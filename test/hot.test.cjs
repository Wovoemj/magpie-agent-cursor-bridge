const assert = require('node:assert/strict');
const test = require('node:test');
const { mkdir, mkdtemp, rename, rm, writeFile } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { setTimeout: delay } = require('node:timers/promises');
const { follow, selection, watchSelection } = require('../cursor-extension/follow.cjs');
const { routes } = require('../cursor-extension/route.cjs');

function fixture() {
  const events = [];
  const port = { state: undefined, route: '', owner: true, id: 'chat1', back: 'cursor-return',
    load: () => port.state, save: async value => { port.state = value; }, isOwner: async () => port.owner,
    chat: async () => port.id, returnModel: async () => port.back, routeId: () => port.route,
    point: async (group, model) => { events.push(['point', model]); return `group/${group}`; },
    switchTo: async model => { events.push(['native', model]); }, status: (kind, id) => events.push([kind, id]) };
  return { port, events, ctrl: follow(port) };
}

const payload = model => JSON.stringify({ enabled: true, model, catalog: [{ id: model }] });
const native = events => events.filter(row => row[0] === 'native').map(row => row[1]);
async function until(predicate) {
  const end = Date.now() + 3500;
  while (!predicate() && Date.now() < end) await delay(15);
  assert.ok(predicate());
}

test('rejects partial/unknown selections, accepts Magpie off and BOM', () => {
  for (const text of ['{', 'null', '[]', '{"enabled":true}', '{"model":"default"}', '{"enabled":true,"model":"p/x","catalog":[]}']) assert.throws(() => selection(text));
  assert.equal(selection('{}'), null); assert.equal(selection('{"enabled":false}'), null);
  assert.equal(selection('\uFEFF' + payload('p/a')), 'p/a');
});

test('A → B → off restores the specified non-Auto model only once even after reload', async () => {
  const { ctrl, port, events } = fixture();
  await ctrl.select(null); await ctrl.select('p/a'); await ctrl.select('p/b'); await ctrl.select('p/b', true);
  ctrl.dispose(); const next = follow(port); await next.select('p/b'); await next.select(null); await next.select(null, true);
  assert.deepEqual(native(events), ['p/a', 'p/b', 'cursor-return']); assert.equal(port.state, undefined);
});

test('stable model group retargets every change without re-selecting inside Cursor', async () => {
  const { ctrl, port, events } = fixture(); port.route = 'owned';
  await ctrl.select('p/a'); await ctrl.select('p/b'); await ctrl.select(null);
  assert.deepEqual(native(events), ['group/owned', 'cursor-return']);
  assert.deepEqual(events.filter(row => row[0] === 'point'), [['point', 'p/a'], ['point', 'p/b']]);
});

test('if A is superseded during setup, only B takes effect', async () => {
  const { ctrl, port, events } = fixture(); let done, entered;
  const inside = new Promise(resolve => { entered = resolve; });
  const gate = new Promise(resolve => { done = resolve; });
  port.returnModel = async () => { entered(); await gate; return 'native'; };
  const first = ctrl.select('p/a'); await inside; ctrl.select('p/b'); done(); await first;
  assert.deepEqual(native(events), ['p/b']);
});

test('no takeover without explicit return; off never edits another chat or window', async () => {
  const { ctrl, port, events } = fixture(); port.back = undefined; await ctrl.select('p/a');
  assert.deepEqual(native(events), []); port.back = 'native'; await ctrl.refresh();
  port.id = 'other'; await ctrl.select(null); assert.deepEqual(native(events), ['p/a']);
  port.owner = false; await ctrl.select('p/b'); assert.deepEqual(native(events), ['p/a']);
});

test('partial writes and atomic replacements never cause an intermediate restore; cleanup stops all callbacks', async context => {
  const temp = await mkdtemp(path.join(tmpdir(), 'cursor-follow-')); context.after(() => rm(temp, { recursive: true, force: true }));
  const dir = path.join(temp, 'missing'), file = path.join(dir, 'selection.json'), picks = [], errors = [];
  const watcher = watchSelection(file, pick => picks.push(pick), err => errors.push(err), { interval: 20, settle: 10, offGrace: 110 });
  context.after(() => watcher.dispose()); await until(() => picks.includes(null)); await mkdir(dir); await writeFile(file, payload('p/a')); await until(() => picks.includes('p/a'));
  await writeFile(file, '{'); await until(() => errors.length); await writeFile(file + '.tmp', payload('p/b')); await rename(file + '.tmp', file); await until(() => picks.includes('p/b'));
  assert.deepEqual(picks, [null, 'p/a', 'p/b']); await rm(file); await until(() => picks.length === 4); assert.equal(picks.at(-1), null);
  watcher.dispose(); await writeFile(file, payload('p/c')); await delay(140); assert.equal(picks.length, 4);
});

test('group ownership, conflicts, exact member and non-shell arguments', async () => {
  const id = 'cursor-hot-' + '1'.repeat(32), calls = []; let listing = '';
  const router = routes(async args => { calls.push(args); return args[0] === 'groups' ? listing : ''; }, () => id);
  assert.equal(await router.create('p/a'), id); assert.equal(await router.point(id, 'p/b'), `group/${id}`);
  assert.deepEqual(calls.at(-1), ['group', 'set', id, 'models=p/b', 'routing=order', 'stays=off']);
  listing = id; await assert.rejects(router.create('p/a'), /冲突/);
  const count = calls.length; for (const [group, model] of [['existing', 'p/a'], [id, `group/${id}`], [id, 'p/*'], [id, 'p/a,p/b']]) await assert.rejects(router.point(group, model));
  assert.equal(calls.length, count);
});
