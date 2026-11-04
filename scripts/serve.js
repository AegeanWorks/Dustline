'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const DEFAULT_PORT = 5173;
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json'
};

function hasHiddenSegment(rel) {
  return rel.split(/[/\\]+/).some((segment) => segment.startsWith('.'));
}

function readPath(req) {
  try {
    return decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch (err) {
    return null;
  }
}

function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD', 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(req.method === 'HEAD' ? undefined : 'Method not allowed');
    return;
  }

  let rel = readPath(req);
  if (rel === null) {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(req.method === 'HEAD' ? undefined : 'Bad request');
    return;
  }
  if (rel === '/') rel = '/index.html';
  if (hasHiddenSegment(rel)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(req.method === 'HEAD' ? undefined : 'Not found');
    return;
  }

  const file = path.resolve(ROOT, '.' + rel);
  if (!file.startsWith(ROOT + path.sep)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(req.method === 'HEAD' ? undefined : 'Forbidden');
    return;
  }

  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(req.method === 'HEAD' ? undefined : 'Not found');
      return;
    }
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Content-Length': data.length,
      'Cache-Control': 'no-store'
    });
    res.end(req.method === 'HEAD' ? undefined : data);
  });
}

function createServer() {
  return http.createServer(handler);
}

function resolvePort(value) {
  const n = Number(value);
  if (Number.isInteger(n) && n >= 0 && n <= 65535) return n;
  return DEFAULT_PORT;
}

function resolveHost(value) {
  const h = String(value === undefined ? '' : value).trim();
  return h === '' ? '127.0.0.1' : h;
}

function start(port, host) {
  const chosen = resolvePort(port);
  const bind = resolveHost(host);
  const server = createServer();
  server.on('error', (err) => {
    console.error('Why: ' + err.message);
    console.error('Fix: free port ' + chosen + ' or run with PORT=<other> npm start');
    process.exit(1);
  });
  server.listen(chosen, bind, () => {
    const addr = server.address();
    console.log('Dustline running at http://' + bind + ':' + addr.port + '/');
    console.log('Press Ctrl+C to stop.');
  });
  process.on('SIGINT', () => server.close(() => process.exit(0)));
  return server;
}

if (require.main === module) {
  start(process.env.PORT !== undefined ? process.env.PORT : undefined, process.env.HOST);
}

module.exports = { ROOT, createServer, start, resolvePort, resolveHost };
