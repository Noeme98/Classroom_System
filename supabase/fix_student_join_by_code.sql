-- Run in Supabase SQL Editor AFTER schema.sql.
-- Fixes students seeing "Invalid code" when the code is correct.

do $$
begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'classes'
  ) then
    raise exception 'Table public.classes is missing. Run supabase/schema.sql first.';
  end if;
end $$;

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

drop policy if exists "students can read classes to join" on public.classes;
create policy "students can read classes to join" on public.classes
for select using (public.get_my_profile_role() = 'student');
