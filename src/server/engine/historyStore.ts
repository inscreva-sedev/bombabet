import crypto from 'node:crypto';
import { ObjectId } from 'mongodb';
import {
  PersonalBetRecord,
  PreviousRoundSnapshot,
  RoundHistoryItem,
  TopWinRecord,
} from '@/shared/types';
import { mongoService } from '@/server/db/mongo';

const SEED_MULTIPLIERS = [
  1.96, 5.16, 2.98, 2.09, 5.02, 1.51, 3.1, 1.15, 2.92, 2.67, 1.83, 1.19, 2.71,
  2.28, 1.36, 5.18, 1.7, 1.0, 1.01, 1.0, 1.06, 4.36, 1.29, 2.29,
];

export class HistoryStore {
  private rounds: RoundHistoryItem[] = [];
  private previousRound: PreviousRoundSnapshot | null = null;
  private topWins: TopWinRecord[] = [];
  private personalByClient = new Map<string, PersonalBetRecord[]>();
  private loadedUsers = new Set<string>();

  constructor(initialRoundId: number) {
    const now = Date.now();
    for (let i = 0; i < SEED_MULTIPLIERS.length; i++) {
      const roundId = initialRoundId - 1 - i;
      const crashPoint = SEED_MULTIPLIERS[SEED_MULTIPLIERS.length - 1 - i];
      const hash = crypto
        .createHash('sha256')
        .update(`seed:${roundId}:${crashPoint}`)
        .digest('hex');
      this.rounds.push({
        roundId,
        crashPoint,
        timestamp: now - (i + 1) * 18000,
        hash,
      });
    }
  }

  private extractUserObjectId(clientId: string): ObjectId | null {
    if (!clientId.startsWith('user:')) return null;
    const rawId = clientId.slice(5);
    return ObjectId.isValid(rawId) ? new ObjectId(rawId) : null;
  }

  async loadRoundsFromDb(): Promise<number | null> {
    return null;
  }

  async ensureUserHistoryLoaded(clientId: string): Promise<void> {
    if (this.loadedUsers.has(clientId)) return;
    const userObjId = this.extractUserObjectId(clientId);
    if (!userObjId) return;
    const usersCol = mongoService.users();
    if (!usersCol) return;

    this.loadedUsers.add(clientId);
    try {
      const user = await usersCol.findOne(
        { _id: userObjId },
        { projection: { aviatorBets: 1 } }
      );
      if (user?.aviatorBets && user.aviatorBets.length > 0) {
        this.personalByClient.set(clientId, user.aviatorBets.slice(0, 50));
      }
    } catch (err) {
      console.error('[HistoryStore.ensureUserHistoryLoaded]', err);
    }
  }

  addRoundResult(
    item: RoundHistoryItem,
    snapshot: PreviousRoundSnapshot
  ): void {
    this.rounds.unshift(item);
    if (this.rounds.length > 60) {
      this.rounds.length = 60;
    }
    this.previousRound = snapshot;
  }

  getRounds(): RoundHistoryItem[] {
    return this.rounds;
  }

  getPreviousRound(): PreviousRoundSnapshot | null {
    return this.previousRound;
  }

  recordWin(win: TopWinRecord): void {
    this.topWins.push(win);
    this.topWins.sort((a, b) => b.payout - a.payout);
    if (this.topWins.length > 30) {
      this.topWins.length = 30;
    }
  }

  getTopWins(): TopWinRecord[] {
    return this.topWins;
  }

  addPersonalBet(clientId: string, record: PersonalBetRecord): void {
    const list = this.personalByClient.get(clientId) ?? [];
    list.unshift(record);
    if (list.length > 50) {
      list.length = 50;
    }
    this.personalByClient.set(clientId, list);

    const userObjId = this.extractUserObjectId(clientId);
    const usersCol = mongoService.users();
    if (userObjId && usersCol) {
      usersCol
        .updateOne(
          { _id: userObjId },
          {
            $push: {
              aviatorBets: {
                $each: [record],
                $position: 0,
                $slice: 50,
              },
            },
          }
        )
        .catch((err) => {
          console.error('[HistoryStore.addPersonalBet]', err);
        });
    }
  }

  getPersonalHistory(clientId: string): PersonalBetRecord[] {
    return this.personalByClient.get(clientId) ?? [];
  }
}
