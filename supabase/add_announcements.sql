-- Class stream / announcements (run in Supabase SQL Editor if schema.sql was applied earlier)

create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  body text not null,
  link_url text,
  created_at timestamptz not null default now()
);

create index if not exists idx_announcements_class_id on public.announcements(class_id);
create index if not exists idx_announcements_created_at on public.announcements(created_at desc);

alter table public.announcements enable row level security;

drop policy if exists "teachers manage announcements" on public.announcements;
create policy "teachers manage announcements" on public.announcements
for all using (public.is_teacher_of_class(class_id))
with check (public.is_teacher_of_class(class_id));

drop policy if exists "students view announcements in enrolled class" on public.announcements;
create policy "students view announcements in enrolled class" on public.announcements
for select using (public.is_student_enrolled_in_class(class_id));
