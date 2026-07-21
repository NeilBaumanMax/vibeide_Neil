import { readDeepSeekApiKey } from './agent';
import { logger } from './worker/logger';

export interface SoftwareAssistantMessage {
  role: 'user' | 'assistant';
  content: string;
}

const ENDPOINT = 'https://api.deepseek.com/chat/completions';
const MODEL = 'deepseek-v4-flash';
const MAX_MESSAGES = 12;
const MAX_MESSAGE_CHARS = 2000;

const SYSTEM_PROMPT = `你是 Catnip Forge 内置的软件使用助手“猫薄荷”。只回答用户如何使用 Catnip Forge（Catnip 硬件智能开发平台）的问题。

产品界面与操作事实：
- 左侧是 Agent 对话区，支持历史对话、新建、重命名、置顶、删除，以及从输入框的 Skills 按钮选择技能。
- 右侧包含仓库、监视器、任务管理器和编辑器。仓库页用于管理 Skills、硬件工程和参考代码。
- 硬件工具支持工程刷新、编译、设备刷新、烧录、串口监视与串口收发。
- 首次启动需要配置 DeepSeek API Key；Key 只保存在当前解压目录 resources/apikey.txt，保存后软件会自动重启。
- 深色/浅色主题位于当前助手面板顶部。
- 这是软件操作帮助通道，不执行编译、烧录、删除文件或修改工程；需要实际执行时，引导用户到左侧 Agent 对话区。

回答要求：使用简体中文，先给直接操作步骤；尽量控制在 6 句话以内。可以使用简短 Markdown。若现有信息不足，明确说“不确定”，不要编造菜单或按钮。不要索要、复述或展示 API Key。`;

interface DeepSeekResponse {
  choices?: Array<{ message?: { content?: string } }>;
  error?: { message?: string };
}

function normalizeMessages(messages: SoftwareAssistantMessage[]): SoftwareAssistantMessage[] {
  return messages
    .slice(-MAX_MESSAGES)
    .filter((message) => message.role === 'user' || message.role === 'assistant')
    .map((message) => ({ role: message.role, content: String(message.content ?? '').trim().slice(0, MAX_MESSAGE_CHARS) }))
    .filter((message) => message.content.length > 0);
}

export async function askSoftwareAssistant(messages: SoftwareAssistantMessage[]): Promise<{ ok: true; text: string }> {
  const apiKey = readDeepSeekApiKey();
  if (!apiKey) throw new Error('尚未配置 DeepSeek API Key');

  const normalized = normalizeMessages(messages);
  if (!normalized.length || normalized[normalized.length - 1].role !== 'user') {
    throw new Error('请输入软件使用问题');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000);
  logger.info('software-assistant:request', { messages: normalized.length, model: MODEL });

  try {
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...normalized],
        thinking: { type: 'disabled' },
        max_tokens: 700,
        stream: false,
      }),
      signal: controller.signal,
    });

    const data = await response.json() as DeepSeekResponse;
    if (!response.ok) {
      throw new Error(data.error?.message || `DeepSeek 请求失败（HTTP ${response.status}）`);
    }
    const text = data.choices?.[0]?.message?.content?.trim();
    if (!text) throw new Error('DeepSeek 没有返回可显示的回答');
    logger.info('software-assistant:response', { chars: text.length, model: MODEL });
    return { ok: true, text };
  } catch (error) {
    const message = error instanceof Error && error.name === 'AbortError'
      ? '请求超时，请检查网络后重试'
      : error instanceof Error ? error.message : String(error);
    logger.warn('software-assistant:error', { message });
    throw new Error(message);
  } finally {
    clearTimeout(timeout);
  }
}
