import crypto from 'node:crypto';
import { ObjectId } from 'mongodb';
import { AuthUser } from '@/shared/types';
import { mongoService, UserDoc } from '@/server/db/mongo';
import { DEFAULT_VIRTUAL_BALANCE } from '@/server/engine/walletManager';

export const SESSION_COOKIE_NAME = 'aviator_session';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function getSessionSecret(): string {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  const seed = process.env.MONGODB_URI || 'aviator-local-session-secret';
  return crypto.createHash('sha256').update(`session-key:${seed}`).digest('hex');
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, keyHex] = parts;
  const keyBuf = Buffer.from(keyHex, 'hex');
  const derivedBuf = crypto.scryptSync(password, salt, 64);
  if (keyBuf.length !== derivedBuf.length) return false;
  return crypto.timingSafeEqual(keyBuf, derivedBuf);
}

interface TokenPayload {
  uid: string;
  ver: number;
  exp: number;
}

function signSessionToken(userId: ObjectId, tokenVersion: number): string {
  const payload: TokenPayload = {
    uid: userId.toHexString(),
    ver: tokenVersion,
    exp: Date.now() + SESSION_TTL_MS,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto
    .createHmac('sha256', getSessionSecret())
    .update(encoded)
    .digest('base64url');
  return `${encoded}.${sig}`;
}

function verifySessionToken(token: string): TokenPayload | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [encoded, sig] = parts;
  const expectedSig = crypto
    .createHmac('sha256', getSessionSecret())
    .update(encoded)
    .digest('base64url');

  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expectedSig);
  if (
    sigBuf.length !== expectedBuf.length ||
    !crypto.timingSafeEqual(sigBuf, expectedBuf)
  ) {
    return null;
  }

  try {
    const parsed = JSON.parse(
      Buffer.from(encoded, 'base64url').toString('utf8')
    ) as TokenPayload;
    if (!parsed.uid || typeof parsed.exp !== 'number' || parsed.exp < Date.now()) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function makeMaskedName(username: string): string {
  const clean = username.trim();
  if (clean.length <= 2) return `${clean[0] ?? '*'}****`;
  return `${clean[0]}****${clean[clean.length - 1]}`;
}

function toAuthUser(doc: UserDoc): AuthUser {
  return {
    id: doc._id.toHexString(),
    username: doc.username,
    email: doc.email,
    role: doc.role === 'admin' ? 'admin' : 'user',
    status: doc.status === 'blocked' ? 'blocked' : 'active',
    maskedName: doc.maskedName,
    avatarIndex: doc.avatarIndex,
    balance: doc.balance,
    currency: doc.currency,
  };
}

export function parseCookies(cookieHeader?: string): Record<string, string> {
  const result: Record<string, string> = {};
  if (!cookieHeader) return result;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    const key = part.slice(0, idx).trim();
    const val = decodeURIComponent(part.slice(idx + 1).trim());
    result[key] = val;
  }
  return result;
}

export class AuthService {
  async register(input: {
    username: string;
    email: string;
    password: string;
  }): Promise<{ ok: true; user: AuthUser; token: string } | { ok: false; error: string }> {
    const db = await mongoService.connect();
    const users = mongoService.users();
    if (!db || !users) {
      return { ok: false, error: 'Serviço de base de dados indisponível neste momento.' };
    }

    const username = input.username.trim();
    const email = input.email.trim();
    const password = input.password;

    if (!/^[a-zA-Z0-9_.-]{3,20}$/.test(username)) {
      return {
        ok: false,
        error: 'O nome de utilizador deve ter 3 a 20 caracteres (letras, números, _, . ou -).',
      };
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return { ok: false, error: 'Introduza um endereço de email válido.' };
    }

    if (typeof password !== 'string' || password.length < 6) {
      return {
        ok: false,
        error: 'A palavra-passe deve ter pelo menos 6 caracteres.',
      };
    }

    const now = new Date();
    const doc: Omit<UserDoc, '_id'> = {
      username,
      usernameLower: username.toLowerCase(),
      email,
      emailLower: email.toLowerCase(),
      role: 'user',
      status: 'active',
      passwordHash: hashPassword(password),
      maskedName: makeMaskedName(username),
      avatarIndex: crypto.randomInt(0, 6),
      balance: DEFAULT_VIRTUAL_BALANCE,
      currency: 'MZN',
      tokenVersion: 1,
      aviatorBets: [],
      createdAt: now,
      updatedAt: now,
    };

    try {
      const insertRes = await users.insertOne(doc as UserDoc);
      const created: UserDoc = { ...doc, _id: insertRes.insertedId };
      const token = signSessionToken(created._id, created.tokenVersion);
      return { ok: true, user: toAuthUser(created), token };
    } catch (err: unknown) {
      const msg = String(err);
      if (msg.includes('emailLower')) {
        return { ok: false, error: 'Este email já está registado.' };
      }
      if (msg.includes('usernameLower')) {
        return { ok: false, error: 'Este nome de utilizador já está em uso.' };
      }
      console.error('[AuthService.register]', err);
      return { ok: false, error: 'Não foi possível criar a conta.' };
    }
  }

