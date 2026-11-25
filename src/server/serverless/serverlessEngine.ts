import crypto from 'node:crypto';
import {
  AutoPlayConfig,
  BetSlotId,
  BetSlotState,
  GameEngineConfig,
  GameSnapshot,
  LivePlayerBet,
  PersonalBetRecord,
  PreviousRoundSnapshot,
  RoundHistoryItem,
  RoundPhase,
  TopWinRecord,
} from '@/shared/types';
import { clampAutoCashout, clampBetAmount } from '@/shared/format';
import { calculateMultiplier, calculatePayout, GROWTH_RATE } from '@/server/engine/multiplier';
import { mongoService, SystemAuditEntry, SystemRoundAnchor, UserDoc } from '@/server/db/mongo';
import { ObjectId } from 'mongodb';
import { authService, parseCookies } from '@/server/auth/authService';
import { DEFAULT_VIRTUAL_BALANCE } from '@/server/engine/walletManager';

export const GUEST_COOKIE_NAME = 'aviator_guest';

interface GuestCookiePayload {
  balance: number;
  slots: { 1: BetSlotState; 2: BetSlotState };
  personalHistory: PersonalBetRecord[];
}

function readGuestCookie(cookieHeader?: string): GuestCookiePayload {
  const fallback: GuestCookiePayload = {
    balance: DEFAULT_VIRTUAL_BALANCE,
    slots: { 1: createDefaultSlot(1), 2: createDefaultSlot(2) },
    personalHistory: [],
  };
  const cookies = parseCookies(cookieHeader);
  const token = cookies[GUEST_COOKIE_NAME];
  if (!token) return fallback;
  const parts = token.split('.');
  if (parts.length !== 2) return fallback;
  const [encoded, sig] = parts;
  const expected = crypto
    .createHmac('sha256', getEngineSecret())
    .update(encoded)
    .digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return fallback;
  }
  try {
    const parsed = JSON.parse(
      Buffer.from(encoded, 'base64url').toString('utf8')
    ) as GuestCookiePayload;
    return {
      balance: typeof parsed.balance === 'number' ? parsed.balance : DEFAULT_VIRTUAL_BALANCE,
      slots: parsed.slots
        ? {
            1: { ...createDefaultSlot(1), ...parsed.slots[1] },
            2: { ...createDefaultSlot(2), ...parsed.slots[2] },
          }
        : fallback.slots,
      personalHistory: Array.isArray(parsed.personalHistory)
        ? parsed.personalHistory.slice(0, 20)
        : [],
    };
  } catch {
    return fallback;
  }
}

export function buildGuestSetCookieHeader(payload: GuestCookiePayload): string {
  const trimmed: GuestCookiePayload = {
    balance: payload.balance,
    slots: payload.slots,
    personalHistory: payload.personalHistory.slice(0, 15),
  };
  const encoded = Buffer.from(JSON.stringify(trimmed)).toString('base64url');
  const sig = crypto
    .createHmac('sha256', getEngineSecret())
    .update(encoded)
    .digest('base64url');
  return `${GUEST_COOKIE_NAME}=${encodeURIComponent(`${encoded}.${sig}`)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800`;
}

export const SYSTEM_DOC_KEY = 'aviator_engine_state';
const DEFAULT_COUNTDOWN_MS = 5500;
const CRASH_PAUSE_MS = 2800;

function getEngineSecret(): string {
  const seed =
    process.env.SESSION_SECRET ||
    process.env.MONGODB_URI ||
    'aviator-serverless-engine-secret';
  return crypto.createHash('sha256').update(`crash-rng:${seed}`).digest('hex');
}

export function deriveRoundOutcome(roundId: number): {
  crashPoint: number;
  hash: string;
} {
  const hmac = crypto
    .createHmac('sha256', getEngineSecret())
    .update(`round:${roundId}`)
    .digest();
  const intVal = hmac.readBigUInt64BE(0);
  const maxUint64 = BigInt('18446744073709551616');
  const r = Number(intVal) / Number(maxUint64);

  let crashPoint: number;
  if (r < 0.03) {
    crashPoint = 1.0;
  } else {
    const raw = 0.97 / (1 - r);
    crashPoint = Math.min(150.0, Math.max(1.01, Math.floor(raw * 100) / 100));
  }

  const hash = crypto
    .createHash('sha256')
    .update(`${roundId}:${crashPoint.toFixed(2)}:${hmac.toString('hex').slice(0, 16)}`)
    .digest('hex');

  return { crashPoint, hash };
}

export function getCrashDurationMs(crashPoint: number, growthRate: number): number {
  if (crashPoint <= 1.0) return 0;
  return Math.max(150, Math.ceil(Math.log(crashPoint) / growthRate));
}

