'use client';

import React from 'react';
import { BetPanel } from '@/components/betting/BetPanel';
import { formatMoney } from '@/shared/format';
import { BetSlotId, BetSlotState, RoundPhase } from '@/shared/types';

interface BettingConsoleProps {
  slots: {
    1: BetSlotState;
    2: BetSlotState;
  };
  phase: RoundPhase;
  multiplier: number;
  balance: number;
  currency: string;
  remainingBetsCount: number;
  totalBetsCount: number;
  totalRoundPayout: number;
  onUpdateAmount: (slotId: BetSlotId, amount: number) => void;
  onPlaceBet: (slotId: BetSlotId, amount: number) => void;
  onCancelBet: (slotId: BetSlotId) => void;
  onCashout: (slotId: BetSlotId) => void;
  onUpdateAuto: (
    slotId: BetSlotId,
    auto: Partial<BetSlotState['auto']>
  ) => void;
}

export function BettingConsole({
  slots,
  phase,
  multiplier,
  balance,
  currency,
  remainingBetsCount,
  totalBetsCount,
  totalRoundPayout,
  onUpdateAmount,
  onPlaceBet,
  onCancelBet,
  onCashout,
  onUpdateAuto,
}: BettingConsoleProps) {
  return (
    <section className="bg-[#121318] border border-[#22242e] rounded-2xl p-2.5 sm:p-3 flex flex-col gap-2.5 shrink-0">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
        <BetPanel
          slot={slots[1]}
          phase={phase}
          currentMultiplier={multiplier}
          balance={balance}
          currency={currency}
          onUpdateAmount={onUpdateAmount}
          onPlaceBet={onPlaceBet}
          onCancelBet={onCancelBet}
          onCashout={onCashout}
          onUpdateAuto={onUpdateAuto}
        />
        <BetPanel
          slot={slots[2]}
          phase={phase}
          currentMultiplier={multiplier}
          balance={balance}
          currency={currency}
          onUpdateAmount={onUpdateAmount}
          onPlaceBet={onPlaceBet}
          onCancelBet={onCancelBet}
          onCashout={onCashout}
          onUpdateAuto={onUpdateAuto}
        />
      </div>

      {/* Totals Footer matching reference */}
      <div className="flex items-center justify-between px-1.5 pt-0.5 text-[11px] sm:text-[12px]">
        <div className="flex flex-col">
          <span className="text-[#888b99] text-[10px]">Total de apostas</span>
          <span className="font-bold font-mono tabular-nums text-white">
            {remainingBetsCount}/{totalBetsCount}
          </span>
        </div>

        <div className="flex flex-col text-right">
          <span className="text-[#888b99] text-[10px]">Ganho total {currency}</span>
          <span className="font-bold font-mono tabular-nums text-white">
            {formatMoney(totalRoundPayout)}
          </span>
        </div>
      </div>
    </section>
  );
}
