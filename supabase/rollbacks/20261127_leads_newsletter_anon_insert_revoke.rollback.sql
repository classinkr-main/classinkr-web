-- 수동 비상 롤백 전용. supabase/migrations 에 넣거나 평상시 실행하지 않는다.
-- 20261127_leads_newsletter_anon_insert_revoke.sql 을 되돌린다 — 공개 키 직접 INSERT 가 다시 열린다.
-- 되돌리기 전에 정말 필요한지 본다: 서버 API(/api/lead 등)는 service role 이라 이 정책과 무관하게 동작한다.
grant select, insert, update, delete on public.leads to anon;
grant select, insert, update, delete on public.newsletter_subscribers to anon;

drop policy if exists "Anyone can submit lead" on public.leads;
create policy "Anyone can submit lead" on public.leads for insert to public with check (true);
drop policy if exists "Anyone can subscribe" on public.newsletter_subscribers;
create policy "Anyone can subscribe" on public.newsletter_subscribers for insert to public with check (true);
