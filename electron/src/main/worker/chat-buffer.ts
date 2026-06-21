export interface ParsedChunk {
  type: 'text' | 'thinking' | 'tool_call' | 'tool_result' | 'system' | 'error' | 'init' | 'result';
  content: string;
  toolId?: string;
  toolName?: string;
  toolInput?: unknown;
  mcpServers?: Array<{ name: string; status: string }>;
  isError?: boolean;
}

export class ChatBuffer {
  private buffer = '';

  feed(chunk: string): ParsedChunk[] {
    this.buffer += chunk;
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() || '';

    const results: ParsedChunk[] = [];
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const parsed = this.parseLine(trimmed);
      results.push(...parsed);
    }
    return results;
  }

  flush(): ParsedChunk[] {
    if (!this.buffer.trim()) return [];
    const result: ParsedChunk = { type: 'text', content: this.buffer.trim() };
    this.buffer = '';
    return [result];
  }

  private parseLine(line: string): ParsedChunk[] {
    try {
      const msg = JSON.parse(line);

      if (msg.type === 'assistant' && msg.message?.content) {
        const chunks: ParsedChunk[] = [];
        for (const block of msg.message.content) {
          if (block.type === 'text' && block.text) {
            chunks.push({ type: 'text', content: block.text });
          }
          if (block.type === 'tool_use') {
            chunks.push({
              type: 'tool_call',
              content: formatToolCall(block.name, block.input),
              toolId: block.id,
              toolName: block.name,
              toolInput: block.input,
            });
          }
          if (block.type === 'thinking' && block.thinking) {
            chunks.push({ type: 'thinking', content: block.thinking });
          }
        }
        return chunks;
      }

      if (msg.type === 'user' && msg.message?.content) {
        const chunks: ParsedChunk[] = [];
        for (const block of msg.message.content) {
          if (block.type === 'tool_result') {
            chunks.push({
              type: 'tool_result',
              content: formatToolResult(block.content),
              toolId: block.tool_use_id,
              isError: !!block.is_error,
            });
          }
        }
        return chunks;
      }

      if (msg.type === 'system') {
        if (msg.subtype === 'init') {
          return [{
            type: 'init',
            content: JSON.stringify(msg),
            mcpServers: Array.isArray(msg.mcp_servers) ? msg.mcp_servers : [],
          }];
        }
        if (msg.subtype === 'thinking_tokens') {
          return [];
        }
        const text = typeof msg.message === 'string' ? msg.message : JSON.stringify(msg);
        return [{ type: 'system', content: text }];
      }

      if (msg.type === 'result') {
        if (msg.is_error) {
          return [{
            type: 'result',
            content: msg.result || `任务失败${msg.api_error_status ? ` (status: ${msg.api_error_status})` : ''}`,
            isError: true,
          }];
        }
        return [{ type: 'result', content: msg.result || msg.subtype || 'completed', isError: false }];
      }

      return [];
    } catch {
      return [];
    }
  }
}

function formatToolCall(name: string, input: unknown): string {
  const data = isRecord(input) ? input : {};
  if (name === 'Bash' || name === 'Shell' || name === 'RunCommand') {
    const command = stringValue(data.command ?? data.cmd) || '(empty command)';
    return `• Ran ${command}`;
  }
  if (name === 'Write') {
    const file = stringValue(data.file_path ?? data.path) || '(unknown file)';
    return `• Created ${file}`;
  }
  if (name === 'Edit' || name === 'MultiEdit') {
    const file = stringValue(data.file_path ?? data.path) || '(unknown file)';
    return `• Edited ${file}`;
  }
  if (name === 'Read') {
    const file = stringValue(data.file_path ?? data.path) || '(unknown file)';
    return `• Read ${file}`;
  }
  if (name === 'TaskCreate' || name === 'TaskUpdate') {
    const title = stringValue(data.title ?? data.task ?? data.description) || name;
    return `• ${name}: ${title}`;
  }
  if (name.includes('browser_navigate') || name === 'browser.navigate') {
    const url = stringValue(data.url) || '(unknown url)';
    return `• Browser navigate ${url}`;
  }
  if (name.includes('browser_screenshot') || name === 'browser.screenshot') {
    return '• Browser screenshot';
  }
  return `• Tool ${name}${Object.keys(data).length ? ` ${compactJson(data)}` : ''}`;
}

function formatToolResult(content: unknown): string {
  const text = normalizeToolContent(content);
  if (!text) return '  └ (no output)';
  const lines = text.split('\n').map((line) => line.trimEnd()).filter(Boolean);
  const clipped = lines.slice(0, 12);
  const suffix = lines.length > clipped.length ? `\n  └ … +${lines.length - clipped.length} lines` : '';
  return `  └ ${clipped.join('\n    ')}${suffix}`;
}

function normalizeToolContent(content: unknown): string {
  if (typeof content === 'string') return content.trim();
  if (Array.isArray(content)) {
    return content.map((item) => {
      if (typeof item === 'string') return item;
      if (isRecord(item) && typeof item.text === 'string') return item.text;
      if (isRecord(item) && item.type === 'image') return '[image output]';
      return compactJson(item);
    }).join('\n').trim();
  }
  if (content == null) return '';
  return compactJson(content);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function compactJson(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
