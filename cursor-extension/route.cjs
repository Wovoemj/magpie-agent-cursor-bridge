const { execFile } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const path = require('node:path');
const { promisify } = require('node:util');
const { validId } = require('./catalog.cjs');

const execute = promisify(execFile);
const owned = id => typeof id === 'string' && /^cursor-hot-[a-f0-9]{32}$/.test(id);

function magpieCli(configured) {
  const binary = configured || path.join(process.env.LOCALAPPDATA || '', 'Programs', 'magpie', 'magpie.com');
  if (!path.isAbsolute(binary) || !/^magpie(?:\.exe|\.com)?$/i.test(path.basename(binary))) throw Error('请指定已安装的 Magpie 可执行文件。');
  return async args => (await execute(binary, args, { windowsHide: true, cwd: path.dirname(binary), timeout: 12000, maxBuffer: 1024 * 1024 })).stdout;
}

function routes(cli, makeId = () => `cursor-hot-${randomUUID().replaceAll('-', '')}`) {
  const member = (id, model) => {
    if (!owned(id) || !validId(model) || !model.includes('/') || model.startsWith('-') || /[*?=]/.test(model) || model === `group/${id}`) throw Error('不是可用的单个 Magpie 模型。');
  };
  return {
    async create(model) {
      const id = makeId();
      member(id, model);
      if ((await cli(['groups'])).includes(id)) throw Error('专用模型组名称冲突，未修改。');
      await cli(['group', 'add', id, `models=${model}`, 'routing=order', 'stays=off']);
      return id;
    },
    async point(id, model) {
      member(id, model);
      await cli(['group', 'set', id, `models=${model}`, 'routing=order', 'stays=off']);
      return `group/${id}`;
    }
  };
}

module.exports = { magpieCli, owned, routes };
