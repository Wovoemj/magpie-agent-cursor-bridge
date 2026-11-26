const { watchFile, unwatchFile } = require('node:fs');
const { readFile } = require('node:fs/promises');
const { validId } = require('./catalog.cjs');

function selection(text) {
  const value = JSON.parse(text.replace(/^\uFEFF/, ''));
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('模型选择文件格式不正确。');
  if (value.enabled === false || !Object.keys(value).length) return null;
  if (value.enabled !== true || !validId(value.model) || !Array.isArray(value.catalog) ||
      !value.catalog.some(item => item?.id === value.model)) throw Error('还没有读到完整、有效的 Magpie 模型选择。');
  return value.model;
}

function watchSelection(file, receive, report, { interval = 180, settle = 65, offGrace = 450 } = {}) {
  let timer, offTimer, revision = 0, disposed = false;
  const refresh = () => {
    if (disposed) return;
    const turn = ++revision;
    clearTimeout(timer);
    clearTimeout(offTimer);
    timer = setTimeout(async () => {
      let pick;
      try { pick = selection(await readFile(file, 'utf8')); }
      catch (error) {
        if (disposed || turn !== revision) return;
        if (error.code !== 'ENOENT' && error.code !== 'ENOTDIR') { report('Magpie 选择文件尚不可读，已保留当前模型。'); return; }
        pick = null;
      }
      if (disposed || turn !== revision) return;
      if (pick !== null) receive(pick);
      else offTimer = setTimeout(() => { if (!disposed && turn === revision) receive(null); }, offGrace);
    }, settle);
  };
  watchFile(file, { persistent: false, interval }, refresh);
  refresh();
  return { refresh, dispose() { disposed = true; clearTimeout(timer); clearTimeout(offTimer); unwatchFile(file, refresh); } };
}

function follow(port) {
  let desired, version = 0, handled = 0, running, disposed = false;
  const drain = async () => {
    while (!disposed && handled !== version) {
      const turn = version, pick = desired;
      handled = turn;
      const current = () => !disposed && turn === version;
      try {
        const journal = port.load();
        if (!journal && pick === null) { port.status('off'); continue; }
        if (pick !== null && !await port.isOwner()) continue;
        const chat = await port.chat();
        if (!current()) continue;
        if (!chat) { port.status('wait'); continue; }
        if (pick === null) {
          if (journal.chat === chat && await port.isOwner()) {
            if (!current()) continue;
            await port.switchTo(journal.back);
            await port.save(undefined);
            port.status('returned', journal.back);
          } else { await port.save(undefined); port.status('released'); }
          continue;
        }
        const route = port.routeId();
        if (journal?.chat === chat && journal.last === pick && journal.route === route && !journal.pending) { port.status('following', pick); continue; }
        const back = journal?.chat === chat ? journal.back : await port.returnModel();
        if (!current() || !validId(back)) continue;
        if (!await port.isOwner() || !current() || await port.chat() !== chat || !current()) continue;
        const next = { chat, back, last: pick, route };
        await port.save({ ...next, pending: true });
        if (!current()) { await port.save(journal); continue; }
        const target = route ? await port.point(route, pick) : pick;
        if (!current()) continue;
        if (!await port.isOwner() || await port.chat() !== chat || !current()) continue;
        if (!route || journal?.chat !== chat || journal?.route !== route || journal?.pending) await port.switchTo(target);
        await port.save(next);
        port.status('following', pick);
      } catch { port.status('error'); }
    }
  };
  const schedule = () => {
    if (!running) running = Promise.resolve().then(drain).finally(() => {
      running = undefined;
      if (!disposed && handled !== version) schedule();
    });
    return running;
  };
  return {
    select(pick, force = false) {
      if (disposed || (!force && pick === desired)) return running;
      desired = pick; version++; return schedule();
    },
    refresh() { if (desired !== undefined) return this.select(desired, true); },
    dispose() { disposed = true; version++; }
  };
}

module.exports = { follow, selection, watchSelection };
