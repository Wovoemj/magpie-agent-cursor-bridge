const { mkdir, readFile, rename, writeFile } = require('node:fs/promises');
const path = require('node:path');

function windowOwner(dir) {
  const file = path.join(dir, 'last-cursor-window');
  const self = String(process.pid);
  let queue = Promise.resolve();
  const read = async () => {
    try { return await readFile(file, 'utf8'); }
    catch (error) { if (error.code === 'ENOENT') return ''; throw error; }
  };
  const alive = id => {
    if (!/^[1-9]\d{0,9}$/.test(id)) return false;
    try { process.kill(Number(id), 0); return true; } catch (error) { return error.code === 'EPERM'; }
  };
  return {
    claim(focused) {
      queue = queue.catch(() => {}).then(async () => {
        await mkdir(dir, { recursive: true });
        const previous = await read();
        if (previous === self || (!focused && alive(previous))) return;
        if (!previous && !focused) {
          try { await writeFile(file, self, { flag: 'wx', mode: 0o600 }); } catch (error) { if (error.code !== 'EEXIST') throw error; }
          return;
        }
        const temp = `${file}.${self}.tmp`;
        await writeFile(temp, self, { mode: 0o600 });
        await rename(temp, file);
      });
      return queue;
    },
    async owns() { await queue; return await read() === self; }
  };
}

module.exports = { windowOwner };
