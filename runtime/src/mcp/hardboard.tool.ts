import * as z from 'zod/v4';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  getHardboardEnvStatus,
  listHardboardDevices,
  runIdfBuild,
  runIdfFlash,
  runIdfSetTarget,
} from '../hardboard.js';
import { RUNTIME_DIRS } from '../paths.js';

export function registerHardboardTools(server: McpServer) {
  server.registerTool('hardboard.env_status', {
    description: '查看硬件 vibecoding 的 ESP-IDF、示例、项目、文档目录状态',
    inputSchema: {
      version: z.string().optional().describe('ESP-IDF 版本，默认 5.4'),
    },
  }, async ({ version }) => {
    return { content: [{ type: 'text', text: JSON.stringify(getHardboardEnvStatus(version), null, 2) }] };
  });

  server.registerTool('hardboard.devices_list', {
    description: '列出当前连接的串口设备，用于选择 ESP32/ESP32-S3 烧录端口',
  }, async () => {
    const devices = await listHardboardDevices();
    return { content: [{ type: 'text', text: devices.length ? JSON.stringify(devices, null, 2) : '(未发现串口设备)' }] };
  });

  server.registerTool('hardboard.idf_build', {
    description: '使用随包 ESP-IDF 编译一个 ESP-IDF 项目',
    inputSchema: {
      projectDir: z.string().optional().describe(`ESP-IDF 项目目录；默认 ${RUNTIME_DIRS.hardboardProjects}`),
      version: z.string().optional().describe('ESP-IDF 版本，默认 5.4'),
    },
  }, async ({ projectDir, version }) => {
    const result = await runIdfBuild(projectDir || RUNTIME_DIRS.hardboardProjects, version);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  });

  server.registerTool('hardboard.idf_set_target', {
    description: '在 ESP-IDF 工程中执行 idf.py set-target，标准新工程流程中应先设置芯片目标',
    inputSchema: {
      projectDir: z.string().optional().describe(`ESP-IDF 项目目录；默认 ${RUNTIME_DIRS.hardboardProjects}`),
      target: z.string().optional().describe('目标芯片，例如 esp32s3、esp32c3、esp32；默认 esp32s3'),
      version: z.string().optional().describe('ESP-IDF 版本，默认 5.4.3'),
    },
  }, async ({ projectDir, target, version }) => {
    const result = await runIdfSetTarget(projectDir || RUNTIME_DIRS.hardboardProjects, target || 'esp32s3', version);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  });

  server.registerTool('hardboard.idf_flash', {
    description: '使用随包 ESP-IDF 编译/烧录一个 ESP-IDF 项目到指定串口设备',
    inputSchema: {
      projectDir: z.string().optional().describe(`ESP-IDF 项目目录；默认 ${RUNTIME_DIRS.hardboardProjects}`),
      port: z.string().describe('串口端口，例如 COM3、COM8、/dev/ttyUSB0'),
      version: z.string().optional().describe('ESP-IDF 版本，默认 5.4'),
    },
  }, async ({ projectDir, port, version }) => {
    const result = await runIdfFlash(projectDir || RUNTIME_DIRS.hardboardProjects, port, version);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  });
}
