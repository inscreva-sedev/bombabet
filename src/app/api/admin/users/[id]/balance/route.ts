import { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { mongoService } from '@/server/db/mongo';
import {
  getLiveRoundManager,
  requireAdmin,
} from '@/server/serverless/httpHelpers';
import { appendSystemAuditLog } from '@/server/serverless/serverlessEngine';

export const dynamic = 'force-dynamic';

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const gate = await requireAdmin(req);
  if (!gate.ok) return gate.response;

  const { id } = await context.params;
  if (!ObjectId.isValid(id)) {
    return NextResponse.json({ error: 'ID inválido.' }, { status: 400 });
  }

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
    const mode = body.mode === 'add' ? 'add' : 'set';
    const rawAmount = Number(body.amount);

    if (!Number.isFinite(rawAmount) || Number.isNaN(rawAmount)) {
      return NextResponse.json({ error: 'Valor inválido.' }, { status: 400 });
    }

    const objId = new ObjectId(id);
    const target = await usersCol.findOne({ _id: objId });
    if (!target || target.systemKey) {
      return NextResponse.json(
        { error: 'Utilizador não encontrado.' },
        { status: 404 }
      );
    }

    const prevBalance = target.balance || 0;
    const nextBalanceRaw = mode === 'add' ? prevBalance + rawAmount : rawAmount;
    const nextBalance = Math.min(
      1000000,
      Math.max(0, Math.round(nextBalanceRaw * 100) / 100)
    );

    await usersCol.updateOne(
      { _id: objId },
      { $set: { balance: nextBalance, updatedAt: new Date() } }
    );

    const liveRm = getLiveRoundManager();
    liveRm?.syncUserBalanceFromAuth(id, nextBalance);
    liveRm?.addAuditLog(
      gate.user.email,
      'Ajustar Saldo',
      target.email,
      `${prevBalance.toFixed(2)} → ${nextBalance.toFixed(2)} MZN (${mode})`
    );
    await appendSystemAuditLog(
      gate.user.email,
      'Ajustar Saldo',
      target.email,
      `${prevBalance.toFixed(2)} → ${nextBalance.toFixed(2)} MZN (${mode})`
    );

    return NextResponse.json({ ok: true, id, balance: nextBalance });
  } catch {
    return NextResponse.json({ error: 'Pedido inválido.' }, { status: 400 });
  }
}
