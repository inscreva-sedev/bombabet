import http from 'node:http';
import crypto from 'node:crypto';
import { ObjectId } from 'mongodb';
import { authService, hashPassword, makeMaskedName } from '@/server/auth/authService';
import { mongoService, UserDoc } from '@/server/db/mongo';
import { RoundManager } from '@/server/engine/roundManager';
import { GameEngineConfig } from '@/shared/types';

const MAX_BODY_BYTES = 16 * 1024;

function sendJson(
  res: http.ServerResponse,
  status: number,
  body: unknown
): void {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(body));
}

async function readJsonBody(
  req: http.IncomingMessage
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('Payload too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8').trim();
        resolve(raw ? (JSON.parse(raw) as Record<string, unknown>) : {});
      } catch {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

export async function handleAdminHttpRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  roundManager: RoundManager
): Promise<boolean> {
  const urlPath = (req.url || '').split('?')[0];
  if (!urlPath.startsWith('/api/admin')) {
    return false;
  }

  const currentUser = await authService.getUserFromCookieHeader(
    req.headers.cookie
  );
  if (!currentUser) {
    sendJson(res, 401, { error: 'Autenticação necessária.' });
    return true;
  }
  if (currentUser.role !== 'admin') {
    sendJson(res, 403, { error: 'Acesso restrito a administradores.' });
    return true;
  }

  await mongoService.connect();
  const usersCol = mongoService.users();
  if (!usersCol) {
    sendJson(res, 503, { error: 'Base de dados indisponível.' });
    return true;
  }

  try {
    // GET /api/admin/overview
    if (req.method === 'GET' && urlPath === '/api/admin/overview') {
      const userDocs = await usersCol
        .find({}, { projection: { passwordHash: 0 } })
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

      const telemetry = roundManager.getAdminTelemetry();
      let under2x = 0;
      let from2to10x = 0;
      let over10x = 0;
      for (const r of telemetry.history) {
        if (r.crashPoint >= 10) over10x++;
        else if (r.crashPoint >= 2) from2to10x++;
        else under2x++;
      }

      sendJson(res, 200, {
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
      return true;
    }

    // POST /api/admin/users (create user directly)
    if (req.method === 'POST' && urlPath === '/api/admin/users') {
      const body = await readJsonBody(req);
      const username = typeof body.username === 'string' ? body.username.trim() : '';
      const email = typeof body.email === 'string' ? body.email.trim() : '';
      const password = typeof body.password === 'string' ? body.password : '';
      const role = body.role === 'admin' ? 'admin' : 'user';
      const rawBal = Number(body.balance ?? 1000);
      const balance = Number.isFinite(rawBal)
        ? Math.min(1000000, Math.max(0, Math.round(rawBal * 100) / 100))
        : 1000;

      if (!/^[a-zA-Z0-9_.-]{3,20}$/.test(username)) {
        sendJson(res, 400, {
          error: 'Nome de utilizador inválido (3 a 20 caracteres alfanuméricos, _, . ou -).',
        });
        return true;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        sendJson(res, 400, { error: 'Endereço de email inválido.' });
        return true;
      }
      if (password.length < 6) {
        sendJson(res, 400, {
          error: 'A palavra-passe deve ter pelo menos 6 caracteres.',
        });
        return true;
      }

      const now = new Date();
      try {
        const newDoc: UserDoc = {
          _id: new ObjectId(),
          username,
          usernameLower: username.toLowerCase(),
          email,
          emailLower: email.toLowerCase(),
          role,
          status: 'active',
          passwordHash: hashPassword(password),
          maskedName: makeMaskedName(username),
          avatarIndex: crypto.randomInt(0, 6),
          balance,
          currency: 'MZN',
          tokenVersion: 1,
          aviatorBets: [],
          createdAt: now,
          updatedAt: now,
        };
        await usersCol.insertOne(newDoc);
        roundManager.addAuditLog(
          currentUser.email,
          'Criar Conta',
          email,
          `Função: ${role}, Saldo inicial: ${balance.toFixed(2)} MZN`
        );
        sendJson(res, 201, { ok: true, id: newDoc._id.toHexString() });
      } catch (err: unknown) {
        const msg = String(err);
        if (msg.includes('emailLower')) {
          sendJson(res, 400, { error: 'Este email já está registado.' });
          return true;
        }
        if (msg.includes('usernameLower')) {
          sendJson(res, 400, { error: 'Este nome de utilizador já está em uso.' });
          return true;
        }
        throw err;
      }
      return true;
    }

    // PATCH /api/admin/config
    if (req.method === 'PATCH' && urlPath === '/api/admin/config') {
      const body = await readJsonBody(req);
      const partial: Partial<GameEngineConfig> = {};

      if (body.minBet !== undefined) partial.minBet = Number(body.minBet);
      if (body.maxBet !== undefined) partial.maxBet = Number(body.maxBet);
      if (body.countdownMs !== undefined) partial.countdownMs = Number(body.countdownMs);
      if (body.growthRate !== undefined) partial.growthRate = Number(body.growthRate);
      if (body.botsEnabled !== undefined) partial.botsEnabled = Boolean(body.botsEnabled);
      if (body.maintenanceMode !== undefined) {
        partial.maintenanceMode = Boolean(body.maintenanceMode);
      }

      const updated = roundManager.updateEngineConfig(partial);
      roundManager.addAuditLog(
        currentUser.email,
        'Configuração Motor',
        'Global',
        `Aposta ${updated.minBet}-${updated.maxBet} MZN, Espera ${updated.countdownMs}ms, Bots=${updated.botsEnabled}, Manutenção=${updated.maintenanceMode}`
      );
      sendJson(res, 200, { ok: true, engineConfig: updated });
      return true;
    }

    // PATCH /api/admin/users/:id/balance
    const balanceMatch = urlPath.match(/^\/api\/admin\/users\/([a-fA-F0-9]{24})\/balance$/);
    if (req.method === 'PATCH' && balanceMatch) {
      const targetId = balanceMatch[1];
      const body = await readJsonBody(req);
      const mode = body.mode === 'add' ? 'add' : 'set';
      const rawAmount = Number(body.amount);

      if (!Number.isFinite(rawAmount) || Number.isNaN(rawAmount)) {
        sendJson(res, 400, { error: 'Valor inválido.' });
        return true;
      }

      const objId = new ObjectId(targetId);
      const target = await usersCol.findOne({ _id: objId });
      if (!target) {
        sendJson(res, 404, { error: 'Utilizador não encontrado.' });
        return true;
      }

      const prevBalance = target.balance || 0;
      const nextBalanceRaw = mode === 'add' ? prevBalance + rawAmount : rawAmount;
      const nextBalance = Math.min(
        1000000,
        Math.max(0, Math.round(nextBalanceRaw * 100) / 100)
      );

      await usersCol.updateOne(
        { _id: objId },
        { $set: { balance: nextBalance, updatedAt: new Date() } }
      );
      roundManager.syncUserBalanceFromAuth(targetId, nextBalance);
      roundManager.addAuditLog(
        currentUser.email,
        'Ajustar Saldo',
        target.email,
        `${prevBalance.toFixed(2)} → ${nextBalance.toFixed(2)} MZN (${mode})`
      );

      sendJson(res, 200, { ok: true, id: targetId, balance: nextBalance });
      return true;
    }

    // PATCH /api/admin/users/:id/role
    const roleMatch = urlPath.match(/^\/api\/admin\/users\/([a-fA-F0-9]{24})\/role$/);
    if (req.method === 'PATCH' && roleMatch) {
      const targetId = roleMatch[1];
      const body = await readJsonBody(req);
      const nextRole = body.role === 'admin' ? 'admin' : 'user';

      const objId = new ObjectId(targetId);
      const target = await usersCol.findOne({ _id: objId });
      if (!target) {
        sendJson(res, 404, { error: 'Utilizador não encontrado.' });
        return true;
      }
      if (target.emailLower === 'admin@bombabet.com' && nextRole !== 'admin') {
        sendJson(res, 400, {
          error: 'O administrador principal não pode perder privilégios.',
        });
        return true;
      }

      await usersCol.updateOne(
        { _id: objId },
        { $set: { role: nextRole, updatedAt: new Date() } }
      );
      roundManager.addAuditLog(
        currentUser.email,
        'Alterar Função',
        target.email,
        `Nova função: ${nextRole}`
      );
      sendJson(res, 200, { ok: true, id: targetId, role: nextRole });
      return true;
    }

    // PATCH /api/admin/users/:id/status (block / unblock)
    const statusMatch = urlPath.match(/^\/api\/admin\/users\/([a-fA-F0-9]{24})\/status$/);
    if (req.method === 'PATCH' && statusMatch) {
      const targetId = statusMatch[1];
      const body = await readJsonBody(req);
      const nextStatus = body.status === 'blocked' ? 'blocked' : 'active';

      const objId = new ObjectId(targetId);
      const target = await usersCol.findOne({ _id: objId });
      if (!target) {
        sendJson(res, 404, { error: 'Utilizador não encontrado.' });
        return true;
      }
      if (
        nextStatus === 'blocked' &&
        (target.emailLower === 'admin@bombabet.com' || targetId === currentUser.id)
      ) {
        sendJson(res, 400, {
          error: 'Não é possível bloquear o administrador principal ou a sessão actual.',
        });
        return true;
      }

      await usersCol.updateOne(
        { _id: objId },
        {
          $set: { status: nextStatus, updatedAt: new Date() },
          ...(nextStatus === 'blocked' ? { $inc: { tokenVersion: 1 } } : {}),
        }
      );

      if (nextStatus === 'blocked') {
        roundManager.revokeLiveUserSession(
          targetId,
          'A sua conta foi bloqueada pelo administrador.'
        );
      }
      roundManager.addAuditLog(
        currentUser.email,
        nextStatus === 'blocked' ? 'Bloquear Conta' : 'Desbloquear Conta',
        target.email,
        `Estado: ${nextStatus}`
      );
      sendJson(res, 200, { ok: true, id: targetId, status: nextStatus });
      return true;
    }

    // PATCH /api/admin/users/:id/password
    const passwordMatch = urlPath.match(/^\/api\/admin\/users\/([a-fA-F0-9]{24})\/password$/);
    if (req.method === 'PATCH' && passwordMatch) {
      const targetId = passwordMatch[1];
      const body = await readJsonBody(req);
      const newPassword = typeof body.password === 'string' ? body.password : '';
      if (newPassword.length < 6) {
        sendJson(res, 400, {
          error: 'A nova palavra-passe deve ter pelo menos 6 caracteres.',
        });
        return true;
      }

      const objId = new ObjectId(targetId);
      const target = await usersCol.findOne({ _id: objId });
      if (!target) {
        sendJson(res, 404, { error: 'Utilizador não encontrado.' });
        return true;
      }

      await usersCol.updateOne(
        { _id: objId },
        {
          $set: { passwordHash: hashPassword(newPassword), updatedAt: new Date() },
          $inc: { tokenVersion: 1 },
        }
      );
      roundManager.revokeLiveUserSession(
        targetId,
        'Palavra-passe redefinida pelo administrador. Inicie sessão novamente.'
      );
      roundManager.addAuditLog(
        currentUser.email,
        'Redefinir Senha',
        target.email,
        'Senha alterada e sessões anteriores revogadas'
      );
      sendJson(res, 200, { ok: true });
      return true;
    }

    // POST /api/admin/users/:id/revoke
    const revokeMatch = urlPath.match(/^\/api\/admin\/users\/([a-fA-F0-9]{24})\/revoke$/);
    if (req.method === 'POST' && revokeMatch) {
      const targetId = revokeMatch[1];
      const objId = new ObjectId(targetId);
      const target = await usersCol.findOne({ _id: objId });
      if (!target) {
        sendJson(res, 404, { error: 'Utilizador não encontrado.' });
        return true;
      }

      await usersCol.updateOne(
        { _id: objId },
        { $inc: { tokenVersion: 1 }, $set: { updatedAt: new Date() } }
      );
      roundManager.revokeLiveUserSession(
        targetId,
        'Sessão terminada pelo administrador.'
      );
      roundManager.addAuditLog(
        currentUser.email,
        'Revogar Sessão',
        target.email,
        'Sessões Web/WS terminadas remotamente'
      );
      sendJson(res, 200, { ok: true });
      return true;
    }

    // DELETE /api/admin/users/:id
    const deleteMatch = urlPath.match(/^\/api\/admin\/users\/([a-fA-F0-9]{24})$/);
    if (req.method === 'DELETE' && deleteMatch) {
      const targetId = deleteMatch[1];
      const objId = new ObjectId(targetId);
      const target = await usersCol.findOne({ _id: objId });
      if (!target) {
        sendJson(res, 404, { error: 'Utilizador não encontrado.' });
        return true;
      }
      if (target.emailLower === 'admin@bombabet.com' || targetId === currentUser.id) {
        sendJson(res, 400, {
          error: 'Não é possível remover a conta de administrador principal ou a sessão actual.',
        });
        return true;
      }

      await usersCol.deleteOne({ _id: objId });
      roundManager.revokeLiveUserSession(targetId, 'Conta removida.');
      roundManager.addAuditLog(
        currentUser.email,
        'Remover Conta',
        target.email,
        `Utilizador ${target.username} eliminado`
      );
      sendJson(res, 200, { ok: true });
      return true;
    }

    sendJson(res, 404, { error: 'Rota administrativa não encontrada.' });
    return true;
  } catch (err) {
    console.error('[adminRoutes]', err);
    sendJson(res, 500, { error: 'Erro interno na área administrativa.' });
    return true;
  }
}
