import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';

const port = Number(process.env.PORT ?? '4173');
const gateway = new URL(process.env.FTGO_GATEWAY_URL ?? 'http://127.0.0.1:8087');
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be between 1 and 65535.');
}
if (!['http:', 'https:'].includes(gateway.protocol) || gateway.username || gateway.password
    || gateway.pathname !== '/' || gateway.search || gateway.hash) {
  throw new Error('FTGO_GATEWAY_URL must be an HTTP or HTTPS origin.');
}

const assets = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/styles.css', ['styles.css', 'text/css; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/api.js', ['api.js', 'text/javascript; charset=utf-8']],
]);

function send(response, status, contentType, body) {
  response.writeHead(status, { 'Content-Type': contentType, 'Cache-Control': 'no-store' });
  response.end(body);
}

async function forwardOrder(path, response) {
  try {
    const upstream = await fetch(new URL(path, gateway), {
      method: 'GET',
      headers: { Accept: 'application/json' },
      redirect: 'error',
      signal: AbortSignal.timeout(10000),
    });
    const body = Buffer.from(await upstream.arrayBuffer());
    send(response, upstream.status, 'application/json; charset=utf-8', body);
  } catch {
    send(response, 502, 'application/json; charset=utf-8',
      JSON.stringify({ error: 'The configured FTGO gateway is unavailable.' }));
  }
}

async function serve(request, response) {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    send(response, 405, 'text/plain; charset=utf-8', 'Method not allowed');
    return;
  }

  const path = request.url?.split('?', 1)[0] ?? '/';
  if (/^\/orders\/[1-9][0-9]{0,18}$/.test(path)) {
    await forwardOrder(path, response);
    return;
  }

  const asset = assets.get(path);
  if (!asset) {
    send(response, 404, 'text/plain; charset=utf-8', 'Not found');
    return;
  }

  const [filename, contentType] = asset;
  try {
    const body = await readFile(new URL(`./dist/${filename}`, import.meta.url));
    send(response, 200, contentType, body);
  } catch {
    send(response, 500, 'text/plain; charset=utf-8', 'Build the frontend with npm run build first.');
  }
}

createServer(serve).listen(port, '127.0.0.1', () => {
  console.log(`FTGO frontend at http://127.0.0.1:${port} using gateway ${gateway.origin}`);
});
