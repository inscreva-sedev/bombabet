export type RoundPhase = 'COUNTDOWN' | 'FLYING' | 'CRASHED';

export type BetSlotId = 1 | 2;

export type BetSlotStatus =
  | 'IDLE'          // No active bet for current or next round
  | 'QUEUED_NEXT'   // Bet queued for upcoming round while current round is flying
  | 'PLACED'        // Bet accepted for the round about to start (COUNTDOWN)
  | 'ACTIVE'        // In flight, waiting for player or auto-cashout
  | 'CASHED_OUT'    // Cashed out successfully during current round
  | 'LOST';         // Round crashed before cashout

export interface AutoPlayConfig {
  autoBet: boolean;
  autoBetRoundsLeft: number; // 0 = infinite while enabled, >0 = remaining rounds
  autoCashout: boolean;
  autoCashoutMultiplier: number; // e.g. 2.00
}

export interface BetSlotState {
  slotId: BetSlotId;
  amount: number;
  status: BetSlotStatus;
  activeRoundId: number | null;
  cashoutMultiplier: number | null;
  payout: number | null;
  auto: AutoPlayConfig;
}

export interface LivePlayerBet {
  id: string;
  avatarIndex: number;
  maskedName: string;
  betAmount: number;
  cashoutMultiplier: number | null;
  payout: number | null;
  isUser?: boolean;
  slotId?: BetSlotId;
}

export interface PersonalBetRecord {
  id: string;
  roundId: number;
  timestamp: number;
  slotId: BetSlotId;
  betAmount: number;
  cashoutMultiplier: number | null;
  crashPoint: number;
  payout: number;
  profit: number;
  status: 'WON' | 'LOST';
}

export interface TopWinRecord {
  id: string;
  roundId: number;
  timestamp: number;
  avatarIndex: number;
  maskedName: string;
  betAmount: number;
  cashoutMultiplier: number;
  payout: number;
}

export interface RoundHistoryItem {
  roundId: number;
  crashPoint: number;
  timestamp: number;
  hash: string;
}

export interface PreviousRoundSnapshot {
  roundId: number;
  crashPoint: number;
  totalBetsCount: number;
  totalPayout: number;
  bets: LivePlayerBet[];
}

export interface GameSettings {
  soundEnabled: boolean;
  animationsEnabled: boolean;
  currencyLabel: string;
  showBotBets: boolean;
}

export interface ToastNotification {
  id: string;
  type: 'win' | 'loss' | 'info';
  title: string;
  subtitle?: string;
  amount?: number;
  multiplier?: number;
}

export type UserRole = 'user' | 'admin';
export type UserStatus = 'active' | 'blocked';

export interface GameEngineConfig {
  minBet: number;
  maxBet: number;
  countdownMs: number;
  growthRate: number;
  botsEnabled: boolean;
  maintenanceMode: boolean;
}

export interface AuthUser {
  id: string;
  username: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  maskedName: string;
  avatarIndex: number;
  balance: number;
  currency: string;
}

export interface GameSnapshot {
  roundId: number;
  phase: RoundPhase;
  multiplier: number;
  countdownRemainingMs: number;
  countdownTotalMs: number;
  elapsedFlightMs: number;
  lastCrashPoint: number | null;
  lastRoundHash: string | null;
  balance: number;
  currency: string;
  user: AuthUser | null;
  engineLimits: {
    minBet: number;
    maxBet: number;
    maintenanceMode: boolean;
  };
  slots: {
    1: BetSlotState;
    2: BetSlotState;
  };
  history: RoundHistoryItem[];
  liveBets: LivePlayerBet[];
  totalBetsCount: number;
  remainingBetsCount: number;
  totalRoundPayout: number;
  personalHistory: PersonalBetRecord[];
  topWins: TopWinRecord[];
  previousRound: PreviousRoundSnapshot | null;
  serverTime: number;
}

// Client -> Server WebSocket messages
export type ClientMessage =
  | { type: 'INIT'; clientId?: string }
  | { type: 'PLACE_BET'; slotId: BetSlotId; amount: number }
  | { type: 'CANCEL_BET'; slotId: BetSlotId }
  | { type: 'CASHOUT'; slotId: BetSlotId }
  | { type: 'UPDATE_AUTO'; slotId: BetSlotId; auto: Partial<AutoPlayConfig> }
  | { type: 'RESET_VIRTUAL_BALANCE'; amount?: number };

// Server -> Client WebSocket messages
export type ServerMessage =
  | { type: 'SNAPSHOT'; data: GameSnapshot }
  | {
      type: 'TICK';
      data: {
        roundId: number;
        phase: RoundPhase;
        multiplier: number;
        countdownRemainingMs: number;
        elapsedFlightMs: number;
        liveBets: LivePlayerBet[];
        remainingBetsCount: number;
        totalBetsCount: number;
        totalRoundPayout: number;
        serverTime: number;
      };
    }
  | {
      type: 'ROUND_CRASHED';
      data: {
        roundId: number;
        crashPoint: number;
        hash: string;
        historyItem: RoundHistoryItem;
        previousRound: PreviousRoundSnapshot;
      };
    }
  | {
      type: 'BET_RESULT';
      data: {
        slotId: BetSlotId;
        outcome: 'WON' | 'LOST';
        betAmount: number;
        multiplier: number;
        payout: number;
        roundId: number;
      };
    }
  | { type: 'ERROR'; message: string };
