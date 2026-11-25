import {
  AuthUser,
  AutoPlayConfig,
  BetSlotId,
  GameEngineConfig,
  GameSnapshot,
  LivePlayerBet,
  PreviousRoundSnapshot,
  RoundHistoryItem,
  RoundPhase,
  ServerMessage,
} from '@/shared/types';
import { calculateMultiplier, GROWTH_RATE } from '@/server/engine/multiplier';
import { generateCrashPoint } from '@/server/engine/crashGenerator';
import { WalletManager } from '@/server/engine/walletManager';
import { HistoryStore } from '@/server/engine/historyStore';
import { BotSimulator } from '@/server/engine/botSimulator';
import { BetManager, BetOutcomeEvent } from '@/server/engine/betManager';

export const COUNTDOWN_TOTAL_MS = 5500;
export const CRASH_PAUSE_MS = 2800;
export const TICK_INTERVAL_MS = 50;

export interface RoundBroadcaster {
  sendToClient: (clientId: string, message: ServerMessage) => void;
  getConnectedClientIds: () => string[];
}

export interface AdminAuditEntry {
  id: string;
  timestamp: number;
  actorEmail: string;
  action: string;
  target: string;
  details: string;
}

export class RoundManager {
  private roundId = 1040;
  private phase: RoundPhase = 'COUNTDOWN';
  private phaseStartedAt = Date.now();
  private multiplier = 1.0;
  private crashPoint = 2.0;
  private roundHash = '';
  private lastCrashPoint: number | null = null;
  private lastRoundHash: string | null = null;
  private timer: NodeJS.Timeout | null = null;

  private engineConfig: GameEngineConfig = {
    minBet: 0.1,
    maxBet: 10000,
    countdownMs: COUNTDOWN_TOTAL_MS,
    growthRate: GROWTH_RATE,
    botsEnabled: true,
    maintenanceMode: false,
  };
  private auditLogs: AdminAuditEntry[] = [];

  private wallet = new WalletManager();
  private history = new HistoryStore(this.roundId);
  private bots = new BotSimulator();
  private bets = new BetManager(this.wallet, this.history);

  private currentLiveBots: LivePlayerBet[] = [];
  private currentTotalBotsCount = 0;
  private currentRemainingBotsCount = 0;
  private currentTotalBotsPayout = 0;
  private authUsers = new Map<string, AuthUser>();

  constructor(private broadcaster: RoundBroadcaster) {
    this.startCountdown(this.roundId);
  }

  async hydrateFromDatabase(): Promise<void> {
    const nextRoundId = await this.history.loadRoundsFromDb();
    if (nextRoundId && nextRoundId > this.roundId && this.phase === 'COUNTDOWN') {
      this.roundId = nextRoundId;
    }
  }

  async attachAuthenticatedUser(user: AuthUser): Promise<string> {
    const clientId = `user:${user.id}`;
    this.authUsers.set(clientId, user);
    this.wallet.syncCachedBalance(clientId, user.balance);
    this.bets.setClientProfile(clientId, {
      maskedName: user.maskedName,
      avatarIndex: user.avatarIndex,
    });
    await this.history.ensureUserHistoryLoaded(clientId);
    return clientId;
  }

  syncUserBalanceFromAuth(userId: string, balance: number): void {
    const clientId = `user:${userId}`;
    this.wallet.syncCachedBalance(clientId, balance);
    this.broadcaster.sendToClient(clientId, {
      type: 'SNAPSHOT',
      data: this.getSnapshot(clientId),
    });
  }

  getEngineConfig(): GameEngineConfig {
    return { ...this.engineConfig };
  }

  updateEngineConfig(partial: Partial<GameEngineConfig>): GameEngineConfig {
    if (partial.minBet !== undefined && Number.isFinite(partial.minBet)) {
      this.engineConfig.minBet = Math.max(0.1, Math.min(1000, Math.round(partial.minBet * 100) / 100));
    }
    if (partial.maxBet !== undefined && Number.isFinite(partial.maxBet)) {
      this.engineConfig.maxBet = Math.max(this.engineConfig.minBet, Math.min(100000, Math.round(partial.maxBet * 100) / 100));
    }
    if (partial.countdownMs !== undefined && Number.isFinite(partial.countdownMs)) {
      this.engineConfig.countdownMs = Math.max(2000, Math.min(15000, Math.round(partial.countdownMs)));
    }
    if (partial.growthRate !== undefined && Number.isFinite(partial.growthRate)) {
      this.engineConfig.growthRate = Math.max(0.00003, Math.min(0.00018, partial.growthRate));
    }
    if (partial.botsEnabled !== undefined) {
      this.engineConfig.botsEnabled = Boolean(partial.botsEnabled);
    }
    if (partial.maintenanceMode !== undefined) {
      this.engineConfig.maintenanceMode = Boolean(partial.maintenanceMode);
    }
    this.broadcastSnapshots();
    return this.getEngineConfig();
  }

