-- 수동 비상 롤백 전용. supabase/migrations 에 넣거나 평상시 실행하지 않는다.
-- 20261126_drop_duplicate_indexes.sql 이 지운 중복 색인 3개를 같은 정의로 되살린다(남은 쪽과 정의가 같아 기능 차이는 없다).
create index if not exists lead_contact_logs_lead_id_idx on public.lead_contact_logs (lead_id);
create index if not exists idx_subscribers_email on public.newsletter_subscribers (email);
create index if not exists idx_subscribers_status on public.newsletter_subscribers (status);
