-- Run in Supabase SQL Editor if you see 400 errors on assignments/submissions sync.
-- Safe to run multiple times.

alter table public.assignments add column if not exists resource_url text;
alter table public.assignments add column if not exists allow_late boolean not null default true;

alter table public.submissions add column if not exists returned_for_revision boolean not null default false;
