'use client';

import React from 'react';
import Link from 'next/link';
import { Menu, ChevronDown, Volume2, VolumeX, HelpCircle, UserPlus, UserCheck, Shield } from 'lucide-react';
import { AviatorLogo } from '@/components/icons/AviatorLogo';
import { formatMoney, getMultiplierBadgeColor } from '@/shared/format';
import { AuthUser, RoundHistoryItem, RoundPhase } from '@/shared/types';

interface TopBarProps {
  balance: number;
  currency: string;
  roundId: number;
  phase: RoundPhase;
  user: AuthUser | null;
  history: RoundHistoryItem[];
  soundEnabled: boolean;
  onToggleSound: () => void;
  onOpenSettings: () => void;
  onOpenHistory: () => void;
  onOpenMechanics: () => void;
  onOpenAuth: (mode: 'register' | 'login') => void;
}

export function TopBar({
  balance,
  currency,
  roundId,
  phase,
  user,
  history,
  soundEnabled,
  onToggleSound,
  onOpenSettings,
  onOpenHistory,
  onOpenMechanics,
  onOpenAuth,
}: TopBarProps) {
  const phaseLabel =
    phase === 'COUNTDOWN' ? 'Apostas' : phase === 'FLYING' ? 'Em voo' : 'Fim';
  const phaseDot =
    phase === 'COUNTDOWN'
      ? 'bg-amber-400'
      : phase === 'FLYING'
        ? 'bg-[#36b51a]'
        : 'bg-[#e50539]';

  return (
    <header className="w-full bg-[#0e0f14] border-b border-[#1c1d26] shrink-0">
      <div className="flex flex-col lg:flex-row lg:items-center w-full">
        {/* Left Header Block (matches sidebar width on desktop) */}
        <div className="flex items-center justify-between gap-2 px-3 py-2 lg:w-[375px] xl:w-[405px] shrink-0 border-b lg:border-b-0 border-[#1c1d26] overflow-hidden">
          <div className="flex items-center gap-2 min-w-0 shrink-0">
            <AviatorLogo size="md" />
            <div
              className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#171820] border border-[#262834] text-[10px] text-[#a5a8b6] whitespace-nowrap shrink-0"
              title={`Ronda actual #${roundId} (${phaseLabel})`}
            >
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${phaseDot}`} />
              <span className="font-mono font-semibold">#{roundId}</span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <div className="flex items-baseline gap-1 px-2 py-1 rounded-full bg-[#15171e] border border-[#232631] whitespace-nowrap">
              <span className="text-[13px] font-bold text-[#36b51a] font-mono tabular-nums">
                {formatMoney(balance)}
              </span>
              <span className="text-[11px] font-semibold text-[#c9ccd6]">{currency}</span>
            </div>

            <button
              type="button"
              onClick={onToggleSound}
              className="p-1.5 rounded-lg text-[#8c909e] hover:text-white hover:bg-[#1d1f28] transition-colors shrink-0"
              title={soundEnabled ? 'Silenciar som' : 'Activar som'}
              aria-label={soundEnabled ? 'Silenciar som' : 'Activar som'}
            >
              {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </button>

            <button
              type="button"
              onClick={onOpenSettings}
              className="p-1.5 rounded-lg text-[#c5c7d0] hover:text-white hover:bg-[#1d1f28] transition-colors shrink-0"
              title="Menu e definições"
              aria-label="Abrir menu e definições"
            >
              <Menu className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Right Header Block: Multiplier History Ribbon */}
        <div className="flex-1 flex items-center justify-between gap-2 px-2.5 py-1.5 min-w-0">
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5 flex-1 min-w-0">
            {history.slice(0, 24).map((item, idx) => (
              <button
                key={`${item.roundId}-${idx}`}
                type="button"
                onClick={onOpenHistory}
                title={`Ronda #${item.roundId} — Crash em ${item.crashPoint.toFixed(2)}x`}
                className={`px-2 py-0.5 rounded-full text-[12px] font-bold font-mono tabular-nums bg-[#171820] hover:bg-[#232531] border border-[#222430] shrink-0 transition-colors ${getMultiplierBadgeColor(
                  item.crashPoint
                )}`}
              >
                {item.crashPoint.toFixed(2)}x
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1 shrink-0 pl-1 border-l border-[#1e202b]">
            <button
              type="button"
              onClick={onOpenHistory}
              className="flex items-center gap-1 px-2 py-1 rounded-full bg-[#1a1b23] hover:bg-[#252733] border border-[#2a2c38] text-[#9ea2b0] hover:text-white transition-colors"
              title="Ver histórico completo de rondas"
              aria-label="Ver histórico completo de rondas"
            >
              <ChevronDown className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={onOpenMechanics}
              className="p-1.5 rounded-full bg-[#1a1b23] hover:bg-[#252733] border border-[#2a2c38] text-[#9ea2b0] hover:text-white transition-colors"
              title="Como funciona & justiça da ronda"
              aria-label="Como funciona"
            >
              <HelpCircle className="w-3.5 h-3.5" />
            </button>
            {user?.role === 'admin' && (
              <Link
                href="/admin"
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#e50539]/20 hover:bg-[#e50539]/35 border border-[#e50539]/50 text-[11px] font-bold text-[#ff7b96] transition-colors whitespace-nowrap"
                title="Abrir área administrativa"
              >
                <Shield className="w-3.5 h-3.5 shrink-0" />
                <span>Admin</span>
              </Link>
            )}
            {user ? (
              <button
                type="button"
                onClick={onOpenSettings}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#152518] hover:bg-[#1b3120] border border-[#285431] text-[11px] font-semibold text-[#7ef263] transition-colors whitespace-nowrap"
                title={`Sessão iniciada como ${user.username}`}
              >
                <UserCheck className="w-3.5 h-3.5 shrink-0" />
                <span className="max-w-[90px] truncate">{user.username}</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onOpenAuth('register')}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#2ca616] hover:bg-[#34bd1b] text-[11px] font-bold text-white transition-colors whitespace-nowrap shadow-sm"
              >
                <UserPlus className="w-3.5 h-3.5 shrink-0" />
                <span>Criar Conta</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
