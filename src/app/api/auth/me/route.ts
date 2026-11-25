import { NextRequest, NextResponse } from 'next/server';
import { authService } from '@/server/auth/authService';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const user = await authService.getUserFromCookieHeader(
    req.headers.get('cookie') ?? undefined
  );
  return NextResponse.json({ user }, { headers: { 'Cache-Control': 'no-store' } });
}
