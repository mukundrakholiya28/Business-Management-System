Vortice is the bold condensed display font used for "SHREE ROYAL CAR"
on your logo. It is a commercial font (not on Google Fonts / not
freely redistributable), so the actual font files aren't included here.

To use the real Vortice typeface in the invoice:
  1. Buy/license Vortice Bold (woff2 + otf if you have them).
  2. Drop the files into this folder, named exactly:
       Vortice-Bold.woff2
       Vortice-Bold.otf
  3. Reload the invoice — the @font-face rule in
     public/css/invoice.css will pick it up automatically.

Until then, the invoice falls back to "Oswald" (free, Google Fonts),
a bold condensed geometric face with the same stamped/sporty feel
as Vortice, so the design still looks correct without it.
