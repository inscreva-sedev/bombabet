import http from 'node:http';
import { authService, SESSION_COOKIE_NAME } from '@/server/auth/authService';

const MAX_BODY_BYTES = 16 * 1024;

function sendJson(
  res: http.ServerResponse,
  status: number,
  body: unknown,
  extraHeaders?: Record<string, string>
): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...extraHeaders,
  });
  res.end(payload);
}

async function readJsonBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
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

function buildSessionCookie(token: string): string {
  return `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800`;
}

function buildClearCookie(): string {
  return `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

export async function handleAuthHttpRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  onUserBalanceSynced?: (userId: string, balance: number) => void
): Promise<boolean> {
  const urlPath = (req.url || '').split('?')[0];
  if (!urlPath.startsWith('/api/auth/')) {
    return false;
  }

  try {
    if (req.method === 'GET' && urlPath === '/api/auth/me') {
      const user = await authService.getUserFromCookieHeader(req.headers.cookie);
      sendJson(res, 200, { user });
      return true;
    }

    if (req.method === 'POST' && urlPath === '/api/auth/register') {
      const body = await readJsonBody(req);
      const username = typeof body.username === 'string' ? body.username : '';
      const email = typeof body.email === 'string' ? body.email : '';
      const password = typeof body.password === 'string' ? body.password : '';

      const result = await authService.register({ username, email, password });
      if (!result.ok) {
        sendJson(res, 400, { error: result.error });
        return true;
      }

      onUserBalanceSynced?.(result.user.id, result.user.balance);
      sendJson(
        res,
        201,
        { user: result.user },
        { 'Set-Cookie': buildSessionCookie(result.token) }
      );
      return true;
    }

    if (req.method === 'POST' && urlPath === '/api/auth/login') {
      const body = await readJsonBody(req);
      const identifier =
        typeof body.identifier === 'string'
          ? body.identifier
          : typeof body.email === 'string'
            ? body.email
            : '';
      const password = typeof body.password === 'string' ? body.password : '';

      const result = await authService.login({ identifier, password });
      if (!result.ok) {
        sendJson(res, 401, { error: result.error });
        return true;
      }

      onUserBalanceSynced?.(result.user.id, result.user.balance);
      sendJson(
        res,
        200,
        { user: result.user },
        { 'Set-Cookie': buildSessionCookie(result.token) }
      );
      return true;
    }

    if (req.method === 'POST' && urlPath === '/api/auth/logout') {
      await authService.logoutByCookieHeader(req.headers.cookie);
      sendJson(res, 200, { ok: true }, { 'Set-Cookie': buildClearCookie() });
      return true;
    }

    sendJson(res, 404, { error: 'Rota não encontrada.' });
    return true;
  } catch (err) {
    console.error('[authRoutes]', err);
    sendJson(res, 400, { error: 'Pedido inválido.' });
    return true;
  }
}
