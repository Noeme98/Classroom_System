-- Phase 1: server-authoritative grading + XP bonus in one transaction.
-- Safe to run multiple times.

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
