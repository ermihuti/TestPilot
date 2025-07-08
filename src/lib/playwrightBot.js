import * as dotenv from 'dotenv';
dotenv.config(); // Load environment variables early

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';
import PDFDocument from 'pdfkit';
import OpenAI from 'openai';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

const SNAPSHOT_DIR = path.resolve('./snapshots');
const REPORT_DIR = path.resolve('./reports');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

async function runPlaywrightBot(url) {
  ensureDir(SNAPSHOT_DIR);
  ensureDir(REPORT_DIR);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();

  const page = await context.newPage();
  await page.goto(url, { waitUntil: 'domcontentloaded' });

  // Extract full DOM
  const domContent = await page.content();

  // Take screenshot
  const screenshotPath = path.join(SNAPSHOT_DIR, 'current.png');
  await page.screenshot({ path: screenshotPath, fullPage: true });

  // Save DOM
  const domPath = path.join(SNAPSHOT_DIR, 'current.html');
  fs.writeFileSync(domPath, domContent);

  // Load old snapshot if exists
  const oldDomPath = path.join(SNAPSHOT_DIR, 'snapshot.html');
  const oldScreenshotPath = path.join(SNAPSHOT_DIR, 'snapshot.png');

  let changes = [];
  if (fs.existsSync(oldDomPath) && fs.existsSync(oldScreenshotPath)) {
    const oldDom = fs.readFileSync(oldDomPath, 'utf-8');
    if (oldDom !== domContent) changes.push('DOM structure has changed.');

    const img1 = PNG.sync.read(fs.readFileSync(oldScreenshotPath));
    const img2 = PNG.sync.read(fs.readFileSync(screenshotPath));
    const diff = new PNG({ width: img1.width, height: img1.height });
    const diffPixels = pixelmatch(img1.data, img2.data, diff.data, img1.width, img1.height, { threshold: 0.1 });

    if (diffPixels > 0) {
      changes.push(`Visual content changed: ${diffPixels} pixels differ.`);
      const diffPath = path.join(REPORT_DIR, 'diff.png');
      fs.writeFileSync(diffPath, PNG.sync.write(diff));
    }
  } else {
    // Save first snapshot
    fs.copyFileSync(screenshotPath, oldScreenshotPath);
    fs.writeFileSync(oldDomPath, domContent);
  }

  // 🧠 Call OpenAI to summarize page
  const summary = await getAISummary(domContent);

  // 📄 Generate PDFs
  const summaryPdfPath = path.join(REPORT_DIR, 'summary.pdf');
  const detailsPdfPath = path.join(REPORT_DIR, 'details.pdf');

  await generateSummaryPDF(summary, summaryPdfPath);
  await generateDetailsPDF({ url, changes }, detailsPdfPath);

  await browser.close();

  return {
    summaryPdf: '/summary.pdf',
    detailsPdf: '/details.pdf',
    changes,
    summary
  };
}

async function getAISummary(html) {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o', // or gpt-4o-mini
      messages: [
        {
          role: 'user',
          content: `Analyze this HTML page and summarize its functionality:\n\n${html}`
        }
      ],
      max_tokens: 300
    });
    return response.choices?.[0]?.message?.content ?? 'No summary available.';
  } catch (err) {
    console.error('OpenAI Error:', err);
    return 'Error while summarizing.';
  }
}

function generateSummaryPDF(text, filePath) {
  return new Promise((res) => {
    const doc = new PDFDocument();
    doc.pipe(fs.createWriteStream(filePath));
    doc.fontSize(16).text('Website Functionality Summary', { underline: true });
    doc.moveDown();
    doc.fontSize(12).text(text);
    doc.end();
    doc.on('finish', res);
  });
}

function generateDetailsPDF(data, filePath) {
  return new Promise((res) => {
    const doc = new PDFDocument();
    doc.pipe(fs.createWriteStream(filePath));
    doc.fontSize(16).text('Analysis Details Report', { underline: true });
    doc.moveDown();
    doc.fontSize(12).text(`URL: ${data.url}`);
    doc.moveDown();
    if (data.changes.length === 0) {
      doc.text('No changes detected.');
    } else {
      doc.text('Detected changes:');
      data.changes.forEach((c) => doc.list([c]));
    }
    doc.end();
    doc.on('finish', res);
  });
}

export { runPlaywrightBot };