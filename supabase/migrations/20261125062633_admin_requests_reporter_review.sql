alter table public.admin_requests
  add column requester_review text,
  add column requester_reviewed_at timestamptz,
  add constraint admin_requests_requester_review_check check (
    (requester_review is null and requester_reviewed_at is null)
    or (
      requester_reviewed_at is not null and requester_review is not null
      and requester_review in ('confirmed', 'reopened')
    )
  );

create index admin_requests_status_created_idx
  on public.admin_requests (status, created_at desc, id desc);
create index admin_requests_reporter_status_created_idx
  on public.admin_requests (reporter_id, status, created_at desc, id desc);
