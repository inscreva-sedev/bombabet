import { NextRequest, NextResponse } from 'next/server';
import { mongoService } from '@/server/db/mongo';
import {
  getLiveRoundManager,
  requireAdmin,
} from '@/server/serverless/httpHelpers';
import {
  computeRoundStateAt,
  getOrInitSystemState,
  reconcileAndBuildUserSnapshot,
} from '@/server/serverless/serverlessEngine';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const gate = await requireAdmin(req);
  if (!gate.ok) return gate.response;

  await mongoService.connect();
  const usersCol = mongoService.users();
  if (!usersCol) {
    return NextResponse.json(
      { error: 'Base de dados indisponível.' },
      { status: 503 }
    );
  }

  const userDocs = await usersCol
    .find({ systemKey: { $exists: false } }, { projection: { passwordHash: 0 } })
    .sort({ createdAt: -1 })
    .limit(500)
    .toArray();

  let totalVirtualBalance = 0;
  let totalUserBets = 0;
  let totalWagered = 0;
  let totalPaidOut = 0;
  let activeUsers = 0;
  let blockedUsers = 0;

  const users = userDocs.map((doc) => {
    const balance = typeof doc.balance === 'number' ? doc.balance : 0;
    const bets = Array.isArray(doc.aviatorBets) ? doc.aviatorBets : [];
    const status = doc.status === 'blocked' ? 'blocked' : 'active';
    if (status === 'blocked') blockedUsers++;
    else activeUsers++;

    totalVirtualBalance += balance;
    totalUserBets += bets.length;
    for (const b of bets) {
      totalWagered += b.betAmount || 0;
      totalPaidOut += b.payout || 0;
    }

    return {
      id: doc._id.toHexString(),
      username: doc.username,
      email: doc.email,
      role: doc.role === 'admin' ? 'admin' : 'user',
      status,
      maskedName: doc.maskedName,
      balance,
      currency: doc.currency || 'MZN',
      betsCount: bets.length,
      recentBets: bets.slice(0, 20),
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  });

  const liveRm = getLiveRoundManager();
  if (liveRm) {
    const telemetry = liveRm.getAdminTelemetry();
    let under2x = 0;
    let from2to10x = 0;
    let over10x = 0;
    for (const r of telemetry.history) {
      if (r.crashPoint >= 10) over10x++;
      else if (r.crashPoint >= 2) from2to10x++;
      else under2x++;
    }

    return NextResponse.json({
      mongoConnected: mongoService.isConnected(),
      stats: {
        totalUsers: users.length,
        activeUsers,
        blockedUsers,
        totalVirtualBalance: Math.round(totalVirtualBalance * 100) / 100,
        totalUserBets,
        totalWagered: Math.round(totalWagered * 100) / 100,
        totalPaidOut: Math.round(totalPaidOut * 100) / 100,
        connectedClients: telemetry.connectedClients,
        authenticatedOnline: telemetry.authenticatedOnline,
      },
      multiplierStats: {
        totalRounds: telemetry.history.length,
        under2x,
        from2to10x,
        over10x,
      },
      liveRound: {
        roundId: telemetry.roundId,
        phase: telemetry.phase,
        multiplier: telemetry.multiplier,
        totalBetsCount: telemetry.totalBetsCount,
        remainingBetsCount: telemetry.remainingBetsCount,
        totalRoundPayout: telemetry.totalRoundPayout,
        liveBets: telemetry.liveBets,
      },
      history: telemetry.history,
      topWins: telemetry.topWins,
      engineConfig: telemetry.engineConfig,
      auditLogs: telemetry.auditLogs,
      users,
    });
  }

  // Serverless / Vercel mode
  const sys = await getOrInitSystemState();
  const round = computeRoundStateAt(sys);
  const { snapshot } = await reconcileAndBuildUserSnapshot(
    req.headers.get('cookie') ?? undefined
  );

  let under2x = 0;
  let from2to10x = 0;
  let over10x = 0;
  for (const r of round.history) {
    if (r.crashPoint >= 10) over10x++;
    else if (r.crashPoint >= 2) from2to10x++;
    else under2x++;
  }

  return NextResponse.json({
    mongoConnected: mongoService.isConnected(),
    stats: {
      totalUsers: users.length,
      activeUsers,
      blockedUsers,
      totalVirtualBalance: Math.round(totalVirtualBalance * 100) / 100,
      totalUserBets,
      totalWagered: Math.round(totalWagered * 100) / 100,
      totalPaidOut: Math.round(totalPaidOut * 100) / 100,
      connectedClients: snapshot.totalBetsCount > 0 ? 1 : 0,
      authenticatedOnline: 1,
    },
    multiplierStats: {
      totalRounds: round.history.length,
      under2x,
      from2to10x,
      over10x,
    },
    liveRound: {
      roundId: snapshot.roundId,
      phase: snapshot.phase,
      multiplier: snapshot.multiplier,
      totalBetsCount: snapshot.totalBetsCount,
      remainingBetsCount: snapshot.remainingBetsCount,
      totalRoundPayout: snapshot.totalRoundPayout,
      liveBets: snapshot.liveBets.slice(0, 25),
    },
    history: round.history,
    topWins: snapshot.topWins,
    engineConfig: sys.engineConfig,
    auditLogs: sys.auditLogs,
    users,
  });
}
