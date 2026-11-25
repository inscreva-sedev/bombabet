import { NextRequest, NextResponse } from 'next/server';
import { authService } from '@/server/auth/authService';
import { clearSessionCookie } from '@/server/serverless/httpHelpers';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  await authService.logoutByCookieHeader(
    req.headers.get('cookie') ?? undefined
  );
  const res = NextResponse.json({ ok: true });
  return clearSessionCookie(res);
}
