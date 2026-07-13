# First Admin Bootstrap

The first administrator email is `shafayet445@gmail.com`.

1. Ensure email confirmation is not mandatory for Phase 3A in Supabase Auth settings.
2. Register `shafayet445@gmail.com` through `/register` using a password chosen by the real administrator.
3. In Supabase SQL editor, run `supabase/manual/bootstrap-first-admin.sql`.
4. Verify `public.profiles.role = 'admin'` and `status = 'active'` for that user.
5. Confirm an audit row exists with action `first_admin_bootstrapped`.

The bootstrap file does not create a password, does not create an auth user and must never be exposed through a public route or browser API.
