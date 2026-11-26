const assert = require('node:assert/strict');
const { execFile } = require('node:child_process');
const { createServer } = require('node:http');
const { mkdir, writeFile } = require('node:fs/promises');
const { homedir, tmpdir } = require('node:os');
const path = require('node:path');
const { setTimeout: delay } = require('node:timers/promises');
const { promisify } = require('node:util');
const editor = require('vscode');

async function waitFor(read, predicate, label) {
  const end = Date.now() + 12000;
  while (Date.now() < end) {
    const value = await read();
    if (predicate(value)) return value;
    await delay(100);
  }
  throw Error(`Timeout: ${label}`);
}

exports.run = async function () {
  const root = path.resolve(process.env.MAGPIE_CURSOR_SMOKE_ROOT || '');
  assert.ok(root.toLowerCase().startsWith(path.resolve(process.env.MAGPIE_CURSOR_TEST_TEMP || tmpdir()).toLowerCase() + path.sep));
  assert.equal(path.resolve(homedir()).toLowerCase(), path.join(root, 'home').toLowerCase());
  assert.equal(process.env.MAGPIE_NO_ACCOUNTS, '1');
  const binary = process.env.MAGPIE_CURSOR_SMOKE_CLI;
  const execute = promisify(execFile);
  const run = async (...args) => (await execute(binary, args, { windowsHide: true, timeout: 12000, maxBuffer: 1024 * 1024 })).stdout;
  const routeCheck = await run('data');
  assert.ok(routeCheck.toLowerCase().includes(path.join(root, 'home', '.config', 'magpie').toLowerCase()));
  const report = { direct: [], grouped: [], sameChat: true, nativeInferenceSent: false };
  const result = path.join(root, 'cursor-hot-result.json');
  const save = () => writeFile(result, JSON.stringify(report, null, 2));
  const upstreamModels = [];
  const server = createServer(async (request, response) => {
    response.setHeader('Content-Type', 'application/json');
    if (request.url === '/v1/models') return response.end(JSON.stringify({ object: 'list', data: ['alpha', 'beta'].map(id => ({ id, object: 'model', owned_by: 'fixture' })) }));
    if (request.url !== '/v1/chat/completions') { response.writeHead(404); return response.end('{}'); }
    let body = ''; for await (const chunk of request) body += chunk;
    const data = JSON.parse(body); upstreamModels.push(data.model);
    response.end(JSON.stringify({ id: 'local-fixture', object: 'chat.completion', created: 1, model: data.model, choices: [{ index: 0, message: { role: 'assistant', content: `fixture:${data.model}` }, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }));
  });
  let gateway;
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    await run('plugin', 'add', path.resolve(__dirname, '..'));
    await run('provider', 'add', 'hotfixture', `url=http://127.0.0.1:${server.address().port}/v1`, 'models=alpha,beta');
    await mkdir(path.join(root, 'gateway'), { recursive: true });
    const { spawn } = require('node:child_process');
    const { createServer: socket } = require('node:net');
    const reservation = socket(); await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve));
    const address = `127.0.0.1:${reservation.address().port}`;
    await new Promise(resolve => reservation.close(resolve));
    gateway = spawn(binary, ['serve'], { env: { ...process.env, MAGPIE_ADDR: address }, cwd: path.join(root, 'gateway'), windowsHide: true, stdio: 'ignore' });
    const url = `http://${address}/v1`;
    await waitFor(() => fetch(`${url}/models`, { redirect: 'error' }).then(res => res.json()).catch(() => undefined), value => value?.data?.some(item => item.id === 'hotfixture/alpha'), 'isolated gateway catalog');
    const extension = editor.extensions.getExtension('magpie-local.cursor-native-models');
    await waitFor(async () => extension.isActive, Boolean, 'extension startup activation');
    const config = editor.workspace.getConfiguration('magpieCursorNative');
    await config.update('returnModel', 'cursor-test-native', editor.ConfigurationTarget.Global);
    await config.update('magpieExecutable', binary, editor.ConfigurationTarget.Global);
    const native = (...args) => editor.commands.executeCommand(...args);
    await native('cursorai.action.switchToModelSlug', { modelIdWithParams: JSON.stringify({ modelId: 'cursor-test-native', params: [] }) });
    const state = () => native('workbench.action.devGetComposerDataForTesting');
    const chat = (await state()).composerId;
    const check = async id => {
      const current = await waitFor(state, data => data.modelName === id && data.selectedModels?.[0]?.modelId === id, `current chat ${id}`);
      assert.equal(current.composerId, chat);
      const surface = await native('workbench.action.devGetModelConfigForSurfaceForTesting', 'composer'); assert.equal(surface.modelName, id);
    };
    const agent = pick => run('cursor-desktop-native', pick);
    for (const [pick, expected] of [['hotfixture/alpha', 'hotfixture/alpha'], ['hotfixture/beta', 'hotfixture/beta'], ['default', 'cursor-test-native']]) {
      await agent(pick); await check(expected); report.direct.push(expected); await save();
    }
    const fixed = await extension.exports.prepareRoute('hotfixture/alpha');
    for (const member of ['alpha', 'beta']) {
      await agent(`hotfixture/${member}`); await check(fixed);
      await waitFor(() => run('group', fixed.slice(6)), text => text.includes(`1 hotfixture/${member}`), `group ${member}`);
      const res = await fetch(`${url}/chat/completions`, { method: 'POST', redirect: 'error', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: fixed, messages: [{ role: 'user', content: 'fixture' }], stream: false }) });
      assert.equal(res.status, 200, 'expected local fixture gateway response');
      assert.equal((await res.json()).choices?.[0]?.message?.content, `fixture:${member}`);
      assert.equal(upstreamModels.at(-1), member); report.grouped.push(member); await save();
    }
    await agent('default'); await check('cursor-test-native'); report.returned = true; report.complete = true;
  } catch (error) {
    report.error = error.message.split('\n')[0].slice(0,300); throw error;
  } finally {
    await save(); if (gateway) gateway.kill(); await new Promise(resolve => server.close(resolve));
  }
};
