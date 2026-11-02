#!/usr/bin/env node
// 產生 App 圖示：icon-192.png、icon-512.png、apple-touch-icon.png
//
//   有 logo：node make-icons.mjs --logo ./logo.png --bg "#ffffff" --out ../my-site/public
//   沒 logo：node make-icons.mjs --text 甫 --bg "#c0392b" --fg "#ffffff" --out ../my-site/public
//
// logo 可以是 png / jpg / svg / webp，不是正方形也沒關係，會置中留邊。
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

function arg(name, fallback) {
  const i = process.argv.indexOf('--' + name);
  return i > -1 ? process.argv[i + 1] : fallback;
}

const logo = arg('logo');
const text = arg('text');
const bg = arg('bg', '#ffffff');
const fg = arg('fg', '#222222');
const out = arg('out');

if ((!logo && !text) || !out) {
  console.error('用法：node make-icons.mjs (--logo 檔案 | --text 文字) --out 輸出資料夾 [--bg 底色] [--fg 字色]');
  process.exit(2);
}

const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.webp': 'image/webp' };
let content;
if (logo) {
  const mime = MIME[path.extname(logo).toLowerCase()];
  if (!mime) { console.error('不支援的圖片格式：' + logo); process.exit(2); }
  const data = fs.readFileSync(logo).toString('base64');
  content = `<img src="data:${mime};base64,${data}" style="width:100%;height:100%;object-fit:contain">`;
} else {
  content = `<div style="font:700 62vmin system-ui,'Microsoft JhengHei','PingFang TC',sans-serif;color:${fg};line-height:1">${text}</div>`;
}

const page_html = size => `<!doctype html><body style="margin:0;width:${size}px;height:${size}px;background:${bg};
  display:flex;align-items:center;justify-content:center;box-sizing:border-box;padding:${Math.round(size * 0.12)}px">${content}</body>`;

fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
try {
  for (const [file, size] of [['icon-192.png', 192], ['icon-512.png', 512], ['apple-touch-icon.png', 180]]) {
    const page = await browser.newPage({ viewport: { width: size, height: size } });
    await page.setContent(page_html(size), { waitUntil: 'load' });
    await page.screenshot({ path: path.join(out, file) });
    await page.close();
    console.log('已產生 ' + path.join(out, file));
  }
} finally {
  await browser.close();
}
