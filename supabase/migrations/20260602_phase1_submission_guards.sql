-- Phase 1: data-integrity guardrails for submissions + xp.
-- Safe to run multiple times.

alter table public.submissions
  drop constraint if exists submissions_grade_range_chk;
alter table public.submissions
  add constraint submissions_grade_range_chk
  check (grade is null or (grade >= 0 and grade <= 100)) not valid;

alter table public.submissions
  drop constraint if exists submissions_grade_timestamp_chk;
alter table public.submissions
  add constraint submissions_grade_timestamp_chk
  check (
    (grade is null and graded_at is null)
    or (grade is not null and graded_at is not null)
  ) not valid;

alter table public.submissions
  drop constraint if exists submissions_auto_score_nonnegative_chk;
alter table public.submissions
  add constraint submissions_auto_score_nonnegative_chk
  check (auto_score is null or auto_score >= 0) not valid;

alter table public.submissions
  drop constraint if exists submissions_auto_max_positive_chk;
alter table public.submissions
  add constraint submissions_auto_max_positive_chk
  check (auto_max_score is null or auto_max_score > 0) not valid;

alter table public.submissions
  drop constraint if exists submissions_auto_score_le_max_chk;
alter table public.submissions
  add constraint submissions_auto_score_le_max_chk
  check (
    auto_score is null
    or auto_max_score is null
    or auto_score <= auto_max_score
  ) not valid;

alter table public.submissions
  drop constraint if exists submissions_answer_not_blank_chk;
alter table public.submissions
  add constraint submissions_answer_not_blank_chk
  check (length(btrim(answer)) > 0) not valid;

alter table public.xp_scores
  drop constraint if exists xp_scores_nonnegative_chk;
alter table public.xp_scores
  add constraint xp_scores_nonnegative_chk
  check (xp >= 0) not valid;
