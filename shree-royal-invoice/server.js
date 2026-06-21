/**
 * SHREE ROYAL CAR — Invoice Server
 * -----------------------------------------------------------
 * Run:    npm install   then   npm start
 * View:   http://localhost:3000/invoice
 * PDF:    http://localhost:3000/invoice/pdf  (downloads a PDF)
 *
 * Swap the JSON file loaded below for your real invoice data,
 * or wire up a route that pulls invoice data from your database.
 * -----------------------------------------------------------
 */

const express = require('express');
const path = require('path');
const fs = require('fs');
const puppeteer = require('puppeteer');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));

function loadInvoiceData() {
  const raw = fs.readFileSync(path.join(__dirname, 'data', 'sample-invoice.json'), 'utf-8');
  return JSON.parse(raw);
}

// Render invoice in the browser
app.get('/invoice', (req, res) => {
  const data = loadInvoiceData();
  res.render('invoice', data);
});

// Render the same invoice straight to a downloadable PDF
app.get('/invoice/pdf', async (req, res) => {
  try {
    const data = loadInvoiceData();

    const browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();

    // Navigate to the live invoice route so relative asset paths
    // (/css/invoice.css, /images/logo.png, /fonts/...) resolve correctly.
    await page.goto(`http://localhost:${PORT}/invoice`, { waitUntil: 'networkidle0' });
    await page.evaluateHandle('document.fonts.ready');

    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '0', bottom: '0', left: '0', right: '0' }
    });
    await browser.close();

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="invoice-${data.invoice.number}.pdf"`
    });
    res.send(pdfBuffer);
  } catch (err) {
    console.error(err);
    res.status(500).send('Could not generate PDF: ' + err.message);
  }
});

app.listen(PORT, () => {
  console.log(`Shree Royal Car invoice server running → http://localhost:${PORT}/invoice`);
});
