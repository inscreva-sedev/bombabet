'use client';

import React from 'react';
import Link from 'next/link';
import { X, Volume2, Sparkles, Users, RefreshCw, SlidersHorizontal, UserCheck, LogOut, UserPlus, Shield } from 'lucide-react';
import { formatMoney } from '@/shared/format';
import { AuthUser, GameSettings } from '@/shared/types';

interface SettingsModalProps {
  open: boolean;
  settings: GameSettings;
  balance: number;
  user: AuthUser | null;
  onClose: () => void;
  onUpdateSettings: (partial: Partial<GameSettings>) => void;
  onResetBalance: (amount: number) => void;
  onOpenAuth: (mode: 'register' | 'login') => void;
  onLogout: () => void;
}

export function SettingsModal({
  open,
  settings,
  balance,
  user,
  onClose,
  onUpdateSettings,
  onResetBalance,
  onOpenAuth,
  onLogout,
}: SettingsModalProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-[#181921] border border-[#2d303e] rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-3 border-b border-[#262835] flex items-center justify-between bg-[#14151b]">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="w-4 h-4 text-[#e50539]" />
            <h2 className="text-sm font-bold text-white">Configurações & Carteira Virtual</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-[#8c909e] hover:text-white hover:bg-[#232532]"
            aria-label="Fechar configurações"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Account Card */}
          <div className="bg-[#121319] border border-[#252734] rounded-xl p-3.5">
            {user ? (
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-white">
                    <UserCheck className="w-4 h-4 text-[#36b51a] shrink-0" />
                    <span className="truncate">{user.username}</span>
                  </div>
                  <div className="text-[11px] text-[#8a8e9c] truncate mt-0.5">
                    {user.email}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {user.role === 'admin' && (
                    <Link
                      href="/admin"
                      onClick={onClose}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#e50539]/20 hover:bg-[#e50539]/35 border border-[#e50539]/50 text-[11px] font-bold text-[#ff8aa1]"
                    >
                      <Shield className="w-3.5 h-3.5" />
                      Admin
                    </Link>
                  )}
                  <button
                    type="button"
                    onClick={onLogout}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#2b171d] hover:bg-[#3c1e26] border border-[#5c2836] text-[11px] font-semibold text-[#ff93aa] shrink-0 transition-colors"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    Sair
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold text-white">Modo Visitante</div>
                  <div className="text-[11px] text-[#8a8e9c]">
                    Crie conta para guardar saldo e apostas.
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenAuth('login');
                    }}
                    className="px-2.5 py-1.5 rounded-lg bg-[#1d2029] hover:bg-[#272a36] border border-[#303444] text-[11px] font-semibold text-white"
                  >
                    Entrar
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenAuth('register');
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#2ca616] hover:bg-[#34bd1b] text-[11px] font-bold text-white"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    Criar
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Virtual Balance Card */}
          <div className="bg-[#121319] border border-[#252734] rounded-xl p-3.5 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs text-[#9598a6]">Saldo virtual actual</span>
              <span className="text-base font-bold font-mono text-[#36b51a]">
                {formatMoney(balance)} {settings.currencyLabel}
              </span>
            </div>
            <p className="text-[11px] text-[#787b8a] leading-relaxed">
              Saldo da sua carteira em {settings.currencyLabel} sincronizado com a sua conta.
            </p>
            <div className="flex items-center gap-2 pt-1">
              {[500, 1000, 5000].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => onResetBalance(preset)}
                  className="flex-1 inline-flex items-center justify-center gap-1 py-1.5 px-2 rounded-lg bg-[#1d2029] hover:bg-[#262a36] border border-[#2e3140] text-[11px] font-semibold text-white transition-colors"
                >
                  <RefreshCw className="w-3 h-3 text-[#36b51a]" />
                  {preset} {settings.currencyLabel}
                </button>
              ))}
            </div>
          </div>

          {/* Toggles */}
          <div className="space-y-2">
            <label className="flex items-center justify-between p-3 rounded-xl bg-[#121319] border border-[#252734] cursor-pointer">
              <span className="flex items-center gap-2.5 text-xs font-medium text-white">
                <Volume2 className="w-4 h-4 text-[#9ea2b0]" />
                Efeitos sonoros
              </span>
              <input
                type="checkbox"
                checked={settings.soundEnabled}
                onChange={(e) => onUpdateSettings({ soundEnabled: e.target.checked })}
                className="accent-[#36b51a] w-4 h-4"
              />
            </label>

            <label className="flex items-center justify-between p-3 rounded-xl bg-[#121319] border border-[#252734] cursor-pointer">
              <span className="flex items-center gap-2.5 text-xs font-medium text-white">
                <Sparkles className="w-4 h-4 text-[#9ea2b0]" />
                Animações de nuvens e voo
              </span>
              <input
                type="checkbox"
                checked={settings.animationsEnabled}
                onChange={(e) => onUpdateSettings({ animationsEnabled: e.target.checked })}
                className="accent-[#36b51a] w-4 h-4"
              />
            </label>

            <label className="flex items-center justify-between p-3 rounded-xl bg-[#121319] border border-[#252734] cursor-pointer">
              <span className="flex items-center gap-2.5 text-xs font-medium text-white">
                <Users className="w-4 h-4 text-[#9ea2b0]" />
                Mostrar outros jogadores ao vivo
              </span>
              <input
                type="checkbox"
                checked={settings.showBotBets}
                onChange={(e) => onUpdateSettings({ showBotBets: e.target.checked })}
                className="accent-[#36b51a] w-4 h-4"
              />
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}
