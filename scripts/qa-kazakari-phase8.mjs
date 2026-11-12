import fs from 'node:fs';
import path from 'node:path';

const output = path.resolve(process.argv[2] || 'D:\\Projects\\Penny-Hunter\\verification\\phase9-mobile');
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
await evaluate(`sessionStorage.removeItem('kazakari.penny.state');location.reload()`);
await new Promise((resolve) => setTimeout(resolve, 900));
await evaluate(`document.querySelectorAll('.kz-tabs button')[1].click()`);
await new Promise((resolve) => setTimeout(resolve, 500));
const initial = await evaluate(`({
  title:document.querySelector('.kz-page-heading h1')?.textContent,
  toolbar:document.querySelector('.kz-penny-toolbar')?.textContent,
  renderedLeads:document.querySelectorAll('.kz-penny-lead').length,
  removedCopy:document.body.textContent.includes('Community-reported penny leads')||document.body.textContent.includes('No store IDs were supplied by this feed'),
  firstTitle:document.querySelector('.kz-penny-lead h3')?.textContent,
  overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth,
  currentSelected:document.querySelector('.kz-penny-view-switch .active')?.textContent,
  reportViewSelected:document.querySelector('.kz-penny-report-switch .active')?.textContent,
  firstBadge:document.querySelector('.kz-penny-lead .kz-penny-evidence-badge')?.textContent,
  firstCoverage:document.querySelector('.kz-penny-lead .kz-lead-evidence')?.textContent,
  firstBadgeInside:(()=>{const badge=document.querySelector('.kz-penny-evidence-badge')?.getBoundingClientRect();const image=document.querySelector('.kz-penny-lead .kz-image-wrap')?.getBoundingClientRect();return Boolean(badge&&image&&badge.left>=image.left&&badge.right<=image.right&&badge.top>=image.top&&badge.bottom<=image.bottom)})()
})`);
const initialScreenshot = await command('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false });
const initialScreenshotPath = path.join(output, 'phase10-current-pennies-384.png');
fs.writeFileSync(initialScreenshotPath, Buffer.from(initialScreenshot.data, 'base64'));
await evaluate(`document.querySelectorAll('.kz-penny-report-switch button')[1].click()`);
await new Promise((resolve) => setTimeout(resolve, 150));
const allKentuckyReports = await evaluate(`({toolbar:document.querySelector('.kz-penny-toolbar')?.textContent,count:document.querySelectorAll('.kz-penny-lead').length})`);
const chooseState = async (value) => {
  await evaluate(`document.querySelector('.kz-penny-toolbar .kz-filter-toggle').click()`);
  await new Promise((resolve) => setTimeout(resolve, 100));
  await evaluate(`(()=>{const select=document.querySelector('.kz-penny-sheet-backdrop select');const setter=Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set;setter.call(select,${JSON.stringify(value)});select.dispatchEvent(new Event('change',{bubbles:true}));document.querySelector('.kz-penny-sheet-backdrop .kz-primary').click()})()`);
  await new Promise((resolve) => setTimeout(resolve, 200));
};
await chooseState('CA');
const california = await evaluate(`({toolbar:document.querySelector('.kz-penny-toolbar')?.textContent,count:document.querySelectorAll('.kz-penny-lead').length})`);
await chooseState('ALL');
const allStates = await evaluate(`({toolbar:document.querySelector('.kz-penny-toolbar')?.textContent,count:document.querySelectorAll('.kz-penny-lead').length,loadMore:Boolean(document.querySelector('.kz-load-more'))})`);
await evaluate(`document.querySelectorAll('.kz-tabs button')[0].click();document.querySelectorAll('.kz-tabs button')[1].click()`);
await new Promise((resolve) => setTimeout(resolve, 150));
const persisted = await evaluate(`document.querySelector('.kz-penny-toolbar')?.textContent`);
await evaluate(`document.querySelector('.kz-penny-toolbar .kz-filter-toggle').click()`);
await new Promise((resolve) => setTimeout(resolve, 100));
await evaluate(`(()=>{const selects=document.querySelectorAll('.kz-penny-sheet-backdrop select');const setter=Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set;setter.call(selects[1],'reports');selects[1].dispatchEvent(new Event('change',{bubbles:true}));document.querySelector('.kz-penny-sheet-backdrop .kz-primary').click()})()`);
await new Promise((resolve) => setTimeout(resolve, 150));
const sorted = await evaluate(`document.querySelector('.kz-penny-lead h3')?.textContent`);
await evaluate(`document.querySelector('.kz-penny-lead .kz-image-action').click()`);
await new Promise((resolve) => setTimeout(resolve, 100));
const details = await evaluate(`({open:Boolean(document.querySelector('#kz-penny-detail-title')),evidence:document.querySelector('.kz-drawer')?.textContent.includes('Community-reported penny')})`);
await evaluate(`document.querySelector('.kz-drawer-head button').click();sessionStorage.removeItem('kazakari.penny.state');location.reload()`);
await new Promise((resolve) => setTimeout(resolve, 900));
await evaluate(`document.querySelectorAll('.kz-tabs button')[1].click()`);
await new Promise((resolve) => setTimeout(resolve, 250));
const freshSession = await evaluate(`document.querySelector('.kz-penny-toolbar')?.textContent`);
await evaluate(`document.querySelectorAll('.kz-penny-view-switch button')[1].click()`);
await new Promise((resolve) => setTimeout(resolve, 150));
const kentuckyPredictions = await evaluate(`({toolbar:document.querySelector('.kz-penny-toolbar')?.textContent,empty:document.querySelector('.kz-state strong')?.textContent})`);
await evaluate(`document.querySelector('.kz-state .kz-text-button').click()`);
await new Promise((resolve) => setTimeout(resolve, 150));
const allPredictions = await evaluate(`({toolbar:document.querySelector('.kz-penny-toolbar')?.textContent,count:document.querySelectorAll('.kz-prediction').length,firstBadge:document.querySelector('.kz-prediction .kz-penny-evidence-badge')?.textContent})`);
const screenshot = await command('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false });
const screenshotPath = path.join(output, 'phase9-penny-finds-384.png');
fs.writeFileSync(screenshotPath, Buffer.from(screenshot.data, 'base64'));
const report = { initial, initialScreenshotPath, allKentuckyReports, california, allStates, persisted, sorted, details, freshSession, kentuckyPredictions, allPredictions, screenshotPath };
if (initial.title !== 'Penny Finds' || initial.currentSelected !== 'Current Pennies' || initial.reportViewSelected !== 'Recent' || !initial.toolbar.includes('Kentucky · 3 current pennies') || initial.renderedLeads !== 3 || !['Confirmed','Observed','Reported','Verify'].includes(initial.firstBadge) || !initial.firstCoverage.includes('Kentucky: 1 report · Nationwide:') || initial.removedCopy || initial.overflow || !initial.firstBadgeInside || !allKentuckyReports.toolbar.includes('Kentucky · 9 current pennies') || allKentuckyReports.count !== 9 || !california.toolbar.includes('California') || !allStates.toolbar.includes('All States · 583 current pennies') || allStates.count !== 40 || !allStates.loadMore || !persisted.includes('All States') || sorted !== 'Packout 19.5 in. W x 14.7 in. H x 14.5 in. D Cabinet in Red (1-Piece)' || !details.open || !freshSession.includes('Kentucky · 3 current pennies') || !kentuckyPredictions.toolbar.includes('Kentucky · 0 predictions') || !kentuckyPredictions.empty.includes('No penny predictions') || !allPredictions.toolbar.includes('All States · 10 predictions') || allPredictions.count !== 10 || allPredictions.firstBadge !== 'Early signal') throw new Error(`Phase 11 UI verification failed: ${JSON.stringify(report)}`);
fs.writeFileSync(path.join(output, 'phase9-penny-finds.json'), `${JSON.stringify(report, null, 2)}\n`);
socket.close();
console.log(JSON.stringify(report, null, 2));
