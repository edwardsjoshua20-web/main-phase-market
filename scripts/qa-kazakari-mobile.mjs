import fs from 'node:fs';
import path from 'node:path';

const args = Object.fromEntries(process.argv.slice(2).map((entry) => {
  const [key, ...rest] = entry.replace(/^--/, '').split('=');
  return [key, rest.join('=') || true];
}));

const cdpOrigin = String(args.cdp || 'http://127.0.0.1:9337').replace(/\/$/, '');
const pageUrl = String(args.url || 'http://127.0.0.1:4176/private/kazakari');
const label = String(args.label || 'mobile');
const widths = String(args.widths || '384').split(',').map(Number).filter(Number.isFinite);
const outputRoot = path.resolve(String(args.output || '.runtime/kazakari-phase6e'));
fs.mkdirSync(outputRoot, { recursive: true });

const targets = await fetch(`${cdpOrigin}/json`).then((response) => response.json());
const target = targets.find((item) => item.type === 'page');
if (!target?.webSocketDebuggerUrl) throw new Error('No Chromium page target is available.');

const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});

let sequence = 0;
const pending = new Map();
socket.addEventListener('message', (event) => {
  const message = JSON.parse(String(event.data));
  if (!message.id || !pending.has(message.id)) return;
  const { resolve, reject } = pending.get(message.id);
  pending.delete(message.id);
  if (message.error) reject(new Error(message.error.message));
  else resolve(message.result || {});
});

function command(method, params = {}) {
  const id = ++sequence;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

async function evaluate(expression) {
  const result = await command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || 'Browser evaluation failed.');
  return result.result?.value;
}

await command('Page.enable');
await command('Runtime.enable');
const reports = [];
let interactions = null;

