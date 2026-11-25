import dns from 'node:dns';
import fs from 'node:fs';
import path from 'node:path';
import { Collection, Db, MongoClient, ObjectId } from 'mongodb';
import {
  BetSlotState,
  GameEngineConfig,
  PersonalBetRecord,
  UserRole,
  UserStatus,
} from '@/shared/types';

export interface SystemRoundAnchor {
  roundId: number;
  startedAt: number;
}

export interface SystemAuditEntry {
  id: string;
  timestamp: number;
  actorEmail: string;
  action: string;
  target: string;
  details: string;
}

export interface UserDoc {
  _id: ObjectId;
  systemKey?: string;
  username: string;
  usernameLower: string;
  email: string;
  emailLower: string;
  role?: UserRole;
  status?: UserStatus;
  passwordHash: string;
  maskedName: string;
  avatarIndex: number;
  balance: number;
  currency: string;
  tokenVersion: number;
  aviatorBets?: PersonalBetRecord[];
  aviatorActiveSlots?: {
    1: BetSlotState;
    2: BetSlotState;
  };
  engineConfig?: GameEngineConfig;
  auditLogs?: SystemAuditEntry[];
  roundAnchor?: SystemRoundAnchor;
  createdAt: Date;
  updatedAt: Date;
}

function loadEnvFileIfPresent(): void {
  if (process.env.MONGODB_URI) return;
  const envPath = path.resolve(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eqIndex = line.indexOf('=');
    if (eqIndex <= 0) continue;
    const key = line.slice(0, eqIndex).trim();
    const val = line.slice(eqIndex + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[key]) {
      process.env[key] = val;
    }
  }
}

class MongoService {
  private client: MongoClient | null = null;
  private db: Db | null = null;
  private connectingPromise: Promise<Db | null> | null = null;

  async connect(): Promise<Db | null> {
    if (this.db) return this.db;
    if (this.connectingPromise) return this.connectingPromise;

    loadEnvFileIfPresent();
    const uri = process.env.MONGODB_URI;
    if (!uri) {
      console.warn('[MongoDB] MONGODB_URI not set. Running without database persistence.');
      return null;
    }

    this.connectingPromise = (async () => {
      const tryConnect = async () => {
        const client = new MongoClient(uri, {
          serverSelectionTimeoutMS: 8000,
          connectTimeoutMS: 8000,
        });
        await client.connect();
        return client;
      };

      try {
        let client: MongoClient;
        try {
          client = await tryConnect();
        } catch (firstErr: unknown) {
          const msg = String(firstErr);
          if (uri.startsWith('mongodb+srv://') && msg.includes('querySrv')) {
            // Node's c-ares resolver on Windows may default to loopback DNS; retry with public DNS
            dns.setServers(['8.8.8.8', '1.1.1.1']);
            client = await tryConnect();
          } else {
            throw firstErr;
          }
        }

        const db = client.db('nhabombabetdb');
        this.client = client;
        this.db = db;

        await this.ensureIndexes(db);
        console.log('> Connected to MongoDB database: nhabombabetdb');
        return db;
      } catch (err) {
        console.error('[MongoDB] Connection failed:', err);
        this.client = null;
        this.db = null;
        return null;
      } finally {
        this.connectingPromise = null;
      }
    })();

    return this.connectingPromise;
  }

  private async ensureIndexes(db: Db): Promise<void> {
    // Use existing 'Users' collection in nhabombabetdb so no extra collections are created
    const usersCol = db.collection('Users');
    await usersCol.createIndex({ emailLower: 1 }, { unique: true, sparse: true });
    await usersCol.createIndex({ usernameLower: 1 }, { unique: true, sparse: true });
  }

  isConnected(): boolean {
    return this.db !== null;
  }

  users(): Collection<UserDoc> | null {
    return this.db ? this.db.collection<UserDoc>('Users') : null;
  }

  async close(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.client = null;
      this.db = null;
    }
  }
}

export const mongoService = new MongoService();
