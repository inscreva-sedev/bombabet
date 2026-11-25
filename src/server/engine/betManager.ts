import {
  AutoPlayConfig,
  BetSlotId,
  BetSlotState,
  LivePlayerBet,
  PersonalBetRecord,
  RoundPhase,
  TopWinRecord,
} from '@/shared/types';
import { clampAutoCashout, clampBetAmount } from '@/shared/format';
import { calculatePayout } from '@/server/engine/multiplier';
import { WalletManager } from '@/server/engine/walletManager';
import { HistoryStore } from '@/server/engine/historyStore';

function createDefaultSlot(slotId: BetSlotId): BetSlotState {
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

export interface BetOutcomeEvent {
  clientId: string;
  slotId: BetSlotId;
  outcome: 'WON' | 'LOST';
  betAmount: number;
  multiplier: number;
  payout: number;
  roundId: number;
}

export class BetManager {
  private clientSlots = new Map<string, { 1: BetSlotState; 2: BetSlotState }>();
  private clientProfiles = new Map<
    string,
    { maskedName: string; avatarIndex: number }
  >();

  constructor(
    private wallet: WalletManager,
    private history: HistoryStore
  ) {}

  setClientProfile(
    clientId: string,
    profile: { maskedName: string; avatarIndex: number } | null
  ): void {
    if (profile) {
      this.clientProfiles.set(clientId, profile);
    } else {
      this.clientProfiles.delete(clientId);
    }
  }

  ensureClient(clientId: string): { 1: BetSlotState; 2: BetSlotState } {
    this.wallet.ensureWallet(clientId);
    if (!this.clientSlots.has(clientId)) {
      this.clientSlots.set(clientId, {
        1: createDefaultSlot(1),
        2: createDefaultSlot(2),
      });
    }
    return this.clientSlots.get(clientId)!;
  }

  getSlots(clientId: string): { 1: BetSlotState; 2: BetSlotState } {
    return this.ensureClient(clientId);
  }

  placeBet(
    clientId: string,
    slotId: BetSlotId,
    rawAmount: number,
    currentRoundId: number,
    phase: RoundPhase,
    limits: { minBet: number; maxBet: number; maintenanceMode: boolean } = {
      minBet: 0.1,
      maxBet: 10000,
      maintenanceMode: false,
    }
  ): { ok: boolean; error?: string } {
    if (limits.maintenanceMode) {
      return {
        ok: false,
        error: 'O jogo está temporariamente em manutenção. Tente novamente em instantes.',
      };
    }

    const slots = this.ensureClient(clientId);
    const slot = slots[slotId];

    if (
      slot.status === 'PLACED' ||
      slot.status === 'ACTIVE' ||
      slot.status === 'QUEUED_NEXT'
    ) {
      return { ok: false, error: `O painel ${slotId} já tem uma aposta activa.` };
    }

    const parsed = Math.round(rawAmount * 100) / 100;
    if (!Number.isFinite(parsed) || parsed < limits.minBet || parsed > limits.maxBet) {
      return {
        ok: false,
        error: `Aposta permitida entre ${limits.minBet.toFixed(2)} e ${limits.maxBet.toFixed(2)} MZN.`,
      };
    }

    const amount = clampBetAmount(parsed);
    const debit = this.wallet.debit(clientId, amount);
    if (!debit.ok) {
      return { ok: false, error: 'Saldo virtual insuficiente.' };
    }

    slot.amount = amount;
    slot.cashoutMultiplier = null;
    slot.payout = null;

    if (phase === 'COUNTDOWN') {
      slot.status = 'PLACED';
      slot.activeRoundId = currentRoundId;
    } else {
      slot.status = 'QUEUED_NEXT';
      slot.activeRoundId = currentRoundId + 1;
    }

    return { ok: true };
  }

  cancelBet(
    clientId: string,
    slotId: BetSlotId
  ): { ok: boolean; error?: string } {
    const slots = this.ensureClient(clientId);
    const slot = slots[slotId];

    if (slot.status !== 'PLACED' && slot.status !== 'QUEUED_NEXT') {
      return { ok: false, error: 'Não é possível cancelar esta aposta agora.' };
    }

    this.wallet.credit(clientId, slot.amount);
    slot.status = 'IDLE';
    slot.activeRoundId = null;
    slot.cashoutMultiplier = null;
    slot.payout = null;

    return { ok: true };
  }

  cashout(
    clientId: string,
    slotId: BetSlotId,
    roundId: number,
    multiplier: number,
    phase: RoundPhase,
    crashPoint: number
  ): { ok: boolean; event?: BetOutcomeEvent; error?: string } {
    if (phase !== 'FLYING') {
      return { ok: false, error: 'A ronda não está em voo.' };
    }

    const slots = this.ensureClient(clientId);
    const slot = slots[slotId];

    if (slot.status !== 'ACTIVE' || slot.activeRoundId !== roundId) {
      return { ok: false, error: 'Sem aposta activa nesta ronda.' };
    }

    if (multiplier >= crashPoint) {
      return { ok: false, error: 'O avião já sofreu crash.' };
    }

    const payout = calculatePayout(slot.amount, multiplier);
    const profit = Math.round((payout - slot.amount) * 100) / 100;
    this.wallet.credit(clientId, payout);

    slot.status = 'CASHED_OUT';
    slot.cashoutMultiplier = multiplier;
    slot.payout = payout;

    const record: PersonalBetRecord = {
      id: `pbet-${roundId}-${slotId}-${Date.now()}`,
      roundId,
      timestamp: Date.now(),
      slotId,
      betAmount: slot.amount,
      cashoutMultiplier: multiplier,
      crashPoint,
      payout,
      profit,
      status: 'WON',
    };
    this.history.addPersonalBet(clientId, record);

    const profile = this.clientProfiles.get(clientId);
    const topWin: TopWinRecord = {
      id: `user-win-${roundId}-${slotId}-${clientId.slice(0, 6)}`,
      roundId,
      timestamp: Date.now(),
      avatarIndex: profile?.avatarIndex ?? 0,
      maskedName: profile ? profile.maskedName : 'Você',
      betAmount: slot.amount,
      cashoutMultiplier: multiplier,
      payout,
    };
    if (payout >= 15) {
      this.history.recordWin(topWin);
    }

    return {
      ok: true,
      event: {
        clientId,
        slotId,
        outcome: 'WON',
        betAmount: slot.amount,
        multiplier,
        payout,
        roundId,
      },
    };
  }

  updateAuto(
    clientId: string,
    slotId: BetSlotId,
    partial: Partial<AutoPlayConfig>
  ): void {
    const slots = this.ensureClient(clientId);
    const slot = slots[slotId];
    if (partial.autoBet !== undefined) {
      slot.auto.autoBet = Boolean(partial.autoBet);
    }
    if (partial.autoBetRoundsLeft !== undefined) {
      slot.auto.autoBetRoundsLeft = Math.max(
        0,
        Math.floor(partial.autoBetRoundsLeft)
      );
    }
    if (partial.autoCashout !== undefined) {
      slot.auto.autoCashout = Boolean(partial.autoCashout);
    }
    if (partial.autoCashoutMultiplier !== undefined) {
      slot.auto.autoCashoutMultiplier = clampAutoCashout(
        partial.autoCashoutMultiplier
      );
    }
  }

  onCountdownStart(newRoundId: number, maintenanceMode = false): void {
    for (const [clientId, slots] of this.clientSlots.entries()) {
      for (const slotId of [1, 2] as BetSlotId[]) {
        const slot = slots[slotId];

        // Clear previous round settled state
        if (slot.status === 'CASHED_OUT' || slot.status === 'LOST') {
          slot.status = 'IDLE';
          slot.activeRoundId = null;
          slot.cashoutMultiplier = null;
          slot.payout = null;
        }

        if (maintenanceMode) {
          continue;
        }

        // Promote queued bet to placed for this countdown
        if (slot.status === 'QUEUED_NEXT') {
          slot.status = 'PLACED';
          slot.activeRoundId = newRoundId;
          continue;
        }

        // Handle auto-bet if enabled and idle
        if (slot.status === 'IDLE' && slot.auto.autoBet) {
          const debit = this.wallet.debit(clientId, slot.amount);
          if (debit.ok) {
            slot.status = 'PLACED';
            slot.activeRoundId = newRoundId;
            if (slot.auto.autoBetRoundsLeft > 0) {
              slot.auto.autoBetRoundsLeft -= 1;
              if (slot.auto.autoBetRoundsLeft === 0) {
                slot.auto.autoBet = false;
              }
            }
          } else {
            // Stop autoBet when balance runs out
            slot.auto.autoBet = false;
          }
        }
      }
    }
  }

  onFlightStart(roundId: number): void {
    for (const slots of this.clientSlots.values()) {
      for (const slotId of [1, 2] as BetSlotId[]) {
        const slot = slots[slotId];
        if (slot.status === 'PLACED' && slot.activeRoundId === roundId) {
          slot.status = 'ACTIVE';
        }
      }
    }
  }

  processAutoCashouts(
    roundId: number,
    currentMultiplier: number,
    crashPoint: number
  ): BetOutcomeEvent[] {
    const events: BetOutcomeEvent[] = [];

    for (const [clientId, slots] of this.clientSlots.entries()) {
      for (const slotId of [1, 2] as BetSlotId[]) {
        const slot = slots[slotId];
        if (
          slot.status === 'ACTIVE' &&
          slot.activeRoundId === roundId &&
          slot.auto.autoCashout
        ) {
          const target = slot.auto.autoCashoutMultiplier;
          if (currentMultiplier >= target && target < crashPoint) {
            const res = this.cashout(
              clientId,
              slotId,
              roundId,
              target,
              'FLYING',
              crashPoint
            );
            if (res.ok && res.event) {
              events.push(res.event);
            }
          }
        }
      }
    }

    return events;
  }

  onRoundCrash(roundId: number, crashPoint: number): BetOutcomeEvent[] {
    const losses: BetOutcomeEvent[] = [];

    for (const [clientId, slots] of this.clientSlots.entries()) {
      for (const slotId of [1, 2] as BetSlotId[]) {
        const slot = slots[slotId];
        if (slot.status === 'ACTIVE' && slot.activeRoundId === roundId) {
          slot.status = 'LOST';
          slot.cashoutMultiplier = null;
          slot.payout = 0;

          this.history.addPersonalBet(clientId, {
            id: `pbet-${roundId}-${slotId}-${Date.now()}`,
            roundId,
            timestamp: Date.now(),
            slotId,
            betAmount: slot.amount,
            cashoutMultiplier: null,
            crashPoint,
            payout: 0,
            profit: -slot.amount,
            status: 'LOST',
          });

          losses.push({
            clientId,
            slotId,
            outcome: 'LOST',
            betAmount: slot.amount,
            multiplier: crashPoint,
            payout: 0,
            roundId,
          });
        }
      }
    }

    return losses;
  }

  getUserLiveBets(roundId: number): LivePlayerBet[] {
    const list: LivePlayerBet[] = [];
    for (const [clientId, slots] of this.clientSlots.entries()) {
      const profile = this.clientProfiles.get(clientId);
      for (const slotId of [1, 2] as BetSlotId[]) {
        const slot = slots[slotId];
        if (
          slot.activeRoundId === roundId &&
          (slot.status === 'PLACED' ||
            slot.status === 'ACTIVE' ||
            slot.status === 'CASHED_OUT' ||
            slot.status === 'LOST')
        ) {
          list.push({
            id: `user-${clientId}-${slotId}-${roundId}`,
            avatarIndex: profile?.avatarIndex ?? 0,
            maskedName: profile ? `${profile.maskedName} (P${slotId})` : `Você (P${slotId})`,
            betAmount: slot.amount,
            cashoutMultiplier: slot.cashoutMultiplier,
            payout: slot.payout,
            isUser: true,
            slotId,
          });
        }
      }
    }
    return list;
  }
}
