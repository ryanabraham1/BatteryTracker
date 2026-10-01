import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { createRequire } from 'node:module';
const importDependency = createRequire(import.meta.url);
test('active issue views follow project archive, trash, and restoration', () => {
  const { activeWorkItems, filterIssues } = load('lib/work.ts');
  const row = (id, kind, data = {}, extra = {}) => ({ id, kind, title: id, data, archived: false, deleted_at: null, ...extra });
  const project = row('project', 'project');
  const issue = row('issue', 'issue', { project: project.id, assignee: 'me', status: 'Todo' });
  const unassigned = row('unassigned', 'issue');
  const archivedIssue = row('archived-issue', 'issue', {}, { archived: true });
  const deletedIssue = row('deleted-issue', 'issue', {}, { deleted_at: '2026-10-01' });
  const orphan = row('orphan', 'issue', { project: 'missing' });
  const others = [issue, unassigned, archivedIssue, deletedIssue, orphan];
  const ids = rows => Array.from(rows, i => i.id);
  for (const state of [{ archived: true }, { deleted_at: '2026-10-01' }]) {
    const items = [{ ...project, ...state }, ...others];
    assert.deepEqual(ids(filterIssues(items, {})), ['unassigned']);
    assert.deepEqual(ids(filterIssues(items, { project: project.id })), []);
    assert.deepEqual(ids(filterIssues(items, { assignee: 'me' })), []);
    assert.deepEqual(ids(activeWorkItems(items)), ['unassigned']);
  }
  assert.deepEqual(ids(filterIssues([project, ...others], {})), ['issue', 'unassigned']);
  assert.deepEqual(ids(filterIssues([project, ...others], { project: project.id })), ['issue']);
  assert.equal(issue.archived, false);
  assert.equal(issue.deleted_at, null);
});
function load(file, imports = {}, globals = {}) {
  const loadedModule = { exports: {} };
  const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  vm.runInNewContext(js, { module: loadedModule, exports: loadedModule.exports, require: name => imports[name] ?? importDependency(name), ...globals });
  return loadedModule.exports;
}
test('calendar dates retain their day in Los Angeles', () => {
  const previous = process.env.TZ;
  process.env.TZ = 'America/Los_Angeles';
  try {
    const { fmtDate } = load('lib/format.ts');
    assert.equal(fmtDate('2026-10-01'), 'Oct 1, 2026');
    assert.equal(fmtDate('2026-10-01T01:00:00Z'), 'Sep 30, 2026');
  } finally { process.env.TZ = previous; }
});
test('login return paths reject external URL forms', () => {
  const { safeReturnPath } = load('lib/navigation.ts');
  for (const value of ['//example.com', '/\\example.com', '/\n/example.com', 'https://example.com']) assert.equal(safeReturnPath(value), '/');
  assert.equal(safeReturnPath('/stock?q=hex'), '/stock?q=hex');
});
test('lengths reject zero and overflow while retaining shop notation', () => {
  const { parseLength } = load('lib/units.ts');
  for (const value of ["0'", '9'.repeat(320), '0.00001mm', '1/0']) assert.equal(parseLength(value, 'in'), null);
  assert.equal(parseLength('27 1/2', 'in'), 698.5);
  assert.equal(parseLength("2' 3\"", 'in'), 685.8);
  assert.equal(parseLength('70cm', 'in'), 700);
});
test('offline navigation never replaces a cached page with a login redirect', async () => {
  const listeners = {};
  const writes = [];
  let response = { ok: true, redirected: true, clone() { return this; } };
  vm.runInNewContext(fs.readFileSync('public/sw.js', 'utf8'), {
    self: { skipWaiting() {}, location: { origin: 'https://tools.test' }, addEventListener: (name, handler) => { listeners[name] = handler; } },
    URL, Response, setTimeout, clearTimeout,
    fetch: async () => response,
    caches: { open: async () => ({ put: (req, res) => writes.push(res), match: async () => null }) },
  });
  let installation;
  listeners.install({ waitUntil: p => { installation = p; } });
  await installation;
  assert.equal(writes.length, 0);
  const request = { method: 'GET', mode: 'navigate', url: 'https://tools.test/battery', headers: new Headers() };
  let result;
  listeners.fetch({ request, respondWith: p => { result = p; } });
  await result;
  assert.equal(writes.length, 0);
  response = { ...response, redirected: false };
  listeners.fetch({ request, respondWith: p => { result = p; } });
  await result;
  assert.equal(writes.length, 1);
});
test('replay retains changes enqueued while an action is in flight', async () => {
  let stored = JSON.stringify([{ id: 'old', name: 'addNote', batteryId: 'battery', fields: [], queuedAt: '' }]);
  const effects = [];
  let context;
  let release;
  const first = new Promise(resolve => { release = resolve; });
  const calls = [];
  const actions = { addNote: async () => { calls.push('sent'); if (calls.length === 1) await first; return { ok: true }; } };
  const react = {
    createContext: () => ({ Provider: 'provider' }),
    useCallback: cb => cb, useMemo: cb => cb(), useRef: value => ({ current: value }),
    useState: value => [value, () => {}], useEffect: cb => effects.push(cb),
  };
  const { OfflineProvider } = load('components/offline.tsx', {
    react, 'react/jsx-runtime': { jsx: (type, props) => { context = props.value; return null; } },
    'next/navigation': { useRouter: () => ({ refresh() {} }) },
    '@/lib/offline-actions': { ACTIONS: actions, fromFields: () => new FormData(), toFields: fd => [...fd.entries()] },
  }, { localStorage: { getItem: () => stored, setItem: (key, value) => { stored = value; } },
    navigator: { onLine: true }, crypto: { randomUUID: () => 'new' }, FormData, setTimeout, clearTimeout });
  OfflineProvider({ children: null });
  effects[1](); // online effect starts the pending replay
  const result = await context.run('addNote', 'battery', new FormData());
  assert.equal(result.queued, true);
  assert.equal(calls.length, 1); // new change must wait for the old change
  release();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls.length, 2);
  assert.equal(stored, '[]');
});
