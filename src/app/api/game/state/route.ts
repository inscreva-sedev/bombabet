import { NextRequest, NextResponse } from 'next/server';
import { reconcileAndBuildUserSnapshot } from '@/server/serverless/serverlessEngine';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { snapshot, outcomes, guestSetCookie } =
    await reconcileAndBuildUserSnapshot(
      req.headers.get('cookie') ?? undefined
    );

  const res = NextResponse.json(
    { snapshot, outcomes },
    { headers: { 'Cache-Control': 'no-store' } }
  );
  if (guestSetCookie) {
    res.headers.append('Set-Cookie', guestSetCookie);
  }
  return res;
}
