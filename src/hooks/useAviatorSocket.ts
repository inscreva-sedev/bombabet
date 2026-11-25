'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AutoPlayConfig,
  BetSlotId,
  ClientMessage,
  GameSnapshot,
  ServerMessage,
  ToastNotification,
} from '@/shared/types';
import { soundFx } from '@/lib/sound';

const INITIAL_SNAPSHOT: GameSnapshot = {
  roundId: 1040,
  phase: 'COUNTDOWN',
  multiplier: 1.0,
  countdownRemainingMs: 5000,
  countdownTotalMs: 5500,
  elapsedFlightMs: 0,
  lastCrashPoint: null,
  lastRoundHash: null,
  balance: 1000.0,
  currency: 'MZN',
  user: null,
  engineLimits: {
    minBet: 0.1,
    maxBet: 10000,
    maintenanceMode: false,
  },
  slots: {
    1: {
      slotId: 1,
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
    },
    2: {
      slotId: 2,
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
    },
  },
  history: [],
  liveBets: [],
  totalBetsCount: 0,
  remainingBetsCount: 0,
  totalRoundPayout: 0,
  personalHistory: [],
  topWins: [],
  previousRound: null,
  serverTime: Date.now(),
};

function getOrCreateClientId(): string {
  if (typeof window === 'undefined') return 'ssr-client';
  const key = 'aviator_virtual_client_id';
  let existing = window.localStorage.getItem(key);
  if (!existing) {
    existing =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `cli-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    window.localStorage.setItem(key, existing);
  }
  return existing;
}

export function useAviatorSocket(soundEnabled: boolean) {
  const [snapshot, setSnapshot] = useState<GameSnapshot>(INITIAL_SNAPSHOT);
  const [connected, setConnected] = useState(false);
  const [toasts, setToasts] = useState<ToastNotification[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const soundRef = useRef(soundEnabled);
  const localAmountsRef = useRef<{ 1: number; 2: number }>({ 1: 8.0, 2: 8.0 });
  const [reconnectNonce, setReconnectNonce] = useState(0);

  useEffect(() => {
    soundRef.current = soundEnabled;
  }, [soundEnabled]);

  const pushToast = useCallback((toast: Omit<ToastNotification, 'id'>) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setToasts((prev) => [{ ...toast, id }, ...prev].slice(0, 4));
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3600);
  }, []);

  useEffect(() => {
    let disposed = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      if (disposed) return;
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        if (disposed) return;
        setConnected(true);
        const clientId = getOrCreateClientId();
        ws.send(
          JSON.stringify({ type: 'INIT', clientId } satisfies ClientMessage)
        );
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data) as ServerMessage;

          if (msg.type === 'SNAPSHOT') {
            setSnapshot((prev) => {
              const next = msg.data;
              // Preserve user's locally edited idle bet amount if server still has default and slot is IDLE
              return {
                ...next,
                slots: {
                  1:
                    next.slots[1].status === 'IDLE'
                      ? { ...next.slots[1], amount: localAmountsRef.current[1] ?? prev.slots[1].amount }
                      : next.slots[1],
                  2:
                    next.slots[2].status === 'IDLE'
                      ? { ...next.slots[2], amount: localAmountsRef.current[2] ?? prev.slots[2].amount }
                      : next.slots[2],
                },
              };
            });
          } else if (msg.type === 'TICK') {
            setSnapshot((prev) => ({
              ...prev,
              roundId: msg.data.roundId,
              phase: msg.data.phase,
              multiplier: msg.data.multiplier,
              countdownRemainingMs: msg.data.countdownRemainingMs,
              elapsedFlightMs: msg.data.elapsedFlightMs,
              liveBets: msg.data.liveBets,
              remainingBetsCount: msg.data.remainingBetsCount,
              totalBetsCount: msg.data.totalBetsCount,
              totalRoundPayout: msg.data.totalRoundPayout,
              serverTime: msg.data.serverTime,
            }));
          } else if (msg.type === 'ROUND_CRASHED') {
            soundFx.playCrash(soundRef.current);
            setSnapshot((prev) => ({
              ...prev,
              phase: 'CRASHED',
              multiplier: msg.data.crashPoint,
              lastCrashPoint: msg.data.crashPoint,
              lastRoundHash: msg.data.hash,
              history: [msg.data.historyItem, ...prev.history].slice(0, 60),
              previousRound: msg.data.previousRound,
            }));
          } else if (msg.type === 'BET_RESULT') {
            if (msg.data.outcome === 'WON') {
              soundFx.playWin(soundRef.current);
              pushToast({
                type: 'win',
                title: `Levantamento no Painel ${msg.data.slotId}!`,
                subtitle: `${msg.data.multiplier.toFixed(2)}x`,
                amount: msg.data.payout,
              });
            } else {
              pushToast({
                type: 'loss',
                title: `Aposta perdida (Painel ${msg.data.slotId})`,
                subtitle: `Crash em ${msg.data.multiplier.toFixed(2)}x`,
                amount: msg.data.betAmount,
              });
            }
          } else if (msg.type === 'ERROR') {
            pushToast({
              type: 'info',
              title: msg.message,
            });
          }
        } catch {
          // ignore malformed messages
        }
      };

      ws.onclose = () => {
        setConnected(false);
        if (!disposed) {
          reconnectTimer = setTimeout(connect, 1500);
        }
      };
    };

    connect();

    return () => {
      disposed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      wsRef.current?.close();
    };
  }, [pushToast, reconnectNonce]);

  const reconnectSocket = useCallback(() => {
    setReconnectNonce((n) => n + 1);
  }, []);

  const sendMessage = useCallback((msg: ClientMessage) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }, []);

  const updateSlotAmount = useCallback((slotId: BetSlotId, amount: number) => {
    localAmountsRef.current[slotId] = amount;
    setSnapshot((prev) => ({
      ...prev,
      slots: {
        ...prev.slots,
        [slotId]: {
          ...prev.slots[slotId],
          amount,
        },
      },
    }));
  }, []);

  const placeBet = useCallback(
    (slotId: BetSlotId, amount: number) => {
      soundFx.playClick(soundRef.current);
      localAmountsRef.current[slotId] = amount;
      sendMessage({ type: 'PLACE_BET', slotId, amount });
    },
    [sendMessage]
  );

  const cancelBet = useCallback(
    (slotId: BetSlotId) => {
      soundFx.playClick(soundRef.current);
      sendMessage({ type: 'CANCEL_BET', slotId });
    },
    [sendMessage]
  );

  const cashout = useCallback(
    (slotId: BetSlotId) => {
      sendMessage({ type: 'CASHOUT', slotId });
    },
    [sendMessage]
  );

  const updateAuto = useCallback(
    (slotId: BetSlotId, auto: Partial<AutoPlayConfig>) => {
      soundFx.playClick(soundRef.current);
      sendMessage({ type: 'UPDATE_AUTO', slotId, auto });
    },
    [sendMessage]
  );

  const resetBalance = useCallback(
    (amount: number) => {
      soundFx.playClick(soundRef.current);
      sendMessage({ type: 'RESET_VIRTUAL_BALANCE', amount });
      pushToast({
        type: 'info',
        title: 'Saldo virtual reposto',
        amount,
      });
    },
    [sendMessage, pushToast]
  );

  return {
    snapshot,
    connected,
    toasts,
    pushToast,
    reconnectSocket,
    updateSlotAmount,
    placeBet,
    cancelBet,
    cashout,
    updateAuto,
    resetBalance,
  };
}
