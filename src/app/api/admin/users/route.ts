import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { hashPassword, makeMaskedName } from '@/server/auth/authService';
import { mongoService, UserDoc } from '@/server/db/mongo';
import {
  getLiveRoundManager,
  requireAdmin,
} from '@/server/serverless/httpHelpers';
import { appendSystemAuditLog } from '@/server/serverless/serverlessEngine';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const gate = await requireAdmin(req);
  if (!gate.ok) return gate.response;

  await mongoService.connect();
  const usersCol = mongoService.users();
  if (!usersCol) {
    return NextResponse.json(
      { error: 'Base de dados indisponível.' },
      { status: 503 }
    );
  }

  try {
    const body = (await req.json()) as Record<string, unknown>;
    const username = typeof body.username === 'string' ? body.username.trim() : '';
    const email = typeof body.email === 'string' ? body.email.trim() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    const role = body.role === 'admin' ? 'admin' : 'user';
    const rawBal = Number(body.balance ?? 1000);
    const balance = Number.isFinite(rawBal)
      ? Math.min(1000000, Math.max(0, Math.round(rawBal * 100) / 100))
      : 1000;

    if (!/^[a-zA-Z0-9_.-]{3,20}$/.test(username)) {
      return NextResponse.json(
        {
          error:
            'Nome de utilizador inválido (3 a 20 caracteres alfanuméricos, _, . ou -).',
        },
        { status: 400 }
      );
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        { error: 'Endereço de email inválido.' },
        { status: 400 }
      );
    }
    if (password.length < 6) {
      return NextResponse.json(
        { error: 'A palavra-passe deve ter pelo menos 6 caracteres.' },
        { status: 400 }
      );
    }

    const now = new Date();
    const newDoc: UserDoc = {
      _id: new ObjectId(),
      username,
      usernameLower: username.toLowerCase(),
      email,
      emailLower: email.toLowerCase(),
      role,
      status: 'active',
      passwordHash: hashPassword(password),
      maskedName: makeMaskedName(username),
      avatarIndex: crypto.randomInt(0, 6),
      balance,
      currency: 'MZN',
      tokenVersion: 1,
      aviatorBets: [],
      createdAt: now,
      updatedAt: now,
    };

    try {
      await usersCol.insertOne(newDoc);
      getLiveRoundManager()?.addAuditLog(
        gate.user.email,
        'Criar Conta',
        email,
        `Função: ${role}, Saldo inicial: ${balance.toFixed(2)} MZN`
      );
      await appendSystemAuditLog(
        gate.user.email,
        'Criar Conta',
        email,
        `Função: ${role}, Saldo inicial: ${balance.toFixed(2)} MZN`
      );
      return NextResponse.json(
        { ok: true, id: newDoc._id.toHexString() },
        { status: 201 }
      );
    } catch (err: unknown) {
      const msg = String(err);
      if (msg.includes('emailLower')) {
        return NextResponse.json(
          { error: 'Este email já está registado.' },
          { status: 400 }
        );
      }
      if (msg.includes('usernameLower')) {
        return NextResponse.json(
          { error: 'Este nome de utilizador já está em uso.' },
          { status: 400 }
        );
      }
      throw err;
    }
  } catch {
    return NextResponse.json({ error: 'Pedido inválido.' }, { status: 400 });
  }
}
