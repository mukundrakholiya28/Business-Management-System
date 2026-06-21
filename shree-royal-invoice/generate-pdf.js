/**
 * SHREE ROYAL CAR — Standalone PDF Generator
 * -----------------------------------------------------------
 * Run:  npm run pdf
 * Output: ./output/invoice-<number>.pdf
 *
 * Spins up a temporary local server (so relative CSS/font/image
 * paths resolve correctly), renders the invoice with Puppeteer,
 * saves it as a PDF, then shuts everything down.
 * -----------------------------------------------------------
 */

const express = require('express');
const path = require('path');
const fs = require('fs');
const puppeteer = require('puppeteer');

const PORT = 4321;
const app = express();
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));

function loadInvoiceData() {
  const raw = fs.readFileSync(path.join(__dirname, 'data', 'sample-invoice.json'), 'utf-8');
  return JSON.parse(raw);
}

app.get('/invoice', (req, res) => {
  res.render('invoice', loadInvoiceData());
});

(async () => {
  const server = app.listen(PORT);
  const data = loadInvoiceData();

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();

  await page.goto(`http://localhost:${PORT}/invoice`, { waitUntil: 'networkidle0' });
  await page.evaluateHandle('document.fonts.ready');

  const outDir = path.join(__dirname, 'output');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);
  const outPath = path.join(outDir, `invoice-${data.invoice.number}.pdf`);

  await page.pdf({
    path: outPath,
    format: 'A4',
    printBackground: true,
    margin: { top: '0', bottom: '0', left: '0', right: '0' }
  });

  await browser.close();
  server.close();

  console.log(`Saved → ${outPath}`);
})();
