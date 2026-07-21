import fs from 'fs';
import path from 'path';
import { logger } from './logger';
import { getResourcesDirFromWorker, getAgentDir, getAgentWorkspaceDir } from '../paths';

const PROJECT_ROOT = getResourcesDirFromWorker();
const AGENT_DIR = getAgentDir();
const AGENT_WORKSPACE_DIR = getAgentWorkspaceDir();

export interface TaskContext {
  prompt: string;
  skillsFound: string[];
}

export function buildAgentSystemPrompt(): string {
  const rules = readRules();
  return [
    '你是“奥德赛1.0.0-7201”内置的常驻编码 Agent，运行在 Electron App 旁边。',
    '',
    '核心目标：用户在左侧对话，右侧 BrowserView/Chrome 区域显示结果。你要像 CLI 交互版一样保持上下文，让用户看到你正在做什么。',
    `可写工作区：${AGENT_WORKSPACE_DIR}`,
    `只读资源区：${AGENT_DIR}`,
    '',
    '硬性规则：',
    '1. 展示关键过程：先用 1-3 行说明执行计划；每个阶段开始前输出一句短进度，说明正在写入哪个文件、调用哪个工具、为什么改动、下一步做什么；避免无意义重复刷屏。',
    '2. 用户说“不要打开 / 先不打开 / 只写代码”时，只创建或修改文件，禁止 browser.navigate，禁止截图验收。',
    '3. 用户说“打开 / 运行 / 看效果”时，才使用 browser.navigate 打开对应文件或页面。',
    '4. 所有浏览器操作必须走 MCP browser.* 工具，禁止用系统 Chrome、Playwright 脚本、curl/wget 替代。',
    '5. browser.* 报 Target closed 时，先重试 browser.getState 或 browser.navigate；不要立刻要求用户重开 Electron。',
    '6. 写 HTML/小游戏/代码时，默认保存到可写工作区；不要写到只读资源区。若用户要求打开，必须在 Electron BrowserView 内打开并截图自检。',
    '7. 生成游戏要有开始页、清晰角色/目标/操作提示、响应式尺寸，不能只有黑底小画布。',
    '8. 硬件 vibecoding 任务优先使用 hardboard.* MCP 工具；编译/烧录 ESP32/ESP32-S3 时先 hardboard.env_status，再 hardboard.devices_list，最后 hardboard.idf_build 或 hardboard.idf_flash。',
    '9. 长文件不要憋到最后一次性输出：先立刻创建最小可运行骨架文件，再用 Edit/MultiEdit 分阶段补 UI、逻辑、验收修复，让用户持续看到执行轨迹。',
    '10. 文件路径和结果说明要简短明确。',
    '',
    rules ? `项目附加规则：\n${rules}` : '',
  ].filter(Boolean).join('\n');
}

export function buildContext(task: string): TaskContext {
  const startTime = Date.now();
  const { content: skillsContent, files: skillsFound } = readSkills(task);

    logger.info('task:context', {
      task: task.slice(0, 200),
    skillsCount: skillsFound.length,
    skillsFound,
  });

  const platformRules = buildPlatformRules(task);
  const shouldNotOpen = /(不要打开|先不打开|不用打开|别打开|只写|先写)/i.test(task);
  const wantsOpen = /(打开|运行|看效果|预览|截图)/i.test(task) && !shouldNotOpen;

  const prompt = [
    `【当前任务】${task}`,
    `【默认保存目录】${AGENT_WORKSPACE_DIR}`,
    '',
    shouldNotOpen ? '【执行模式】只写文件/代码，不打开、不截图。' : '',
    wantsOpen ? '【执行模式】打开或运行当前目标，必要时截图确认。' : '',
    isHtmlGameTask(task)
      ? [
        '【HTML 游戏要求】',
        'A. 必须有可见角色/目标/开始页/操作提示；画面响应式铺开。',
        'B. 先创建最小可运行 HTML 骨架，再分阶段补游戏逻辑、样式、移动端控制和验收修复；不要长时间沉默后一次性 Write 完整大文件。',
        'C. 每次写入/修改前先用一句话说明当前阶段，例如“先创建骨架文件”“补充关卡逻辑”“打开截图验收”。',
        'D. 若打开后截图发现角色不可见或布局异常，直接修复再汇报。',
      ].join('\n')
      : '',
    platformRules,
    '',
    skillsContent ? `【建议技能】\n${skillsContent}` : '',
  ].filter(Boolean).join('\n');

  logger.debug('task:context', {
    totalPromptLength: prompt.length,
    buildTimeMs: Date.now() - startTime,
  });

  return { prompt, skillsFound };
}

