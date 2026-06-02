-- Run once in Supabase SQL Editor to re-apply profile trigger logic from schema.sql.
--
-- Works with both auth modes:
-- • "Confirm email" OFF — user gets email_confirmed_at on insert; profile is created on signup (app expects this).
-- • "Confirm email" ON — profile is deferred until email_confirmed_at is set; use this file if you need that behavior.

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
