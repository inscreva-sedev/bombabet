'use client';

import React, { useEffect, useState } from 'react';
import { Minus, Plus, RotateCw } from 'lucide-react';
import { clampAutoCashout, clampBetAmount, formatMoney } from '@/shared/format';
import { BetSlotId, BetSlotState, RoundPhase } from '@/shared/types';

interface BetPanelProps {
  slot: BetSlotState;
  phase: RoundPhase;
  currentMultiplier: number;
  balance: number;
  currency: string;
  onUpdateAmount: (slotId: BetSlotId, amount: number) => void;
  onPlaceBet: (slotId: BetSlotId, amount: number) => void;
  onCancelBet: (slotId: BetSlotId) => void;
  onCashout: (slotId: BetSlotId) => void;
  onUpdateAuto: (
    slotId: BetSlotId,
    auto: Partial<BetSlotState['auto']>
  ) => void;
}

const QUICK_AMOUNTS = [1, 2, 5, 10];

export function BetPanel({
  slot,
  phase,
  currentMultiplier,
  balance,
  currency,
  onUpdateAmount,
  onPlaceBet,
  onCancelBet,
  onCashout,
  onUpdateAuto,
}: BetPanelProps) {
  const [inputValue, setInputValue] = useState<string>(slot.amount.toFixed(2));
  const [autoCashoutInput, setAutoCashoutInput] = useState<string>(
    slot.auto.autoCashoutMultiplier.toFixed(2)
  );
  const [showAutoConfig, setShowAutoConfig] = useState(false);

  useEffect(() => {
    setInputValue(slot.amount.toFixed(2));
  }, [slot.amount]);

  useEffect(() => {
    setAutoCashoutInput(slot.auto.autoCashoutMultiplier.toFixed(2));
  }, [slot.auto.autoCashoutMultiplier]);

  const isBetLocked =
    slot.status === 'PLACED' ||
    slot.status === 'ACTIVE' ||
    slot.status === 'QUEUED_NEXT';

  const handleAdjustAmount = (delta: number) => {
    if (isBetLocked) return;
    const next = clampBetAmount(slot.amount + delta);
    onUpdateAmount(slot.slotId, next);
  };

  const handleQuickAmount = (value: number) => {
    if (isBetLocked) return;
    onUpdateAmount(slot.slotId, clampBetAmount(value));
  };

  const commitInputAmount = () => {
    const parsed = parseFloat(inputValue.replace(',', '.'));
    const next = clampBetAmount(Number.isNaN(parsed) ? slot.amount : parsed);
    onUpdateAmount(slot.slotId, next);
    setInputValue(next.toFixed(2));
  };

  const commitAutoCashout = () => {
    const parsed = parseFloat(autoCashoutInput.replace(',', '.'));
    const next = clampAutoCashout(
      Number.isNaN(parsed) ? slot.auto.autoCashoutMultiplier : parsed
    );
    onUpdateAuto(slot.slotId, { autoCashoutMultiplier: next });
    setAutoCashoutInput(next.toFixed(2));
  };

  // Determine main action button appearance & behavior
  const isCashoutAvailable = slot.status === 'ACTIVE' && phase === 'FLYING';
  const isCancelAvailable =
    slot.status === 'PLACED' || slot.status === 'QUEUED_NEXT';
  const potentialWin = slot.amount * currentMultiplier;

  const canAfford = balance >= slot.amount;

  const handleMainButton = () => {
    if (isCashoutAvailable) {
      onCashout(slot.slotId);
      return;
    }
    if (isCancelAvailable) {
      onCancelBet(slot.slotId);
      return;
    }
    if (!canAfford) return;
    onPlaceBet(slot.slotId, slot.amount);
  };

  return (
    <div className="bg-[#1b1c22] border border-[#282a35] rounded-2xl p-3 flex flex-col gap-2.5 shadow-inner">
      {/* Main Row: Amount Controls + Action Button */}
      <div className="grid grid-cols-12 gap-2.5 items-stretch">
        {/* Left: Stepper + Quick Chips */}
        <div className="col-span-6 flex flex-col gap-2">
          <div
            className={`flex items-center justify-between bg-[#111217] border border-[#2a2c38] rounded-full px-1.5 py-1 ${
              isBetLocked ? 'opacity-60 pointer-events-none' : ''
            }`}
          >
            <button
              type="button"
              onClick={() => handleAdjustAmount(-1)}
              disabled={isBetLocked || slot.amount <= 0.1}
              className="w-7 h-7 rounded-full border border-[#3a3d4d] bg-[#1e2029] hover:bg-[#2a2d3a] text-[#d5d7e0] flex items-center justify-center transition-colors disabled:opacity-40"
              aria-label={`Diminuir aposta do painel ${slot.slotId}`}
            >
              <Minus className="w-3.5 h-3.5" />
            </button>

            <input
              type="text"
              inputMode="decimal"
              value={inputValue}
              disabled={isBetLocked}
              onChange={(e) => setInputValue(e.target.value)}
              onBlur={commitInputAmount}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitInputAmount();
              }}
              aria-label={`Valor da aposta painel ${slot.slotId}`}
              className="w-full text-center bg-transparent text-white font-bold font-mono tabular-nums text-[15px] focus:outline-none px-1"
            />

            <button
              type="button"
              onClick={() => handleAdjustAmount(1)}
              disabled={isBetLocked}
              className="w-7 h-7 rounded-full border border-[#3a3d4d] bg-[#1e2029] hover:bg-[#2a2d3a] text-[#d5d7e0] flex items-center justify-center transition-colors disabled:opacity-40"
              aria-label={`Aumentar aposta do painel ${slot.slotId}`}
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>

          <div
            className={`grid grid-cols-4 gap-1.5 ${
              isBetLocked ? 'opacity-60 pointer-events-none' : ''
            }`}
          >
            {QUICK_AMOUNTS.map((val) => {
              const selected = Math.abs(slot.amount - val) < 0.001;
              return (
                <button
                  key={val}
                  type="button"
                  onClick={() => handleQuickAmount(val)}
                  disabled={isBetLocked}
                  className={`py-1 rounded-full text-[12px] font-semibold font-mono transition-colors border ${
                    selected
                      ? 'bg-[#2c2f3c] border-[#4b5066] text-white'
                      : 'bg-[#13141a] border-[#252733] text-[#a7aab8] hover:text-white hover:bg-[#22242e]'
                  }`}
                >
                  {val}
                </button>
              );
            })}
          </div>
        </div>

        {/* Right: Primary Bet / Cancel / Cashout Button */}
        <div className="col-span-6 flex">
          <button
            type="button"
            onClick={handleMainButton}
            disabled={!isCashoutAvailable && !isCancelAvailable && !canAfford}
            className={`w-full min-h-[76px] rounded-xl px-3 py-2 flex flex-col items-center justify-center text-white transition-all active:scale-[0.985] shadow-md border ${
              isCashoutAvailable
                ? 'bg-gradient-to-b from-[#ef9b1a] to-[#cc750b] hover:from-[#f7a828] hover:to-[#d97e0d] border-[#ffb84d]/50 shadow-amber-900/30'
                : isCancelAvailable
                  ? 'bg-gradient-to-b from-[#e0314a] to-[#b51830] hover:from-[#ed3b54] hover:to-[#c71e38] border-[#ff6b81]/40 shadow-rose-950/30'
                  : canAfford
                    ? 'bg-gradient-to-b from-[#39ba1d] to-[#279914] hover:from-[#40c922] hover:to-[#2da918] border-[#66e04d]/35 shadow-emerald-950/30'
                    : 'bg-[#2a2c36] border-[#383b48] text-[#7a7e8f] cursor-not-allowed'
            }`}
          >
            {isCashoutAvailable ? (
              <>
                <span className="text-[13px] font-bold uppercase tracking-wide leading-tight">
                  Levantar
                </span>
                <span className="text-[18px] font-extrabold font-mono tabular-nums leading-tight mt-0.5">
                  {formatMoney(potentialWin)} {currency}
                </span>
              </>
            ) : isCancelAvailable ? (
              <>
                <span className="text-[15px] font-bold leading-tight">Cancelar</span>
                <span className="text-[11px] text-white/90 mt-0.5">
                  {slot.status === 'QUEUED_NEXT'
                    ? 'Agendada p/ próxima ronda'
                    : `${formatMoney(slot.amount)} ${currency}`}
                </span>
              </>
            ) : (
              <>
                <span className="text-[13px] font-semibold leading-tight">
                  {phase === 'FLYING' ? 'Apostar (próxima)' : 'Aposta'}
                </span>
                <span className="text-[18px] font-extrabold font-mono tabular-nums leading-tight mt-0.5">
                  {formatMoney(slot.amount)} {currency}
                </span>
                {!canAfford && (
                  <span className="text-[10px] text-[#ff8799] mt-0.5">
                    Saldo insuficiente
                  </span>
                )}
              </>
            )}
          </button>
        </div>
      </div>

      {/* Bottom Row: Auto Bet & Auto Cashout */}
      <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 pt-1 border-t border-[#242630]">
        {/* Auto Bet */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() =>
              onUpdateAuto(slot.slotId, { autoBet: !slot.auto.autoBet })
            }
            className={`flex items-center justify-center gap-1.5 py-1.5 px-2.5 rounded-full text-[11px] font-medium border transition-colors whitespace-nowrap ${
              slot.auto.autoBet
                ? 'bg-[#19331c] border-[#36b51a] text-[#7ef263]'
                : 'bg-[#13141a] border-[#262834] text-[#b4b7c4] hover:text-white hover:bg-[#1e2029]'
            }`}
          >
            <RotateCw className="w-3 h-3 shrink-0" />
            <span>Jogo Automático</span>
          </button>
          <button
            type="button"
            onClick={() => setShowAutoConfig((v) => !v)}
            title="Configurar número de rondas automáticas"
            className="px-2 py-1.5 rounded-full text-[10px] font-mono bg-[#13141a] border border-[#262834] text-[#9ea2b0] hover:text-white"
          >
            {slot.auto.autoBetRoundsLeft > 0 ? `${slot.auto.autoBetRoundsLeft}x` : '∞'}
          </button>
        </div>

        {/* Auto Cashout */}
        <div className="flex-1 min-w-[205px] flex items-center justify-between gap-1.5 bg-[#13141a] border border-[#262834] rounded-full px-2.5 py-1">
          <button
            type="button"
            onClick={() =>
              onUpdateAuto(slot.slotId, { autoCashout: !slot.auto.autoCashout })
            }
            className={`flex items-center gap-1.5 text-[11px] font-medium transition-colors whitespace-nowrap ${
              slot.auto.autoCashout ? 'text-[#7ef263]' : 'text-[#b4b7c4] hover:text-white'
            }`}
          >
            <span
              className={`w-6 h-3.5 rounded-full relative transition-colors shrink-0 ${
                slot.auto.autoCashout ? 'bg-[#36b51a]' : 'bg-[#2f3240]'
              }`}
            >
              <span
                className={`absolute top-0.5 w-2.5 h-2.5 rounded-full bg-white transition-transform ${
                  slot.auto.autoCashout ? 'left-3' : 'left-0.5'
                }`}
              />
            </span>
            <span>Levantamento Auto</span>
          </button>

          <div className="flex items-center bg-[#1c1e26] border border-[#2e303d] rounded-full px-2 py-0.5 shrink-0">
            <input
              type="text"
              inputMode="decimal"
              value={autoCashoutInput}
              onChange={(e) => setAutoCashoutInput(e.target.value)}
              onBlur={commitAutoCashout}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitAutoCashout();
              }}
              aria-label={`Multiplicador de levantamento automático painel ${slot.slotId}`}
              className="w-11 bg-transparent text-right text-[11px] font-bold font-mono text-white focus:outline-none pr-0.5"
            />
            <span className="text-[10px] text-[#8d91a0]">x</span>
          </div>
        </div>
      </div>

      {/* Expandable Auto Bet Rounds Selector */}
      {showAutoConfig && (
        <div className="flex items-center justify-between gap-2 bg-[#13141a] border border-[#262834] rounded-xl px-2.5 py-1.5 text-[11px]">
          <span className="text-[#9ea2b0]">Rondas automáticas:</span>
          <div className="flex items-center gap-1">
            {[0, 5, 10, 25, 50].map((count) => {
              const active = slot.auto.autoBetRoundsLeft === count;
              return (
                <button
                  key={count}
                  type="button"
                  onClick={() => {
                    onUpdateAuto(slot.slotId, { autoBetRoundsLeft: count });
                    setShowAutoConfig(false);
                  }}
                  className={`px-2 py-0.5 rounded-full font-mono transition-colors ${
                    active
                      ? 'bg-[#36b51a] text-white font-bold'
                      : 'bg-[#1e2029] text-[#b4b7c4] hover:text-white'
                  }`}
                >
                  {count === 0 ? '∞' : count}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