function buildPlatformRules(task: string): string {
  if (/(b站|哔哩|bilibili)/i.test(task)) {
    return [
      '',
      '【平台硬约束】',
      'A. 本任务用户明确指定了 B 站，只允许使用 bilibili.com 相关页面',
      'B. 禁止改去 YouTube、Google、Bing、抖音、微博或其他网站找“替代结果”',
      'C. 如果当前页面已经离开 B 站，必须立刻导航回 B 站',
      'D. 如果 B 站当前无法完成，就直接报告 B 站受限，不得跨平台继续',
      'E. 优先使用 B 站站内搜索结果页、频道页、排序页；不要随意点击会打开独立播放页或作者空间的新路径',
    ].join('\n');
  }

  if (/(youtube|油管)/i.test(task)) {
    return [
      '',
      '【平台硬约束】',
      'A. 本任务用户明确指定了 YouTube，只允许使用 youtube.com 相关页面',
      'B. 禁止改去 B 站、Google、Bing 或其他网站找“替代结果”',
    ].join('\n');
  }

  if (/(淘宝|taobao|天猫|tmall)/i.test(task)) {
    return [
      '',
      '【平台硬约束】',
      'A. 本任务用户明确指定了淘宝/天猫，只允许使用 taobao.com / tmall.com 相关页面',
      'B. 禁止改去 1688、拼多多、京东、Google、Bing 或其他网站找“替代结果”',
    ].join('\n');
  }

  if (/(百度|baidu)/i.test(task)) {
    return [
      '',
      '【平台硬约束】',
      'A. 本任务用户明确指定了百度，只允许使用 baidu.com 相关页面',
      'B. 搜索任务必须先执行平台 URL 工具生成 URL：优先 node tools/build_platform_search_url.mjs baidu "<关键词>"；如果在 Linux/macOS 且 Node 工具不可用，再用 tools/build_platform_search_url.sh baidu "<关键词>"',
      'C. 禁止改去 Google、Bing、B站、YouTube 或其他网站找“替代结果”',
    ].join('\n');
  }

  return '';
}

function isHtmlGameTask(task: string): boolean {
  return /(html.*游戏|游戏.*html|小游戏|游戏|贪吃蛇|马里奥|坦克大战|推箱子|迷宫|走迷宫|galgame|视觉小说|platformer|sokoban|maze|game)/i.test(task);
}

function readRules(): string {
  const claudeMdPath = path.join(AGENT_DIR, 'CLAUDE.md');
  try {
    const rules = fs.readFileSync(claudeMdPath, 'utf-8');
    logger.debug('task:context', { claudeMdSize: rules.length });
    return rules;
  } catch (err) {
    logger.warn('task:context', { error: 'CLAUDE.md not found, using defaults' });
    return '';
  }
}

function readSkills(task: string): { content: string; files: string[] } {
  const skillsDir = path.join(AGENT_DIR, 'skills');
  try {
    const allFiles = fs.readdirSync(skillsDir).filter((f) => f.endsWith('.md')).sort();
    const files = selectSkillFiles(task, allFiles);
    const commands = files.map((file) => `/${file.replace(/\.md$/i, '').replace(/_/g, '-')}`);
    const content = commands.length
      ? `根据任务需要优先调用这些已部署的原生 Skill：${commands.join('、')}。调用前简短说明选择原因；若 Skill 工具不可用，再按项目规则完成任务。`
      : '';
    return { content, files };
  } catch {
    logger.warn('task:context', { error: 'Skills directory not found' });
    return { content: '', files: [] };
  }
}

function selectSkillFiles(task: string, allFiles: string[]): string[] {
  const selected = new Set<string>();
  const needsBrowserGuide = /(打开|搜索|网页|浏览器|导航|采集|提取|抽取|抖音|淘宝|1688|b站|哔哩|html|游戏|browser|navigate|extract|crawl|scrape)/i.test(task);
  const needsSearchWorkflow = /(搜索|查找|搜一下|搜一搜|整理结果|整理视频|列出|最火|最热|top|排行|search|find)/i.test(task);
  const needsRecordingWorkflow = /(录制|回放|重放|播放录制|工作流|流程复用|保存流程|开始录制|停止录制)/i.test(task);
  const needsReplayTooling = /(优化重放|优化回放|信息捕获|封装成脚本|封装.*流程|下次.*调用|复用.*任务|保存成工具|workflow|工作流|重放.*提取|回放.*提取)/i.test(task);
  const needsHardboard = /(esp32|esp-idf|espidf|idf\.py|硬件|开发板|串口|烧录|刷机|固件|flash|monitor|esp32s3|esp32-s3|esp32c3|esp32-c3|(?:编译|build).{0,12}(?:固件|开发板|esp|idf)|(?:固件|开发板|esp|idf).{0,12}(?:编译|build))/i.test(task);
  const add = (...files: string[]) => {
    for (const file of files) {
      if (allFiles.includes(file)) selected.add(file);
    }
  };

  if (needsBrowserGuide) {
    add('browser_guide.md');
  }

  if (needsSearchWorkflow) {
    add('search_workflow.md');
  }

  if (needsRecordingWorkflow) {
    add('recording_workflow.md');
  }

  if (needsReplayTooling) {
    add('recording_workflow.md', 'replay_workflow_tooling.md', 'data_extract.md');
  }

  if (needsHardboard) {
    add('espidf_hardboard.md');
  }

  if (isHtmlGameTask(task)) {
    add('html_game_generation.md');
    return [...selected];
  }

  if (/1688/i.test(task)) {
    add('1688_source_finding.md', 'data_extract.md');
  }

  if (/(b站|哔哩|bilibili)/i.test(task)) {
    add('bilibili_search_workflow.md');
  }

  if (/淘宝|taobao/i.test(task)) {
    add('taobao_listing.md', 'data_extract.md');
  }

  if (/抖音|douyin/i.test(task)) {
    add('douyin_product_rank.md', 'data_extract.md');
  }

  if (/采集|提取|抽取|解析|理解页面|page/i.test(task)) {
    add('data_extract.md', 'page_understanding.md');
  }

  return [...selected];
}
