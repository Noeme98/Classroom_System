-- Core schema for Classroom System
-- Run in Supabase SQL Editor.

create extension if not exists pgcrypto;

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null,
  role text not null check (role in ('teacher', 'student')),
  full_name text,
  bio text,
  avatar_url text,
  created_at timestamptz not null default now()
);

-- Existing projects: add columns if the table was created before bio / avatar_url existed.
alter table public.profiles add column if not exists bio text;
alter table public.profiles add column if not exists avatar_url text;

create table if not exists classes (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references profiles(id) on delete cascade,
  name text not null,
  code text unique not null,
  created_at timestamptz not null default now()
);

create table if not exists class_enrollments (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references classes(id) on delete cascade,
  student_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (class_id, student_id)
);

create table if not exists assignments (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references classes(id) on delete cascade,
  title text not null,
  description text not null,
  due_date date not null,
  questions jsonb not null default '{"schemaVersion": 1, "items": []}'::jsonb,
  resource_url text,
  allow_late boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists submissions (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references assignments(id) on delete cascade,
  class_id uuid not null references classes(id) on delete cascade,
  student_id uuid not null references profiles(id) on delete cascade,
  answer text not null,
  answers jsonb,
  auto_score numeric(5,2),
  auto_max_score numeric(5,2),
  submitted_at timestamptz not null default now(),
  grade numeric(5,2),
  feedback text,
  graded_at timestamptz,
  returned_for_revision boolean not null default false,
  unique (assignment_id, student_id)
);

-- Quiz / auto-grade (safe on fresh DB and upgrades)
alter table public.assignments add column if not exists questions jsonb not null default '{"schemaVersion": 1, "items": []}'::jsonb;
alter table public.assignments add column if not exists resource_url text;
alter table public.assignments add column if not exists allow_late boolean not null default true;
alter table public.submissions add column if not exists returned_for_revision boolean not null default false;
alter table public.submissions add column if not exists answers jsonb;
alter table public.submissions add column if not exists auto_score numeric(5,2);
alter table public.submissions add column if not exists auto_max_score numeric(5,2);

create table if not exists xp_scores (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references classes(id) on delete cascade,
  student_id uuid not null references profiles(id) on delete cascade,
  xp integer not null default 0,
  updated_at timestamptz not null default now(),
  unique (class_id, student_id)
);

create table if not exists badges (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references profiles(id) on delete cascade,
  badge_key text not null,
  earned_at timestamptz not null default now(),
  unique (student_id, badge_key)
);

create table if not exists finalized_rankings (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references assignments(id) on delete cascade,
  class_id uuid not null references classes(id) on delete cascade,
  snapshot jsonb not null,
  finalized_at timestamptz not null default now(),
  unique (assignment_id)
);

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid references profiles(id) on delete cascade,
  recipient_role text check (recipient_role in ('teacher', 'student')),
  type text not null default 'info',
  title text not null,
  body text not null,
  meta jsonb not null default '{}'::jsonb,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists streaks (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null unique references profiles(id) on delete cascade,
  streak integer not null default 0,
  last_submission_date date,
  updated_at timestamptz not null default now()
);

create table if not exists announcements (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references classes(id) on delete cascade,
  author_id uuid not null references profiles(id) on delete cascade,
  body text not null,
  link_url text,
  created_at timestamptz not null default now()
);

alter table profiles enable row level security;
alter table classes enable row level security;
alter table class_enrollments enable row level security;
alter table assignments enable row level security;
alter table submissions enable row level security;
alter table xp_scores enable row level security;
alter table badges enable row level security;
alter table finalized_rankings enable row level security;
alter table notifications enable row level security;
alter table streaks enable row level security;
alter table announcements enable row level security;

create or replace function public.get_my_profile_role()
returns text
language sql
stable
as $$
  select role from public.profiles where id = auth.uid()
$$;

-- RLS helpers (SECURITY DEFINER breaks infinite recursion between classes <-> class_enrollments).
create or replace function public.is_teacher_of_class(p_class_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.classes c
    where c.id = p_class_id
      and c.teacher_id = auth.uid()
  );
$$;

create or replace function public.is_student_enrolled_in_class(p_class_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.class_enrollments e
    where e.class_id = p_class_id
      and e.student_id = auth.uid()
  );
$$;

create or replace function public.teacher_teaches_student(p_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.class_enrollments e
    join public.classes c on c.id = e.class_id
    where e.student_id = p_student_id
      and c.teacher_id = auth.uid()
  );
$$;

grant execute on function public.is_teacher_of_class(uuid) to authenticated;
grant execute on function public.is_student_enrolled_in_class(uuid) to authenticated;
grant execute on function public.teacher_teaches_student(uuid) to authenticated;

-- Join-by-code lookup (bypasses RLS so students can resolve a class before enrollment).
create or replace function public.lookup_class_by_join_code(p_code text)
returns table (id uuid, name text, code text)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.name, c.code
  from public.classes c
  where upper(trim(c.code)) = upper(trim(p_code))
  limit 1;
$$;

grant execute on function public.lookup_class_by_join_code(text) to authenticated;

-- Join + enroll in one step (bypasses RLS; uses auth.uid() as student).
create or replace function public.join_class_by_code(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_class record;
  v_uid uuid;
  v_code text;
begin
  v_uid := auth.uid();
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  v_code := upper(trim(p_code));
  if v_code = '' then
    return jsonb_build_object('ok', false, 'error', 'invalid_code');
  end if;

  select c.id, c.name, c.code into v_class
  from public.classes c
  where upper(trim(c.code)) = v_code
  limit 1;

  if v_class.id is null then
    select c.id, c.name, c.code into v_class
    from public.classes c
    where upper(trim(replace(c.code, '0', 'O'))) = replace(v_code, '0', 'O')
       or upper(trim(replace(c.code, 'O', '0'))) = replace(v_code, 'O', '0')
    limit 1;
  end if;

  if v_class.id is null then
    return jsonb_build_object('ok', false, 'error', 'invalid_code');
  end if;

  if exists (
    select 1 from public.class_enrollments e
    where e.class_id = v_class.id and e.student_id = v_uid
  ) then
    return jsonb_build_object('ok', false, 'error', 'already_joined', 'name', v_class.name);
  end if;

  insert into public.class_enrollments (class_id, student_id)
  values (v_class.id, v_uid);

  return jsonb_build_object(
    'ok', true,
    'id', v_class.id,
    'name', v_class.name,
    'code', v_class.code
  );
exception
  when unique_violation then
    return jsonb_build_object('ok', false, 'error', 'already_joined', 'name', v_class.name);
end;
$$;

grant execute on function public.join_class_by_code(text) to authenticated;

drop policy if exists "profiles select own" on profiles;
create policy "profiles select own" on profiles
for select using (auth.uid() = id);

drop policy if exists "authenticated can read profiles" on profiles;
create policy "authenticated can read profiles" on profiles
for select using (auth.uid() is not null);

drop policy if exists "profiles upsert own" on profiles;
drop policy if exists "profiles insert own" on profiles;
drop policy if exists "profiles update own" on profiles;
-- Split INSERT/UPDATE so signup + profile creation behave reliably under RLS.
create policy "profiles insert own" on profiles
for insert with check (auth.uid() = id);

create policy "profiles update own" on profiles
for update using (auth.uid() = id)
with check (auth.uid() = id);

drop policy if exists "teachers manage classes" on classes;
create policy "teachers manage classes" on classes
for all using (teacher_id = auth.uid())
with check (teacher_id = auth.uid());

drop policy if exists "students can view enrolled classes" on classes;
create policy "students can view enrolled classes" on classes
for select using (public.is_student_enrolled_in_class(id));

-- Required for join-by-code: students must read a class row before they are enrolled.
drop policy if exists "students can read classes to join" on classes;
create policy "students can read classes to join" on classes
for select using (public.get_my_profile_role() = 'student');

drop policy if exists "students manage own enrollments" on class_enrollments;
create policy "students manage own enrollments" on class_enrollments
for all using (student_id = auth.uid())
with check (student_id = auth.uid());

drop policy if exists "teachers view enrollments in own class" on class_enrollments;
create policy "teachers view enrollments in own class" on class_enrollments
for select using (public.is_teacher_of_class(class_id));

drop policy if exists "teachers manage assignments" on assignments;
create policy "teachers manage assignments" on assignments
for all using (public.is_teacher_of_class(class_id))
with check (public.is_teacher_of_class(class_id));

drop policy if exists "students view assignments in enrolled classes" on assignments;
create policy "students view assignments in enrolled classes" on assignments
for select using (public.is_student_enrolled_in_class(class_id));

drop policy if exists "teachers manage announcements" on announcements;
create policy "teachers manage announcements" on announcements
for all using (public.is_teacher_of_class(class_id))
with check (public.is_teacher_of_class(class_id));

drop policy if exists "students view announcements in enrolled class" on announcements;
create policy "students view announcements in enrolled class" on announcements
for select using (public.is_student_enrolled_in_class(class_id));

drop policy if exists "students manage own submissions" on submissions;
create policy "students manage own submissions" on submissions
for all using (student_id = auth.uid())
with check (student_id = auth.uid());

drop policy if exists "teachers view and update submissions in own class" on submissions;
create policy "teachers view and update submissions in own class" on submissions
for select using (public.is_teacher_of_class(class_id));

drop policy if exists "teachers update submissions in own class" on submissions;
create policy "teachers update submissions in own class" on submissions
for update using (public.is_teacher_of_class(class_id));

drop policy if exists "students view own xp" on xp_scores;
create policy "students view own xp" on xp_scores
for select using (student_id = auth.uid());

drop policy if exists "students manage own xp in enrolled classes" on xp_scores;
create policy "students manage own xp in enrolled classes" on xp_scores
for all using (
  student_id = auth.uid()
  and public.is_student_enrolled_in_class(class_id)
)
with check (
  student_id = auth.uid()
  and public.is_student_enrolled_in_class(class_id)
);

drop policy if exists "teachers manage xp for own class" on xp_scores;
create policy "teachers manage xp for own class" on xp_scores
for all using (public.is_teacher_of_class(class_id))
with check (public.is_teacher_of_class(class_id));

drop policy if exists "students view own badges" on badges;
create policy "students view own badges" on badges
for select using (student_id = auth.uid());

drop policy if exists "students manage own badges" on badges;
create policy "students manage own badges" on badges
for all using (student_id = auth.uid())
with check (student_id = auth.uid());

drop policy if exists "teachers view badges for own classes" on badges;
create policy "teachers view badges for own classes" on badges
for select using (public.teacher_teaches_student(student_id));

drop policy if exists "teachers manage finalized rankings" on finalized_rankings;
create policy "teachers manage finalized rankings" on finalized_rankings
for all using (public.is_teacher_of_class(class_id))
with check (public.is_teacher_of_class(class_id));

drop policy if exists "students view finalized rankings in enrolled class" on finalized_rankings;
create policy "students view finalized rankings in enrolled class" on finalized_rankings
for select using (public.is_student_enrolled_in_class(class_id));

drop policy if exists "users view own notifications" on notifications;
create policy "users view own notifications" on notifications
for select using (
  recipient_id = auth.uid()
  or recipient_role = public.get_my_profile_role()
);

drop policy if exists "users update own notifications" on notifications;
create policy "users update own notifications" on notifications
for update using (
  recipient_id = auth.uid()
  or recipient_role = public.get_my_profile_role()
);

drop policy if exists "teachers insert notifications for own classes" on notifications;
create policy "teachers insert notifications for own classes" on notifications
for insert with check (public.get_my_profile_role() = 'teacher');

drop policy if exists "students view own streak" on streaks;
create policy "students view own streak" on streaks
for select using (student_id = auth.uid());

drop policy if exists "students update own streak" on streaks;
create policy "students update own streak" on streaks
for all using (student_id = auth.uid())
with check (student_id = auth.uid());

drop policy if exists "teachers view streak for own classes" on streaks;
create policy "teachers view streak for own classes" on streaks
for select using (public.teacher_teaches_student(student_id));

create index if not exists idx_classes_teacher_id on classes(teacher_id);
create index if not exists idx_class_enrollments_student_id on class_enrollments(student_id);
create index if not exists idx_class_enrollments_class_id on class_enrollments(class_id);
create index if not exists idx_assignments_class_id on assignments(class_id);
create index if not exists idx_assignments_due_date on assignments(due_date);
create index if not exists idx_submissions_class_id on submissions(class_id);
create index if not exists idx_submissions_assignment_id on submissions(assignment_id);
create index if not exists idx_submissions_student_id on submissions(student_id);
create index if not exists idx_xp_scores_student_id on xp_scores(student_id);
create index if not exists idx_xp_scores_class_id on xp_scores(class_id);
create index if not exists idx_badges_student_id on badges(student_id);
create index if not exists idx_finalized_rankings_class_id on finalized_rankings(class_id);
create index if not exists idx_notifications_recipient_id on notifications(recipient_id);
create index if not exists idx_notifications_recipient_role on notifications(recipient_role);
create index if not exists idx_notifications_created_at on notifications(created_at desc);
create index if not exists idx_notifications_is_read on notifications(is_read);
create index if not exists idx_streaks_student_id on streaks(student_id);
create index if not exists idx_announcements_class_id on announcements(class_id);
create index if not exists idx_announcements_created_at on announcements(created_at desc);

-- Profile row: created when auth.users has a confirmed email timestamp.
-- With Authentication → Providers → Email → "Confirm email" OFF (recommended for this app),
-- Supabase sets email_confirmed_at on signup; handle_new_user() inserts the profile immediately.
-- With "Confirm email" ON, the row is created on first insert only if the provider already confirmed the address,
-- or later via handle_auth_email_confirmed() when the user verifies.
create or replace function public.upsert_profile_from_auth_meta(
  p_user_id uuid,
  p_email text,
  p_meta jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_name text;
begin
  v_role := coalesce(nullif(trim(p_meta->>'role'), ''), 'student');
  if v_role not in ('teacher', 'student') then
    v_role := 'student';
  end if;
  v_name := nullif(trim(p_meta->>'full_name'), '');

  insert into public.profiles (id, email, role, full_name)
  values (
    p_user_id,
    coalesce(p_email, ''),
    v_role,
    v_name
  )
  on conflict (id) do update set
    email = excluded.email,
    role = excluded.role,
    full_name = coalesce(excluded.full_name, profiles.full_name);
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email_confirmed_at is null then
    return new;
  end if;
  perform public.upsert_profile_from_auth_meta(new.id, new.email, new.raw_user_meta_data);
  return new;
end;
$$;

create or replace function public.handle_auth_email_confirmed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.email_confirmed_at is null and new.email_confirmed_at is not null then
    perform public.upsert_profile_from_auth_meta(new.id, new.email, new.raw_user_meta_data);
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute procedure public.handle_new_user();

drop trigger if exists on_auth_user_email_confirmed on auth.users;
create trigger on_auth_user_email_confirmed
  after update of email_confirmed_at on auth.users
  for each row
  when (old.email_confirmed_at is null and new.email_confirmed_at is not null)
  execute procedure public.handle_auth_email_confirmed();

-- —— Storage: profile avatars (public bucket, one folder per user id) ——
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists "Public read avatars" on storage.objects;
create policy "Public read avatars"
on storage.objects for select
to public
using (bucket_id = 'avatars');

drop policy if exists "Users insert own avatar" on storage.objects;
create policy "Users insert own avatar"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users update own avatar" on storage.objects;
create policy "Users update own avatar"
on storage.objects for update
to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users delete own avatar" on storage.objects;
create policy "Users delete own avatar"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- Server-authoritative grading + XP bonus transaction.
create or replace function public.grade_submission_with_bonus(
  p_submission_id uuid,
  p_score numeric,
  p_feedback text default ''
)
returns table (
  submission_id uuid,
  class_id uuid,
  student_id uuid,
  applied_score numeric,
  bonus_xp integer,
  xp_after integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_submission public.submissions%rowtype;
  v_bonus integer := 0;
  v_next_xp integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if p_submission_id is null then
    raise exception 'Missing submission id';
  end if;
  if p_score is null or p_score < 0 or p_score > 100 then
    raise exception 'Score must be between 0 and 100';
  end if;

  select *
  into v_submission
  from public.submissions s
  where s.id = p_submission_id
  for update;

  if not found then
    raise exception 'Submission not found';
  end if;
  if not public.is_teacher_of_class(v_submission.class_id) then
    raise exception 'Not allowed to grade this submission';
  end if;

  update public.submissions
  set
    grade = p_score,
    feedback = coalesce(p_feedback, ''),
    graded_at = now(),
    returned_for_revision = false
  where id = p_submission_id;

  if p_score >= 95 then v_bonus := 12;
  elsif p_score >= 90 then v_bonus := 10;
  elsif p_score >= 85 then v_bonus := 7;
  elsif p_score >= 75 then v_bonus := 4;
  else v_bonus := 2;
  end if;

  insert into public.xp_scores (class_id, student_id, xp, updated_at)
  values (v_submission.class_id, v_submission.student_id, v_bonus, now())
  on conflict (class_id, student_id)
  do update
    set xp = public.xp_scores.xp + excluded.xp,
        updated_at = now()
  returning xp into v_next_xp;

  return query
  select
    v_submission.id,
    v_submission.class_id,
    v_submission.student_id,
    p_score,
    v_bonus,
    v_next_xp;
end;
$$;

grant execute on function public.grade_submission_with_bonus(uuid, numeric, text) to authenticated;
