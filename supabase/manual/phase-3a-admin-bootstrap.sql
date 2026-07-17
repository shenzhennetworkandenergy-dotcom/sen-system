-- Replace the email value, then run once to bootstrap the first SEN admin.
update public.profiles set role = 'admin', status = 'active' where email = 'admin@example.com';