  addAuditLog(actorEmail: string, action: string, target: string, details: string): void {
    this.auditLogs.unshift({
      id: `aud-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: Date.now(),
      actorEmail,
      action,
      target,
      details,
    });
    if (this.auditLogs.length > 100) {
      this.auditLogs.length = 100;
    }
  }

  getAuditLogs(): AdminAuditEntry[] {
    return this.auditLogs;
  }

  revokeLiveUserSession(userId: string, reason: string): void {
    const clientId = `user:${userId}`;
    this.authUsers.delete(clientId);
    this.broadcaster.sendToClient(clientId, {
      type: 'ERROR',
      message: reason,
    });
  }

  getAdminTelemetry() {
    const connectedIds = this.broadcaster.getConnectedClientIds();
    const authenticatedOnline = connectedIds.filter((id) =>
      id.startsWith('user:')
    ).length;

    return {
      roundId: this.roundId,
      phase: this.phase,
      multiplier: this.multiplier,
      totalBetsCount: this.currentTotalBotsCount,
      remainingBetsCount: this.currentRemainingBotsCount,
      totalRoundPayout: this.currentTotalBotsPayout,
      liveBets: this.currentLiveBots.slice(0, 25),
      connectedClients: connectedIds.length,
      authenticatedOnline,
      history: this.history.getRounds().slice(0, 40),
      topWins: this.history.getTopWins().slice(0, 20),
      engineConfig: this.getEngineConfig(),
      auditLogs: this.getAuditLogs().slice(0, 50),
    };
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(), TICK_INTERVAL_MS);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private startCountdown(nextRoundId: number): void {
    this.roundId = nextRoundId;
    this.phase = 'COUNTDOWN';
    this.phaseStartedAt = Date.now();
    this.multiplier = 1.0;

    const generated = generateCrashPoint(this.roundId);
    this.crashPoint = generated.crashPoint;
    this.roundHash = generated.hash;

    if (this.engineConfig.botsEnabled && !this.engineConfig.maintenanceMode) {
      this.bots.prepareRound(this.roundId, this.engineConfig.countdownMs);
    }
    this.bets.onCountdownStart(this.roundId, this.engineConfig.maintenanceMode);

    this.currentLiveBots = [];
    this.currentTotalBotsCount = 0;
    this.currentRemainingBotsCount = 0;
    this.currentTotalBotsPayout = 0;

    this.broadcastSnapshots();
  }

  private startFlight(): void {
    this.phase = 'FLYING';
    this.phaseStartedAt = Date.now();
    this.multiplier = 1.0;
    this.bets.onFlightStart(this.roundId);

    // Handle rare instant 1.00x crash immediately
    if (this.crashPoint <= 1.0) {
      this.triggerCrash();
      return;
    }

    this.broadcastSnapshots();
  }

  private triggerCrash(): void {
    this.phase = 'CRASHED';
    this.phaseStartedAt = Date.now();
    this.multiplier = this.crashPoint;
    this.lastCrashPoint = this.crashPoint;
    this.lastRoundHash = this.roundHash;

    const lossEvents = this.bets.onRoundCrash(this.roundId, this.crashPoint);
    for (const ev of lossEvents) {
      this.broadcaster.sendToClient(ev.clientId, {
        type: 'BET_RESULT',
        data: {
          slotId: ev.slotId,
          outcome: 'LOST',
          betAmount: ev.betAmount,
          multiplier: this.crashPoint,
          payout: 0,
          roundId: this.roundId,
        },
      });
    }

    const botSnap = this.bots.getAllBotsSnapshot();
    const userBets = this.bets.getUserLiveBets(this.roundId);
    const allBets = [...userBets, ...botSnap.bets];
    const userPayout = userBets.reduce((sum, b) => sum + (b.payout ?? 0), 0);

    const historyItem: RoundHistoryItem = {
      roundId: this.roundId,
      crashPoint: this.crashPoint,
      timestamp: Date.now(),
      hash: this.roundHash,
    };

    const prevSnapshot: PreviousRoundSnapshot = {
      roundId: this.roundId,
      crashPoint: this.crashPoint,
      totalBetsCount: botSnap.totalCount + userBets.length,
      totalPayout: Math.round((botSnap.totalPayout + userPayout) * 100) / 100,
      bets: allBets,
    };

    this.history.addRoundResult(historyItem, prevSnapshot);

    for (const clientId of this.broadcaster.getConnectedClientIds()) {
      this.broadcaster.sendToClient(clientId, {
        type: 'ROUND_CRASHED',
        data: {
          roundId: this.roundId,
          crashPoint: this.crashPoint,
          hash: this.roundHash,
          historyItem,
          previousRound: prevSnapshot,
        },
      });
    }

    this.broadcastSnapshots();
  }

  private tick(): void {
    const now = Date.now();
    const elapsed = now - this.phaseStartedAt;

    if (this.phase === 'COUNTDOWN') {
      // Hold countdown in maintenance mode
      if (this.engineConfig.maintenanceMode) {
        this.phaseStartedAt = now;
        this.currentLiveBots = [];
        this.currentTotalBotsCount = 0;
        this.currentRemainingBotsCount = 0;
        this.currentTotalBotsPayout = 0;
        this.broadcastTick(this.engineConfig.countdownMs, 0);
        return;
      }

      const remaining = Math.max(0, this.engineConfig.countdownMs - elapsed);
      if (this.engineConfig.botsEnabled) {
        const botCountdown = this.bots.getActiveBetsDuringCountdown(remaining);
        this.currentLiveBots = botCountdown.bets;
        this.currentTotalBotsCount = botCountdown.totalCount;
        this.currentRemainingBotsCount = botCountdown.totalCount;
        this.currentTotalBotsPayout = 0;
      } else {
        this.currentLiveBots = [];
        this.currentTotalBotsCount = 0;
        this.currentRemainingBotsCount = 0;
        this.currentTotalBotsPayout = 0;
      }

      if (remaining <= 0) {
        this.startFlight();
      } else {
        this.broadcastTick(remaining, 0);
      }
      return;
    }

    if (this.phase === 'FLYING') {
      const nextMult = calculateMultiplier(elapsed, this.engineConfig.growthRate);
      this.multiplier = nextMult;

      // Auto-cashout checks happen before crash check for targets strictly below crashPoint
      const autoEvents = this.bets.processAutoCashouts(
        this.roundId,
        nextMult,
        this.crashPoint
      );
      this.emitOutcomeEvents(autoEvents);

      if (nextMult >= this.crashPoint) {
        this.triggerCrash();
        return;
      }

      if (this.engineConfig.botsEnabled) {
        const botFlight = this.bots.stepFlight(this.roundId, nextMult, (win) =>
          this.history.recordWin(win)
        );
        this.currentLiveBots = botFlight.bets;
        this.currentTotalBotsCount = botFlight.totalCount;
        this.currentRemainingBotsCount = botFlight.remainingCount;
        this.currentTotalBotsPayout = botFlight.totalPayout;
      }

      if (autoEvents.length > 0) {
        this.broadcastSnapshots();
      } else {
        this.broadcastTick(0, elapsed);
      }
      return;
    }

    if (this.phase === 'CRASHED') {
      if (elapsed >= CRASH_PAUSE_MS) {
        this.startCountdown(this.roundId + 1);
      }
    }
  }

  private emitOutcomeEvents(events: BetOutcomeEvent[]): void {
    for (const ev of events) {
      this.broadcaster.sendToClient(ev.clientId, {
        type: 'BET_RESULT',
        data: {
          slotId: ev.slotId,
          outcome: ev.outcome,
          betAmount: ev.betAmount,
          multiplier: ev.multiplier,
          payout: ev.payout,
          roundId: ev.roundId,
        },
      });
    }
  }

  private buildMergedLiveBets(clientId: string): {
    liveBets: LivePlayerBet[];
    totalBetsCount: number;
    remainingBetsCount: number;
    totalRoundPayout: number;
  } {
    const userBets = this.bets
      .getUserLiveBets(this.roundId)
      .filter((b) => b.id.startsWith(`user-${clientId}-`));

    const activeUserCount = userBets.filter(
      (b) => b.cashoutMultiplier === null && this.phase !== 'CRASHED'
    ).length;
    const userPayout = userBets.reduce((sum, b) => sum + (b.payout ?? 0), 0);

    return {
      liveBets: [...userBets, ...this.currentLiveBots],
      totalBetsCount: this.currentTotalBotsCount + userBets.length,
      remainingBetsCount: this.currentRemainingBotsCount + activeUserCount,
      totalRoundPayout:
        Math.round((this.currentTotalBotsPayout + userPayout) * 100) / 100,
    };
  }

  getSnapshot(clientId: string): GameSnapshot {
    this.bets.ensureClient(clientId);
    const now = Date.now();
    const elapsed = now - this.phaseStartedAt;
    const countdownRemainingMs =
      this.phase === 'COUNTDOWN'
        ? Math.max(0, this.engineConfig.countdownMs - elapsed)
        : 0;
    const elapsedFlightMs = this.phase === 'FLYING' ? elapsed : 0;
    const merged = this.buildMergedLiveBets(clientId);

    const liveBalance = this.wallet.getBalance(clientId);
    const cachedUser = this.authUsers.get(clientId) ?? null;
    const userPayload: AuthUser | null = cachedUser
      ? { ...cachedUser, balance: liveBalance }
      : null;

    return {
      roundId: this.roundId,
      phase: this.phase,
      multiplier: this.multiplier,
      countdownRemainingMs,
      countdownTotalMs: this.engineConfig.countdownMs,
      elapsedFlightMs,
      lastCrashPoint: this.lastCrashPoint,
      lastRoundHash: this.lastRoundHash,
      balance: liveBalance,
      currency: userPayload?.currency ?? 'MZN',
      user: userPayload,
      engineLimits: {
        minBet: this.engineConfig.minBet,
        maxBet: this.engineConfig.maxBet,
        maintenanceMode: this.engineConfig.maintenanceMode,
      },
      slots: this.bets.getSlots(clientId),
      history: this.history.getRounds(),
      liveBets: merged.liveBets,
      totalBetsCount: merged.totalBetsCount,
      remainingBetsCount: merged.remainingBetsCount,
      totalRoundPayout: merged.totalRoundPayout,
      personalHistory: this.history.getPersonalHistory(clientId),
      topWins: this.history.getTopWins(),
      previousRound: this.history.getPreviousRound(),
      serverTime: now,
    };
  }

  private broadcastSnapshots(): void {
    for (const clientId of this.broadcaster.getConnectedClientIds()) {
      this.broadcaster.sendToClient(clientId, {
        type: 'SNAPSHOT',
        data: this.getSnapshot(clientId),
      });
    }
  }

  private broadcastTick(countdownRemainingMs: number, elapsedFlightMs: number): void {
    const now = Date.now();
    for (const clientId of this.broadcaster.getConnectedClientIds()) {
      const merged = this.buildMergedLiveBets(clientId);
      this.broadcaster.sendToClient(clientId, {
        type: 'TICK',
        data: {
          roundId: this.roundId,
          phase: this.phase,
          multiplier: this.multiplier,
          countdownRemainingMs,
          elapsedFlightMs,
          liveBets: merged.liveBets,
          remainingBetsCount: merged.remainingBetsCount,
          totalBetsCount: merged.totalBetsCount,
          totalRoundPayout: merged.totalRoundPayout,
          serverTime: now,
        },
      });
    }
  }

  // Client Actions
  handlePlaceBet(clientId: string, slotId: BetSlotId, amount: number): void {
    const res = this.bets.placeBet(
      clientId,
      slotId,
      amount,
      this.roundId,
      this.phase,
      {
        minBet: this.engineConfig.minBet,
        maxBet: this.engineConfig.maxBet,
        maintenanceMode: this.engineConfig.maintenanceMode,
      }
    );
    if (!res.ok) {
      this.broadcaster.sendToClient(clientId, {
        type: 'ERROR',
        message: res.error ?? 'Erro ao apostar.',
      });
      return;
    }
    this.broadcaster.sendToClient(clientId, {
      type: 'SNAPSHOT',
      data: this.getSnapshot(clientId),
    });
  }

  handleCancelBet(clientId: string, slotId: BetSlotId): void {
    const res = this.bets.cancelBet(clientId, slotId);
    if (!res.ok) {
      this.broadcaster.sendToClient(clientId, {
        type: 'ERROR',
        message: res.error ?? 'Erro ao cancelar aposta.',
      });
      return;
    }
    this.broadcaster.sendToClient(clientId, {
      type: 'SNAPSHOT',
      data: this.getSnapshot(clientId),
    });
  }

  handleCashout(clientId: string, slotId: BetSlotId): void {
    const res = this.bets.cashout(
      clientId,
      slotId,
      this.roundId,
      this.multiplier,
      this.phase,
      this.crashPoint
    );
    if (!res.ok) {
      this.broadcaster.sendToClient(clientId, {
        type: 'ERROR',
        message: res.error ?? 'Erro ao levantar.',
      });
      return;
    }
    if (res.event) {
      this.emitOutcomeEvents([res.event]);
    }
    this.broadcaster.sendToClient(clientId, {
      type: 'SNAPSHOT',
      data: this.getSnapshot(clientId),
    });
  }

  handleUpdateAuto(
    clientId: string,
    slotId: BetSlotId,
    auto: Partial<AutoPlayConfig>
  ): void {
    this.bets.updateAuto(clientId, slotId, auto);
    this.broadcaster.sendToClient(clientId, {
      type: 'SNAPSHOT',
      data: this.getSnapshot(clientId),
    });
  }

  handleResetBalance(clientId: string, amount?: number): void {
    this.wallet.reset(clientId, amount);
    this.broadcaster.sendToClient(clientId, {
      type: 'SNAPSHOT',
      data: this.getSnapshot(clientId),
    });
  }
}
