-- 채널톡 웹훅의 "상담 완결" CRM 기록을 상담(chatId) 하나에 한 행으로 묶는다(백엔드 점검 R9·B3).
--
-- 왜: 웹훅이 createCrmCustomerEvent 를 썼는데, 그 중복 판정(10초 창)은 출처 id 를 보지 않아 본문이 같은(대개 null) 서로 다른
-- 상담이 하나로 뭉개졌고, 같은 상담이 10초 뒤 다시 닫히면 두 번 쌓였다. 코드는 이제 출처 id(source_id = 'channel:{chatId}')로
-- 찾고 없을 때만 만든다(getOrCreateCrmCustomerEventBySource). 이 색인은 동시 웹훅 두 건이 같은 상담을 두 번 만들지 못하게 막는다
-- (코드는 23505 를 받으면 먼저 만든 행을 돌려준다).
--
-- 범위를 좁힌 이유: 다른 출처(관리자 수기 입력 등)는 같은 source_id 로 여러 기록을 남기는 경우가 있어 일반 (source_type, source_id)
-- 유니크는 걸지 않는다. 20260806_crm_capture_idempotency.sql 과 같은 방식이다.
--
-- 이 마이그레이션 전에도 코드는 깨지지 않는다(색인이 없으면 조회 후 만들기만 한다 — 동시 두 건이면 드물게 두 행).
--
-- 먼저 확인할 것: 운영에 이미 같은 상담의 완결 기록이 여러 행이면 아래 검사가 마이그레이션을 멈춘다(조용히 지우지 않는다).
--   select source_id, count(*) from public.crm_customer_events
--    where source_type = 'site_inflow' and source_id like 'channel:%'
--    group by source_id having count(*) > 1 order by count(*) desc;
-- 정리하기로 했다면(가장 이른 행만 남김) 사람이 확인한 뒤 실행한다:
--   delete from public.crm_customer_events e
--    using public.crm_customer_events keep
--    where e.source_type = 'site_inflow' and e.source_id like 'channel:%'
--      and keep.source_type = e.source_type and keep.source_id = e.source_id
--      and (keep.created_at, keep.id) < (e.created_at, e.id);

do $$
declare
  duplicate_sources integer;
begin
  select count(*) into duplicate_sources
    from (
      select source_id
        from public.crm_customer_events
       where source_type = 'site_inflow'
         and source_id like 'channel:%'
       group by source_id
      having count(*) > 1
    ) d;
  if duplicate_sources > 0 then
    raise exception '채널톡 완결 기록 중복 % 건(source_id 기준) — 이 파일 머리 주석의 확인·정리 쿼리를 먼저 실행하세요.', duplicate_sources;
  end if;
end $$;

create unique index if not exists crm_customer_events_channel_source_uidx
  on public.crm_customer_events (source_type, source_id)
  where source_type = 'site_inflow'
    and source_id like 'channel:%';
