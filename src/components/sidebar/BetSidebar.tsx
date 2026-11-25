'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { History, ShieldCheck, ArrowLeft } from 'lucide-react';
import { AviatorLogo, PlayerAvatar } from '@/components/icons/AviatorLogo';
import { formatMoney } from '@/shared/format';
import { LivePlayerBet, PersonalBetRecord, PreviousRoundSnapshot, TopWinRecord } from '@/shared/types';

type SidebarTab = 'all' | 'mine' | 'top';

interface BetSidebarProps {
  currency: string;
  liveBets: LivePlayerBet[];
  totalBetsCount: number;
  personalHistory: PersonalBetRecord[];
  topWins: TopWinRecord[];
  previousRound: PreviousRoundSnapshot | null;
  onOpenMechanics: () => void;
}

export function BetSidebar({
  currency,
  liveBets,
  totalBetsCount,
  personalHistory,
  topWins,
  previousRound,
  onOpenMechanics,
}: BetSidebarProps) {
  const [activeTab, setActiveTab] = useState<SidebarTab>('all');
  const [showingPreviousRound, setShowingPreviousRound] = useState(false);

  const displayedLiveBets = useMemo(() => {
    if (showingPreviousRound && previousRound) {
      return previousRound.bets;
    }
    return liveBets;
  }, [showingPreviousRound, previousRound, liveBets]);

  const [currentClock, setCurrentClock] = useState('--:--');

  useEffect(() => {
    const updateClock = () => {
      setCurrentClock(
        new Date().toLocaleTimeString('pt-PT', {
          hour: '2-digit',
          minute: '2-digit',
        })
      );
    };
    updateClock();
    const id = setInterval(updateClock, 15000);
    return () => clearInterval(id);
  }, []);

  return (
    <aside className="w-full lg:w-[375px] xl:w-[405px] shrink-0 bg-[#1b1c22] rounded-2xl border border-[#24252f] flex flex-col overflow-hidden h-[420px] lg:h-full">
      {/* Segmented Tabs */}
      <div className="p-2.5 pb-2 shrink-0">
        <div className="flex items-center gap-1 bg-[#14151b] p-1 rounded-full border border-[#22242e]">
          <button
            type="button"
            onClick={() => {
              setActiveTab('all');
              setShowingPreviousRound(false);
            }}
            className={`flex-1 py-1.5 px-2 rounded-full text-[11px] font-medium transition-colors whitespace-nowrap ${
              activeTab === 'all'
                ? 'bg-[#2c2d37] text-white shadow-sm'
                : 'text-[#8e92a1] hover:text-white'
            }`}
          >
            Todas as apostas
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('mine');
              setShowingPreviousRound(false);
            }}
            className={`flex-1 py-1.5 px-2 rounded-full text-[11px] font-medium transition-colors whitespace-nowrap ${
              activeTab === 'mine'
                ? 'bg-[#2c2d37] text-white shadow-sm'
                : 'text-[#8e92a1] hover:text-white'
            }`}
          >
            As minhas apostas
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('top');
              setShowingPreviousRound(false);
            }}
            className={`flex-1 py-1.5 px-2 rounded-full text-[11px] font-medium transition-colors whitespace-nowrap ${
              activeTab === 'top'
                ? 'bg-[#2c2d37] text-white shadow-sm'
                : 'text-[#8e92a1] hover:text-white'
            }`}
          >
            Principais Ganhos
          </button>
        </div>
      </div>

      {/* Sub-header */}
      <div className="px-3 pb-2 flex items-center justify-between gap-2 shrink-0">
        {showingPreviousRound && previousRound ? (
          <div className="flex items-center gap-2 text-[12px]">
            <span className="font-semibold text-white">
              Ronda #{previousRound.roundId}
            </span>
            <span className="px-2 py-0.5 rounded-full bg-[#242530] text-[#9d5cf6] font-mono font-bold text-[11px]">
              {previousRound.crashPoint.toFixed(2)}x
            </span>
          </div>
        ) : (
          <div className="text-[12px] font-semibold text-white">
            Total de apostas{' '}
            <span className="font-mono tabular-nums text-[#d8dae2]">
              {activeTab === 'all'
                ? totalBetsCount
                : activeTab === 'mine'
                  ? personalHistory.length
                  : topWins.length}
            </span>
          </div>
        )}

        {activeTab === 'all' && previousRound && (
          <button
            type="button"
            onClick={() => setShowingPreviousRound((v) => !v)}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors ${
              showingPreviousRound
                ? 'bg-[#2e303d] border-[#45485c] text-white'
                : 'bg-[#21222b] border-[#2e303c] text-[#b4b7c4] hover:text-white hover:bg-[#2a2b36]'
            }`}
          >
            {showingPreviousRound ? (
              <>
                <ArrowLeft className="w-3 h-3" />
                Ronda actual
              </>
            ) : (
              <>
                <History className="w-3 h-3" />
                Ronda anterior
              </>
            )}
          </button>
        )}
      </div>

      {/* Column Headers */}
      <div className="px-3 py-1.5 grid grid-cols-12 text-[11px] font-medium text-[#7b7e8c] border-y border-[#232530] bg-[#181920] shrink-0">
        <div className="col-span-4">Jogador</div>
        <div className="col-span-5 text-center">
          {activeTab === 'mine' ? `Aposta ${currency} / Crash` : `Aposta ${currency} X`}
        </div>
        <div className="col-span-3 text-right">Ganho {currency}</div>
      </div>

      {/* Rows */}
      <div className="flex-1 overflow-y-auto px-2 py-1.5 space-y-1">
        {activeTab === 'all' && (
          <>
            {displayedLiveBets.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-[#6e7180]">
                A aguardar apostas desta ronda...
              </div>
            ) : (
              displayedLiveBets.map((bet) => {
                const cashed = bet.cashoutMultiplier !== null && bet.payout !== null;
                return (
                  <div
                    key={bet.id}
                    className={`grid grid-cols-12 items-center px-2 py-1.5 rounded-lg border text-[12px] transition-colors ${
                      cashed
                        ? 'bg-[#172e19] border-[#274b29]'
                        : bet.isUser
                          ? 'bg-[#232433] border-[#393d54]'
                          : 'bg-[#15161c] border-[#1e2029]'
                    }`}
                  >
                    <div className="col-span-4 flex items-center gap-2 min-w-0">
                      <PlayerAvatar index={bet.avatarIndex} isUser={bet.isUser} />
                      <span
                        className={`truncate font-mono text-[12px] ${
                          bet.isUser ? 'text-[#7af060] font-semibold' : 'text-[#c2c5d0]'
                        }`}
                      >
                        {bet.maskedName}
                      </span>
                    </div>

                    <div className="col-span-5 flex items-center justify-center gap-1.5">
                      <span className="font-mono tabular-nums text-[#e6e7ec]">
                        {formatMoney(bet.betAmount)}
                      </span>
                      {cashed && (
                        <span className="px-1.5 py-0.5 rounded-full bg-[#2eb617] text-white text-[10px] font-bold font-mono tabular-nums leading-none">
                          {bet.cashoutMultiplier!.toFixed(2)}x
                        </span>
                      )}
                    </div>

                    <div className="col-span-3 text-right font-mono tabular-nums font-semibold">
                      {cashed ? (
                        <span className="text-white">{formatMoney(bet.payout!)}</span>
                      ) : (
                        <span className="text-[#4a4d5c]">—</span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </>
        )}

        {activeTab === 'mine' && (
          <>
            {personalHistory.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center px-4 text-xs text-[#737685] gap-1">
                <span>Ainda não realizou apostas nesta sessão.</span>
                <span className="text-[11px] text-[#565968]">
                  Use os painéis de aposta abaixo para entrar na próxima ronda.
                </span>
              </div>
            ) : (
              personalHistory.map((item) => {
                const won = item.status === 'WON';
                return (
                  <div
                    key={item.id}
                    className={`grid grid-cols-12 items-center px-2.5 py-2 rounded-lg border text-[12px] ${
                      won
                        ? 'bg-[#172e19] border-[#274b29]'
                        : 'bg-[#25171c] border-[#3d2129]'
                    }`}
                  >
                    <div className="col-span-4 flex flex-col min-w-0">
                      <span className="text-[11px] font-semibold text-white">
                        Painel {item.slotId} • #{item.roundId}
                      </span>
                      <span className="text-[10px] text-[#8d91a0]">
                        {new Date(item.timestamp).toLocaleTimeString('pt-PT', {
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                        })}
                      </span>
                    </div>

                    <div className="col-span-5 flex items-center justify-center gap-1.5">
                      <span className="font-mono tabular-nums text-[#e6e7ec]">
                        {formatMoney(item.betAmount)}
                      </span>
                      {won && item.cashoutMultiplier ? (
                        <span className="px-1.5 py-0.5 rounded-full bg-[#2eb617] text-white text-[10px] font-bold font-mono leading-none">
                          {item.cashoutMultiplier.toFixed(2)}x
                        </span>
                      ) : (
                        <span className="px-1.5 py-0.5 rounded-full bg-[#4a222c] text-[#ff708c] text-[10px] font-bold font-mono leading-none">
                          @{item.crashPoint.toFixed(2)}x
                        </span>
                      )}
                    </div>

                    <div className="col-span-3 text-right font-mono tabular-nums font-semibold">
                      {won ? (
                        <span className="text-[#6ef056]">+{formatMoney(item.payout)}</span>
                      ) : (
                        <span className="text-[#ff6a85]">-{formatMoney(item.betAmount)}</span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </>
        )}

        {activeTab === 'top' && (
          <>
            {topWins.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-[#737685]">
                Os maiores ganhos aparecerão aqui após as rondas.
              </div>
            ) : (
              topWins.map((win) => (
                <div
                  key={win.id}
                  className="grid grid-cols-12 items-center px-2 py-1.5 rounded-lg border bg-[#172e19] border-[#274b29] text-[12px]"
                >
                  <div className="col-span-4 flex items-center gap-2 min-w-0">
                    <PlayerAvatar index={win.avatarIndex} />
                    <div className="min-w-0">
                      <div className="truncate font-mono text-[12px] text-[#e5e7ef]">
                        {win.maskedName}
                      </div>
                      <div className="text-[10px] text-[#7c8c7e]">Ronda #{win.roundId}</div>
                    </div>
                  </div>

                  <div className="col-span-5 flex items-center justify-center gap-1.5">
                    <span className="font-mono tabular-nums text-[#e6e7ec]">
                      {formatMoney(win.betAmount)}
                    </span>
                    <span className="px-1.5 py-0.5 rounded-full bg-[#2eb617] text-white text-[10px] font-bold font-mono leading-none">
                      {win.cashoutMultiplier.toFixed(2)}x
                    </span>
                  </div>

                  <div className="col-span-3 text-right font-mono tabular-nums font-bold text-[#7df564]">
                    {formatMoney(win.payout)}
                  </div>
                </div>
              ))
            )}
          </>
        )}
      </div>

      {/* Sidebar Footer */}
      <div className="px-3 py-2 bg-[#14151b] border-t border-[#232530] flex items-center justify-between gap-2 shrink-0">
        <button
          type="button"
          onClick={onOpenMechanics}
          className="inline-flex items-center gap-1.5 text-[11px] text-[#c7cad6] hover:text-white transition-colors"
        >
          <ShieldCheck className="w-4 h-4 text-[#36b51a]" />
          <span className="underline underline-offset-2 decoration-[#505466]">
            Mecânica do jogo
          </span>
          <span className="text-[#6f7282] ml-1">Version 1.0.1</span>
          <span className="text-[#8e92a1] font-mono">{currentClock}</span>
        </button>

        <AviatorLogo size="sm" showStudio />
      </div>
    </aside>
  );
}
