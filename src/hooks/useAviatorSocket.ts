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

interface HttpOutcome {
  slotId: BetSlotId;
  outcome: 'WON' | 'LOST';
  betAmount: number;
  multiplier: number;
  payout: number;
  roundId: number;
}

export function useAviatorSocket(soundEnabled: boolean) {
  const [snapshot, setSnapshot] = useState<GameSnapshot>(INITIAL_SNAPSHOT);
  const [connected, setConnected] = useState(false);
  const [toasts, setToasts] = useState<ToastNotification[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const modeRef = useRef<'ws' | 'http'>('ws');
  const soundRef = useRef(soundEnabled);
  const localAmountsRef = useRef<{ 1: number; 2: number }>({ 1: 8.0, 2: 8.0 });
  const [reconnectNonce, setReconnectNonce] = useState(0);
  const [httpActive, setHttpActive] = useState(false);
  const lastHttpSyncAtRef = useRef<number>(Date.now());
  const prevPhaseRef = useRef<string>('COUNTDOWN');

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

  const applyIdleAmounts = useCallback((next: GameSnapshot): GameSnapshot => {
    return {
      ...next,
      slots: {
        1:
          next.slots[1].status === 'IDLE'
            ? { ...next.slots[1], amount: localAmountsRef.current[1] ?? next.slots[1].amount }
            : next.slots[1],
        2:
          next.slots[2].status === 'IDLE'
            ? { ...next.slots[2], amount: localAmountsRef.current[2] ?? next.slots[2].amount }
            : next.slots[2],
      },
    };
  }, []);

  const emitOutcomes = useCallback(
    (outcomes?: HttpOutcome[]) => {
      if (!outcomes || outcomes.length === 0) return;
      for (const o of outcomes) {
        if (o.outcome === 'WON') {
          soundFx.playWin(soundRef.current);
          pushToast({
            type: 'win',
            title: `Levantamento no Painel ${o.slotId}!`,
            subtitle: `${o.multiplier.toFixed(2)}x`,
            amount: o.payout,
          });
        } else {
          pushToast({
            type: 'loss',
            title: `Aposta perdida (Painel ${o.slotId})`,
            subtitle: `Crash em ${o.multiplier.toFixed(2)}x`,
            amount: o.betAmount,
          });
        }
      }
    },
    [pushToast]
  );

  // Try WebSocket first; automatically switch to HTTP serverless polling on Vercel
  useEffect(() => {
    let disposed = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let receivedWsSnapshot = false;

    const isLocalHost =
      typeof window !== 'undefined' &&
      (window.location.hostname === 'localhost' ||
        window.location.hostname === '127.0.0.1');
    const enableWs =
      process.env.NEXT_PUBLIC_ENABLE_WS === 'true' ||
      (isLocalHost && process.env.NEXT_PUBLIC_ENABLE_WS !== 'false');

    if (!enableWs || modeRef.current === 'http') {
      modeRef.current = 'http';
      setHttpActive(true);
      return;
    }

    const connect = () => {
      if (disposed || modeRef.current === 'http') return;
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      const fallbackTimeout = setTimeout(() => {
        if (!receivedWsSnapshot && !disposed) {
          modeRef.current = 'http';
          setHttpActive(true);
          try {
            ws.close();
          } catch {
            // ignore
          }
        }
      }, 1500);

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
            receivedWsSnapshot = true;
            clearTimeout(fallbackTimeout);
            setSnapshot(applyIdleAmounts(msg.data));
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
            emitOutcomes([msg.data]);
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

      ws.onerror = () => {
        if (!receivedWsSnapshot && !disposed) {
          clearTimeout(fallbackTimeout);
          modeRef.current = 'http';
          setHttpActive(true);
        }
      };

      ws.onclose = () => {
        clearTimeout(fallbackTimeout);
        setConnected(false);
        if (disposed || modeRef.current === 'http') return;
        if (!receivedWsSnapshot) {
          modeRef.current = 'http';
          setHttpActive(true);
        } else {
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
  }, [applyIdleAmounts, emitOutcomes, pushToast, reconnectNonce]);

  // Serverless HTTP Polling + 50ms smooth flight interpolation (when on Vercel)
  useEffect(() => {
    if (!httpActive) return;

    let disposed = false;
    let inFlight = false;

    const poll = async () => {
      if (disposed || inFlight) return;
      inFlight = true;
      try {
        const res = await fetch('/api/game/state', { cache: 'no-store' });
        if (!res.ok) return;
        const data = (await res.json()) as {
          snapshot: GameSnapshot;
          outcomes?: HttpOutcome[];
        };
        if (disposed || !data.snapshot) return;

        lastHttpSyncAtRef.current = performance.now();
        setConnected(true);

        if (
          prevPhaseRef.current === 'FLYING' &&
          data.snapshot.phase === 'CRASHED'
        ) {
          soundFx.playCrash(soundRef.current);
        }
        prevPhaseRef.current = data.snapshot.phase;

        setSnapshot(applyIdleAmounts(data.snapshot));
        emitOutcomes(data.outcomes);
      } catch {
        setConnected(false);
      } finally {
        inFlight = false;
      }
    };

    poll();
    const pollId = setInterval(poll, 260);

    // Smooth local visual tick between server polls
    const interpId = setInterval(() => {
      const dt = performance.now() - lastHttpSyncAtRef.current;
      if (dt <= 0 || dt > 500) return;

      setSnapshot((prev) => {
        if (prev.engineLimits.maintenanceMode) return prev;
        if (prev.phase === 'COUNTDOWN') {
          return {
            ...prev,
            countdownRemainingMs: Math.max(0, prev.countdownRemainingMs - 50),
          };
        }
        if (prev.phase === 'FLYING') {
          const nextElapsed = prev.elapsedFlightMs + 50;
          const nextMult = Math.max(
            1.0,
            Math.floor(Math.exp(0.000068 * nextElapsed) * 100) / 100
          );
          return {
            ...prev,
            elapsedFlightMs: nextElapsed,
            multiplier: nextMult,
          };
        }
        return prev;
      });
    }, 50);

    return () => {
      disposed = true;
      clearInterval(pollId);
      clearInterval(interpId);
    };
  }, [applyIdleAmounts, emitOutcomes, httpActive, reconnectNonce]);

  const sendHttpAction = useCallback(
    async (
      body: {
        type:
          | 'PLACE_BET'
          | 'CANCEL_BET'
          | 'CASHOUT'
          | 'UPDATE_AUTO'
          | 'RESET_VIRTUAL_BALANCE';
        slotId?: BetSlotId;
        amount?: number;
        auto?: Partial<AutoPlayConfig>;
      }
    ) => {
      try {
        const res = await fetch('/api/game/action', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const data = (await res.json()) as {
          ok?: boolean;
          error?: string;
          snapshot?: GameSnapshot;
          outcomes?: HttpOutcome[];
        };
        if (!res.ok) {
          pushToast({
            type: 'info',
            title: data.error ?? 'Erro na operação.',
          });
          return;
        }
        if (data.snapshot) {
          lastHttpSyncAtRef.current = performance.now();
          setSnapshot(applyIdleAmounts(data.snapshot));
        }
        emitOutcomes(data.outcomes);
      } catch {
        pushToast({ type: 'info', title: 'Falha de ligação ao servidor.' });
      }
    },
    [applyIdleAmounts, emitOutcomes, pushToast]
  );

  const reconnectSocket = useCallback(() => {
    setReconnectNonce((n) => n + 1);
  }, []);

  const sendMessage = useCallback(
    (msg: ClientMessage) => {
      if (modeRef.current === 'http') {
        if (msg.type !== 'INIT') {
          void sendHttpAction(msg);
        }
        return;
      }
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(msg));
      } else {
        void sendHttpAction(msg as Exclude<ClientMessage, { type: 'INIT' }>);
      }
    },
    [sendHttpAction]
  );

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
