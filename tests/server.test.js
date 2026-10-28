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
