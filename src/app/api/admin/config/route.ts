import { NextRequest, NextResponse } from 'next/server';
import { GameEngineConfig } from '@/shared/types';
import {
  getLiveRoundManager,
  requireAdmin,
} from '@/server/serverless/httpHelpers';
import { updateSystemEngineConfig } from '@/server/serverless/serverlessEngine';

export const dynamic = 'force-dynamic';

export async function PATCH(req: NextRequest) {
  const gate = await requireAdmin(req);
  if (!gate.ok) return gate.response;

  try {
    const body = (await req.json()) as Record<string, unknown>;
    const partial: Partial<GameEngineConfig> = {};

    if (body.minBet !== undefined) partial.minBet = Number(body.minBet);
    if (body.maxBet !== undefined) partial.maxBet = Number(body.maxBet);
    if (body.countdownMs !== undefined) partial.countdownMs = Number(body.countdownMs);
    if (body.growthRate !== undefined) partial.growthRate = Number(body.growthRate);
    if (body.botsEnabled !== undefined) partial.botsEnabled = Boolean(body.botsEnabled);
    if (body.maintenanceMode !== undefined) {
      partial.maintenanceMode = Boolean(body.maintenanceMode);
    }

    const updated = await updateSystemEngineConfig(partial, gate.user.email);
    const liveRm = getLiveRoundManager();
    if (liveRm) {
      liveRm.updateEngineConfig(updated);
      liveRm.addAuditLog(
        gate.user.email,
        'Configuração Motor',
        'Global',
        `Aposta ${updated.minBet}-${updated.maxBet} MZN, Espera ${updated.countdownMs}ms, Bots=${updated.botsEnabled}, Manutenção=${updated.maintenanceMode}`
      );
    }

    return NextResponse.json({ ok: true, engineConfig: updated });
  } catch {
    return NextResponse.json({ error: 'Pedido inválido.' }, { status: 400 });
  }
}
