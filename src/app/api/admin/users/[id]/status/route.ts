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
    const nextStatus = body.status === 'blocked' ? 'blocked' : 'active';

    const objId = new ObjectId(id);
    const target = await usersCol.findOne({ _id: objId });
    if (!target || target.systemKey) {
      return NextResponse.json(
        { error: 'Utilizador não encontrado.' },
        { status: 404 }
      );
    }
    if (
      nextStatus === 'blocked' &&
      (target.emailLower === 'admin@bombabet.com' || id === gate.user.id)
    ) {
      return NextResponse.json(
        {
          error:
            'Não é possível bloquear o administrador principal ou a sessão actual.',
        },
        { status: 400 }
      );
    }

    await usersCol.updateOne(
      { _id: objId },
      {
        $set: { status: nextStatus, updatedAt: new Date() },
        ...(nextStatus === 'blocked' ? { $inc: { tokenVersion: 1 } } : {}),
      }
    );

    const liveRm = getLiveRoundManager();
    if (nextStatus === 'blocked') {
      liveRm?.revokeLiveUserSession(
        id,
        'A sua conta foi bloqueada pelo administrador.'
      );
    }
    liveRm?.addAuditLog(
      gate.user.email,
      nextStatus === 'blocked' ? 'Bloquear Conta' : 'Desbloquear Conta',
      target.email,
      `Estado: ${nextStatus}`
    );
    await appendSystemAuditLog(
      gate.user.email,
      nextStatus === 'blocked' ? 'Bloquear Conta' : 'Desbloquear Conta',
      target.email,
      `Estado: ${nextStatus}`
    );

    return NextResponse.json({ ok: true, id, status: nextStatus });
  } catch {
    return NextResponse.json({ error: 'Pedido inválido.' }, { status: 400 });
  }
}
