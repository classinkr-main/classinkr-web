-- 신원 결합(identity stitching) — 익명 방문자(cln_aid)와 리드를 잇는 키.
--
-- 배경: client_events.lead_id 는 20260615 마이그레이션에서 만들어졌고 주석에도
-- "CRM lead connected after form submission or public login identity stitching" 라고
-- 적혀 있지만, 채우는 코드가 없어 2,159행 중 0행만 값이 있었다(2026-08-05 실측).
-- 그래서 리드 참여 신호(getLeadsActivitySummary)가 항상 비어 있었고, CRM 우선순위의
-- 반응(response) 축이 전량 0 이었다.
--
-- leads.anonymous_id 는 리드 제출 시점의 cln_aid 다. 이 값 하나로
--   ① 제출 이전의 익명 활동을 소급 귀속하고(백필)
--   ② 제출 이후의 활동을 실시간 귀속한다(track/event 조회 키)
-- 두 방향이 모두 열린다.

alter table public.leads
  add column if not exists anonymous_id text;

comment on column public.leads.anonymous_id is
  'cln_aid at capture time. Stitches pre/post-conversion client_events and material_downloads to this lead.';

-- track/event 핫패스에서 anonymous_id → lead 를 찾는 조회용.
-- 부분 인덱스(null 제외) — 대부분의 리드는 동의 전이거나 오프라인 유입이라 null 이다.
create index if not exists leads_anonymous_id_idx
  on public.leads (anonymous_id, created_at desc)
  where anonymous_id is not null;