for (const width of widths) {
  await command('Emulation.setDeviceMetricsOverride', {
    width,
    height: 850,
    deviceScaleFactor: 3,
    mobile: true,
    screenWidth: width,
    screenHeight: 850,
  });
  await command('Emulation.setPageScaleFactor', { pageScaleFactor: 1 });
  await command('Page.navigate', { url: pageUrl });
  await new Promise((resolve) => setTimeout(resolve, 1600));
  await evaluate(`new Promise((resolve, reject) => {
    const deadline = Date.now() + 8000;
    const check = () => document.querySelector('.kz-product') ? resolve(true) : Date.now() > deadline ? reject(new Error('Products did not render')) : setTimeout(check, 100);
    check();
  })`);

  const measurements = await evaluate(`(() => {
    const first = document.querySelector('.kz-product');
    const second = document.querySelectorAll('.kz-product')[1];
    const imageWrap = first.querySelector('.kz-image-wrap');
    const image = first.querySelector('.kz-product-image');
    const overlay = first.querySelector('.kz-discount-overlay');
    const name = first.querySelector('h3');
    const price = first.querySelector('.kz-price-main strong');
    const original = document.querySelector('.kz-price-main del');
    const retailer = first.querySelector('.kz-retailer');
    const search = document.querySelector('.kz-search input');
    const nav = document.querySelector('.kz-tabs button');
    const filterToggle = document.querySelector('.kz-filter-toggle');
    const inlineFilters = document.querySelector('.kz-filters');
    const watch = first.querySelector('.kz-watch-icon');
    const rect = (node) => node ? Object.fromEntries(['x','y','width','height','top','right','bottom','left'].map((key) => [key, Number(node.getBoundingClientRect()[key].toFixed(2))])) : null;
    const font = (node) => node ? getComputedStyle(node).fontSize : null;
    const imageRect = rect(imageWrap);
    const overlayRect = rect(overlay);
    return {
      viewport: {
        innerWidth: window.innerWidth,
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
        devicePixelRatio: window.devicePixelRatio,
        visualViewportWidth: window.visualViewport?.width,
        visualViewportScale: window.visualViewport?.scale,
        viewportMeta: document.querySelector('meta[name="viewport"]')?.content || null,
      },
      fonts: { productName: font(name), currentPrice: font(price), originalPrice: font(original), retailer: font(retailer), overlay: font(overlay?.querySelector('strong')), overlaySavings: font(overlay?.querySelector('span')), navigation: font(nav), search: font(search), filter: font(filterToggle) },
      geometry: { first: rect(first), second: rect(second), imageWrap: imageRect, image: rect(image), overlay: overlayRect, watch: rect(watch) },
      layout: {
        productDisplay: getComputedStyle(first).display,
        productColumns: getComputedStyle(first).gridTemplateColumns,
        rowsStacked: second ? second.getBoundingClientRect().top >= first.getBoundingClientRect().bottom - 1 : null,
        overlayInsideImage: Boolean(imageRect && overlayRect && overlayRect.left >= imageRect.left && overlayRect.top >= imageRect.top && overlayRect.right <= imageRect.right && overlayRect.bottom <= imageRect.bottom),
        filtersCollapsed: (!inlineFilters || getComputedStyle(inlineFilters).display === 'none') && (!filterToggle || getComputedStyle(filterToggle).display !== 'none'),
        horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        touchTargetsAtLeast48: [watch, document.querySelector('.kz-scan')].every((node) => node && node.getBoundingClientRect().height >= 48 && node.getBoundingClientRect().width >= 48),
      },
      zoom: { body: getComputedStyle(document.body).zoom || '1', app: getComputedStyle(document.querySelector('.kz-app')).zoom || '1', bodyTransform: getComputedStyle(document.body).transform },
    };
  })()`);

  const screenshot = await command('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false });
  const screenshotPath = path.join(outputRoot, `${label}-${width}.png`);
  fs.writeFileSync(screenshotPath, Buffer.from(screenshot.data, 'base64'));
  reports.push({ width, screenshotPath, ...measurements });
}

if (args.interactions && widths.includes(384)) {
  await command('Emulation.setDeviceMetricsOverride', { width: 384, height: 850, deviceScaleFactor: 3, mobile: true, screenWidth: 384, screenHeight: 850 });
  await command('Page.navigate', { url: pageUrl });
  await new Promise((resolve) => setTimeout(resolve, 1500));
  const initialCount = await evaluate(`document.querySelectorAll('.kz-product').length`);
  await evaluate(`(() => { const input=document.querySelector('.kz-search input'); const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set; setter.call(input,'Ring'); input.dispatchEvent(new Event('input',{bubbles:true})); })()`);
  await new Promise((resolve) => setTimeout(resolve, 250));
  const searchedCount = await evaluate(`document.querySelectorAll('.kz-product').length`);
  await evaluate(`document.querySelector('.kz-filter-toggle').click()`);
  await new Promise((resolve) => setTimeout(resolve, 100));
  const filterSheet = await evaluate(`({open:getComputedStyle(document.querySelector('.kz-filter-sheet')).display !== 'none', controlFont:getComputedStyle(document.querySelector('.kz-sheet-fields select')).fontSize, fits:document.querySelector('.kz-filter-sheet').getBoundingClientRect().height <= innerHeight})`);
  await evaluate(`document.querySelector('.kz-sheet-head button').click()`);
  await evaluate(`(() => { const input=document.querySelector('.kz-search input'); const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set; setter.call(input,''); input.dispatchEvent(new Event('input',{bubbles:true})); })()`);
  await new Promise((resolve) => setTimeout(resolve, 200));
  await evaluate(`document.querySelector('.kz-product-open').click()`);
  await new Promise((resolve) => setTimeout(resolve, 100));
  const detailsOpened = await evaluate(`Boolean(document.querySelector('.kz-drawer'))`);
  await evaluate(`document.querySelector('.kz-drawer-head button').click()`);
  await evaluate(`document.querySelector('.kz-scan').click()`);
  const scannerNotice = await evaluate(`document.querySelector('.kz-scanner-notice')?.textContent.includes('Scanner coming soon') || false`);
  await evaluate(`document.querySelector('.kz-scanner-notice button').click()`);
  await evaluate(`document.querySelector('.kz-watch-icon').click()`);
  await new Promise((resolve) => setTimeout(resolve, 100));
  const watchPrefill = await evaluate(`Boolean(document.querySelector('.kz-watch-product'))`);
  const watchesBeforeCreate = await evaluate(`document.querySelectorAll('.kz-watch-list article').length`);
  await evaluate(`[...document.querySelectorAll('.kz-watch-form button')].find((button)=>button.textContent.includes('Add watch')).click()`);
  await new Promise((resolve) => setTimeout(resolve, 500));
  const watchCreated = await evaluate(`document.querySelectorAll('.kz-watch-list article').length > ${watchesBeforeCreate}`);
  if (watchCreated) {
    await evaluate(`document.querySelector('.kz-watch-list article:last-of-type button[aria-label^="Remove "]').click()`);
    await evaluate(`new Promise((resolve) => { const deadline=Date.now()+5000; const check=()=>document.querySelectorAll('.kz-watch-list article').length===${watchesBeforeCreate} ? resolve(true) : Date.now()>deadline ? resolve(false) : setTimeout(check,100); check(); })`);
  }
  const watchDeleted = await evaluate(`document.querySelectorAll('.kz-watch-list article').length === ${watchesBeforeCreate}`);
  interactions = { initialCount, searchedCount, searchFiltered: searchedCount > 0 && searchedCount < initialCount, filterSheet, detailsOpened, scannerNotice, watchPrefill, watchesBeforeCreate, watchCreated, watchDeleted };
}

socket.close();
const reportPath = path.join(outputRoot, `${label}-measurements.json`);
fs.writeFileSync(reportPath, `${JSON.stringify({ reports, interactions }, null, 2)}\n`);
console.log(JSON.stringify({ label, reportPath, reports, interactions }, null, 2));
