import { ObjectId } from 'mongodb';
import { mongoService } from '@/server/db/mongo';

export const DEFAULT_VIRTUAL_BALANCE = 1000.0;

export class WalletManager {
  private balances = new Map<string, number>();

  private extractUserObjectId(clientId: string): ObjectId | null {
    if (!clientId.startsWith('user:')) return null;
    const rawId = clientId.slice(5);
    return ObjectId.isValid(rawId) ? new ObjectId(rawId) : null;
  }

  private persistBalance(clientId: string, balance: number): void {
    const userObjId = this.extractUserObjectId(clientId);
    if (!userObjId) return;
    const users = mongoService.users();
    if (!users) return;
    users
      .updateOne(
        { _id: userObjId },
        { $set: { balance, updatedAt: new Date() } }
      )
      .catch((err) => {
        console.error('[WalletManager.persistBalance]', err);
      });
  }

  syncCachedBalance(clientId: string, balance: number): void {
    const clean = Math.max(0, Math.round(balance * 100) / 100);
    this.balances.set(clientId, clean);
  }

  ensureWallet(clientId: string): number {
    if (!this.balances.has(clientId)) {
      this.balances.set(clientId, DEFAULT_VIRTUAL_BALANCE);
    }
    return this.balances.get(clientId)!;
  }

  getBalance(clientId: string): number {
    return this.ensureWallet(clientId);
  }

  debit(clientId: string, amount: number): { ok: boolean; balance: number } {
    const current = this.ensureWallet(clientId);
    const cleanAmount = Math.round(amount * 100) / 100;
    if (cleanAmount <= 0 || current + 1e-6 < cleanAmount) {
      return { ok: false, balance: current };
    }
    const next = Math.max(0, Math.round((current - cleanAmount) * 100) / 100);
    this.balances.set(clientId, next);
    this.persistBalance(clientId, next);
    return { ok: true, balance: next };
  }

  credit(clientId: string, amount: number): number {
    const current = this.ensureWallet(clientId);
    const cleanAmount = Math.round(amount * 100) / 100;
    const next = Math.round((current + cleanAmount) * 100) / 100;
    this.balances.set(clientId, next);
    this.persistBalance(clientId, next);
    return next;
  }

  reset(clientId: string, amount = DEFAULT_VIRTUAL_BALANCE): number {
    const clean = Math.min(100000, Math.max(10, Math.round(amount * 100) / 100));
    this.balances.set(clientId, clean);
    this.persistBalance(clientId, clean);
    return clean;
  }
}
