import { Tray, Menu, nativeImage } from 'electron';

let tray: Tray | null = null;

export function setupTray(): Tray {
  // 16x16 透明图标占位
  const icon = nativeImage.createEmpty();
  tray = new Tray(icon);

  const menu = Menu.buildFromTemplate([
    { label: '显示窗口', click: () => { /* TODO */ } },
    { type: 'separator' },
    { label: '退出', role: 'quit' },
  ]);

  tray.setToolTip('vibeide');
  tray.setContextMenu(menu);

  return tray;
}
