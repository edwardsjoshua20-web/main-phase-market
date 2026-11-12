import fs from 'node:fs';
import path from 'node:path';

const output = path.resolve(process.argv[2] || 'D:\\Projects\\Penny-Hunter\\verification\\phase8-mobile');
fs.mkdirSync(output, { recursive: true });
const targets = await fetch('http://127.0.0.1:9337/json').then((response) => response.json());
const target = targets.find((item) => item.type === 'page');
if (!target?.webSocketDebuggerUrl) throw new Error('No Chromium target.');
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
let id = 0; const pending = new Map();
socket.addEventListener('message', (event) => { const message = JSON.parse(String(event.data)); if (!pending.has(message.id)) return; const task = pending.get(message.id); pending.delete(message.id); message.error ? task.reject(new Error(message.error.message)) : task.resolve(message.result || {}); });
const command = (method, params = {}) => new Promise((resolve, reject) => { const next = ++id; pending.set(next, { resolve, reject }); socket.send(JSON.stringify({ id: next, method, params })); });
const evaluate = async (expression) => { const result = await command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (result.exceptionDetails) throw new Error(result.result?.description || result.exceptionDetails.text); return result.result?.value; };
await command('Page.enable'); await command('Runtime.enable');
await command('Emulation.setDeviceMetricsOverride', { width: 384, height: 850, deviceScaleFactor: 3, mobile: true, screenWidth: 384, screenHeight: 850 });
await command('Page.navigate', { url: 'http://127.0.0.1:4176/private/kazakari?preview=phase7b' });
await new Promise((resolve) => setTimeout(resolve, 1800));
await evaluate(`document.querySelectorAll('.kz-tabs button')[1].click()`);
await new Promise((resolve) => setTimeout(resolve, 500));
const initial = await evaluate(`({
  heading:[...document.querySelectorAll('.kz-penny-group h2')].map((node)=>node.textContent),
  renderedLeads:document.querySelectorAll('.kz-penny-lead').length,
  disclaimer:document.querySelector('.kz-penny-disclaimer')?.textContent,
  loadMore:Boolean(document.querySelector('.kz-load-more')),
  overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth,
  firstBadgeInside:(()=>{const badge=document.querySelector('.kz-penny-evidence-badge')?.getBoundingClientRect();const image=document.querySelector('.kz-penny-lead .kz-image-wrap')?.getBoundingClientRect();return Boolean(badge&&image&&badge.left>=image.left&&badge.right<=image.right&&badge.top>=image.top&&badge.bottom<=image.bottom)})()
})`);
await evaluate(`(()=>{const input=document.querySelector('.kz-search input');const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;setter.call(input,'327716118');input.dispatchEvent(new Event('input',{bubbles:true}))})()`);
await new Promise((resolve) => setTimeout(resolve, 300));
const exact = await evaluate(`({count:document.querySelectorAll('.kz-penny-lead').length,text:document.querySelector('.kz-penny-lead')?.textContent||''})`);
const screenshot = await command('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false });
const screenshotPath = path.join(output, 'phase8-penny-finds-384.png');
fs.writeFileSync(screenshotPath, Buffer.from(screenshot.data, 'base64'));
const report = { initial, exact, screenshotPath };
if (!initial.heading.includes('Community-reported penny leads') || initial.renderedLeads !== 40 || !initial.loadMore || initial.overflow || !initial.firstBadgeInside || exact.count !== 1 || !exact.text.includes('Exact catalog match')) throw new Error(`Phase 8 UI verification failed: ${JSON.stringify(report)}`);
fs.writeFileSync(path.join(output, 'phase8-penny-finds.json'), `${JSON.stringify(report, null, 2)}\n`);
socket.close();
console.log(JSON.stringify(report, null, 2));
