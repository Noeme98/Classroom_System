-- =============================================================================
-- ClassroomXP — permanent demo data (run in Supabase SQL Editor)
-- =============================================================================
-- Prerequisite: schema.sql (+ fix_student_join_by_code.sql) already applied.
--
-- Creates demo auth users, profiles, 3 subjects, 6 students, assignments,
-- submissions, XP, badges, streaks, notifications, and finalized rankings.
--
-- Demo logins (password for all): Demo1234!
--   Teacher: demo.teacher@classroomxp.edu
--   Students: student1@school.edu … student6@school.edu
--
-- Join codes: MATH10 | SCI9BIO | ENG8LIT
--
-- Safe to re-run: uses fixed UUIDs and ON CONFLICT.
-- =============================================================================

create extension if not exists pgcrypto;

-- ── Fixed UUIDs ─────────────────────────────────────────────────────────────
-- Teacher
-- a0000001-0001-4000-8000-000000000001  demo.teacher@classroomxp.edu
-- Students
-- a0000001-0001-4000-8000-000000000011  student1@school.edu
-- a0000001-0001-4000-8000-000000000012  student2@school.edu
-- a0000001-0001-4000-8000-000000000013  student3@school.edu
-- a0000001-0001-4000-8000-000000000014  student4@school.edu
-- a0000001-0001-4000-8000-000000000015  student5@school.edu
-- a0000001-0001-4000-8000-000000000016  student6@school.edu

do $seed$
declare
  v_instance uuid := '00000000-0000-0000-0000-000000000000';
  v_pw text := extensions.crypt('Demo1234!', extensions.gen_salt('bf'));
  v_teacher uuid := 'a0000001-0001-4000-8000-000000000001';
  v_s1 uuid := 'a0000001-0001-4000-8000-000000000011';
  v_s2 uuid := 'a0000001-0001-4000-8000-000000000012';
  v_s3 uuid := 'a0000001-0001-4000-8000-000000000013';
  v_s4 uuid := 'a0000001-0001-4000-8000-000000000014';
  v_s5 uuid := 'a0000001-0001-4000-8000-000000000015';
  v_s6 uuid := 'a0000001-0001-4000-8000-000000000016';
  v_c_math uuid := 'b0000001-0001-4000-8000-000000000101';
  v_c_sci uuid := 'b0000001-0001-4000-8000-000000000102';
  v_c_eng uuid := 'b0000001-0001-4000-8000-000000000103';
