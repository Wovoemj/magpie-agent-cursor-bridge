import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { modify, applyEdits } from 'jsonc-parser';
import { atomic, document } from './settings.js';

export const CHINESE_LANGUAGE_PACK = 'polang233.cursor-language-pack';
export const CHINESE_LANGUAGE_PACK_VERSION = '1.3.0';
const languagePackRoot = fileURLToPath(new URL('../vendor/cursor-language-pack/', import.meta.url));

export function defaultChineseLocale(argvFile) {
  const { text, data } = document(argvFile);
  if (Object.hasOwn(data, 'locale') && typeof data.locale === 'string' && data.locale.trim()) {
    return { changed: false, locale: data.locale, file: argvFile };
  }
  const updated = applyEdits(text, modify(text, ['locale'], 'zh-cn', {
    formattingOptions: { insertSpaces: true, tabSize: 2, eol: text.includes('\r\n') ? '\r\n' : '\n' },
  }));
  atomic(argvFile, updated);
  return { changed: true, locale: 'zh-cn', file: argvFile };
}

export function findCursorExecutable(exec) {
  const candidates = [process.env.CURSOR_BRIDGE_CURSOR_EXE];
  if (process.platform === 'win32') {
    const result = exec('powershell', ['-NoProfile', '-NonInteractive', '-Command',
      '(Get-Process -Name Cursor -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty Path)'], { optional: true });
    if (result.status === 0 && result.stdout?.trim()) candidates.push(result.stdout.trim());
    candidates.push(path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData/Local'), 'Programs/Cursor/Cursor.exe'));
  } else {
    candidates.push('/Applications/Cursor.app/Contents/MacOS/Cursor');
  }
  for (const executable of candidates) {
    if (executable && fs.existsSync(executable)) return executable;
  }
  throw new Error('找不到 Cursor，请先安装或打开 Cursor；也可以设置 CURSOR_BRIDGE_CURSOR_EXE 指定安装路径');
}

export function installChineseLanguagePack(executable, exec, { locale = 'zh-cn' } = {}) {
  if (!['zh-cn', 'zh-tw'].includes(locale)) throw new Error(`中文包不支持显示语言：${locale}`);
  const installRoot = process.platform === 'win32' ? path.dirname(executable) : path.resolve(path.dirname(executable), '..');
  const appRoot = path.join(installRoot, 'resources/app');
  const cli = path.join(languagePackRoot, 'bin/cli.mjs');
  for (const relative of ['package.json', 'config.json', 'bin/cli.mjs', 'scripts/translate-install.mjs', 'assets/language-pack.vsix']) {
    if (!fs.existsSync(path.join(languagePackRoot, relative))) throw new Error(`完整 Cursor 中文包缺少文件：${relative}，请重新安装桥接包`);
  }
  const manifest = JSON.parse(fs.readFileSync(path.join(languagePackRoot, 'package.json'), 'utf8'));
  const config = JSON.parse(fs.readFileSync(path.join(languagePackRoot, 'config.json'), 'utf8'));
  if (manifest.version !== CHINESE_LANGUAGE_PACK_VERSION || config.version !== CHINESE_LANGUAGE_PACK_VERSION) {
    throw new Error(`Cursor 中文包版本不符，期望 ${CHINESE_LANGUAGE_PACK_VERSION}`);
  }
  const product = JSON.parse(fs.readFileSync(path.join(appRoot, 'product.json'), 'utf8'));
  // Upstream only warns on a build it has not reconciled yet: the patcher still
  // rewrites every key it knows and leaves brand-new strings in English. Blocking
  // outright would strand anyone whose Cursor auto-updated past the pack, so the
  // mismatch is surfaced instead of thrown.
  const verified = config.target.verifiedCursorVersions.includes(product.version);
  if (!verified) {
    process.emitWarning(`Cursor ${product.version} 尚未在中文包 ${CHINESE_LANGUAGE_PACK_VERSION} 的验证清单内，新增文案可能仍显示英文`);
  }
  // Reuse the upstream installer: it patches only UI fields, journals original
  // files, installs and verifies its VSIX, then removes conflicting language packs.
  const result = exec(process.execPath, [cli, 'install', `--locale=${locale}`, `--dir=${installRoot}`], {
    env: { ...process.env }, timeout: 180000,
  });
  if (result?.status !== 0) throw new Error(`Cursor 完整中文包安装失败：${result?.stderr || result?.stdout || '安装器没有返回成功状态'}`);
  return {
    languagePack: CHINESE_LANGUAGE_PACK,
    version: CHINESE_LANGUAGE_PACK_VERSION,
    locale,
    cursorVersion: product.version,
    verified,
    stdout: result.stdout || ''
  };
}
