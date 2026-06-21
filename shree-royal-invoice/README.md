# Shree Royal Car — Invoice Generator

A minimalist, branded Node.js invoice template built directly from your logo's
palette and typography — mustard yellow + deep navy, flat shapes, no gradients
or shadows. Amounts use the Rupee symbol (₹) with Indian-style comma grouping
(e.g. ₹9,440).

## What's inside
- `views/invoice.ejs` — the invoice layout (EJS template)
- `public/css/invoice.css` — all styling: colors, type, layout
- `data/sample-invoice.json` — example invoice data (edit this, or wire up your own DB)
- `server.js` — Express app: view the invoice in a browser, or download it as a PDF
- `generate-pdf.js` — CLI script: renders straight to `output/invoice-<number>.pdf`
- `public/images/logo.png` — your logo, already wired into the header
- `public/fonts/README.txt` — how to add the real Vortice font file

## Setup
```bash
npm install
```

## Run it
**View in browser, with a live PDF download link:**
```bash
npm start
# → http://localhost:3000/invoice        (view)
# → http://localhost:3000/invoice/pdf    (download as PDF)
```

**Or generate a PDF straight to disk:**
```bash
npm run pdf
# → ./output/invoice-<number>.pdf
```

## Fonts
- **Body / data:** Poppins — flat, geometric, minimalist, loaded from Google Fonts.
- **Brand wordmark ("SHREE ROYAL CAR"):** Vortice, the font on your logo.
  Vortice is a paid commercial font, so the actual font file isn't bundled
  (licensing). The CSS is already set up to use it the moment you drop your
  licensed file into `public/fonts/` — see `public/fonts/README.txt` for the
  exact filenames it expects. Until then, it falls back to **Oswald**, a free
  bold condensed face with the same stamped/sporty character.

## Editing invoice data
Update `data/sample-invoice.json` — company info, bill-to, line items, GST,
and payment/bank details. Every field flows straight into the template.

## Customizing the look
All colors and fonts are defined as CSS variables at the top of
`public/css/invoice.css`:
```css
--yellow:  #F4C518;
--navy:    #2B2A3D;
--paper:   #FAF8F2;
```
Adjust these to fine-tune the match to your exact brand colors.
