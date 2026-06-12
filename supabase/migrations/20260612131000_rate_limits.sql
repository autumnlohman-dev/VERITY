-- C2 / H6: server-side rate limiting for the Anthropic-backed audit routes.
--
-- A small fixed-window counter table plus an atomic increment function. The app
-- calls rate_limit_hit() through the service-role admin client (so it works for
-- anonymous guests too) and rejects the request when the returned count for the
-- current window exceeds the caller's limit.

create table if not exists public.rate_limits (
  bucket text not null,
  window_start timestamptz not null,
  count integer not null default 0,
  primary key (bucket, window_start)
);

-- Only the service role (which bypasses RLS) may read/write this table.
alter table public.rate_limits enable row level security;

-- Atomic fixed-window hit: increments the current window's counter for a bucket
-- and returns the new count. Older windows for the same bucket are pruned so the
-- table stays ~one row per active bucket.
create or replace function public.rate_limit_hit(
  p_bucket text,
  p_window_seconds integer
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window_start timestamptz;
  v_count integer;
begin
  v_window_start := to_timestamp(
    floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds
  );

  delete from public.rate_limits
    where bucket = p_bucket and window_start < v_window_start;

  insert into public.rate_limits (bucket, window_start, count)
    values (p_bucket, v_window_start, 1)
  on conflict (bucket, window_start)
    do update set count = public.rate_limits.count + 1
  returning count into v_count;

  return v_count;
end;
$$;

revoke all on function public.rate_limit_hit(text, integer) from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, integer) to service_role;
