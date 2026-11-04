'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { createServer } = require('../scripts/serve');

async function boot(t) {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return 'http://127.0.0.1:' + server.address().port;
}

test('serves the game shell and script with the right MIME type', async (t) => {
  const base = await boot(t);
  const page = await fetch(base + '/');
  const html = await page.text();
  assert.strictEqual(page.status, 200);
  assert.match(page.headers.get('content-type'), /text\/html/);
  assert.ok(html.includes('id="game"'), 'page mounts the canvas');

  const script = await fetch(base + '/game.js');
  assert.strictEqual(script.status, 200);
  assert.match(script.headers.get('content-type'), /javascript/);
  assert.ok((await script.text()).length > 1000);
});

test('serves the PWA shell with the right MIME types', async (t) => {
  const base = await boot(t);
  const manifest = await fetch(base + '/manifest.webmanifest');
  assert.strictEqual(manifest.status, 200);
  assert.match(manifest.headers.get('content-type'), /manifest\+json/);
  const body = await manifest.json();
  assert.strictEqual(body.short_name, 'Dustline');
  assert.ok(Array.isArray(body.icons) && body.icons.length >= 2, 'manifest lists icons');

  const worker = await fetch(base + '/sw.js');
  assert.strictEqual(worker.status, 200);
  assert.match(worker.headers.get('content-type'), /javascript/);

  for (const icon of ['/assets/icon-192.png', '/assets/icon-512.png', '/assets/icon-maskable-512.png']) {
    const res = await fetch(base + icon);
    assert.strictEqual(res.status, 200, icon + ' must be served');
    assert.match(res.headers.get('content-type'), /image\/png/);
  }

  const page = await fetch(base + '/');
  const html = await page.text();
  assert.ok(html.includes('manifest.webmanifest'), 'shell links the manifest');
});

test('refuses dot-directories, missing files and non-GET methods', async (t) => {
  const base = await boot(t);
  for (const path of ['/.git/config', '/.aikit/task_ledger.json', '/.gitignore']) {
    const res = await fetch(base + path);
    assert.strictEqual(res.status, 404, path + ' must not be served');
  }

  const missing = await fetch(base + '/nope.js');
  assert.strictEqual(missing.status, 404);

  const post = await fetch(base + '/', { method: 'POST' });
  assert.strictEqual(post.status, 405);
  assert.match(post.headers.get('allow'), /GET/);

  const head = await fetch(base + '/', { method: 'HEAD' });
  assert.strictEqual(head.status, 200);
  assert.ok(Number(head.headers.get('content-length')) > 0);
  assert.strictEqual(await head.text(), '');
});

test('HEAD error responses carry no body (S13-B1)', async (t) => {
  const base = await boot(t);
  const net = require('node:net');
  const port = new URL(base).port;
  async function rawHead(path) {
    return new Promise((resolve, reject) => {
      const chunks = [];
      const sock = net.connect(Number(port), '127.0.0.1', () => {
        sock.write('HEAD ' + path + ' HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n');
      });
      sock.on('data', (c) => chunks.push(c));
      sock.on('end', () => resolve(Buffer.concat(chunks).toString('latin1')));
      sock.on('error', reject);
    });
  }
  for (const [path, status] of [['/nope.js', 404], ['/.git/config', 404], ['/%E0%A4%A', 400]]) {
    const raw = await rawHead(path);
    assert.match(raw.split('\r\n')[0], new RegExp(' ' + status + ' '), path + ' status');
    const body = raw.split('\r\n\r\n').slice(1).join('\r\n\r\n');
    assert.strictEqual(body, '', path + ' HEAD must be bodiless on the wire');
  }
});

test('backslash traversal cannot reach dot-directories (S13-B2)', async (t) => {
  const base = await boot(t);
  for (const path of ['/assets%5c..%5c.git%5cconfig', '/.aikit%5ctask_ledger.json', '/%252e%252e/game.js']) {
    const res = await fetch(base + path);
    assert.notStrictEqual(res.status, 200, path + ' must not be served');
  }
  const legit = await fetch(base + '/game.js');
  assert.strictEqual(legit.status, 200, 'plain game.js still served');
});

test('traversal stays unserved and maps to 404 without a symlink (K8 gap)', async (t) => {
  const base = await boot(t);
  // '..' trips the hidden-segment guard before the outside-ROOT 403 branch,
  // so plain HTTP traversal surfaces as 404; 403 needs a real symlink escape.
  // (Single-encoded %2e is normalized to /game.js by the client itself.)
  for (const path of ['/assets%5c..%5c.git%5cconfig', '/..%2f..%2fsecret']) {
    const res = await fetch(base + path);
    assert.strictEqual(res.status, 404, path + ' must not be served');
  }
});

test('symlink escape maps to 403 (K8 gap)', async (t) => {
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const outside = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'dustline-outside-'));
  t.after(() => fs.promises.rm(outside, { recursive: true, force: true }));
  await fs.promises.writeFile(path.join(outside, 'secret.txt'), 'x');
  const link = path.join(__dirname, '..', 't8n-symlink-probe');
  await fs.promises.rm(link, { recursive: true, force: true });
  try {
    fs.symlinkSync(outside, link, process.platform === 'win32' ? 'junction' : 'dir');
  } catch (err) {
    t.skip('symlinks unavailable: ' + err.message);
    return;
  }
  t.after(() => fs.promises.rm(link, { recursive: true, force: true }));
  const base = await boot(t);
  const res = await fetch(base + '/t8n-symlink-probe/secret.txt');
  assert.strictEqual(res.status, 403, 'symlink escape must be forbidden');
});

test('port and host resolve safely (deferred K7-B2/B3)', () => {
  const { resolvePort, resolveHost } = require('../scripts/serve');
  assert.strictEqual(resolvePort(undefined), 5173);
  assert.strictEqual(resolvePort('abc'), 5173);
  assert.strictEqual(resolvePort(99999), 5173);
  assert.strictEqual(resolvePort(-1), 5173);
  assert.strictEqual(resolvePort(0), 0);
  assert.strictEqual(resolvePort('8080'), 8080);
  assert.strictEqual(resolveHost(undefined), '127.0.0.1');
  assert.strictEqual(resolveHost(''), '127.0.0.1');
  assert.strictEqual(resolveHost('0.0.0.0'), '0.0.0.0');
});