// Deterministic PRNG per round so all serverless instances generate identical bot rows
function createSeededRng(seed: number): () => number {
  let s = (seed ^ 0x9e3779b9) >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const HIGH_STAKES_POOL = [
  5305.73, 3337.95, 1390.81, 1112.65, 1061.15, 1008.09, 700.35, 695.57,
  450.0, 320.5, 250.0, 180.0, 120.0, 85.0, 50.0, 35.0, 20.0, 10.0, 8.0, 5.0,
];

function computeDeterministicBots(
  roundId: number,
  phase: RoundPhase,
  countdownRemainingMs: number,
  countdownTotalMs: number,
  currentMultiplier: number,
  botsEnabled: boolean
): {
  bets: LivePlayerBet[];
  totalCount: number;
  remainingCount: number;
  totalPayout: number;
} {
  if (!botsEnabled) {
    return { bets: [], totalCount: 0, remainingCount: 0, totalPayout: 0 };
  }

  const rng = createSeededRng(roundId);
  const visibleCount = 24 + Math.floor(rng() * 10);
  const totalLobbyCount = visibleCount * 68 + Math.floor(rng() * 150);

  const bots: Array<
    LivePlayerBet & { joinAtRemainingMs: number; targetCashout: number | null }
  > = [];

  for (let i = 0; i < visibleCount; i++) {
    const amount =
      i < 8
        ? HIGH_STAKES_POOL[i % HIGH_STAKES_POOL.length]
        : HIGH_STAKES_POOL[Math.floor(rng() * HIGH_STAKES_POOL.length)];
    const lead = rng() < 0.25 ? String(Math.floor(rng() * 9) + 1) : '*';
    const tail = String(Math.floor(rng() * 10));
    const joinAtRemainingMs = Math.floor(countdownTotalMs * (0.15 + rng() * 0.85));

    const rt = rng();
    let targetCashout: number | null = null;
    if (rt >= 0.16 && rt < 0.56) {
      targetCashout = Math.round((1.15 + rng() * 0.83) * 100) / 100;
    } else if (rt >= 0.56 && rt < 0.86) {
      targetCashout = Math.round((2.0 + rng() * 2.5) * 100) / 100;
    } else if (rt >= 0.86) {
      targetCashout = Math.round((4.5 + rng() * 7.5) * 100) / 100;
    }

    bots.push({
      id: `bot-${roundId}-${i}`,
      avatarIndex: Math.floor(rng() * 6),
      maskedName: `${lead}****${tail}`,
      betAmount: amount,
      cashoutMultiplier: null,
      payout: null,
      joinAtRemainingMs,
      targetCashout,
    });
  }

  if (phase === 'COUNTDOWN') {
    const visible = bots
      .filter((b) => countdownRemainingMs <= b.joinAtRemainingMs)
      .sort((a, b) => b.betAmount - a.betAmount);
    const ratio = visible.length / Math.max(1, bots.length);
    const totalCount = Math.max(visible.length, Math.round(totalLobbyCount * ratio));
    return {
      bets: visible.map(({ joinAtRemainingMs: _j, targetCashout: _t, ...rest }) => rest),
      totalCount,
      remainingCount: totalCount,
      totalPayout: 0,
    };
  }

  let cashedCount = 0;
  let totalPayout = 0;
  for (const b of bots) {
    if (b.targetCashout !== null && currentMultiplier >= b.targetCashout) {
      b.cashoutMultiplier = b.targetCashout;
      b.payout = calculatePayout(b.betAmount, b.targetCashout);
      cashedCount++;
      totalPayout += b.payout;
    }
  }

  const remainingRatio = (bots.length - cashedCount) / Math.max(1, bots.length);
  const remainingCount = Math.max(
    bots.length - cashedCount,
    Math.round(totalLobbyCount * remainingRatio)
  );

  bots.sort((a, b) => {
    const ac = a.cashoutMultiplier !== null ? 1 : 0;
    const bc = b.cashoutMultiplier !== null ? 1 : 0;
    if (ac !== bc) return bc - ac;
    return b.betAmount - a.betAmount;
  });

  return {
    bets: bots.map(({ joinAtRemainingMs: _j, targetCashout: _t, ...rest }) => rest),
    totalCount: totalLobbyCount,
    remainingCount,
    totalPayout: Math.round(totalPayout * 100) / 100,
  };
}

export function createDefaultSlot(slotId: BetSlotId): BetSlotState {
  return {
    slotId,
    amount: 8.0,
    status: 'IDLE',
    activeRoundId: null,
    cashoutMultiplier: null,
    payout: null,
    auto: {
      autoBet: false,
      autoBetRoundsLeft: 0,
      autoCashout: false,
      autoCashoutMultiplier: 2.0,
    },
  };
}

const DEFAULT_CONFIG: GameEngineConfig = {
  minBet: 0.1,
  maxBet: 10000,
  countdownMs: DEFAULT_COUNTDOWN_MS,
  growthRate: GROWTH_RATE,
  botsEnabled: true,
  maintenanceMode: false,
};

export interface SystemStateSnapshot {
  engineConfig: GameEngineConfig;
  auditLogs: SystemAuditEntry[];
  roundAnchor: SystemRoundAnchor;
}

export async function getOrInitSystemState(): Promise<SystemStateSnapshot> {
  await mongoService.connect();
  const usersCol = mongoService.users();
  const now = Date.now();

  if (!usersCol) {
    return {
      engineConfig: { ...DEFAULT_CONFIG },
      auditLogs: [],
      roundAnchor: { roundId: 1040, startedAt: now },
    };
  }

  let doc = await usersCol.findOne({ systemKey: SYSTEM_DOC_KEY });
  if (!doc) {
    const initialAnchor: SystemRoundAnchor = { roundId: 1040, startedAt: now };
    try {
      await usersCol.insertOne({
        _id: new ObjectId(),
        systemKey: SYSTEM_DOC_KEY,
        username: '__system__',
        usernameLower: '__system__',
        email: '__system__@internal',
        emailLower: '__system__@internal',
        passwordHash: '',
        maskedName: 'sys',
        avatarIndex: 0,
        balance: 0,
        currency: 'MZN',
        tokenVersion: 1,
        engineConfig: { ...DEFAULT_CONFIG },
        auditLogs: [],
        roundAnchor: initialAnchor,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as UserDoc);
    } catch {
      // race with another cold start
    }
    doc = await usersCol.findOne({ systemKey: SYSTEM_DOC_KEY });
  }

  const engineConfig: GameEngineConfig = {
    ...DEFAULT_CONFIG,
    ...(doc?.engineConfig ?? {}),
  };
  let roundAnchor: SystemRoundAnchor = doc?.roundAnchor ?? {
    roundId: 1040,
    startedAt: now,
  };

  // Advance roundAnchor forward cleanly if current round elapsed
  if (!engineConfig.maintenanceMode) {
    let curRoundId = roundAnchor.roundId;
    let curStartedAt = roundAnchor.startedAt;
    let safety = 0;

    while (safety < 120) {
      safety++;
      const { crashPoint } = deriveRoundOutcome(curRoundId);
      const flightDuration = getCrashDurationMs(crashPoint, engineConfig.growthRate);
      const totalRoundDuration =
        engineConfig.countdownMs + flightDuration + CRASH_PAUSE_MS;

      if (now < curStartedAt + totalRoundDuration) {
        break;
      }
      curStartedAt += totalRoundDuration;
      curRoundId += 1;
    }

    // If serverless was idle for a long time (>120 rounds), snap cleanly to now
    if (safety >= 120) {
      curStartedAt = now;
    }

    if (curRoundId !== roundAnchor.roundId || curStartedAt !== roundAnchor.startedAt) {
      roundAnchor = { roundId: curRoundId, startedAt: curStartedAt };
      await usersCol.updateOne(
        { systemKey: SYSTEM_DOC_KEY },
        { $set: { roundAnchor, updatedAt: new Date() } }
      );
    }
  } else {
    // Keep anchor pinned at countdown start during maintenance
    roundAnchor = { roundId: roundAnchor.roundId, startedAt: now };
  }

  return {
    engineConfig,
    auditLogs: doc?.auditLogs ?? [],
    roundAnchor,
  };
}

export interface ComputedRoundNow {
  roundId: number;
  phase: RoundPhase;
  multiplier: number;
  crashPoint: number;
  hash: string;
  countdownRemainingMs: number;
  countdownTotalMs: number;
  elapsedFlightMs: number;
  lastCrashPoint: number;
  lastRoundHash: string;
  history: RoundHistoryItem[];
  engineConfig: GameEngineConfig;
}

export function computeRoundStateAt(
  state: SystemStateSnapshot,
  now = Date.now()
): ComputedRoundNow {
  const { engineConfig, roundAnchor } = state;
  const roundId = roundAnchor.roundId;
  const { crashPoint, hash } = deriveRoundOutcome(roundId);
  const flightDuration = getCrashDurationMs(crashPoint, engineConfig.growthRate);

  let phase: RoundPhase = 'COUNTDOWN';
  let multiplier = 1.0;
  let countdownRemainingMs = 0;
  let elapsedFlightMs = 0;

  if (engineConfig.maintenanceMode) {
    phase = 'COUNTDOWN';
    countdownRemainingMs = engineConfig.countdownMs;
  } else {
    const elapsed = Math.max(0, now - roundAnchor.startedAt);
    if (elapsed < engineConfig.countdownMs) {
      phase = 'COUNTDOWN';
      countdownRemainingMs = engineConfig.countdownMs - elapsed;
    } else if (elapsed < engineConfig.countdownMs + flightDuration && crashPoint > 1.0) {
      phase = 'FLYING';
      elapsedFlightMs = elapsed - engineConfig.countdownMs;
      multiplier = Math.min(
        crashPoint,
        calculateMultiplier(elapsedFlightMs, engineConfig.growthRate)
      );
      if (multiplier >= crashPoint) {
        phase = 'CRASHED';
        multiplier = crashPoint;
      }
    } else {
      phase = 'CRASHED';
      multiplier = crashPoint;
    }
  }

  const history: RoundHistoryItem[] = [];
  const startHistId = phase === 'CRASHED' ? roundId : roundId - 1;
  for (let i = 0; i < 30; i++) {
    const hid = startHistId - i;
    if (hid < 1) break;
    const out = deriveRoundOutcome(hid);
    history.push({
      roundId: hid,
      crashPoint: out.crashPoint,
      timestamp: now - (i + 1) * 18000,
      hash: out.hash,
    });
  }

  const prev = deriveRoundOutcome(roundId - 1);

  return {
    roundId,
    phase,
    multiplier,
    crashPoint,
    hash,
    countdownRemainingMs,
    countdownTotalMs: engineConfig.countdownMs,
    elapsedFlightMs,
    lastCrashPoint: phase === 'CRASHED' ? crashPoint : prev.crashPoint,
    lastRoundHash: phase === 'CRASHED' ? hash : prev.hash,
    history,
    engineConfig,
  };
}

export async function updateSystemEngineConfig(
  partial: Partial<GameEngineConfig>,
  actorEmail: string
): Promise<GameEngineConfig> {
  const sys = await getOrInitSystemState();
  const next = { ...sys.engineConfig };

  if (partial.minBet !== undefined && Number.isFinite(partial.minBet)) {
    next.minBet = Math.max(0.1, Math.min(1000, Math.round(partial.minBet * 100) / 100));
  }
  if (partial.maxBet !== undefined && Number.isFinite(partial.maxBet)) {
    next.maxBet = Math.max(next.minBet, Math.min(100000, Math.round(partial.maxBet * 100) / 100));
  }
  if (partial.countdownMs !== undefined && Number.isFinite(partial.countdownMs)) {
    next.countdownMs = Math.max(2000, Math.min(15000, Math.round(partial.countdownMs)));
  }
  if (partial.growthRate !== undefined && Number.isFinite(partial.growthRate)) {
    next.growthRate = Math.max(0.00003, Math.min(0.00018, partial.growthRate));
  }
  if (partial.botsEnabled !== undefined) {
    next.botsEnabled = Boolean(partial.botsEnabled);
  }
  if (partial.maintenanceMode !== undefined) {
    next.maintenanceMode = Boolean(partial.maintenanceMode);
  }

  const usersCol = mongoService.users();
  if (usersCol) {
    const entry: SystemAuditEntry = {
      id: `aud-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: Date.now(),
      actorEmail,
      action: 'Configuração Motor',
      target: 'Global',
      details: `Aposta ${next.minBet}-${next.maxBet} MZN, Espera ${next.countdownMs}ms, Bots=${next.botsEnabled}, Manutenção=${next.maintenanceMode}`,
    };
    await usersCol.updateOne(
      { systemKey: SYSTEM_DOC_KEY },
      {
        $set: { engineConfig: next, updatedAt: new Date() },
        $push: { auditLogs: { $each: [entry], $position: 0, $slice: 100 } },
      }
    );
  }

  return next;
}

export async function appendSystemAuditLog(
  actorEmail: string,
  action: string,
  target: string,
  details: string
): Promise<void> {
  await mongoService.connect();
  const usersCol = mongoService.users();
  if (!usersCol) return;
  await getOrInitSystemState();
  const entry: SystemAuditEntry = {
    id: `aud-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: Date.now(),
    actorEmail,
    action,
    target,
    details,
  };
  await usersCol.updateOne(
    { systemKey: SYSTEM_DOC_KEY },
    {
      $push: { auditLogs: { $each: [entry], $position: 0, $slice: 100 } },
      $set: { updatedAt: new Date() },
    }
  );
}

/**
 * Reconciles a user's persisted bet slots against the current round state
 * (settles auto-cashouts, crashes/losses, queued -> placed/active, and auto-bet).
 */
export async function reconcileAndBuildUserSnapshot(
  cookieHeader?: string
): Promise<{
  snapshot: GameSnapshot;
  outcomes: Array<{
    slotId: BetSlotId;
    outcome: 'WON' | 'LOST';
    betAmount: number;
    multiplier: number;
    payout: number;
    roundId: number;
  }>;
  guestSetCookie?: string;
}> {
  const sys = await getOrInitSystemState();
  const round = computeRoundStateAt(sys);
  const outcomes: Array<{
    slotId: BetSlotId;
    outcome: 'WON' | 'LOST';
    betAmount: number;
    multiplier: number;
    payout: number;
    roundId: number;
  }> = [];

  const authUser = await authService.getUserFromCookieHeader(cookieHeader);
  let balance = DEFAULT_VIRTUAL_BALANCE;
  let slots: { 1: BetSlotState; 2: BetSlotState } = {
    1: createDefaultSlot(1),
    2: createDefaultSlot(2),
  };
  let personalHistory: PersonalBetRecord[] = [];
  let guestSetCookie: string | undefined;

  const reconcileSlots = (
    curBalance: number,
    curSlots: { 1: BetSlotState; 2: BetSlotState },
    curHist: PersonalBetRecord[]
  ) => {
    let nextBal = curBalance;
    let dirty = false;
    const newBets: PersonalBetRecord[] = [];

    for (const slotId of [1, 2] as BetSlotId[]) {
      const slot = curSlots[slotId];

      if (
        slot.activeRoundId !== null &&
        slot.activeRoundId < round.roundId &&
        (slot.status === 'PLACED' || slot.status === 'ACTIVE')
      ) {
        const pastOutcome = deriveRoundOutcome(slot.activeRoundId);
        if (
          slot.auto.autoCashout &&
          slot.auto.autoCashoutMultiplier < pastOutcome.crashPoint
        ) {
          const mult = slot.auto.autoCashoutMultiplier;
          const payout = calculatePayout(slot.amount, mult);
          nextBal = Math.round((nextBal + payout) * 100) / 100;
          newBets.push({
            id: `pbet-${slot.activeRoundId}-${slotId}-${Date.now()}`,
            roundId: slot.activeRoundId,
            timestamp: Date.now(),
            slotId,
            betAmount: slot.amount,
            cashoutMultiplier: mult,
            crashPoint: pastOutcome.crashPoint,
            payout,
            profit: Math.round((payout - slot.amount) * 100) / 100,
            status: 'WON',
          });
          outcomes.push({
            slotId,
            outcome: 'WON',
            betAmount: slot.amount,
            multiplier: mult,
            payout,
            roundId: slot.activeRoundId,
          });
        } else {
          newBets.push({
            id: `pbet-${slot.activeRoundId}-${slotId}-${Date.now()}`,
            roundId: slot.activeRoundId,
            timestamp: Date.now(),
            slotId,
            betAmount: slot.amount,
            cashoutMultiplier: null,
            crashPoint: pastOutcome.crashPoint,
            payout: 0,
            profit: -slot.amount,
            status: 'LOST',
          });
          outcomes.push({
            slotId,
            outcome: 'LOST',
            betAmount: slot.amount,
            multiplier: pastOutcome.crashPoint,
            payout: 0,
            roundId: slot.activeRoundId,
          });
        }
        slot.status = 'IDLE';
        slot.activeRoundId = null;
        slot.cashoutMultiplier = null;
        slot.payout = null;
        dirty = true;
      }

      if (
        round.phase === 'COUNTDOWN' &&
        (slot.status === 'CASHED_OUT' || slot.status === 'LOST') &&
        slot.activeRoundId !== round.roundId
      ) {
        slot.status = 'IDLE';
        slot.activeRoundId = null;
        slot.cashoutMultiplier = null;
        slot.payout = null;
        dirty = true;
      }

      if (
        slot.status === 'QUEUED_NEXT' &&
        slot.activeRoundId !== null &&
        slot.activeRoundId <= round.roundId
      ) {
        slot.status = round.phase === 'COUNTDOWN' ? 'PLACED' : 'ACTIVE';
        slot.activeRoundId = round.roundId;
        dirty = true;
      }

      if (
        slot.status === 'PLACED' &&
        slot.activeRoundId === round.roundId &&
        round.phase === 'FLYING'
      ) {
        slot.status = 'ACTIVE';
        dirty = true;
      }

      if (
        round.phase === 'COUNTDOWN' &&
        !round.engineConfig.maintenanceMode &&
        slot.status === 'IDLE' &&
        slot.auto.autoBet
      ) {
        if (nextBal + 1e-6 >= slot.amount) {
          nextBal = Math.round((nextBal - slot.amount) * 100) / 100;
          slot.status = 'PLACED';
          slot.activeRoundId = round.roundId;
          if (slot.auto.autoBetRoundsLeft > 0) {
            slot.auto.autoBetRoundsLeft -= 1;
            if (slot.auto.autoBetRoundsLeft === 0) {
              slot.auto.autoBet = false;
            }
          }
          dirty = true;
        } else {
          slot.auto.autoBet = false;
          dirty = true;
        }
      }

      if (
        round.phase === 'FLYING' &&
        slot.status === 'ACTIVE' &&
        slot.activeRoundId === round.roundId &&
        slot.auto.autoCashout
      ) {
        const target = slot.auto.autoCashoutMultiplier;
        if (round.multiplier >= target && target < round.crashPoint) {
          const payout = calculatePayout(slot.amount, target);
          nextBal = Math.round((nextBal + payout) * 100) / 100;
          slot.status = 'CASHED_OUT';
          slot.cashoutMultiplier = target;
          slot.payout = payout;
          newBets.push({
            id: `pbet-${round.roundId}-${slotId}-${Date.now()}`,
            roundId: round.roundId,
            timestamp: Date.now(),
            slotId,
            betAmount: slot.amount,
            cashoutMultiplier: target,
            crashPoint: round.crashPoint,
            payout,
            profit: Math.round((payout - slot.amount) * 100) / 100,
            status: 'WON',
          });
          outcomes.push({
            slotId,
            outcome: 'WON',
            betAmount: slot.amount,
            multiplier: target,
            payout,
            roundId: round.roundId,
          });
          dirty = true;
        }
      }

      if (
        round.phase === 'CRASHED' &&
        (slot.status === 'ACTIVE' || slot.status === 'PLACED') &&
        slot.activeRoundId === round.roundId
      ) {
        slot.status = 'LOST';
        slot.cashoutMultiplier = null;
        slot.payout = 0;
        newBets.push({
          id: `pbet-${round.roundId}-${slotId}-${Date.now()}`,
          roundId: round.roundId,
          timestamp: Date.now(),
          slotId,
          betAmount: slot.amount,
          cashoutMultiplier: null,
          crashPoint: round.crashPoint,
          payout: 0,
          profit: -slot.amount,
          status: 'LOST',
        });
        outcomes.push({
          slotId,
          outcome: 'LOST',
          betAmount: slot.amount,
          multiplier: round.crashPoint,
          payout: 0,
          roundId: round.roundId,
        });
        dirty = true;
      }
    }

    const updatedHist =
      newBets.length > 0 ? [...newBets, ...curHist].slice(0, 50) : curHist;
    return { nextBal, dirty, newBets, updatedHist };
  };

  const usersCol = mongoService.users();
  if (authUser && usersCol && ObjectId.isValid(authUser.id)) {
    const userObjId = new ObjectId(authUser.id);
    const doc = await usersCol.findOne({ _id: userObjId });
    if (doc) {
      balance = doc.balance;
      personalHistory = (doc.aviatorBets ?? []).slice(0, 50);
      slots = doc.aviatorActiveSlots
        ? {
            1: { ...createDefaultSlot(1), ...doc.aviatorActiveSlots[1] },
            2: { ...createDefaultSlot(2), ...doc.aviatorActiveSlots[2] },
          }
        : slots;

      const rec = reconcileSlots(balance, slots, personalHistory);
      balance = rec.nextBal;
      personalHistory = rec.updatedHist;

      if (rec.dirty) {
        await usersCol.updateOne(
          { _id: userObjId },
          {
            $set: {
              balance,
              aviatorActiveSlots: slots,
              updatedAt: new Date(),
            },
            ...(rec.newBets.length > 0
              ? {
                  $push: {
                    aviatorBets: {
                      $each: rec.newBets,
                      $position: 0,
                      $slice: 50,
                    },
                  },
                }
              : {}),
          }
        );
      }
    }
  } else {
    const guest = readGuestCookie(cookieHeader);
    const rec = reconcileSlots(guest.balance, guest.slots, guest.personalHistory);
    balance = rec.nextBal;
    slots = guest.slots;
    personalHistory = rec.updatedHist;
    if (rec.dirty) {
      guestSetCookie = buildGuestSetCookieHeader({
        balance,
        slots,
        personalHistory,
      });
    }
  }

  const bots = computeDeterministicBots(
    round.roundId,
    round.phase,
    round.countdownRemainingMs,
    round.countdownTotalMs,
    round.multiplier,
    round.engineConfig.botsEnabled && !round.engineConfig.maintenanceMode
  );

  const userLiveBets: LivePlayerBet[] = [];
  for (const slotId of [1, 2] as BetSlotId[]) {
    const slot = slots[slotId];
    if (
      slot.activeRoundId === round.roundId &&
      (slot.status === 'PLACED' ||
        slot.status === 'ACTIVE' ||
        slot.status === 'CASHED_OUT' ||
        slot.status === 'LOST')
    ) {
      userLiveBets.push({
        id: `user-${authUser ? authUser.id : 'guest'}-${slotId}-${round.roundId}`,
        avatarIndex: authUser?.avatarIndex ?? 0,
        maskedName: authUser ? `${authUser.maskedName} (P${slotId})` : `Você (P${slotId})`,
        betAmount: slot.amount,
        cashoutMultiplier: slot.cashoutMultiplier,
        payout: slot.payout,
        isUser: true,
        slotId,
      });
    }
  }

  const prevBots = computeDeterministicBots(
    round.roundId - 1,
    'CRASHED',
    0,
    round.countdownTotalMs,
    round.lastCrashPoint,
    round.engineConfig.botsEnabled
  );
  const previousRound: PreviousRoundSnapshot = {
    roundId: round.roundId - 1,
    crashPoint: round.lastCrashPoint,
    totalBetsCount: prevBots.totalCount,
    totalPayout: prevBots.totalPayout,
    bets: prevBots.bets,
  };

  const topWins: TopWinRecord[] = prevBots.bets
    .filter((b) => (b.payout ?? 0) >= 500)
    .slice(0, 15)
    .map((b) => ({
      id: `top-${round.roundId - 1}-${b.id}`,
      roundId: round.roundId - 1,
      timestamp: Date.now() - 18000,
      avatarIndex: b.avatarIndex,
      maskedName: b.maskedName,
      betAmount: b.betAmount,
      cashoutMultiplier: b.cashoutMultiplier!,
      payout: b.payout!,
    }));

  const snapshot: GameSnapshot = {
    roundId: round.roundId,
    phase: round.phase,
    multiplier: round.multiplier,
    countdownRemainingMs: round.countdownRemainingMs,
    countdownTotalMs: round.countdownTotalMs,
    elapsedFlightMs: round.elapsedFlightMs,
    lastCrashPoint: round.lastCrashPoint,
    lastRoundHash: round.lastRoundHash,
    balance,
    currency: authUser?.currency ?? 'MZN',
    user: authUser ? { ...authUser, balance } : null,
    engineLimits: {
      minBet: round.engineConfig.minBet,
      maxBet: round.engineConfig.maxBet,
      maintenanceMode: round.engineConfig.maintenanceMode,
    },
    slots,
    history: round.history,
    liveBets: [...userLiveBets, ...bots.bets],
    totalBetsCount: bots.totalCount + userLiveBets.length,
    remainingBetsCount:
      bots.remainingCount +
      userLiveBets.filter((b) => b.cashoutMultiplier === null && round.phase !== 'CRASHED')
        .length,
    totalRoundPayout:
      Math.round(
        (bots.totalPayout +
          userLiveBets.reduce((s, b) => s + (b.payout ?? 0), 0)) *
          100
      ) / 100,
    personalHistory,
    topWins,
    previousRound,
    serverTime: Date.now(),
  };

  return { snapshot, outcomes, guestSetCookie };
}

export async function handleServerlessGameAction(
  cookieHeader: string | undefined,
  body: {
    type: 'PLACE_BET' | 'CANCEL_BET' | 'CASHOUT' | 'UPDATE_AUTO' | 'RESET_VIRTUAL_BALANCE';
    slotId?: BetSlotId;
    amount?: number;
    auto?: Partial<AutoPlayConfig>;
  }
): Promise<{
  ok: boolean;
  error?: string;
  snapshot?: GameSnapshot;
  outcomes?: Array<{
    slotId: BetSlotId;
    outcome: 'WON' | 'LOST';
    betAmount: number;
    multiplier: number;
    payout: number;
    roundId: number;
  }>;
  guestSetCookie?: string;
}> {
  const authUser = await authService.getUserFromCookieHeader(cookieHeader);
  const usersCol = mongoService.users();
  const isAuthenticated = Boolean(authUser && usersCol && ObjectId.isValid(authUser.id));

  const { snapshot: currentSnap, outcomes } = await reconcileAndBuildUserSnapshot(
    cookieHeader
  );
  const sys = await getOrInitSystemState();
  const round = computeRoundStateAt(sys);
  const slots = currentSnap.slots;
  let balance = currentSnap.balance;
  let personalHistory = currentSnap.personalHistory;

  const persistState = async (newBet?: PersonalBetRecord): Promise<string | undefined> => {
    if (isAuthenticated && authUser && usersCol) {
      await usersCol.updateOne(
        { _id: new ObjectId(authUser.id) },
        {
          $set: { balance, aviatorActiveSlots: slots, updatedAt: new Date() },
          ...(newBet
            ? {
                $push: {
                  aviatorBets: {
                    $each: [newBet],
                    $position: 0,
                    $slice: 50,
                  },
                },
              }
            : {}),
        }
      );
      return undefined;
    }
    if (newBet) {
      personalHistory = [newBet, ...personalHistory].slice(0, 20);
    }
    return buildGuestSetCookieHeader({
      balance,
      slots,
      personalHistory,
    });
  };

  if (body.type === 'RESET_VIRTUAL_BALANCE') {
    balance = Math.min(
      100000,
      Math.max(10, Math.round((body.amount ?? DEFAULT_VIRTUAL_BALANCE) * 100) / 100)
    );
    const guestSetCookie = await persistState();
    const updated = await reconcileAndBuildUserSnapshot(
      guestSetCookie ? `${GUEST_COOKIE_NAME}=${guestSetCookie.split('=')[1].split(';')[0]}` : cookieHeader
    );
    return { ok: true, snapshot: updated.snapshot, outcomes, guestSetCookie };
  }

  const slotId: BetSlotId = body.slotId === 2 ? 2 : 1;
  const slot = slots[slotId];

  if (body.type === 'UPDATE_AUTO') {
    if (body.auto?.autoBet !== undefined) slot.auto.autoBet = Boolean(body.auto.autoBet);
    if (body.auto?.autoBetRoundsLeft !== undefined) {
      slot.auto.autoBetRoundsLeft = Math.max(0, Math.floor(body.auto.autoBetRoundsLeft));
    }
    if (body.auto?.autoCashout !== undefined) {
      slot.auto.autoCashout = Boolean(body.auto.autoCashout);
    }
    if (body.auto?.autoCashoutMultiplier !== undefined) {
      slot.auto.autoCashoutMultiplier = clampAutoCashout(body.auto.autoCashoutMultiplier);
    }
    const guestSetCookie = await persistState();
    return {
      ok: true,
      snapshot: { ...currentSnap, balance, slots },
      outcomes,
      guestSetCookie,
    };
  }

  if (body.type === 'PLACE_BET') {
    if (round.engineConfig.maintenanceMode) {
      return {
        ok: false,
        error: 'O jogo está temporariamente em manutenção.',
      };
    }
    if (
      slot.status === 'PLACED' ||
      slot.status === 'ACTIVE' ||
      slot.status === 'QUEUED_NEXT'
    ) {
      return { ok: false, error: `O painel ${slotId} já tem uma aposta activa.` };
    }
    const rawAmount = Number(body.amount ?? slot.amount);
    const parsed = Math.round(rawAmount * 100) / 100;
    if (
      !Number.isFinite(parsed) ||
      parsed < round.engineConfig.minBet ||
      parsed > round.engineConfig.maxBet
    ) {
      return {
        ok: false,
        error: `Aposta permitida entre ${round.engineConfig.minBet.toFixed(2)} e ${round.engineConfig.maxBet.toFixed(2)} MZN.`,
      };
    }
    const amount = clampBetAmount(parsed);
    if (balance + 1e-6 < amount) {
      return { ok: false, error: 'Saldo virtual insuficiente.' };
    }

    balance = Math.round((balance - amount) * 100) / 100;
    slot.amount = amount;
    slot.cashoutMultiplier = null;
    slot.payout = null;
    if (round.phase === 'COUNTDOWN') {
      slot.status = 'PLACED';
      slot.activeRoundId = round.roundId;
    } else {
      slot.status = 'QUEUED_NEXT';
      slot.activeRoundId = round.roundId + 1;
    }

    const guestSetCookie = await persistState();
    return {
      ok: true,
      snapshot: { ...currentSnap, balance, slots },
      outcomes,
      guestSetCookie,
    };
  }

  if (body.type === 'CANCEL_BET') {
    if (slot.status !== 'PLACED' && slot.status !== 'QUEUED_NEXT') {
      return { ok: false, error: 'Não é possível cancelar esta aposta agora.' };
    }
    balance = Math.round((balance + slot.amount) * 100) / 100;
    slot.status = 'IDLE';
    slot.activeRoundId = null;
    slot.cashoutMultiplier = null;
    slot.payout = null;

    const guestSetCookie = await persistState();
    return {
      ok: true,
      snapshot: { ...currentSnap, balance, slots },
      outcomes,
      guestSetCookie,
    };
  }

  if (body.type === 'CASHOUT') {
    if (round.phase !== 'FLYING') {
      return { ok: false, error: 'A ronda não está em voo.' };
    }
    if (slot.status !== 'ACTIVE' || slot.activeRoundId !== round.roundId) {
      return { ok: false, error: 'Sem aposta activa nesta ronda.' };
    }
    if (round.multiplier >= round.crashPoint) {
      return { ok: false, error: 'O avião já sofreu crash.' };
    }

    const payout = calculatePayout(slot.amount, round.multiplier);
    balance = Math.round((balance + payout) * 100) / 100;
    slot.status = 'CASHED_OUT';
    slot.cashoutMultiplier = round.multiplier;
    slot.payout = payout;

    const betRecord: PersonalBetRecord = {
      id: `pbet-${round.roundId}-${slotId}-${Date.now()}`,
      roundId: round.roundId,
      timestamp: Date.now(),
      slotId,
      betAmount: slot.amount,
      cashoutMultiplier: round.multiplier,
      crashPoint: round.crashPoint,
      payout,
      profit: Math.round((payout - slot.amount) * 100) / 100,
      status: 'WON',
    };

    const guestSetCookie = await persistState(betRecord);
    return {
      ok: true,
      snapshot: {
        ...currentSnap,
        balance,
        slots,
        personalHistory: [betRecord, ...personalHistory].slice(0, 50),
      },
      outcomes: [
        ...outcomes,
        {
          slotId,
          outcome: 'WON',
          betAmount: slot.amount,
          multiplier: round.multiplier,
          payout,
          roundId: round.roundId,
        },
      ],
      guestSetCookie,
    };
  }

  return { ok: false, error: 'Acção desconhecida.' };
}
