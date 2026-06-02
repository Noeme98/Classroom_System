-- Optional link/attachment URL on assignments (PDF, Drive, etc.)

alter table public.assignments add column if not exists resource_url text;
