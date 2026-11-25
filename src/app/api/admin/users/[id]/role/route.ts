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
    const nextRole = body.role === 'admin' ? 'admin' : 'user';

    const objId = new ObjectId(id);
    const target = await usersCol.findOne({ _id: objId });
    if (!target || target.systemKey) {
      return NextResponse.json(
        { error: 'Utilizador não encontrado.' },
        { status: 404 }
      );
    }
    if (target.emailLower === 'admin@bombabet.com' && nextRole !== 'admin') {
      return NextResponse.json(
        { error: 'O administrador principal não pode perder privilégios.' },
        { status: 400 }
      );
    }

    await usersCol.updateOne(
      { _id: objId },
      { $set: { role: nextRole, updatedAt: new Date() } }
    );
    getLiveRoundManager()?.addAuditLog(
      gate.user.email,
      'Alterar Função',
      target.email,
      `Nova função: ${nextRole}`
    );
    await appendSystemAuditLog(
      gate.user.email,
      'Alterar Função',
      target.email,
      `Nova função: ${nextRole}`
    );

    return NextResponse.json({ ok: true, id, role: nextRole });
  } catch {
    return NextResponse.json({ error: 'Pedido inválido.' }, { status: 400 });
  }
}
