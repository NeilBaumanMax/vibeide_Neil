import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerBrowserTools } from './browser.tool.js';
import { registerStorageTools } from './storage.tool.js';
import { registerHardboardTools } from './hardboard.tool.js';

export async function startMCPServer() {
  const server = new McpServer(
    { name: 'vibeide-runtime', version: '0.3.0' },
    {
      capabilities: { tools: {} },
      instructions: 'vibeide Runtime MCP Server — 提供浏览器自动化、存储和 ESP-IDF 硬件 vibecoding 能力。',
    }
  );

  registerBrowserTools(server);
  registerStorageTools(server);
  registerHardboardTools(server);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[vibeide] MCP Server 已启动 (stdio)');
}

// 直接运行时启动
if (process.argv[1]?.includes('server.')) {
  startMCPServer().catch((err) => {
    console.error('[vibeide] MCP Server 启动失败:', err);
    process.exit(1);
  });
}
