import { NextRequest, NextResponse } from 'next/server';
import { authService, SESSION_COOKIE_NAME } from '@/server/auth/authService';
import { AuthUser } from '@/shared/types';
import type { RoundManager } from '@/server/engine/roundManager';

declare global {
  // eslint-disable-next-line no-var
  var __aviatorRoundManager: RoundManager | undefined;
}

export function getLiveRoundManager(): RoundManager | undefined {
  return globalThis.__aviatorRoundManager;
}

export function setLiveRoundManager(rm: RoundManager): void {
  globalThis.__aviatorRoundManager = rm;
}

export function withSessionCookie(
  res: NextResponse,
  token: string
): NextResponse {
  res.cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
    secure: process.env.NODE_ENV === 'production' && Boolean(process.env.VERCEL),
  });
  return res;
}

export function clearSessionCookie(res: NextResponse): NextResponse {
  res.cookies.set(SESSION_COOKIE_NAME, '', {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
  return res;
}

export async function requireAdmin(
  req: NextRequest
): Promise<{ ok: true; user: AuthUser } | { ok: false; response: NextResponse }> {
  const cookieHeader = req.headers.get('cookie') ?? undefined;
  const user = await authService.getUserFromCookieHeader(cookieHeader);
  if (!user) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Autenticação necessária.' },
        { status: 401 }
      ),
    };
  }
  if (user.role !== 'admin') {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Acesso restrito a administradores.' },
        { status: 403 }
      ),
    };
  }
  return { ok: true, user };
}
