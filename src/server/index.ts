import http from 'node:http';
import crypto from 'node:crypto';
import next from 'next';
import { WebSocketServer, WebSocket } from 'ws';
import { ClientMessage, ServerMessage } from '@/shared/types';
import { RoundManager } from '@/server/engine/roundManager';
import { mongoService } from '@/server/db/mongo';
import { authService } from '@/server/auth/authService';
import { handleAuthHttpRequest } from '@/server/auth/authRoutes';
import { handleAdminHttpRequest } from '@/server/admin/adminRoutes';

const dev =
  !process.argv.includes('--prod') && process.env.NODE_ENV !== 'production';
const hostname = process.env.HOST || '127.0.0.1';
const port = parseInt(process.env.PORT || '3000', 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

async function bootstrap() {
  await mongoService.connect();
  await authService.ensureDefaultAdmin();
  await app.prepare();

  const clients = new Map<string, Set<WebSocket>>();

  const roundManager = new RoundManager({
    sendToClient: (clientId, message: ServerMessage) => {
      const sockets = clients.get(clientId);
      if (!sockets) return;
      const payload = JSON.stringify(message);
      for (const ws of sockets) {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(payload);
        }
      }
    },
    getConnectedClientIds: () => Array.from(clients.keys()),
  });

  await roundManager.hydrateFromDatabase();
  roundManager.start();

  const server = http.createServer(async (req, res) => {
    try {
      const handledAuth = await handleAuthHttpRequest(req, res, (userId, balance) => {
        roundManager.syncUserBalanceFromAuth(userId, balance);
      });
      if (handledAuth) return;

      const handledAdmin = await handleAdminHttpRequest(req, res, roundManager);
      if (handledAdmin) return;

      handle(req, res);
    } catch (err) {
      console.error('[HTTP server]', err);
      if (!res.headersSent) {
        res.statusCode = 500;
        res.end('Internal Server Error');
      }
    }
  });

  const wss = new WebSocketServer({ noServer: true });

  // Only upgrade /ws so Next.js HMR /_next/webpack-hmr continues to work seamlessly
  server.on('upgrade', (request, socket, head) => {
    const reqUrl = request.url || '';
    if (reqUrl.startsWith('/ws')) {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    }
  });

  wss.on('connection', (ws, request) => {
    let activeClientId = `guest-${crypto.randomUUID()}`;

    const attachSocket = (clientId: string) => {
      if (clients.has(activeClientId)) {
        clients.get(activeClientId)!.delete(ws);
        if (clients.get(activeClientId)!.size === 0) {
          clients.delete(activeClientId);
        }
      }
      activeClientId = clientId;
      if (!clients.has(clientId)) {
        clients.set(clientId, new Set());
      }
      clients.get(clientId)!.add(ws);
    };

    attachSocket(activeClientId);

    ws.on('message', async (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as ClientMessage;

        switch (msg.type) {
          case 'INIT': {
            const cookieUser = await authService.getUserFromCookieHeader(
              request.headers.cookie
            );
            if (cookieUser) {
              const authClientId =
                await roundManager.attachAuthenticatedUser(cookieUser);
              attachSocket(authClientId);
            } else {
              const requestedId =
                typeof msg.clientId === 'string' && msg.clientId.trim().length > 0
                  ? `guest:${msg.clientId.trim().slice(0, 64)}`
                  : activeClientId;
              attachSocket(requestedId);
            }

            ws.send(
              JSON.stringify({
                type: 'SNAPSHOT',
                data: roundManager.getSnapshot(activeClientId),
              } satisfies ServerMessage)
            );
            break;
          }
          case 'PLACE_BET': {
            roundManager.handlePlaceBet(activeClientId, msg.slotId, msg.amount);
            break;
          }
          case 'CANCEL_BET': {
            roundManager.handleCancelBet(activeClientId, msg.slotId);
            break;
          }
          case 'CASHOUT': {
            roundManager.handleCashout(activeClientId, msg.slotId);
            break;
          }
          case 'UPDATE_AUTO': {
            roundManager.handleUpdateAuto(activeClientId, msg.slotId, msg.auto);
            break;
          }
          case 'RESET_VIRTUAL_BALANCE': {
            roundManager.handleResetBalance(activeClientId, msg.amount);
            break;
          }
        }
      } catch {
        ws.send(
          JSON.stringify({
            type: 'ERROR',
            message: 'Mensagem inválida.',
          } satisfies ServerMessage)
        );
      }
    });

    ws.on('close', () => {
      const set = clients.get(activeClientId);
      if (set) {
        set.delete(ws);
        if (set.size === 0) {
          clients.delete(activeClientId);
        }
      }
    });
  });

  server.listen(port, hostname, () => {
    console.log(`> Aviator server ready on http://${hostname}:${port}`);
  });
}

bootstrap().catch((err) => {
  console.error('Failed to start Aviator server:', err);
  process.exit(1);
});
