import { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { mongoService } from '@/server/db/mongo';
import {
  getLiveRoundManager,
  requireAdmin,
} from '@/server/serverless/httpHelpers';
import { appendSystemAuditLog } from '@/server/serverless/serverlessEngine';

export const dynamic = 'force-dynamic';

export async function POST(
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

  await usersCol.updateOne(
    { _id: objId },
    { $inc: { tokenVersion: 1 }, $set: { updatedAt: new Date() } }
  );

  const liveRm = getLiveRoundManager();
  liveRm?.revokeLiveUserSession(id, 'Sessão terminada pelo administrador.');
  liveRm?.addAuditLog(
    gate.user.email,
    'Revogar Sessão',
    target.email,
    'Sessões Web/WS terminadas remotamente'
  );
  await appendSystemAuditLog(
    gate.user.email,
    'Revogar Sessão',
    target.email,
    'Sessões Web/WS terminadas remotamente'
  );

  return NextResponse.json({ ok: true });
}
