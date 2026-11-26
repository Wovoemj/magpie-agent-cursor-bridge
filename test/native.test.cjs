const assert = require('node:assert/strict');
const { mkdtemp, mkdir, rm, writeFile } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { listModels, models } = require('../cursor-extension/catalog.cjs');
const { commands, switchNative } = require('../cursor-extension/extension.cjs');

async function fixture(context) {
  const home = await mkdtemp(path.join(tmpdir(), 'cursor-native-test-'));
  context.after(() => rm(home, { recursive: true, force: true }));
  const dir = path.join(home, '.config', 'magpie-cursor-native');
  await mkdir(dir, { recursive: true });
  return { home, file: path.join(dir, 'selection.json') };
}

test('the Magpie agent stores only display data and leaves credential handling to Cursor', async () => {
  const { agent, connect } = await import('../cursor-native.agent.js');
  assert.equal(agent.model, 'model');
  assert.equal(agent.config, '~/.config/magpie-cursor-native/selection.json');
  const value = connect({ gateway: new Proxy({}, { get() { throw Error('must not access credentials'); } }), models: [{ id: 'provider/a', name: 'A' }, { id: 'group/b' }] });
  assert.deepEqual(value, { enabled: true, catalog: [{ id: 'provider/a', name: 'A' }, { id: 'group/b', name: 'group/b' }] });
});

test('model IDs stay exact; duplicates, ambiguous multi-model syntax and line breaks are not selectable', () => {
  assert.deepEqual(listModels([{ id: 'one/x' }, { id: 'group/y' }, { id: 'one/x' }, { id: 'one/x,group/y' }, { id: 'two\nthree' }], 'group/y').map(item => item.label), ['group/y', 'one/x']);
  assert.throws(() => listModels([], null));
});

test('the chosen Magpie catalog works offline; invalid state is not silently replaced', async context => {
  const { home, file } = await fixture(context);
  const request = () => { throw Error('should not use network'); };
  await writeFile(file, JSON.stringify({ enabled: true, model: 'group/b', catalog: [{ id: 'provider/a' }, { id: 'group/b' }] }));
  assert.equal((await models({ home, request }))[0].label, 'group/b');
  await writeFile(file, '{broken');
  await assert.rejects(models({ home, request }), /无法读取/);
});

test('the read-only fallback enumerates only the loopback catalog, without credentials or redirects', async context => {
  const { home } = await fixture(context);
  const request = async (url, options) => {
    assert.equal(url, 'http://127.0.0.1:3425/v1/models');
    assert.equal(options.redirect, 'error');
    assert.equal(options.headers, undefined);
    return Response.json({ data: [{ id: 'demo/model', magpie_label: 'Model' }] });
  };
  assert.deepEqual(await models({ home, request }), [{ label: 'demo/model', description: 'Model' }]);
  await assert.rejects(models({ home, request: async () => new Response('', { status: 401 }) }), /无法读取/);
});

function editorDouble(available, cancel = false) {
  const activity = { calls: [], clipboard: [], messages: [] };
  const editor = {
    window: { showQuickPick: async choices => cancel ? undefined : choices[0], showInformationMessage: async value => activity.messages.push(value), showErrorMessage: async value => activity.messages.push(value) },
    env: { clipboard: { writeText: async text => activity.clipboard.push(text) } },
    commands: { getCommands: async () => available, executeCommand: async (...args) => activity.calls.push(args) }
  };
  return { activity, editor, actions: commands(editor, async () => [{ label: 'group/a' }], async () => 'group/cursor-hot-fixture') };
}

test('one-time setup copies the stable group ID and opens Cursor’s own Models settings', async () => {
  const { actions, activity } = editorDouble(['aiSettings.action.open']);
  await actions.configure();
  assert.deepEqual(activity.clipboard, ['group/cursor-hot-fixture']);
  assert.deepEqual(activity.calls, [['aiSettings.action.open', 'models']]);
});

test('switch selects the native composer model without submitting a prompt or writing a key', async () => {
  const { editor, activity } = editorDouble(['cursorai.action.switchToModelSlug']);
  await switchNative(editor, 'group/a');
  assert.deepEqual(activity.calls, [['cursorai.action.switchToModelSlug', { modelIdWithParams: JSON.stringify({ modelId: 'group/a', params: [] }) }]]);
  assert.equal(activity.clipboard.length, 0);
});

test('cancellation changes nothing; a missing Cursor action never claims a successful switch', async () => {
  const cancelled = editorDouble(['cursorai.action.switchToModel'], true);
  await cancelled.actions.configure();
  assert.deepEqual(cancelled.activity, { calls: [], clipboard: [], messages: [] });
  const fallback = editorDouble([]);
  await assert.rejects(switchNative(fallback.editor, 'group/a'), /不支持/);
  assert.equal(fallback.activity.calls.length, 0);
  assert.equal(fallback.activity.messages.length, 0);
});
