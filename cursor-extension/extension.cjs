const { homedir } = require('node:os');
const path = require('node:path');
const { models, validId } = require('./catalog.cjs');
const { watchSelection, follow } = require('./follow.cjs');
const { windowOwner } = require('./window-owner.cjs');
const { magpieCli, owned, routes } = require('./route.cjs');

const settingsCommand = 'aiSettings.action.open';
const switchCommand = 'cursorai.action.switchToModelSlug';

async function switchNative(editor, model) {
  if (!validId(model) || !(await editor.commands.getCommands(true)).includes(switchCommand)) throw Error('Cursor 不支持切换当前聊天模型。');
  await editor.commands.executeCommand(switchCommand, { modelIdWithParams: JSON.stringify({ modelId: model, params: [] }) });
}

async function selectReturn(editor, config) {
  const choice = await editor.window.showQuickPick([
    { label: 'Cursor Auto', id: 'default' }, { label: '指定 Cursor 原生模型 ID…' }
  ], { title: '仅首次设置：关闭 Magpie 时，这个聊天要切回哪个 Cursor 模型？', placeHolder: '取消不会更改当前聊天；只保存模型 ID，不读聊天或密钥。' });
  if (!choice) return;
  const id = choice.id || (await editor.window.showInputBox({ title: '关闭时使用的 Cursor 原生模型 ID', validateInput: value => validId(value) ? undefined : '请输入单个有效的模型 ID。' }))?.trim();
  if (validId(id)) { await config.update('returnModel', id, editor.ConfigurationTarget.Global); return id; }
}

async function selectModel(editor, readModels, placeHolder) {
  let choices;
  try { choices = await readModels(); }
  catch { await editor.window.showErrorMessage('读不到 Magpie 模型目录。请启动 Magpie，并在 Agents → Cursor 原生模型（中文）选择模型。'); return; }
  const choice = await editor.window.showQuickPick(choices, { title: 'Magpie · Cursor 原生聊天模型', placeHolder, matchOnDescription: true });
  return choice?.label;
}

function commands(editor, readModels = models, createRoute) {
  const available = async command => (await editor.commands.getCommands(true)).includes(command);
  return {
    async configure() {
      const model = await selectModel(editor, readModels, '选择作为初始成员的 Magpie 模型；以后只在 Magpie 切换');
      if (!model) return;
      const id = await createRoute(model);
      if (!id) return;
      await editor.env.clipboard.writeText(id);
      let opened = false;
      if (await available(settingsCommand)) {
        try { await editor.commands.executeCommand(settingsCommand, 'models'); opened = true; } catch {}
      }
      const where = opened ? '已打开 Cursor 模型设置。' : '请手动打开 Cursor Settings → Models。';
      await editor.window.showInformationMessage(`${where}固定模型 ID 已复制：${id}。首次在 Add Custom Model 添加一次，配置可从 Cursor 后端访问的 Magpie HTTPS /v1 地址和专用密钥。以后只在 Magpie 换模型，不再改这里。`);
    }
  };
}

function activate(context) {
  const editor = require('vscode');
  const config = () => editor.workspace.getConfiguration('magpieCursorNative');
  const route = () => routes(magpieCli(config().get('magpieExecutable')));
  const routeId = () => { const id = context.globalState.get('ownedRoute'); return owned(id) ? id : ''; };
  const flag = editor.window.createStatusBarItem(editor.StatusBarAlignment.Right, 20);
  flag.command = 'magpieCursorNative.status';
  const notes = {
    off: '未接管，使用 Cursor 自己的设置。', following: '已向当前聊天应用 Magpie 的模型选择；这不是请求已经到达提供商的证明。',
    returned: '已切回首次设置指定的 Cursor 原生模型；不修改 BYOK 地址或密钥。', released: '已停止跟随；原聊天不在本窗口前台，没有改动其他聊天。',
    wait: '需要一个打开的原生聊天；多个并排聊天时暂停，避免改错。', setup: '请先指定关闭时切回的 Cursor 模型。', error: '未能完成切换，请检查 Magpie 专用模型组和 Cursor 版本，再运行「重新同步当前聊天模型」。'
  };
  let detail = notes.off, statusKind = 'off', prompted = false;
  const show = (kind, value) => {
    statusKind = kind; detail = notes[kind] || kind;
    flag.text = `$(plug) Magpie${value ? `: ${value}` : ''}`; flag.tooltip = detail;
    if (kind === 'off' || kind === 'returned' || kind === 'released') flag.hide(); else flag.show();
  };
  const owner = windowOwner(context.globalStorageUri.fsPath);
  void owner.claim(editor.window.state.focused).catch(() => show('error'));
  const controller = follow({
    load: () => context.workspaceState.get('hotSession'), save: journal => context.workspaceState.update('hotSession', journal),
    isOwner: () => owner.owns(), routeId, point: (id, model) => route().point(id, model),
    chat: async () => {
      const ids = await editor.commands.executeCommand('composer.getOrderedSelectedComposerIds');
      return Array.isArray(ids) && ids.length === 1 && typeof ids[0] === 'string' ? ids[0] : undefined;
    },
    async returnModel() {
      const saved = config().get('returnModel');
      if (validId(saved)) return saved;
      show('setup');
      if (!prompted) { prompted = true; return selectReturn(editor, config()); }
    },
    switchTo: model => switchNative(editor, model), status: show
  });
  const watcher = watchSelection(path.join(homedir(), '.config', 'magpie-cursor-native', 'selection.json'), pick => controller.select(pick), show);
  let setup;
  const prepareRoute = async model => {
    if (routeId()) return `group/${routeId()}`;
    const id = await route().create(model);
    await context.globalState.update('ownedRoute', id);
    await controller.refresh();
    return `group/${id}`;
  };
  const actions = commands(editor, models, async model => {
    if (routeId()) return `group/${routeId()}`;
    const agree = '创建专用模型组';
    if (await editor.window.showInformationMessage('在本机 Magpie 新建一个仅由此插件维护的模型组？它不会改动已有模型组、供应商、地址或密钥。', { modal: true }, agree) !== agree) return;
    return prepareRoute(model);
  });
  const retry = setInterval(() => { if (statusKind === 'wait') controller.refresh(); }, 1200);
  retry.unref();
  let focused = editor.window.state.focused;
  context.subscriptions.push(flag, watcher, controller, { dispose: () => clearInterval(retry) },
    editor.window.onDidChangeWindowState(state => {
      const gained = state.focused && !focused;
      focused = state.focused;
      if (gained) void owner.claim(true).then(() => controller.refresh()).catch(() => show('error'));
    }),
    editor.commands.registerCommand('magpieCursorNative.configure', () => setup ??= actions.configure().catch(() => show('error')).finally(() => { setup = undefined; })),
    editor.commands.registerCommand('magpieCursorNative.returnModel', async () => { if (await selectReturn(editor, config())) await controller.refresh(); }),
    editor.commands.registerCommand('magpieCursorNative.status', () => editor.window.showInformationMessage(detail)),
    editor.commands.registerCommand('magpieCursorNative.switch', () => { watcher.refresh(); return controller.refresh(); })
  );
  if (context.extensionMode === editor.ExtensionMode.Test) return { prepareRoute };
}

module.exports = { activate, commands, switchNative };
