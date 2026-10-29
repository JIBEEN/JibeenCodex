-- Run once in Supabase SQL Editor. All data access is through the server.
create extension if not exists pgcrypto;
create table public.project_settings(id integer primary key check(id=1),background_path text,reservation_token uuid,reserved_at timestamptz);
insert into public.project_settings(id) values(1);
create table public.letters(id uuid primary key default gen_random_uuid(),slot_number integer not null unique check(slot_number between 1 and 5),nickname text not null check(length(trim(nickname)) between 1 and 200),content text not null check(length(trim(content)) between 1 and 20000),password_hash text not null,created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create table public.rate_limits(key text primary key,window_start timestamptz not null default now(),attempts integer not null default 1);
alter table public.project_settings enable row level security;
alter table public.letters enable row level security;
alter table public.rate_limits enable row level security;
revoke all on public.project_settings,public.letters,public.rate_limits from anon,authenticated;
grant all on public.project_settings,public.letters,public.rate_limits to service_role;
create or replace function public.take_rate_limit(p_key text,p_max integer) returns boolean language plpgsql security definer set search_path=public as $$
declare hits integer;begin
insert into rate_limits(key) values(p_key) on conflict(key) do update set attempts=case when rate_limits.window_start<now()-interval '1 minute' then 1 else rate_limits.attempts+1 end,window_start=case when rate_limits.window_start<now()-interval '1 minute' then now() else rate_limits.window_start end returning attempts into hits;
return hits<=p_max;end;$$;
create or replace function public.reserve_background(p_token uuid) returns boolean language plpgsql security definer set search_path=public as $$
begin update project_settings set reservation_token=p_token,reserved_at=now() where id=1 and background_path is null and (reservation_token is null or reserved_at<now()-interval '5 minutes');return found;end;$$;
create or replace function public.finish_background(p_token uuid,p_path text) returns boolean language plpgsql security definer set search_path=public as $$
begin update project_settings set background_path=p_path,reservation_token=null,reserved_at=null where id=1 and background_path is null and reservation_token=p_token;return found;end;$$;
create or replace function public.release_background(p_token uuid) returns void language sql security definer set search_path=public as $$ update project_settings set reservation_token=null,reserved_at=null where id=1 and reservation_token=p_token and background_path is null;$$;
revoke all on function public.take_rate_limit(text,integer),public.reserve_background(uuid),public.finish_background(uuid,text),public.release_background(uuid) from public,anon,authenticated;
grant execute on function public.take_rate_limit(text,integer),public.reserve_background(uuid),public.finish_background(uuid,text),public.release_background(uuid) to service_role;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('memories','memories',false,10485760,array['image/jpeg']);
-- No public storage policies: server service role uploads and generates signed URLs.
