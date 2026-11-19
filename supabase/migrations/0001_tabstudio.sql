-- Tab Studio: аккаунты и синхронизация проектов между устройствами.
-- Выполните в Supabase: SQL Editor → New query → вставить → Run.

-- ---------- проекты ----------
create table if not exists public.projects (
  user_id    uuid not null references auth.users(id) on delete cascade,
  id         text not null check (char_length(id) between 1 and 64),
  data       jsonb,                       -- упакованный проект (ноты, аккорды, текст, метаданные)
  rev        integer not null default 0,  -- ревизия для оптимистической блокировки
  deleted    boolean not null default false,
  size_bytes integer generated always as (coalesce(octet_length(data::text), 0)) stored,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
create index if not exists projects_user_updated on public.projects (user_id, updated_at desc);

-- ---------- версии проектов (история) ----------
create table if not exists public.project_versions (
  user_id    uuid not null references auth.users(id) on delete cascade,
  id         text not null check (char_length(id) between 1 and 96),
  project_id text not null,
  label      text,
  rev        integer,
  at         bigint not null,
  data       jsonb not null,
  primary key (user_id, id)
);
create index if not exists versions_user_project on public.project_versions (user_id, project_id, at desc);

-- ---------- настройки, коллекции, история экспорта ----------
create table if not exists public.user_meta (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- ---------- защита строк: каждый видит только своё ----------
alter table public.projects         enable row level security;
alter table public.project_versions enable row level security;
alter table public.user_meta        enable row level security;

drop policy if exists "own projects" on public.projects;
create policy "own projects" on public.projects for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "own versions" on public.project_versions;
create policy "own versions" on public.project_versions for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "own meta" on public.user_meta;
create policy "own meta" on public.user_meta for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------- сохранение с проверкой ревизии ----------
-- Возвращает {ok, rev} или {conflict, rev, data}, если на сервере уже более новая ревизия.
create or replace function public.save_project(p_id text, p_data jsonb, p_base_rev integer, p_force boolean default false)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  cur_rev integer; cur_deleted boolean; cur_data jsonb; new_rev integer;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if octet_length(p_data::text) > 2000000 then raise exception 'project too large'; end if;
  select rev, deleted, data into cur_rev, cur_deleted, cur_data
    from public.projects where user_id = auth.uid() and id = p_id for update;
  if found and not p_force and not cur_deleted and cur_rev > coalesce(p_base_rev, 0) then
    return jsonb_build_object('conflict', true, 'rev', cur_rev, 'data', cur_data);
  end if;
  new_rev := coalesce(cur_rev, 0) + 1;
  insert into public.projects (user_id, id, data, rev, deleted, updated_at)
       values (auth.uid(), p_id, p_data, new_rev, false, now())
  on conflict (user_id, id) do update
     set data = excluded.data, rev = excluded.rev, deleted = false, updated_at = now();
  return jsonb_build_object('ok', true, 'rev', new_rev);
end $$;

-- Мягкое удаление: другие устройства узнают, что проект удалён.
create or replace function public.delete_project(p_id text)
returns void language plpgsql security invoker set search_path = public as $$
begin
  update public.projects set deleted = true, data = null, rev = rev + 1, updated_at = now()
   where user_id = auth.uid() and id = p_id;
  delete from public.project_versions where user_id = auth.uid() and project_id = p_id;
end $$;

-- Удаление аккаунта из приложения (обязательно по правилам App Store).
-- Файлы аудио приложение удаляет через Storage API перед вызовом.
create or replace function public.delete_account()
returns void language plpgsql security definer set search_path = public, auth as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  delete from auth.users where id = auth.uid();
end $$;
revoke all on function public.delete_account() from public, anon;
grant execute on function public.delete_account() to authenticated;
grant execute on function public.save_project(text, jsonb, integer, boolean) to authenticated;
grant execute on function public.delete_project(text) to authenticated;

-- ---------- хранилище исходных записей ----------
insert into storage.buckets (id, name, public, file_size_limit)
values ('audio', 'audio', false, 52428800)   -- 50 МБ на файл (лимит бесплатного тарифа Supabase)
on conflict (id) do nothing;

drop policy if exists "audio read own" on storage.objects;
create policy "audio read own" on storage.objects for select to authenticated
  using (bucket_id = 'audio' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "audio insert own" on storage.objects;
create policy "audio insert own" on storage.objects for insert to authenticated
  with check (bucket_id = 'audio' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "audio update own" on storage.objects;
create policy "audio update own" on storage.objects for update to authenticated
  using (bucket_id = 'audio' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "audio delete own" on storage.objects;
create policy "audio delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'audio' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------- мгновенные обновления на других устройствах ----------
do $$ begin
  alter publication supabase_realtime add table public.projects;
exception when duplicate_object then null; when undefined_object then null; end $$;
