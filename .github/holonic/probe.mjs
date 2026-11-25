import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const [checkout, input] = process.argv.slice(2);
const [browserRequests, gatewayRequests] = [[], []];
const listen = async (server) => {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return server.address().port;
};
const gateway = createServer((request, response) => {
  gatewayRequests.push({ method: request.method, path: request.url });
  const match = /^\/orders\/([1-9][0-9]{0,18})$/.exec(request.url);
  if (request.method !== 'GET' || !match) {
    response.writeHead(404).end();
    return;
  }
  response.setHeader('Content-Type', 'application/json');
  response.end(JSON.stringify({ orderInfo: { orderId: match[1], state: 'APPROVED' } }));
});

const portFinder = createServer();
const port = await listen(portFinder);
await new Promise((done) => portFinder.close(done));
const gatewayPort = await listen(gateway);
const proxy = spawn(process.execPath, ['server.mjs'], {
  cwd: checkout,
  env: { ...process.env, PORT: String(port), FTGO_GATEWAY_URL: 'http://127.0.0.1:' + gatewayPort },
  stdio: ['ignore', 'pipe', 'inherit'],
});
const exited = once(proxy, 'exit');
const httpFetch = globalThis.fetch;
try {
  let ready = false;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      await httpFetch('http://127.0.0.1:' + port + '/');
      ready = true;
      break;
    } catch {
      if (proxy.exitCode !== null) break;
      await new Promise((done) => setTimeout(done, 50));
    }
  }
  if (!ready) throw new Error('FTGO frontend proxy did not start');

  globalThis.fetch = (path, options) => {
    browserRequests.push({ method: options.method, path });
    return httpFetch(new URL(path, 'http://127.0.0.1:' + port), options);
  };
  const { lookupOrder } = await import(pathToFileURL(resolve(checkout, 'dist/api.js')).href);
  let result;
  try {
    result = await lookupOrder(input, AbortSignal.timeout(5000));
  } catch (error) {
    result = { error: error.message };
  }
  console.log(JSON.stringify({ input, browserRequests, gatewayRequests, result }));
} finally {
  proxy.kill();
  await exited;
  gateway.closeAllConnections();
  await new Promise((done) => gateway.close(done));
}
