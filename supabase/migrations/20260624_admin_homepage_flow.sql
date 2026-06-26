-- Admin homepage flow analytics support.
--
-- Uses existing client_events rows and adds focused indexes for the new
-- homepage-flow admin API. No schema changes are required.

create index if not exists client_events_flow_page_view_anon_created_idx
  on public.client_events (anonymous_id, created_at)
  where event_name = 'page_view' and anonymous_id is not null;

create index if not exists client_events_download_materials_created_idx
  on public.client_events (created_at desc)
  where event_name = 'download_materials';

create index if not exists client_events_page_exit_created_idx
  on public.client_events (created_at desc)
  where event_name = 'page_exit';
