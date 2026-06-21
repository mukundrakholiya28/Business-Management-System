# Deployment Checklist

## 🚀 Pre-Deployment Steps

### 1. Database Migration
- [ ] Run `supabase/rls-migration.sql` in Supabase SQL Editor
- [ ] Verify RLS is enabled on all tables
- [ ] Back-fill existing data with `user_id` (if any)

### 2. Environment Variables
Ensure all environment variables are set in **Vercel** (or your hosting platform):

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

# WhatsApp API (optional)
WHATSAPP_API_URL=https://api.whatsapp.com/send
WHATSAPP_API_TOKEN=your-token

# Webhook Secret (if using webhooks)
WEBHOOK_SECRET=your-random-secret
```

### 3. Code Quality
- [ ] Run `npm run lint` — no errors
- [ ] Run `npm run build` — successful build
- [ ] Test locally with `npm run dev`

---

## 📦 Deployment Steps

### Deploy to Vercel

```bash
# Install Vercel CLI (if not installed)
npm i -g vercel

# Deploy
vercel --prod
```

Or push to GitHub — Vercel will auto-deploy if connected.

---

## ✅ Post-Deployment Verification

### 1. Authentication
- [ ] Sign up for a new account
- [ ] Verify email confirmation works
- [ ] Log in successfully
- [ ] Log out and log back in

### 2. Data Isolation (RLS)
- [ ] Create customers with Account A
- [ ] Sign out and create Account B
- [ ] Create customers with Account B
- [ ] Log in as Account A — verify only Account A's data is visible
- [ ] Log in as Account B — verify only Account B's data is visible

### 3. Core Features
- [ ] Create a new customer
- [ ] Add a vehicle to customer
- [ ] Create an invoice/bill
- [ ] Download invoice as PDF
- [ ] Edit invoice status (pending → paid)
- [ ] View dashboard with recent invoices
- [ ] View "All Customers" page
- [ ] Search for customer by name/phone

### 4. Business Profile
- [ ] Update business profile (name, address, bank details)
- [ ] Create an invoice — verify new details appear in PDF
- [ ] Update payment UPI/bank info
- [ ] Verify changes persist after refresh

### 5. UI/UX
- [ ] Navbar shows correct user email
- [ ] Loading skeletons match actual content layout
- [ ] Responsive design works on mobile
- [ ] All dropdowns (status, payment method) work correctly
- [ ] Colors match status (pending = yellow, paid = green)

### 6. WhatsApp Integration (if enabled)
- [ ] Create an invoice
- [ ] Click WhatsApp button
- [ ] Verify pre-filled message with invoice link
- [ ] Check that link opens correct invoice PDF

### 7. Webhooks (if configured)
- [ ] Create an invoice
- [ ] Check webhook logs in Supabase dashboard
- [ ] Verify webhook endpoint received request
- [ ] Test status update (pending → paid) triggers webhook

---

## 🔧 Optional: Database Webhooks

If you want automatic WhatsApp notifications:

1. Follow instructions in `docs/WEBHOOK-SETUP.md`
2. Configure webhook in Supabase dashboard
3. Add `WEBHOOK_SECRET` to environment variables
4. Test by creating an invoice

---

## 🛠️ Troubleshooting

### Issue: "No data showing after login"
**Fix:** Run the RLS migration backfill step (see `docs/RLS-SETUP.md`)

### Issue: "RLS policy violation on insert"
**Fix:** Ensure `.env` has correct Supabase credentials and user is authenticated

### Issue: "Invoice PDF not downloading"
**Fix:** Check browser console for errors, verify jsPDF + html2canvas are installed

### Issue: "WhatsApp link not working"
**Fix:** Check customer phone number is in correct format (+91XXXXXXXXXX)

---

## 📊 Performance Optimization

After deployment, monitor:
- [ ] Page load times (should be <2s)
- [ ] API response times in Vercel dashboard
- [ ] Database query performance in Supabase dashboard
- [ ] Error rates and logs

---

## 🔐 Security Checklist

- [ ] RLS enabled on all tables
- [ ] Environment variables not committed to Git
- [ ] `.env` and `.env.local` in `.gitignore`
- [ ] Supabase anon key (not service key) used in frontend
- [ ] Webhook endpoints validate authorization headers
- [ ] HTTPS enabled in production (Vercel handles this)

---

## 📚 Documentation

Ensure team members have access to:
- [ ] `docs/RLS-SETUP.md` — Database security setup
- [ ] `docs/WEBHOOK-SETUP.md` — Webhook configuration
- [ ] `supabase/README.md` — Quick database reference
- [ ] This deployment checklist

---

## 🎉 Launch!

Once all checkboxes are complete:
✅ Your application is production-ready!  
✅ Multi-user support with data isolation  
✅ Secure database access with RLS  
✅ Professional invoice generation  
✅ WhatsApp integration for customer communication

**Next Steps:**
- Share the application URL with users
- Monitor logs and analytics
- Gather user feedback
- Iterate and improve!

---

## 📞 Support

If you encounter issues:
1. Check the documentation in `docs/`
2. Review Supabase logs for database errors
3. Check Vercel logs for deployment issues
4. Verify environment variables are set correctly

Happy deploying! 🚀
