import { NextRequest, NextResponse } from 'next/server';
import { authService } from '@/server/auth/authService';
import { getLiveRoundManager, withSessionCookie } from '@/server/serverless/httpHelpers';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const username = typeof body.username === 'string' ? body.username : '';
    const email = typeof body.email === 'string' ? body.email : '';
    const password = typeof body.password === 'string' ? body.password : '';

    const result = await authService.register({ username, email, password });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    getLiveRoundManager()?.syncUserBalanceFromAuth(
      result.user.id,
      result.user.balance
    );

    const res = NextResponse.json({ user: result.user }, { status: 201 });
    return withSessionCookie(res, result.token);
  } catch {
    return NextResponse.json({ error: 'Pedido inválido.' }, { status: 400 });
  }
}
