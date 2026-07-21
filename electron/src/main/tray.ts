import { Tray, Menu, nativeImage } from 'electron';
import path from 'path';
import { getResourcesDir } from './paths';

let tray: Tray | null = null;

export function setupTray(): Tray {
  const source = nativeImage.createFromPath(path.join(getResourcesDir(), 'electron', 'assets', 'icon.png'));
  const icon = source.isEmpty() ? nativeImage.createEmpty() : source.resize({ width: 16, height: 16, quality: 'best' });
  tray = new Tray(icon);

  const menu = Menu.buildFromTemplate([
    { label: '显示窗口', click: () => { /* TODO */ } },
    { type: 'separator' },
    { label: '退出', role: 'quit' },
  ]);

  tray.setToolTip('Catnip Forge · Catnip 硬件智能开发平台');
  tray.setContextMenu(menu);

  return tray;
}
