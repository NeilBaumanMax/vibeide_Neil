import fs from 'fs';
import path from 'path';
import { app, dialog } from 'electron';
import { logger } from './worker/logger';
import { getApiKeyPath, getResourcesDir, getRuntimeDir } from './paths';

/**
 * 首次启动检查 — 确保 App 所需环境就绪。
 *
 * 检查项：
 * 1. API Key 是否存在
 * 2. Playwright 浏览器是否存在
 * 3. 必要目录是否已创建
 */

export interface StartupStatus {
  apiKeyReady: boolean;
  playwrightReady: boolean;
  firstRun: boolean;
}

/** 执行启动检查，返回系统状态 */
export function checkStartupStatus(): StartupStatus {
  const apiKeyReady = checkApiKey();
  const playwrightReady = checkPlaywright();
  const firstRun = !apiKeyReady;

  if (firstRun) {
    logger.info('first-run:detected', { apiKeyReady, playwrightReady });
  }

  return { apiKeyReady, playwrightReady, firstRun };
}

/** 检查 API Key 是否存在，不存在则尝试从 resources 复制 */
function checkApiKey(): boolean {
  const keyPath = getApiKeyPath();
  try {
    if (fs.existsSync(keyPath)) {
      const content = fs.readFileSync(keyPath, 'utf-8').trim();
      if (content.includes('DEEPSEEK_API_KEY=') && !content.includes('sk-your-key-here')) {
        return true;
      }
    }
  } catch {
    // 继续尝试从 resources 复制
  }

  // 尝试从 resources/ 复制预置的 apikey.txt
  return tryCopyKeyFromResources(keyPath);
}

/** 从 resources/ 目录复制预置的 API Key */
function tryCopyKeyFromResources(destPath: string): boolean {
  try {
    const srcPath = getResourcesDir('apikey.txt');
    if (!fs.existsSync(srcPath)) return false;

    const content = fs.readFileSync(srcPath, 'utf-8').trim();
    if (!content.includes('DEEPSEEK_API_KEY=') || content.includes('sk-your-key-here')) return false;

    const dir = path.dirname(destPath);
    fs.mkdirSync(dir, { recursive: true });
    fs.copyFileSync(srcPath, destPath);
    logger.info('first-run:apikey-copied-from-resources', { src: srcPath, dest: destPath });
    return true;
  } catch (err) {
    logger.warn('first-run:apikey-copy-failed', { error: String(err) });
    return false;
  }
}

/** 检查 Playwright 浏览器是否存在 */
function checkPlaywright(): boolean {
  // Runtime 浏览器资源随 extraResources 放在 runtime/playwright。
  const pwDir = path.join(getRuntimeDir(), 'playwright');
  if (!fs.existsSync(pwDir)) return false;

  // 检查 chromium 核心是否存在
  const chromiumDir = path.join(pwDir, 'chromium-1223');
  return fs.existsSync(chromiumDir);
}

/** 显示 API Key 配置弹窗（通过 IPC 发到 renderer） */
export function getApiKeyPromptData(): Record<string, unknown> {
  return {
    type: 'first-run',
    message: '首次使用需要配置 DeepSeek API Key',
    detail: '请粘贴你的 DeepSeek API Key 以启用 AI 采集功能。\n\nKey 仅保存在本地，不会上传。',
    keyPath: getApiKeyPath(),
  };
}

/** 保存用户输入的 API Key */
export function saveApiKey(key: string): boolean {
  try {
    const keyPath = getApiKeyPath();
    const dir = path.dirname(keyPath);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(keyPath, `DEEPSEEK_API_KEY=${key.trim()}\n`, 'utf-8');
    logger.info('first-run:apikey-saved', { keyPath });
    return true;
  } catch (err) {
    logger.error('first-run:apikey-save-failed', { error: String(err) });
    return false;
  }
}
