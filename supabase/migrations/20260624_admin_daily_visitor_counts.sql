-- Admin daily visitor analytics.
--
-- Counts page_view rows from public.client_events and derives unique visitors
-- from the first-party anonymous_id issued after analytics consent.

create index if not exists client_events_page_view_created_anon_idx
  on public.client_events (created_at desc, anonymous_id)
  where event_name = 'page_view';

create index if not exists client_events_home_page_view_created_anon_idx
  on public.client_events (created_at desc, anonymous_id)
  where event_name = 'page_view' and page = '/';

create or replace function public.admin_daily_visitor_counts(
  since_ts timestamptz,
  timezone_name text default 'Asia/Seoul'
)
returns jsonb
language sql
stable
as $$
  with page_views as (
    select
      created_at,
      split_part(coalesce(page, ''), '?', 1) as page_path,
      anonymous_id
    from public.client_events
    where event_name = 'page_view'
      and created_at >= since_ts
  ),
  daily as (
    select
      to_char(date_trunc('day', created_at at time zone timezone_name), 'YYYY-MM-DD') as date,
      count(*)::bigint as page_views,
      count(distinct anonymous_id) filter (where anonymous_id is not null) as visitors,
      count(*) filter (where page_path = '/') as home_page_views,
      count(distinct anonymous_id) filter (
        where page_path = '/' and anonymous_id is not null
      ) as home_visitors
    from page_views
    group by 1
    order by 1
  ),
  totals as (
    select
      count(*)::bigint as page_views,
      count(distinct anonymous_id) filter (where anonymous_id is not null) as visitors,
      count(*) filter (where page_path = '/') as home_page_views,
      count(distinct anonymous_id) filter (
        where page_path = '/' and anonymous_id is not null
      ) as home_visitors
    from page_views
  )
  select jsonb_build_object(
    'daily',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'date', date,
            'visitors', visitors,
            'pageViews', page_views,
            'homeVisitors', home_visitors,
            'homePageViews', home_page_views
          )
          order by date
        )
        from daily
      ),
      '[]'::jsonb
    ),
    'totals',
    jsonb_build_object(
      'visitors', coalesce((select visitors from totals), 0),
      'pageViews', coalesce((select page_views from totals), 0),
      'homeVisitors', coalesce((select home_visitors from totals), 0),
      'homePageViews', coalesce((select home_page_views from totals), 0)
    )
  )
$$;

grant execute on function public.admin_daily_visitor_counts(timestamptz, text) to service_role;
