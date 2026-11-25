'use client';

import React, { useMemo, useState } from 'react';
import { TopBar } from '@/components/layout/TopBar';
import { BetSidebar } from '@/components/sidebar/BetSidebar';
import { FlightStage } from '@/components/game/FlightStage';
import { BettingConsole } from '@/components/betting/BettingConsole';
import { SettingsModal } from '@/components/modals/SettingsModal';
import { GameMechanicsModal } from '@/components/modals/GameMechanicsModal';
import { HistoryModal } from '@/components/modals/HistoryModal';
import { AuthModal } from '@/components/modals/AuthModal';
import { useAviatorSocket } from '@/hooks/useAviatorSocket';
import { GameSettings } from '@/shared/types';

export default function AviatorPage() {
  const [settings, setSettings] = useState<GameSettings>({
    soundEnabled: true,
    animationsEnabled: true,
    currencyLabel: 'MZN',
    showBotBets: true,
  });

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [mechanicsOpen, setMechanicsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [authModal, setAuthModal] = useState<{
    open: boolean;
    mode: 'register' | 'login';
  }>({ open: false, mode: 'register' });

  const {
    snapshot,
    toasts,
    pushToast,
    reconnectSocket,
    updateSlotAmount,
    placeBet,
    cancelBet,
    cashout,
    updateAuto,
    resetBalance,
  } = useAviatorSocket(settings.soundEnabled);

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      setSettingsOpen(false);
      reconnectSocket();
      pushToast({
        type: 'info',
        title: 'Sessão terminada',
        subtitle: 'A jogar em modo visitante',
      });
    } catch {
      // ignore
    }
  };

  const filteredLiveBets = useMemo(() => {
    if (settings.showBotBets) return snapshot.liveBets;
    return snapshot.liveBets.filter((b) => b.isUser);
  }, [settings.showBotBets, snapshot.liveBets]);

  const displayedTotalBets = settings.showBotBets
    ? snapshot.totalBetsCount
    : filteredLiveBets.length;
  const displayedRemainingBets = settings.showBotBets
    ? snapshot.remainingBetsCount
    : filteredLiveBets.filter((b) => b.cashoutMultiplier === null).length;

  return (
    <div className="min-h-screen lg:h-screen flex flex-col bg-[#0e0f14] text-white overflow-x-hidden lg:overflow-hidden">
      {/* Top Bar */}
      <TopBar
        balance={snapshot.balance}
        currency={settings.currencyLabel}
        roundId={snapshot.roundId}
        phase={snapshot.phase}
        user={snapshot.user}
        history={snapshot.history}
        soundEnabled={settings.soundEnabled}
        onToggleSound={() =>
          setSettings((prev) => ({ ...prev, soundEnabled: !prev.soundEnabled }))
        }
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenHistory={() => setHistoryOpen(true)}
        onOpenMechanics={() => setMechanicsOpen(true)}
        onOpenAuth={(mode) => setAuthModal({ open: true, mode })}
      />

      {/* Main Workspace: Left Sidebar + Right Flight & Betting Area */}
      <main className="flex-1 min-h-0 flex flex-col-reverse lg:flex-row gap-2.5 p-2.5">
        <BetSidebar
          currency={settings.currencyLabel}
          liveBets={filteredLiveBets}
          totalBetsCount={displayedTotalBets}
          personalHistory={snapshot.personalHistory}
          topWins={snapshot.topWins}
          previousRound={snapshot.previousRound}
          onOpenMechanics={() => setMechanicsOpen(true)}
        />

        <div className="flex-1 min-w-0 min-h-0 flex flex-col gap-2.5">
          <FlightStage
            roundId={snapshot.roundId}
            phase={snapshot.phase}
            multiplier={snapshot.multiplier}
            countdownRemainingMs={snapshot.countdownRemainingMs}
            countdownTotalMs={snapshot.countdownTotalMs}
            elapsedFlightMs={snapshot.elapsedFlightMs}
            lastCrashPoint={snapshot.lastCrashPoint}
            animationsEnabled={settings.animationsEnabled}
            maintenanceMode={snapshot.engineLimits.maintenanceMode}
            currency={settings.currencyLabel}
            toasts={toasts}
          />

          <BettingConsole
            slots={snapshot.slots}
            phase={snapshot.phase}
            multiplier={snapshot.multiplier}
            balance={snapshot.balance}
            currency={settings.currencyLabel}
            remainingBetsCount={displayedRemainingBets}
            totalBetsCount={displayedTotalBets}
            totalRoundPayout={snapshot.totalRoundPayout}
            onUpdateAmount={updateSlotAmount}
            onPlaceBet={placeBet}
            onCancelBet={cancelBet}
            onCashout={cashout}
            onUpdateAuto={updateAuto}
          />
        </div>
      </main>

      {/* Modals */}
      <SettingsModal
        open={settingsOpen}
        settings={settings}
        balance={snapshot.balance}
        user={snapshot.user}
        onClose={() => setSettingsOpen(false)}
        onUpdateSettings={(partial) =>
          setSettings((prev) => ({ ...prev, ...partial }))
        }
        onResetBalance={resetBalance}
        onOpenAuth={(mode) => setAuthModal({ open: true, mode })}
        onLogout={handleLogout}
      />

      <AuthModal
        open={authModal.open}
        initialMode={authModal.mode}
        onClose={() => setAuthModal((prev) => ({ ...prev, open: false }))}
        onAuthenticated={(user, mode) => {
          reconnectSocket();
          pushToast({
            type: 'win',
            title:
              mode === 'register'
                ? `Conta criada: ${user.username}`
                : `Bem-vindo, ${user.username}!`,
            subtitle: 'Saldo sincronizado',
            amount: user.balance,
          });
        }}
      />

      <GameMechanicsModal
        open={mechanicsOpen}
        lastRoundId={snapshot.history[0]?.roundId ?? null}
        lastCrashPoint={snapshot.lastCrashPoint ?? snapshot.history[0]?.crashPoint ?? null}
        lastRoundHash={snapshot.lastRoundHash ?? snapshot.history[0]?.hash ?? null}
        onClose={() => setMechanicsOpen(false)}
      />

      <HistoryModal
        open={historyOpen}
        history={snapshot.history}
        onClose={() => setHistoryOpen(false)}
      />
    </div>
  );
}
