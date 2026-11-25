import { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { mongoService } from '@/server/db/mongo';
import {
  getLiveRoundManager,
  requireAdmin,
} from '@/server/serverless/httpHelpers';
import { appendSystemAuditLog } from '@/server/serverless/serverlessEngine';

export const dynamic = 'force-dynamic';

export async function DELETE(
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

  const objId = new ObjectId(id);
  const target = await usersCol.findOne({ _id: objId });
  if (!target || target.systemKey) {
    return NextResponse.json(
      { error: 'Utilizador não encontrado.' },
      { status: 404 }
    );
  }
  if (target.emailLower === 'admin@bombabet.com' || id === gate.user.id) {
    return NextResponse.json(
      {
        error:
          'Não é possível remover a conta de administrador principal ou a sessão actual.',
      },
      { status: 400 }
    );
  }

  await usersCol.deleteOne({ _id: objId });
  const liveRm = getLiveRoundManager();
  liveRm?.revokeLiveUserSession(id, 'Conta removida.');
  liveRm?.addAuditLog(
    gate.user.email,
    'Remover Conta',
    target.email,
    `Utilizador ${target.username} eliminado`
  );
  await appendSystemAuditLog(
    gate.user.email,
    'Remover Conta',
    target.email,
    `Utilizador ${target.username} eliminado`
  );

  return NextResponse.json({ ok: true });
}
