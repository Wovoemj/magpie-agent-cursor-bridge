import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parse } from 'jsonc-parser';
import { defaultChineseLocale, installChineseLanguagePack, CHINESE_LANGUAGE_PACK, CHINESE_LANGUAGE_PACK_VERSION } from '../lib/locale.js';

function sandbox(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cursor-locale-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

test('Chinese is the default and JSONC comments and existing options survive', t => {
  const argv = path.join(sandbox(t), 'argv.json');
  fs.writeFileSync(argv, '{\r\n  // keep this comment\r\n  "disable-hardware-acceleration": true,\r\n}\r\n');
  const result = defaultChineseLocale(argv);
  const text = fs.readFileSync(argv, 'utf8');
  assert.equal(result.locale, 'zh-cn');
  assert.equal(parse(text)['disable-hardware-acceleration'], true);
  assert.ok(text.includes('// keep this comment'));
  assert.equal(parse(text).locale, 'zh-cn');
  assert.equal(defaultChineseLocale(argv).changed, false);
});

test('an explicit display language is retained', t => {
  const argv = path.join(sandbox(t), 'argv.json');
  const original = '{"locale":"ja","other":1}\n';
  fs.writeFileSync(argv, original);
  assert.equal(defaultChineseLocale(argv).changed, false);
  assert.equal(fs.readFileSync(argv, 'utf8'), original);
});

test('invalid JSONC fails before writing display language', t => {
  const argv = path.join(sandbox(t), 'argv.json');
  fs.writeFileSync(argv, '{broken');
  assert.throws(() => defaultChineseLocale(argv), /invalid settings JSONC/);
  assert.equal(fs.readFileSync(argv, 'utf8'), '{broken');
});

function cursorFixture(t, version = '3.29.15') {
  const root = path.join(sandbox(t), 'Cursor with spaces & symbols');
  const executable = path.join(root, process.platform === 'win32' ? 'Cursor.exe' : 'MacOS/Cursor');
  const product = path.join(root, 'resources/app/product.json');
  fs.mkdirSync(path.dirname(product), { recursive: true });
  fs.writeFileSync(product, JSON.stringify({ version }));
  return { root, executable };
}

test('the full Cursor pack uses the upstream installer with a verified editor build', t => {
  const { root, executable } = cursorFixture(t);
  let request;
  const result = installChineseLanguagePack(executable, (command, args, options) => {
    request = { command, args, options };
    return { status: 0, stdout: '语言扩展已安装并登记' };
  }, { locale: 'zh-tw' });
  assert.equal(request.command, process.execPath);
  assert.match(request.args[0], /vendor[\\/]cursor-language-pack[\\/]bin[\\/]cli\.mjs$/);
  assert.deepEqual(request.args.slice(1), ['install', '--locale=zh-tw', `--dir=${root}`]);
  assert.equal(result.languagePack, 'polang233.cursor-language-pack');
  assert.equal(result.version, CHINESE_LANGUAGE_PACK_VERSION);
  assert.equal(result.locale, 'zh-tw');
  assert.notEqual(CHINESE_LANGUAGE_PACK.toLowerCase(), 'ms-ceintl.vscode-language-pack-zh-hans');
});

test('an unverified Cursor build still installs, but is reported as unverified', t => {
  const { executable } = cursorFixture(t, '3.99.99');
  let calls = 0;
  const result = installChineseLanguagePack(executable, () => { calls++; return { status: 0, stdout: 'ok' }; });
  assert.equal(calls, 1);
  assert.equal(result.verified, false);
  assert.equal(result.cursorVersion, '3.99.99');
});

test('an incomplete upstream installation cannot be reported as successful Chinese setup', t => {
  const { executable } = cursorFixture(t);
  assert.throws(() => installChineseLanguagePack(executable, () => ({ status: 1, stderr: '语言扩展未登记' })), /完整中文包安装失败：语言扩展未登记/);
});
