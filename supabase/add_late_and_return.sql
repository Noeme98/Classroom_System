-- Late submissions + return for revision

alter table public.assignments add column if not exists allow_late boolean not null default true;
alter table public.submissions add column if not exists returned_for_revision boolean not null default false;
