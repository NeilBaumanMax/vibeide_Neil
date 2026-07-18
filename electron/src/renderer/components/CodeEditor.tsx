import Editor, { loader, type BeforeMount } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';
import '../monaco';

loader.config({ monaco });

interface Props {
  filePath: string;
  value: string;
  fontSize: number;
  onChange: (value: string) => void;
}

const LANGUAGE_BY_EXTENSION: Record<string, string> = {
  c: 'cpp',
  h: 'cpp',
  cc: 'cpp',
  cpp: 'cpp',
  cxx: 'cpp',
  hh: 'cpp',
  hpp: 'cpp',
  hxx: 'cpp',
  s: 'cpp',
  asm: 'cpp',
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  jsx: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  json: 'json',
  jsonc: 'json',
  md: 'markdown',
  mdx: 'markdown',
  html: 'html',
  htm: 'html',
  css: 'css',
  less: 'less',
  scss: 'scss',
  py: 'python',
  sh: 'shell',
  bash: 'shell',
  yml: 'yaml',
  yaml: 'yaml',
  xml: 'xml',
  sql: 'sql',
  ini: 'ini',
  toml: 'ini',
};

function detectLanguage(filePath: string): string {
  const fileName = filePath.replace(/\\/g, '/').split('/').pop()?.toLowerCase() || '';
  if (fileName === 'cmakelists.txt' || fileName.endsWith('.cmake')) return 'cmake';
  if (fileName === 'makefile' || fileName.endsWith('.mk')) return 'shell';
  const extension = fileName.includes('.') ? fileName.split('.').pop() || '' : '';
  return LANGUAGE_BY_EXTENSION[extension] || 'plaintext';
}

const configureMonaco: BeforeMount = (instance) => {
  if (!instance.languages.getLanguages().some((language) => language.id === 'cmake')) {
    instance.languages.register({ id: 'cmake', extensions: ['.cmake'], filenames: ['CMakeLists.txt'] });
    instance.languages.setMonarchTokensProvider('cmake', {
      ignoreCase: true,
      keywords: [
        'add_executable', 'add_library', 'add_subdirectory', 'cmake_minimum_required',
        'configure_file', 'else', 'elseif', 'endforeach', 'endfunction', 'endif',
        'endmacro', 'endwhile', 'file', 'find_package', 'foreach', 'function',
        'if', 'include', 'install', 'list', 'macro', 'message', 'option', 'project',
        'set', 'string', 'target_compile_definitions', 'target_compile_options',
        'target_include_directories', 'target_link_libraries', 'while',
      ],
      tokenizer: {
        root: [
          [/#.*$/, 'comment'],
          [/\$\{[^}]+\}/, 'variable'],
          [/"([^"\\]|\\.)*"/, 'string'],
          [/'[^']*'/, 'string'],
          [/[a-zA-Z_][\w]*/, { cases: { '@keywords': 'keyword', '@default': 'identifier' } }],
          [/[()]/, '@brackets'],
          [/\d+(\.\d+)?/, 'number'],
        ],
      },
    });
  }

  instance.editor.defineTheme('vibeide-cpp-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '6A9955' },
      { token: 'keyword', foreground: '569CD6' },
      { token: 'keyword.control', foreground: 'C586C0' },
      { token: 'type', foreground: '4EC9B0' },
      { token: 'type.identifier', foreground: '4EC9B0' },
      { token: 'identifier', foreground: 'D4D4D4' },
      { token: 'string', foreground: 'CE9178' },
      { token: 'number', foreground: 'B5CEA8' },
      { token: 'variable', foreground: '9CDCFE' },
      { token: 'delimiter', foreground: 'D4D4D4' },
      { token: 'predefined', foreground: 'C586C0' },
    ],
    colors: {
      'editor.background': '#101522',
      'editor.foreground': '#D4D4D4',
      'editorLineNumber.foreground': '#6E7681',
      'editorLineNumber.activeForeground': '#E6EDF3',
      'editorCursor.foreground': '#FFD700',
      'editor.selectionBackground': '#264F78',
      'editor.inactiveSelectionBackground': '#20364D',
      'editor.lineHighlightBackground': '#172033',
      'editorIndentGuide.background1': '#2A3447',
      'editorIndentGuide.activeBackground1': '#536078',
      'editorBracketMatch.background': '#334155',
      'editorBracketMatch.border': '#FFD700',
    },
  });
};

export default function CodeEditor({ filePath, value, fontSize, onChange }: Props) {
  if (!filePath) {
    return <div className="editor-code-empty">从左侧文件资源管理器打开源码、CMake、Markdown 或 Skills 文档。</div>;
  }

  return (
    <div className="editor-code-host">
      <Editor
        path={filePath.replace(/\\/g, '/')}
        language={detectLanguage(filePath)}
        value={value}
        theme="vibeide-cpp-dark"
        beforeMount={configureMonaco}
        onChange={(nextValue) => onChange(nextValue ?? '')}
        loading={<div className="editor-code-loading">正在载入代码编辑器...</div>}
        saveViewState
        options={{
          automaticLayout: true,
          bracketPairColorization: { enabled: true },
          cursorBlinking: 'smooth',
          fontFamily: 'Consolas, "Noto Sans Mono", monospace',
          fontLigatures: false,
          fontSize,
          lineHeight: Math.round(fontSize * 1.6),
          minimap: { enabled: true, maxColumn: 100, renderCharacters: false },
          padding: { top: 10, bottom: 10 },
          renderWhitespace: 'selection',
          scrollBeyondLastLine: false,
          smoothScrolling: true,
          tabSize: 2,
          wordWrap: 'off',
        }}
      />
    </div>
  );
}
