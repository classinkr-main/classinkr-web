-- Admin dashboard query performance.
--
-- Replaces large client_events / docs_ai_chunks row scans that were aggregated
-- in Node with SQL aggregates, plus supporting indexes. Read-only: indexes,
-- two stable functions, and one view — no table semantics change.
--
-- Non-breaking: every caller prefers these objects but falls back to the prior
-- row-scan path on any error, so the app keeps working before/after apply. The
-- speedup activates once this migration is applied.

-- Indexes for time-ranged client_events aggregates -------------------------
create index if not exists client_events_created_at_event_idx
  on public.client_events (created_at desc, event_name);

create index if not exists client_events_docs_page_view_idx
  on public.client_events (created_at desc)
  where event_name = 'page_view';

-- P1: /docs/* page-view counts since a cutoff (admin docs analytics) --------
create or replace function public.admin_docs_page_view_counts(since_ts timestamptz)
returns table (page text, views bigint)
language sql
stable
as $$
  select split_part(page, '?', 1) as page, count(*)::bigint as views
  from public.client_events
  where event_name = 'page_view'
    and page like '/docs/%'
    and created_at >= since_ts
  group by split_part(page, '?', 1)
  order by views desc
$$;

-- P2: event / button / daily aggregates as one JSON blob (admin analytics) --
create or replace function public.admin_event_counts(since_ts timestamptz)
returns jsonb
language sql
stable
as $$
  with ev as (
    select event_name, button, created_at
    from public.client_events
    where created_at >= since_ts
  ),
  by_event as (
    select event_name, count(*)::bigint as count, max(created_at) as last_seen
    from ev group by event_name order by count desc
  ),
  by_button as (
    select event_name, button, count(*)::bigint as count, max(created_at) as last_seen
    from ev where button is not null
    group by event_name, button order by count desc limit 50
  ),
  daily as (
    select to_char(date_trunc('day', created_at at time zone 'UTC'), 'YYYY-MM-DD') as date,
           count(*)::bigint as count
    from ev group by 1 order by 1
  )
  select jsonb_build_object(
    'total', (select count(*)::bigint from ev),
    'byEvent', coalesce((select jsonb_agg(jsonb_build_object(
      'event', event_name, 'count', count, 'lastSeen', last_seen)) from by_event), '[]'::jsonb),
    'byButton', coalesce((select jsonb_agg(jsonb_build_object(
      'button', button, 'event', event_name, 'count', count, 'lastSeen', last_seen)) from by_button), '[]'::jsonb),
    'daily', coalesce((select jsonb_agg(jsonb_build_object(
      'date', date, 'count', count)) from daily), '[]'::jsonb)
  )
$$;

-- P5: per-article AI chunk counts (admin docs list) ------------------------
create or replace view public.v_docs_ai_chunk_counts as
  select article_id, count(*)::bigint as chunk_count
  from public.docs_ai_chunks
  where article_id is not null
  group by article_id;

-- Grants — admin paths use the service role client ------------------------
grant execute on function public.admin_docs_page_view_counts(timestamptz) to service_role;
grant execute on function public.admin_event_counts(timestamptz) to service_role;
grant select on public.v_docs_ai_chunk_counts to service_role;
