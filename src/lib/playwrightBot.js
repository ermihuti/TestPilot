// src/lib/playwrightBot.js
import * as dotenv from 'dotenv';
dotenv.config();

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';
import { diffLines } from 'diff';

const SNAPSHOT_ROOT = path.resolve('snapshots');
const REPORT_ROOT   = path.resolve('reports');

function slugify(host) {
  return host.replace(/[:\/\\?&=]+/g, '_');
}
function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

export async function runPlaywrightBot(url) {
  // --- prepare folders ---
  ensureDir(SNAPSHOT_ROOT);
  ensureDir(REPORT_ROOT);

  const host = new URL(url).hostname;
  const base = path.join(SNAPSHOT_ROOT, slugify(host));
  ensureDir(base);

  // find previous run
  const runs = fs.readdirSync(base)
    .filter(d => /^\d{14}$/.test(d))
    .sort();
  const prev = runs.pop();
  const prevPath = prev && path.join(base, prev);

  // create new run folder
  const ts = new Date().toISOString().slice(0,19).replace(/[-:T]/g,'');
  const curr = path.join(base, ts);
  fs.mkdirSync(curr);

  // --- browse and interact ---
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: 'domcontentloaded' });

  // 1) identify elements
  const elements = await page.evaluate(() => {
    const sel = ['a','button','input','textarea','select','option'];
    return Array.from(document.querySelectorAll(sel.join(','))).map(el => ({
      tag: el.tagName.toLowerCase(),
      type: el.type||null,
      name: el.name||null,
      id: el.id||null,
      class: el.className||null,
      text: el.innerText.trim().slice(0,30)
    }));
  });

  // 2) interactions
  const interactions = { links: [], inputs: [], buttons: [] };
  // click up to 10 links
  const links = await page.$$eval('a[href]', a=>a.map(x=>x.href).slice(0,10));
  for (const href of links) {
    try {
      const r = await page.goto(href, { timeout:5000, waitUntil:'domcontentloaded' });
      interactions.links.push({ href, status: r.status() });
      await page.goBack();
    } catch (e) {
      interactions.links.push({ href, error: e.message });
    }
  }
  // fill inputs
  for (const el of elements.filter(e=>['input','textarea'].includes(e.tag))) {
    const selector = el.name ? `*[name="${el.name}"]`
                   : el.id   ? `#${el.id}` : null;
    if (!selector) continue;
    try {
      const val = 'test';
      await page.fill(selector, val);
      interactions.inputs.push({ selector, value: val });
    } catch (e) {
      interactions.inputs.push({ selector, error: e.message });
    }
  }
  // click buttons
  const buttons = await page.$$('button, input[type=submit]');
  for (const btn of buttons) {
    try {
      await btn.click({ timeout:3000 });
      interactions.buttons.push({ ok:true });
    } catch (e) {
      interactions.buttons.push({ ok:false, error: e.message });
    }
  }

  // 3) snapshot
  const shot = path.join(curr, 'screenshot.png');
  await page.screenshot({ path: shot, fullPage:true });
  const html = await page.content();
  fs.writeFileSync(path.join(curr,'dom.html'), html);
  fs.writeFileSync(path.join(curr,'elements.json'), JSON.stringify(elements, null,2));
  fs.writeFileSync(path.join(curr,'interactions.json'), JSON.stringify(interactions, null,2));

  // 4) compare with prev
  const changes = [];
  if (prevPath) {
    // visual diff
    const oldImg = PNG.sync.read(fs.readFileSync(path.join(prevPath,'screenshot.png')));
    const newImg = PNG.sync.read(fs.readFileSync(shot));
    const diff = new PNG({ width: oldImg.width, height: oldImg.height });
    const px = pixelmatch(oldImg.data, newImg.data, diff.data, oldImg.width, oldImg.height, {threshold:0.1});
    if (px>0) {
      fs.writeFileSync(path.join(curr,'diff.png'), PNG.sync.write(diff));
      changes.push(`Visual: ${px} px changed`);
    }
    // DOM diff
    const oldHtml = fs.readFileSync(path.join(prevPath,'dom.html'),'utf8');
    diffLines(oldHtml, html).forEach(p => {
      if (p.added)   changes.push('Added → '+p.value.slice(0,50).replace(/\n/g,' '));
      if (p.removed) changes.push('Removed ← '+p.value.slice(0,50).replace(/\n/g,' '));
    });
  }

  await browser.close();

  // 5) report
  const report = { url, timestamp: ts, elements, interactions, changes };
  fs.writeFileSync(path.join(curr,'report.json'), JSON.stringify(report, null,2));
  return report;
}