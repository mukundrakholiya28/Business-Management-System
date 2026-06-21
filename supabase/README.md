# Supabase Database Setup

This directory contains the database schema and security configuration for the Business Management System.

## Files

- **`schema.sql`** - Initial database table definitions
- **`rls-migration.sql`** - Row Level Security (RLS) policies for per-user data isolation

## Setup Instructions

### 1. Initial Schema Setup

Run `schema.sql` first if setting up a fresh database:

1. Go to your Supabase Dashboard
2. Navigate to **SQL Editor**
3. Copy the contents of `schema.sql`
4. Click **Run** to create all tables

### 2. Enable Row Level Security (RLS)

**IMPORTANT:** RLS ensures each user can only access their own data.

Run `rls-migration.sql` to enable data isolation:

1. Go to **SQL Editor** in Supabase Dashboard
2. Copy the entire contents of `rls-migration.sql`
3. Click **Run**

This migration will:
- Add `user_id` columns to all data tables
- Enable RLS on all tables
- Create policies that automatically filter data by the authenticated user
- Add database indexes for performance

### 3. Back-fill Existing Data (if applicable)

If you have existing data from before RLS was enabled, you need to assign it to users:

```sql
-- Option 1: Assign all existing data to a specific user
UPDATE customers SET user_id = '<your-user-uuid>' WHERE user_id IS NULL;
UPDATE vehicles SET user_id = '<your-user-uuid>' WHERE user_id IS NULL;
UPDATE bills SET user_id = '<your-user-uuid>' WHERE user_id IS NULL;
UPDATE bill_items SET user_id = '<your-user-uuid>' WHERE user_id IS NULL;
UPDATE business_profile SET user_id = '<your-user-uuid>' WHERE user_id IS NULL;

-- Option 2: Delete unassigned data (use with caution!)
DELETE FROM customers WHERE user_id IS NULL;
DELETE FROM vehicles WHERE user_id IS NULL;
DELETE FROM bills WHERE user_id IS NULL;
DELETE FROM bill_items WHERE user_id IS NULL;
DELETE FROM business_profile WHERE user_id IS NULL;
```

To find your user UUID:
1. Log in to your app
2. Go to Supabase Dashboard → **Authentication** → **Users**
3. Copy the UUID from your user row

## How RLS Works

### Authentication Flow

1. User logs in through Supabase Auth
2. Supabase issues a JWT token containing the user's ID
3. All database queries automatically include the authenticated user's ID
4. RLS policies filter/restrict data based on `auth.uid()` matching `user_id`

### Security Benefits

- **Automatic data isolation** - No need to manually add WHERE clauses
- **Protection against tampering** - Even if someone modifies the frontend code, they can't access other users' data
- **Server-side enforcement** - Security is enforced at the database level
- **No service role key needed** - The public anon key is safe to use in frontend code

### What Each Policy Does

- **`customers_policy`** - Users can only see/edit their own customers
- **`vehicles_policy`** - Users can only see/edit vehicles linked to their customers
- **`bills_policy`** - Users can only see/edit their own invoices
- **`bill_items_policy`** - Users can only see/edit items in their own invoices (verified through the parent bill)
- **`business_profile_policy`** - Users can only see/edit their own business profile

## Testing RLS

After running the migration, test that RLS is working:

1. Create two test accounts
2. Log in as User A and create some customers/invoices
3. Log out and log in as User B
4. Verify that User B cannot see User A's data
5. Create data as User B
6. Log back in as User A and verify they still only see their own data

## Troubleshooting

### "New row violates row-level security policy"

**Cause:** Trying to insert data without being authenticated, or the `user_id` doesn't match the authenticated user.

**Fix:** Ensure:
- User is logged in before creating data
- Your code sets `user_id` using `supabase.auth.getUser()`
- The user_id matches the authenticated user

### "No rows returned" after enabling RLS

**Cause:** Existing data doesn't have `user_id` set.

**Fix:** Run the back-fill queries above to assign existing data to users.

### Performance Issues

**Fix:** The migration creates indexes on `user_id` columns. If queries are still slow:

```sql
-- Check if indexes exist
SELECT * FROM pg_indexes WHERE tablename IN ('customers', 'vehicles', 'bills', 'business_profile');

-- Add missing indexes
CREATE INDEX IF NOT EXISTS idx_bills_customer ON bills(customer_id);
CREATE INDEX IF NOT EXISTS idx_vehicles_customer ON vehicles(customer_id);
```

## Schema Overview

### Tables and Relationships

```
auth.users (Supabase Auth)
    ↓
    ├─→ customers (user_id)
    │       ↓
    │       ├─→ vehicles (customer_id, user_id)
    │       └─→ bills (customer_id, user_id)
    │               ↓
    │               └─→ bill_items (bill_id, user_id via JOIN)
    └─→ business_profile (user_id)
```

### Key Points

- All tables reference `auth.users(id)` through `user_id`
- Foreign keys cascade on delete (deleting a user deletes all their data)
- `bill_items` inherit security from their parent `bills` record
- Each user has one `business_profile` for invoice customization

## Maintenance

### Adding New Tables

When adding new tables that store user data:

1. Add the table definition to `schema.sql`
2. Add `user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE`
3. Enable RLS: `ALTER TABLE new_table ENABLE ROW LEVEL SECURITY;`
4. Create a policy:
   ```sql
   CREATE POLICY new_table_policy ON new_table
     FOR ALL
     USING (auth.uid() = user_id)
     WITH CHECK (auth.uid() = user_id);
   ```
5. Add an index: `CREATE INDEX idx_new_table_user ON new_table(user_id);`

### Disabling RLS (Not Recommended)

If you need to temporarily disable RLS for debugging:

```sql
ALTER TABLE customers DISABLE ROW LEVEL SECURITY;
```

**WARNING:** This exposes all user data. Never disable RLS in production!

## Additional Resources

- [Supabase RLS Documentation](https://supabase.com/docs/guides/auth/row-level-security)
- [PostgreSQL RLS Policies](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)
- [Supabase Auth Helpers](https://supabase.com/docs/guides/auth/auth-helpers)