begin
  -- ── Auth users ───────────────────────────────────────────────────────────
  -- Token columns must be '' not NULL or login returns "Database error querying schema".
  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, recovery_token,
    is_super_admin, is_sso_user
  ) values
    (v_teacher, v_instance, 'authenticated', 'authenticated', 'demo.teacher@classroomxp.edu', v_pw,
     now(), '{"provider":"email","providers":["email"]}', '{"role":"teacher","full_name":"Demo Teacher"}',
     now(), now(), '', '', '', '', false, false),
    (v_s1, v_instance, 'authenticated', 'authenticated', 'student1@school.edu', v_pw,
     now(), '{"provider":"email","providers":["email"]}', '{"role":"student","full_name":"Neil Francis Layosa"}',
     now(), now(), '', '', '', '', false, false),
    (v_s2, v_instance, 'authenticated', 'authenticated', 'student2@school.edu', v_pw,
     now(), '{"provider":"email","providers":["email"]}', '{"role":"student","full_name":"Ava Cruz"}',
     now(), now(), '', '', '', '', false, false),
    (v_s3, v_instance, 'authenticated', 'authenticated', 'student3@school.edu', v_pw,
     now(), '{"provider":"email","providers":["email"]}', '{"role":"student","full_name":"Jules Santos"}',
     now(), now(), '', '', '', '', false, false),
    (v_s4, v_instance, 'authenticated', 'authenticated', 'student4@school.edu', v_pw,
     now(), '{"provider":"email","providers":["email"]}', '{"role":"student","full_name":"Marco Reyes"}',
     now(), now(), '', '', '', '', false, false),
    (v_s5, v_instance, 'authenticated', 'authenticated', 'student5@school.edu', v_pw,
     now(), '{"provider":"email","providers":["email"]}', '{"role":"student","full_name":"Darla Santos"}',
     now(), now(), '', '', '', '', false, false),
    (v_s6, v_instance, 'authenticated', 'authenticated', 'student6@school.edu', v_pw,
     now(), '{"provider":"email","providers":["email"]}', '{"role":"student","full_name":"Miguel Torres"}',
     now(), now(), '', '', '', '', false, false)
  on conflict (id) do update set
    email = excluded.email,
    encrypted_password = excluded.encrypted_password,
    email_confirmed_at = coalesce(auth.users.email_confirmed_at, now()),
    raw_user_meta_data = excluded.raw_user_meta_data,
    confirmation_token = '',
    email_change = '',
    email_change_token_new = '',
    recovery_token = '';

  -- Identities (required for email login on newer Supabase)
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
  where u.id in (v_teacher, v_s1, v_s2, v_s3, v_s4, v_s5, v_s6)
    and not exists (
      select 1 from auth.identities i
      where i.user_id = u.id and i.provider = 'email'
    );

  -- ── Profiles ──────────────────────────────────────────────────────────────
  insert into public.profiles (id, email, role, full_name)
  values
    (v_teacher, 'demo.teacher@classroomxp.edu', 'teacher', 'Demo Teacher'),
    (v_s1, 'student1@school.edu', 'student', 'Neil Francis Layosa'),
    (v_s2, 'student2@school.edu', 'student', 'Ava Cruz'),
    (v_s3, 'student3@school.edu', 'student', 'Jules Santos'),
    (v_s4, 'student4@school.edu', 'student', 'Marco Reyes'),
    (v_s5, 'student5@school.edu', 'student', 'Darla Santos'),
    (v_s6, 'student6@school.edu', 'student', 'Miguel Torres')
  on conflict (id) do update set
    email = excluded.email,
    role = excluded.role,
    full_name = excluded.full_name;

  -- ── Classes (subjects) ───────────────────────────────────────────────────
  insert into public.classes (id, teacher_id, name, code, created_at)
  values
    (v_c_math, v_teacher, 'General Mathematics', 'MATH10', now() - interval '30 days'),
    (v_c_sci, v_teacher, 'Science 9 — Biology', 'SCI9BIO', now() - interval '28 days'),
    (v_c_eng, v_teacher, 'English 8 — Literature', 'ENG8LIT', now() - interval '25 days')
  on conflict (id) do update set
    name = excluded.name,
    code = excluded.code,
    teacher_id = excluded.teacher_id;

  -- ── Enrollments ─────────────────────────────────────────────────────────
  insert into public.class_enrollments (class_id, student_id)
  values
    (v_c_math, v_s1), (v_c_math, v_s2), (v_c_math, v_s4), (v_c_math, v_s5), (v_c_math, v_s6),
    (v_c_sci, v_s1), (v_c_sci, v_s2), (v_c_sci, v_s3), (v_c_sci, v_s5), (v_c_sci, v_s6),
    (v_c_eng, v_s1), (v_c_eng, v_s3), (v_c_eng, v_s4), (v_c_eng, v_s5)
  on conflict (class_id, student_id) do nothing;

  -- ── Assignments ─────────────────────────────────────────────────────────
  insert into public.assignments (id, class_id, title, description, due_date, questions, created_at)
  values
    (
      'c0000001-0001-4000-8000-000000000201',
      v_c_math,
      'Linear Equations Worksheet',
      'Solve all items and show complete solution steps.',
      (current_date - 2),
      '{"schemaVersion": 1, "items": []}'::jsonb,
      now() - interval '14 days'
    ),
    (
      'c0000001-0001-4000-8000-000000000202',
      v_c_math,
      'Word Problems Set A',
      'Eight word problems — define variables before solving.',
      current_date,
      '{"schemaVersion": 1, "items": []}'::jsonb,
      now() - interval '7 days'
    ),
    (
      'c0000001-0001-4000-8000-000000000203',
      v_c_math,
      'Quiz 2 — Functions',
      'Short auto-graded quiz on slope and intercepts.',
      (current_date + 7),
      '{"schemaVersion": 1, "items": [
        {"id": "q1", "type": "mcq", "prompt": "Slope of y = 2x + 3?", "points": 5,
         "options": [{"id":"a","label":"2"},{"id":"b","label":"3"},{"id":"c","label":"5"},{"id":"d","label":"-2"}],
         "correctOptionId": "a"},
        {"id": "q2", "type": "true_false", "prompt": "y = -x + 1 has negative slope.", "points": 5, "correct": true},
        {"id": "q3", "type": "identification", "prompt": "y-intercept of y = 4x - 7?", "points": 5, "acceptableAnswers": ["-7"]}
      ]}'::jsonb,
      now() - interval '3 days'
    ),
    (
      'c0000001-0001-4000-8000-000000000204',
      v_c_sci,
      'Cell Structure Comparison',
      'Compare plant and animal cells with a labeled diagram.',
      (current_date - 5),
      '{"schemaVersion": 1, "items": []}'::jsonb,
      now() - interval '12 days'
    ),
    (
      'c0000001-0001-4000-8000-000000000205',
      v_c_sci,
      'Microscope Lab Report',
      'Submit observation notes and three labeled sketches.',
      (current_date + 3),
      '{"schemaVersion": 1, "items": []}'::jsonb,
      now() - interval '6 days'
    ),
    (
      'c0000001-0001-4000-8000-000000000206',
      v_c_sci,
      'Lab Safety Summary',
      'One-page summary of classroom lab safety rules.',
      (current_date + 14),
      '{"schemaVersion": 1, "items": []}'::jsonb,
      now() - interval '2 days'
    ),
    (
      'c0000001-0001-4000-8000-000000000207',
      v_c_eng,
      'Poem Reflection',
      'One-page reflection on the assigned poem.',
      (current_date - 1),
      '{"schemaVersion": 1, "items": []}'::jsonb,
      now() - interval '10 days'
    ),
    (
      'c0000001-0001-4000-8000-000000000208',
      v_c_eng,
      'Short Story Analysis',
      'Analyze conflict, theme, and character motivation.',
      (current_date + 5),
      '{"schemaVersion": 1, "items": []}'::jsonb,
      now() - interval '5 days'
    ),
    (
      'c0000001-0001-4000-8000-000000000209',
      v_c_eng,
      'Vocabulary Journal',
      'Ten new words from this week reading with sample sentences.',
      (current_date + 12),
      '{"schemaVersion": 1, "items": []}'::jsonb,
      now() - interval '1 day'
    )
  on conflict (id) do update set
    title = excluded.title,
    description = excluded.description,
    due_date = excluded.due_date,
    questions = excluded.questions;

  -- ── Submissions ───────────────────────────────────────────────────────────
  insert into public.submissions (
    id, assignment_id, class_id, student_id, answer, submitted_at, grade, feedback, graded_at
  ) values
    ('d0000001-0001-4000-8000-000000000301', 'c0000001-0001-4000-8000-000000000201', v_c_math, v_s1,
     'Completed all linear equations with full steps.', now() - interval '3 days', 98,
     'Excellent work — very clear algebraic steps.', now() - interval '2 days'),
    ('d0000001-0001-4000-8000-000000000302', 'c0000001-0001-4000-8000-000000000201', v_c_math, v_s2,
     'Submitted solutions; review #9 transposition.', now() - interval '3 days', 85,
     'Good effort. Review transposition on problem 9.', now() - interval '2 days'),
    ('d0000001-0001-4000-8000-000000000303', 'c0000001-0001-4000-8000-000000000201', v_c_math, v_s4,
     'All items answered with work shown.', now() - interval '2 days', 90,
     'Strong solutions overall.', now() - interval '1 day'),
    ('d0000001-0001-4000-8000-000000000304', 'c0000001-0001-4000-8000-000000000202', v_c_math, v_s1,
     'Word problem setups attached.', now(), null, '', null),
    ('d0000001-0001-4000-8000-000000000305', 'c0000001-0001-4000-8000-000000000202', v_c_math, v_s5,
     'Finished 6 of 8 problems.', now(), null, '', null),
    ('d0000001-0001-4000-8000-000000000306', 'c0000001-0001-4000-8000-000000000204', v_c_sci, v_s2,
     'Comparison chart with organelle functions.', now() - interval '6 days', 92,
     'Thorough comparison.', now() - interval '5 days'),
    ('d0000001-0001-4000-8000-000000000307', 'c0000001-0001-4000-8000-000000000204', v_c_sci, v_s1,
     'Plant vs animal cell diagram.', now() - interval '5 days', 88,
     'Good work. Add vacuole comparison.', now() - interval '4 days'),
    ('d0000001-0001-4000-8000-000000000308', 'c0000001-0001-4000-8000-000000000204', v_c_sci, v_s3,
     'Chart with textbook citations.', now() - interval '5 days', 94,
     'Excellent detail.', now() - interval '4 days'),
    ('d0000001-0001-4000-8000-000000000309', 'c0000001-0001-4000-8000-000000000205', v_c_sci, v_s6,
     'Lab notes and sketches.', now() - interval '1 day', null, '', null),
    ('d0000001-0001-4000-8000-000000000310', 'c0000001-0001-4000-8000-000000000207', v_c_eng, v_s3,
     'Reflection on imagery and tone.', now() - interval '1 day', null, '', null),
    ('d0000001-0001-4000-8000-000000000311', 'c0000001-0001-4000-8000-000000000208', v_c_eng, v_s1,
     'Analysis of protagonist and climax.', now() - interval '2 days', 91,
     'Insightful reading.', now() - interval '1 day'),
    ('d0000001-0001-4000-8000-000000000312', 'c0000001-0001-4000-8000-000000000208', v_c_eng, v_s4,
     'Draft analysis attached.', now(), null, '', null)
  on conflict (assignment_id, student_id) do update set
    answer = excluded.answer,
    grade = excluded.grade,
    feedback = excluded.feedback,
    graded_at = excluded.graded_at;

  -- ── XP ──────────────────────────────────────────────────────────────────
  insert into public.xp_scores (class_id, student_id, xp, updated_at)
  values
    (v_c_math, v_s1, 142, now()), (v_c_math, v_s2, 118, now()), (v_c_math, v_s4, 96, now()),
    (v_c_math, v_s5, 72, now()), (v_c_math, v_s6, 48, now()),
    (v_c_sci, v_s1, 108, now()), (v_c_sci, v_s2, 124, now()), (v_c_sci, v_s3, 115, now()),
    (v_c_sci, v_s6, 62, now()),
    (v_c_eng, v_s1, 88, now()), (v_c_eng, v_s3, 102, now()), (v_c_eng, v_s4, 76, now())
  on conflict (class_id, student_id) do update set
    xp = excluded.xp,
    updated_at = now();

  -- ── Badges ──────────────────────────────────────────────────────────────
  insert into public.badges (student_id, badge_key)
  values
    (v_s1, 'First Step'), (v_s1, 'On a Roll'), (v_s1, 'Rising Star'),
    (v_s2, 'First Step'), (v_s2, 'Early Bird'), (v_s2, 'Scholar'),
    (v_s3, 'First Step'), (v_s3, 'Literature Star'),
    (v_s4, 'First Step'),
    (v_s5, 'First Step')
  on conflict (student_id, badge_key) do nothing;

  -- ── Streaks ─────────────────────────────────────────────────────────────
  insert into public.streaks (student_id, streak, last_submission_date, updated_at)
  values
    (v_s1, 6, current_date, now()),
    (v_s2, 4, current_date - 1, now()),
    (v_s3, 5, current_date - 1, now()),
    (v_s4, 3, current_date, now()),
    (v_s5, 2, current_date, now()),
    (v_s6, 1, current_date - 1, now())
  on conflict (student_id) do update set
    streak = excluded.streak,
    last_submission_date = excluded.last_submission_date,
    updated_at = now();

  -- ── Finalized rankings ────────────────────────────────────────────────────
  insert into public.finalized_rankings (assignment_id, class_id, snapshot, finalized_at)
  values
    (
      'c0000001-0001-4000-8000-000000000201',
      v_c_math,
      '{"leaderboard":[
        {"rank":1,"email":"student1@school.edu","xp":142},
        {"rank":2,"email":"student2@school.edu","xp":118},
        {"rank":3,"email":"student4@school.edu","xp":96}
      ],"awardedBonuses":[
        {"email":"student1@school.edu","rank":1,"bonusXP":20},
        {"email":"student2@school.edu","rank":2,"bonusXP":15},
        {"email":"student4@school.edu","rank":3,"bonusXP":12}
      ]}'::jsonb,
      now() - interval '1 day'
    ),
    (
      'c0000001-0001-4000-8000-000000000204',
      v_c_sci,
      '{"leaderboard":[
        {"rank":1,"email":"student3@school.edu","xp":115},
        {"rank":2,"email":"student2@school.edu","xp":124},
        {"rank":3,"email":"student1@school.edu","xp":108}
      ],"awardedBonuses":[
        {"email":"student3@school.edu","rank":1,"bonusXP":20},
        {"email":"student2@school.edu","rank":2,"bonusXP":15},
        {"email":"student1@school.edu","rank":3,"bonusXP":12}
      ]}'::jsonb,
      now() - interval '3 days'
    )
  on conflict (assignment_id) do update set
    snapshot = excluded.snapshot,
    finalized_at = excluded.finalized_at;

  -- ── Notifications ─────────────────────────────────────────────────────────
  insert into public.notifications (id, recipient_id, recipient_role, type, title, body, meta, is_read, created_at)
  values
    (
      'e0000001-0001-4000-8000-000000000401',
      v_s1, null, 'grade', 'Grade posted',
      'You earned 98 on Linear Equations Worksheet.',
      jsonb_build_object('classId', v_c_math, 'assignmentId', 'c0000001-0001-4000-8000-000000000201'),
      false, now() - interval '2 days'
    ),
    (
      'e0000001-0001-4000-8000-000000000402',
      v_s1, null, 'ranking', 'Ranking finalized',
      'General Mathematics — Linear Equations leaderboard is locked.',
      jsonb_build_object('classId', v_c_math, 'assignmentId', 'c0000001-0001-4000-8000-000000000201'),
      false, now() - interval '1 day'
    ),
    (
      'e0000001-0001-4000-8000-000000000403',
      v_s1, null, 'assignment', 'New assignment: Quiz 2',
      'Quiz 2 — Functions is now open.',
      jsonb_build_object('classId', v_c_math, 'assignmentId', 'c0000001-0001-4000-8000-000000000203'),
      false, now() - interval '3 days'
    ),
    (
      'e0000001-0001-4000-8000-000000000404',
      null, 'teacher', 'assignment', '6 submissions pending review',
      'Students submitted work waiting for grades.',
      '{}'::jsonb,
      false, now()
    )
  on conflict (id) do nothing;

  raise notice 'ClassroomXP demo seed complete.';
  raise notice 'Teacher: demo.teacher@classroomxp.edu / Demo1234!';
  raise notice 'Student: student1@school.edu … student6@school.edu / Demo1234!';
  raise notice 'Join codes: MATH10, SCI9BIO, ENG8LIT';
end;
$seed$;
