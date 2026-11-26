const { readFile } = require('node:fs/promises');
const { homedir } = require('node:os');
const path = require('node:path');

const validId = value => typeof value === 'string' && value.length > 0 && value.length <= 256 && !/[\s\x00-\x1f\x7f,]/u.test(value);

function listModels(items, selected) {
  const seen = new Set();
  const choices = [];
  for (const item of items) {
    if (!validId(item?.id) || seen.has(item.id)) continue;
    seen.add(item.id);
    const name = typeof item.name === 'string' ? item.name.replace(/[\x00-\x1f\x7f]/g, ' ').slice(0, 140) : '';
    choices.push({ label: item.id, description: item.id === selected ? 'Magpie 当前选择' : name });
  }
  const active = choices.findIndex(item => item.label === selected);
  if (active > 0) choices.unshift(...choices.splice(active, 1));
  if (!choices.length) throw new Error('Magpie 没有返回可添加的模型。');
  return choices;
}

async function models({ home = homedir(), request = fetch } = {}) {
  const file = path.join(home, '.config', 'magpie-cursor-native', 'selection.json');
  let selection;
  try { selection = JSON.parse(await readFile(file, 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw new Error('Magpie 模型选择文件无法读取；请在 Agents 中重新选一次模型。'); }
  if (selection?.enabled === true && Array.isArray(selection.catalog)) return listModels(selection.catalog, selection.model);
  const response = await request('http://127.0.0.1:3425/v1/models', { redirect: 'error', signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error('无法读取本机模型目录；请打开 Magpie，在 Agents → Cursor 原生模型（中文）选择模型。');
  const catalog = await response.json();
  if (!Array.isArray(catalog?.data)) throw new Error('本机网关未返回有效的模型列表。');
  return listModels(catalog.data.map(item => ({ id: item?.id, name: item?.magpie_label || item?.display_name || item?.name })), null);
}

module.exports = { listModels, models, validId };
