-- Fix "Database error querying schema" when logging in seeded demo users.
-- Run once in Supabase SQL Editor, then try login again.
--
-- Cause: auth.users token columns were NULL; GoTrue requires empty strings.

update auth.users
set
  confirmation_token = coalesce(confirmation_token, ''),
  email_change = coalesce(email_change, ''),
  email_change_token_new = coalesce(email_change_token_new, ''),
  recovery_token = coalesce(recovery_token, '')
where email in (
  'demo.teacher@classroomxp.edu',
  'student1@school.edu',
  'student2@school.edu',
  'student3@school.edu',
  'student4@school.edu',
  'student5@school.edu',
  'student6@school.edu'
);

-- Ensure email identities exist (safe if already present)
insert into auth.identities (
  id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at
)
select
  gen_random_uuid(),
  u.id,
  u.email,
  'email',
  jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true, 'phone_verified', false),
  now(),
  now(),
  now()
from auth.users u
where u.email in (
  'demo.teacher@classroomxp.edu',
  'student1@school.edu',
  'student2@school.edu',
  'student3@school.edu',
  'student4@school.edu',
  'student5@school.edu',
  'student6@school.edu'
)
and not exists (
  select 1 from auth.identities i
  where i.user_id = u.id and i.provider = 'email'
);
