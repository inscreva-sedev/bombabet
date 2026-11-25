import { NextRequest, NextResponse } from 'next/server';
import { handleServerlessGameAction } from '@/server/serverless/serverlessEngine';
import { AutoPlayConfig, BetSlotId } from '@/shared/types';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      type:
        | 'PLACE_BET'
        | 'CANCEL_BET'
        | 'CASHOUT'
        | 'UPDATE_AUTO'
        | 'RESET_VIRTUAL_BALANCE';
      slotId?: BetSlotId;
      amount?: number;
      auto?: Partial<AutoPlayConfig>;
    };

    const result = await handleServerlessGameAction(
      req.headers.get('cookie') ?? undefined,
      body
    );

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    const res = NextResponse.json({
      ok: true,
      snapshot: result.snapshot,
      outcomes: result.outcomes ?? [],
    });
    if (result.guestSetCookie) {
      res.headers.append('Set-Cookie', result.guestSetCookie);
    }
    return res;
  } catch {
    return NextResponse.json({ error: 'Acção inválida.' }, { status: 400 });
  }
}
