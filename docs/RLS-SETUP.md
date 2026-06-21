# Row-Level Security (RLS) Setup Guide

## Overview

This document describes the **Row-Level Security (RLS)** implementation for the Business Management System. RLS ensures that each authenticated user can only access their own data — customers, vehicles, bills, and business profiles are completely isolated between users.

---

## 🎯 What RLS Does

**Before RLS:**
- All users shared the same data pool
- User A could see User B's customers and invoices
- Manual filtering was required (easy to forget, security risk)

**After RLS:**
- Database automatically filters all queries by `user_id`
- Each user sees only their own data
- No code changes needed — works transparently with existing queries
- Supabase's anonymous key is safe to use (database enforces access control)

---

## 📋 Migration Steps

### 1. **Run the RLS Migration**

File: `supabase/rls-migration.sql`

Execute this in your Supabase dashboard:
1. Go to **SQL Editor**
2. Copy the entire contents of `rls-migration.sql`
3. Click **Run**

The migration does the following:
- Adds `user_id UUID` column to all data tables
- Enables RLS on all tables
- Creates policies that restrict access to rows where `user_id = auth.uid()`
- Adds indexes on `user_id` for performance

### 2. **Tables Affected**

RLS is enabled on:
- ✅ `customers`
- ✅ `vehicles`
- ✅ `bills`
- ✅ `bill_items` (joined through parent `bills` table)
- ✅ `business_profile`

### 3. **Existing Data Handling**

If you have existing rows in the database, they need a `user_id`:

**Option A: Assign to your current user**
```sql
-- Get your user ID first (run in Supabase SQL Editor while logged in)
SELECT auth.uid();

-- Then update all tables (replace <YOUR-UUID> with actual ID)
UPDATE customers        SET user_id = '<YOUR-UUID>' WHERE user_id IS NULL;
UPDATE vehicles         SET user_id = '<YOUR-UUID>' WHERE user_id IS NULL;
UPDATE bills            SET user_id = '<YOUR-UUID>' WHERE user_id IS NULL;
UPDATE bill_items       SET user_id = '<YOUR-UUID>' WHERE user_id IS NULL;
UPDATE business_profile SET user_id = '<YOUR-UUID>' WHERE user_id IS NULL;
```

**Option B: Delete existing test data**
```sql
TRUNCATE customers, vehicles, bills, bill_items, business_profile CASCADE;
```

---

## 🔐 How It Works

### Database Level
Each table now has a policy like:

```sql
CREATE POLICY customers_policy ON customers
  FOR ALL
  USING      (auth.uid() = user_id)  -- SELECT/READ filter
  WITH CHECK (auth.uid() = user_id); -- INSERT/UPDATE guard
```

- `USING`: Filters rows on read — user only sees their data
- `WITH CHECK`: Guards writes — user can only insert/update their own rows

### Application Level
The code in `src/lib/workshop-data.js` now:
1. Fetches the current user via `supabase.auth.getUser()`
2. Automatically includes `user_id` when inserting records
3. No manual filtering needed — RLS does it automatically

**Example:**
```javascript
// Insert customer with user_id
const { data, error } = await supabase
  .from('customers')
  .insert([{ 
    name, 
    phone_number, 
    user_id  // ← Added automatically
  }]);

// Fetch customers (RLS filters to current user automatically)
const { data } = await supabase
  .from('customers')
  .select('*');  // ← Only returns rows where user_id = auth.uid()
```

---

## ✅ Verification Checklist

After deploying, verify RLS is working:

### 1. **Test Data Isolation**
- [ ] Create an account and add test customers
- [ ] Sign out and create a different account
- [ ] Add customers with the second account
- [ ] Verify first account's data is NOT visible from second account

### 2. **Test Operations**
- [ ] Create new customer (should succeed with your user_id)
- [ ] Create new bill (should succeed with your user_id)
- [ ] Try to access another user's data via direct API call (should fail)

### 3. **Check Diagnostics**
```bash
# No TypeScript/ESLint errors
npm run lint

# Application runs without errors
npm run dev
```

---

## 🛠️ Troubleshooting

### Issue: "No rows returned" after enabling RLS

**Cause:** Existing data has `user_id = NULL`

**Fix:** Run the migration backfill step (see "Existing Data Handling" above)

---

### Issue: "RLS policy violation" on insert

**Cause:** Code is trying to insert without `user_id` or with a different user's ID

**Fix:** Ensure `workshop-data.js` fetches the current user and includes `user_id` in all insert operations

---

### Issue: Bill items not showing up

**Cause:** Bill items use a JOIN policy that checks the parent `bills.user_id`

**Fix:** Ensure the parent `bills` record has the correct `user_id` set

---

## 📊 Performance Notes

- All `user_id` columns are indexed for fast filtering
- RLS policies are evaluated at the database level (very fast)
- No application-level overhead — works transparently

---

## 🔒 Security Benefits

1. **Zero Trust Architecture:** Database enforces access control even if application code has bugs
2. **Defense in Depth:** Multiple layers (auth + RLS) protect data
3. **Audit Trail:** All access is logged through Supabase auth layer
4. **Safe Anonymous Key:** Frontend can use the anon key safely — RLS prevents unauthorized access

---

## 📚 Further Reading

- [Supabase RLS Documentation](https://supabase.com/docs/guides/auth/row-level-security)
- [PostgreSQL RLS Policies](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)
- `supabase/rls-migration.sql` — Full migration with inline comments

---

## 🎉 Summary

✅ **RLS is now enabled** — each user sees only their own data  
✅ **No code changes needed** — existing queries work automatically  
✅ **Database-level security** — enforced even if application has bugs  
✅ **Performance optimized** — indexed `user_id` columns

You can now safely deploy the application with multi-user support!
