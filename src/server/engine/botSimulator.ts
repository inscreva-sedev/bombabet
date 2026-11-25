import { LivePlayerBet, TopWinRecord } from '@/shared/types';
import { calculatePayout } from '@/server/engine/multiplier';

interface SimulatedBot extends LivePlayerBet {
  joinAtRemainingMs: number;
  targetCashout: number | null;
}

const HIGH_STAKES_POOL = [
  5305.73, 3337.95, 1390.81, 1112.65, 1061.15, 1008.09, 700.35, 695.57,
  450.0, 320.5, 250.0, 180.0, 120.0, 85.0, 50.0, 35.0, 20.0, 10.0, 8.0, 5.0,
];

function randomMaskedName(): string {
  const lead = Math.random() < 0.25 ? String(Math.floor(Math.random() * 9) + 1) : '*';
  const tail = String(Math.floor(Math.random() * 10));
  return `${lead}****${tail}`;
}

function randomTargetCashout(): number | null {
  const r = Math.random();
  if (r < 0.16) return null; // stays in until high or crashes
  if (r < 0.56) {
    // 1.15x - 1.98x
    return Math.round((1.15 + Math.random() * 0.83) * 100) / 100;
  }
  if (r < 0.86) {
    // 2.00x - 4.50x
    return Math.round((2.0 + Math.random() * 2.5) * 100) / 100;
  }
  // 4.50x - 12.00x
  return Math.round((4.5 + Math.random() * 7.5) * 100) / 100;
}

export class BotSimulator {
  private bots: SimulatedBot[] = [];
  private baseScaleFactor = 68; // represents broader lobby volume alongside visible list
  private totalLobbyCount = 0;

  prepareRound(roundId: number, countdownTotalMs: number): void {
    const visibleCount = 24 + Math.floor(Math.random() * 12);
    this.bots = [];

    for (let i = 0; i < visibleCount; i++) {
      const amount =
        i < 8
          ? HIGH_STAKES_POOL[i % HIGH_STAKES_POOL.length]
          : HIGH_STAKES_POOL[Math.floor(Math.random() * HIGH_STAKES_POOL.length)];

      // Distribute entry over countdown window
      const joinAtRemainingMs = Math.floor(
        countdownTotalMs * (0.15 + Math.random() * 0.85)
      );

      this.bots.push({
        id: `bot-${roundId}-${i}`,
        avatarIndex: Math.floor(Math.random() * 6),
        maskedName: randomMaskedName(),
        betAmount: amount,
        cashoutMultiplier: null,
        payout: null,
        joinAtRemainingMs,
        targetCashout: randomTargetCashout(),
      });
    }

    this.bots.sort((a, b) => b.betAmount - a.betAmount);
    this.totalLobbyCount = visibleCount * this.baseScaleFactor + Math.floor(Math.random() * 180);
  }

  getActiveBetsDuringCountdown(countdownRemainingMs: number): {
    bets: LivePlayerBet[];
    totalCount: number;
  } {
    const visible = this.bots.filter(
      (b) => countdownRemainingMs <= b.joinAtRemainingMs
    );
    const ratio = visible.length / Math.max(1, this.bots.length);
    return {
      bets: visible.map(({ joinAtRemainingMs: _j, targetCashout: _t, ...rest }) => rest),
      totalCount: Math.max(visible.length, Math.round(this.totalLobbyCount * ratio)),
    };
  }

  stepFlight(
    roundId: number,
    currentMultiplier: number,
    onTopWin: (win: TopWinRecord) => void
  ): {
    bets: LivePlayerBet[];
    totalCount: number;
    remainingCount: number;
    totalPayout: number;
  } {
    let cashedCount = 0;
    let visiblePayout = 0;

    for (const bot of this.bots) {
      if (
        bot.cashoutMultiplier === null &&
        bot.targetCashout !== null &&
        currentMultiplier >= bot.targetCashout
      ) {
        bot.cashoutMultiplier = bot.targetCashout;
        bot.payout = calculatePayout(bot.betAmount, bot.targetCashout);
        if (bot.payout >= 1500) {
          onTopWin({
            id: `win-${roundId}-${bot.id}`,
            roundId,
            timestamp: Date.now(),
            avatarIndex: bot.avatarIndex,
            maskedName: bot.maskedName,
            betAmount: bot.betAmount,
            cashoutMultiplier: bot.cashoutMultiplier,
            payout: bot.payout,
          });
        }
      }

      if (bot.cashoutMultiplier !== null && bot.payout !== null) {
        cashedCount++;
        visiblePayout += bot.payout;
      }
    }

    const remainingRatio =
      (this.bots.length - cashedCount) / Math.max(1, this.bots.length);
    const remainingCount = Math.max(
      this.bots.length - cashedCount,
      Math.round(this.totalLobbyCount * remainingRatio)
    );

    const sorted = [...this.bots].sort((a, b) => {
      // Show cashed-out big wins & high bets near top like reference
      const aCashed = a.cashoutMultiplier !== null ? 1 : 0;
      const bCashed = b.cashoutMultiplier !== null ? 1 : 0;
      if (aCashed !== bCashed) return bCashed - aCashed;
      return b.betAmount - a.betAmount;
    });

    return {
      bets: sorted.map(({ joinAtRemainingMs: _j, targetCashout: _t, ...rest }) => rest),
      totalCount: this.totalLobbyCount,
      remainingCount,
      totalPayout: Math.round(visiblePayout * 100) / 100,
    };
  }

  getAllBotsSnapshot(): {
    bets: LivePlayerBet[];
    totalCount: number;
    totalPayout: number;
  } {
    let totalPayout = 0;
    for (const b of this.bots) {
      if (b.payout) totalPayout += b.payout;
    }
    return {
      bets: this.bots.map(({ joinAtRemainingMs: _j, targetCashout: _t, ...rest }) => rest),
      totalCount: this.totalLobbyCount,
      totalPayout: Math.round(totalPayout * 100) / 100,
    };
  }
}
