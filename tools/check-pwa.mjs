#!/usr/bin/env node
// 驗收：用真的瀏覽器打開網址，確認這個網站裝得起來、斷網開得了。
//   用法：node check-pwa.mjs https://你的網址/
// 任何一項沒過就結束碼非 0，不要回報成功。
import { chromium } from 'playwright';

const target = process.argv[2];
if (!target) {
  console.error('用法：node check-pwa.mjs <網址>');
  process.exit(2);
}

const rows = [];
const pass = (name, detail = '') => rows.push({ ok: true, name, detail });
const fail = (name, detail = '') => rows.push({ ok: false, name, detail });
const warn = (name, detail = '') => rows.push({ ok: null, name, detail });

const url = new URL(target);
const isLocal = ['localhost', '127.0.0.1'].includes(url.hostname);
if (url.protocol === 'https:' || isLocal) pass('HTTPS', url.protocol);
else fail('HTTPS', '瀏覽器只允許 HTTPS 網站安裝成 App');

// 一定要 channel: 'chromium'。預設的精簡版無頭瀏覽器不做安裝判定，什麼網站都回「沒問題」
const browser = await chromium.launch({ channel: 'chromium' });
try {
  const context = await browser.newContext();
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', err => pageErrors.push(err.message));

  // 網站可能在檢查途中自己重新載入（例如換新版），等它載完再問一次
  const stableEval = async fn => {
    for (let i = 0; ; i++) {
      try {
        return await page.evaluate(fn);
      } catch (err) {
        if (i >= 3 || !/context was destroyed|navigation/i.test(err.message)) throw err;
        await page.waitForLoadState('load').catch(() => {});
      }
    }
  };

  const first = await page.goto(target, { waitUntil: 'load', timeout: 30000 });
  if (!first || !first.ok()) fail('網站打得開', 'HTTP ' + (first && first.status()));
  else pass('網站打得開', 'HTTP ' + first.status());

  const htmlCache = first ? first.headers()['cache-control'] || '' : '';
  const maxAge = Number((htmlCache.match(/max-age=(\d+)/) || [])[1] || 0);
  if (maxAge > 3600) warn('網頁快取時間', `${htmlCache}：更新後使用者可能要等 ${Math.round(maxAge / 3600)} 小時`);

  const manifestHref = await stableEval(() => {
    const l = document.querySelector('link[rel="manifest"]');
    return l ? l.href : null;
  });
  if (!manifestHref) {
    fail('manifest', '<head> 裡找不到 <link rel="manifest">');
  } else {
    const res = await context.request.get(manifestHref);
    let m = null;
    try { m = await res.json(); } catch {}
    if (!res.ok() || !m) {
      fail('manifest', `${manifestHref} 讀不到或不是 JSON`);
    } else {
      pass('manifest', m.name || m.short_name || '(沒有名稱)');
      if (/^我的網站$/.test(m.name || '')) fail('App 名稱', '還是範本的「我的網站」');
      for (const size of ['192x192', '512x512']) {
        const icon = (m.icons || []).find(i => (i.sizes || '').split(' ').includes(size));
        if (!icon) { fail('圖示 ' + size, 'manifest 沒有這個尺寸'); continue; }
        const iconRes = await context.request.get(new URL(icon.src, manifestHref).href);
        if (iconRes.ok()) pass('圖示 ' + size, icon.src);
        else fail('圖示 ' + size, `${icon.src} 回應 ${iconRes.status()}`);
      }
    }
  }

  await stableEval(() => Promise.race([
    navigator.serviceWorker ? navigator.serviceWorker.ready : Promise.resolve(),
    new Promise(r => setTimeout(r, 8000)),
  ]));

  // 重新載入幾次讓 Service Worker 接管；接管當下載入被中斷是正常的
  let controller = false;
  for (let i = 0; i < 3 && !controller; i++) {
    try { await page.reload({ waitUntil: 'load', timeout: 30000 }); }
    catch { await page.goto(target, { waitUntil: 'load', timeout: 30000 }).catch(() => {}); }
    await page.waitForTimeout(700);
    controller = await page.evaluate(() =>
      !!(navigator.serviceWorker && navigator.serviceWorker.controller)).catch(() => false);
  }
  if (controller) pass('Service Worker 接管');
  else fail('Service Worker 接管', 'sw.js 沒註冊成功，看瀏覽器主控台或 sw.js 的路徑');

  const cdp = await context.newCDPSession(page);
  await cdp.send('Page.enable');
  const { installabilityErrors } = await cdp.send('Page.getInstallabilityErrors');
  // 自動化瀏覽器一律算無痕，這條跟網站無關
  const errors = installabilityErrors.filter(e => e.errorId !== 'in-incognito');
  if (errors.length === 0) pass('瀏覽器判定可安裝');
  else fail('瀏覽器判定可安裝', errors.map(e => e.errorId).join('、'));

  await page.waitForTimeout(500);
  await context.setOffline(true);
  try {
    await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 15000 });
    const text = (await stableEval(() => document.body.innerText)).trim();
    if (text) pass('斷網打得開', `畫面有 ${text.length} 個字`);
    else warn('斷網打得開', '頁面空白，這個網站的內容可能要連線才載入得到');
  } catch (err) {
    fail('斷網打得開', err.message.split('\n')[0]);
  }
  await context.setOffline(false);

  if (pageErrors.length === 0) pass('頁面沒有 JS 錯誤');
  else fail('頁面沒有 JS 錯誤', pageErrors.join(' | '));
} catch (err) {
  fail('檢查中斷', err.message.split('\n')[0]);
} finally {
  await browser.close();
}

console.log('\n檢查結果：' + target);
for (const r of rows) {
  const mark = r.ok === true ? '通過' : r.ok === false ? '失敗' : '注意';
  console.log(`  [${mark}] ${r.name}${r.detail ? '：' + r.detail : ''}`);
}
const failed = rows.filter(r => r.ok === false).length;
console.log(failed ? `\n有 ${failed} 項沒過。` : '\n全部通過。');
process.exit(failed ? 1 : 0);
