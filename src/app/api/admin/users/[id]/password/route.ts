import { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { hashPassword } from '@/server/auth/authService';
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
    const newPassword = typeof body.password === 'string' ? body.password : '';
    if (newPassword.length < 6) {
      return NextResponse.json(
        { error: 'A nova palavra-passe deve ter pelo menos 6 caracteres.' },
        { status: 400 }
      );
    }

    const objId = new ObjectId(id);
    const target = await usersCol.findOne({ _id: objId });
    if (!target || target.systemKey) {
      return NextResponse.json(
        { error: 'Utilizador não encontrado.' },
        { status: 404 }
      );
    }

    await usersCol.updateOne(
      { _id: objId },
      {
        $set: { passwordHash: hashPassword(newPassword), updatedAt: new Date() },
        $inc: { tokenVersion: 1 },
      }
    );

    const liveRm = getLiveRoundManager();
    liveRm?.revokeLiveUserSession(
      id,
      'Palavra-passe redefinida pelo administrador. Inicie sessão novamente.'
    );
    liveRm?.addAuditLog(
      gate.user.email,
      'Redefinir Senha',
      target.email,
      'Senha alterada e sessões anteriores revogadas'
    );
    await appendSystemAuditLog(
      gate.user.email,
      'Redefinir Senha',
      target.email,
      'Senha alterada e sessões anteriores revogadas'
    );

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Pedido inválido.' }, { status: 400 });
  }
}
