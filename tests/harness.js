'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const GAME = path.join(__dirname, '..', 'game.js');

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TRACKED_OPS = new Set([
  'beginPath', 'arc', 'ellipse', 'fill', 'stroke', 'fillRect', 'strokeRect', 'drawImage',
  'clearRect', 'moveTo', 'lineTo', 'closePath', 'fillText', 'save', 'restore', 'translate',
  'rotate', 'scale', 'setTransform', 'createRadialGradient', 'createLinearGradient',
  'setLineDash', 'quadraticCurveTo', 'bezierCurveTo', 'clip'
]);

function createCanvasStub(width, height, counter, record) {
  const handlers = Object.create(null);
  const gradient = { addColorStop() {} };
  const state = Object.create(null);
  const log = record || null;
  const canvas = {
    width,
    height,
    style: {},
    getContext: () => ctx,
    getBoundingClientRect: () => ({ left: 0, top: 0, width, height }),
    addEventListener(type, fn) {
      handlers[type] = fn;
    }
  };
  const count = (prop) => {
    if (counter && TRACKED_OPS.has(String(prop))) counter[prop] = (counter[prop] || 0) + 1;
  };
  const alpha = () => (state.globalAlpha === undefined ? 1 : state.globalAlpha);
  const ctx = new Proxy(
    {},
    {
      get(_t, prop) {
        if (prop === 'canvas') return canvas;
        if (prop === 'measureText') return () => ({ width: 0 });
        if (prop === 'fillText') {
          return (text, x, y) => {
            if (log) {
              log.texts.push({
                text: String(text),
                x,
                y,
                font: state.font || '',
                align: state.textAlign || 'left',
                fillStyle: state.fillStyle
              });
            }
            count(prop);
          };
        }
        if (prop === 'fill') {
          return () => {
            if (log) log.fills.push({ fillStyle: state.fillStyle, alpha: alpha() });
            count(prop);
          };
        }
        if (prop === 'fillRect') {
          return (x, y, w, h) => {
            if (log) log.rects.push({ x, y, w, h, fillStyle: state.fillStyle, alpha: alpha() });
            count(prop);
          };
        }
        if (prop === 'drawImage') {
          return (image, x, y, w, h) => {
            if (log) log.images.push({ x, y, w, h });
            count(prop);
          };
        }
        if (Object.prototype.hasOwnProperty.call(state, prop)) return state[prop];
        return () => {
          count(prop);
          return gradient;
        };
      },
      set(_t, prop, value) {
        state[prop] = value;
        return true;
      }
    }
  );
  return { canvas, handlers };
}

function createGame(options) {
  const opts = options || {};
  const width = 960;
  const height = 600;
  const ops = Object.create(null);
  const record = opts.record ? { texts: [], fills: [], rects: [], images: [] } : null;
  const { canvas, handlers } = createCanvasStub(width, height, ops, record);
  const winHandlers = Object.create(null);
  const clock = { now: 0, raf: null };
  const math = Object.create(Math);
  math.random = mulberry32(opts.seed === undefined ? 1337 : opts.seed);

  const win = {
    __DUSTLINE_TEST__: opts.testSeam !== false,
    addEventListener(type, fn) {
      winHandlers[type] = fn;
    }
  };
  if (opts.storage) win.localStorage = opts.storage;

  const sandbox = {
    document: {
      getElementById: () => canvas,
      createElement: (tag) => (tag === 'canvas' ? createCanvasStub(1, 1, null, record).canvas : { style: {} })
    },
    window: win,
    performance: { now: () => clock.now },
    requestAnimationFrame(fn) {
      clock.raf = fn;
    },
    console,
    Math: math,
    Object,
    Array,
    String,
    Number,
    Boolean,
    Error,
    JSON,
    Date,
    isNaN,
    parseFloat,
    parseInt
  };
  sandbox.globalThis = sandbox;
  if (opts.storage) sandbox.localStorage = opts.storage;


  vm.runInNewContext(fs.readFileSync(GAME, 'utf8'), sandbox, { filename: 'game.js' });

  function step(ms) {
    clock.now += ms === undefined ? 16.7 : ms;
    const fn = clock.raf;
    if (!fn) throw new Error('game stopped scheduling frames');
    clock.raf = null;
    for (const key of Object.keys(ops)) delete ops[key];
    if (record) for (const key of Object.keys(record)) record[key].length = 0;
    fn(clock.now);
  }

  return {
    api: win.Dustline,
    canvas,
    handlers,
    winHandlers,
    ops,
    texts: record ? record.texts : [],
    fills: record ? record.fills : [],
    rects: record ? record.rects : [],
    images: record ? record.images : [],
    step,
    steps(n, ms) {
      for (let i = 0; i < Math.max(0, n | 0); i++) step(ms);
    },
    key(name, down) {
      const e = { key: name, preventDefault() {} };
      const eventName = down === false ? 'key' + 'up' : 'keydown';
      winHandlers[eventName](e);
    },
    move(x, y) {
      handlers.mousemove({ clientX: x, clientY: y });
    },
    down(x, y, button) {
      handlers.mousedown({ clientX: x, clientY: y, button: button === undefined ? 0 : button });
    },
    up() {
      winHandlers.mouseup({});
    }
  };
}

module.exports = { createGame, GAME };