  async login(input: {
    identifier: string;
    password: string;
  }): Promise<{ ok: true; user: AuthUser; token: string } | { ok: false; error: string }> {
    const db = await mongoService.connect();
    const users = mongoService.users();
    if (!db || !users) {
      return { ok: false, error: 'Serviço de base de dados indisponível neste momento.' };
    }

    const identifier = input.identifier.trim().toLowerCase();
    const password = input.password;
    if (!identifier || !password) {
      return { ok: false, error: 'Preencha o email/utilizador e a palavra-passe.' };
    }

    const user = await users.findOne({
      $or: [{ emailLower: identifier }, { usernameLower: identifier }],
    });

    if (!user || !verifyPassword(password, user.passwordHash)) {
      return { ok: false, error: 'Credenciais inválidas.' };
    }
    if (user.status === 'blocked') {
      return {
        ok: false,
        error: 'A sua conta encontra-se bloqueada. Contacte o administrador.',
      };
    }

    const token = signSessionToken(user._id, user.tokenVersion ?? 1);
    return { ok: true, user: toAuthUser(user), token };
  }

  async getUserBySessionToken(token?: string): Promise<AuthUser | null> {
    if (!token) return null;
    const payload = verifySessionToken(token);
    if (!payload || !ObjectId.isValid(payload.uid)) return null;

    await mongoService.connect();
    const users = mongoService.users();
    if (!users) return null;

    const user = await users.findOne({ _id: new ObjectId(payload.uid) });
    if (!user || (user.tokenVersion ?? 1) !== payload.ver) return null;
    if (user.status === 'blocked') return null;
    return toAuthUser(user);
  }

  async getUserFromCookieHeader(cookieHeader?: string): Promise<AuthUser | null> {
    const cookies = parseCookies(cookieHeader);
    return this.getUserBySessionToken(cookies[SESSION_COOKIE_NAME]);
  }

  async logoutByCookieHeader(cookieHeader?: string): Promise<void> {
    const cookies = parseCookies(cookieHeader);
    const token = cookies[SESSION_COOKIE_NAME];
    if (!token) return;
    const payload = verifySessionToken(token);
    if (!payload || !ObjectId.isValid(payload.uid)) return;

    await mongoService.connect();
    const users = mongoService.users();
    if (!users) return;
    await users.updateOne(
      { _id: new ObjectId(payload.uid) },
      { $inc: { tokenVersion: 1 } }
    );
  }

  async ensureDefaultAdmin(): Promise<void> {
    const db = await mongoService.connect();
    const users = mongoService.users();
    if (!db || !users) return;

    const adminEmail = 'admin@bombabet.com';
    const adminEmailLower = adminEmail.toLowerCase();
    const adminPassword = process.env.ADMIN_PASSWORD || '@Admin123@';

    const existing = await users.findOne({ emailLower: adminEmailLower });
    if (!existing) {
      const now = new Date();
      await users.insertOne({
        _id: new ObjectId(),
        username: 'admin',
        usernameLower: 'admin',
        email: adminEmail,
        emailLower: adminEmailLower,
        role: 'admin',
        status: 'active',
        passwordHash: hashPassword(adminPassword),
        maskedName: 'a****n',
        avatarIndex: 0,
        balance: 10000.0,
        currency: 'MZN',
        tokenVersion: 1,
        aviatorBets: [],
        createdAt: now,
        updatedAt: now,
      });
      console.log('> Seeded default admin account: admin@bombabet.com');
    } else if (existing.role !== 'admin') {
      await users.updateOne(
        { _id: existing._id },
        { $set: { role: 'admin', updatedAt: new Date() } }
      );
    }
  }
}

export const authService = new AuthService();
