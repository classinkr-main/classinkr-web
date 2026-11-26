-- 정의가 완전히 같은 중복 색인 3개를 지운다(2026-11-25 어드민·Compass 점검, Supabase 성능 어드바이저 duplicate_index 3건).
--
-- 지우는 것은 저장소 마이그레이션에 없는(운영에만 있는) 이름 쪽이다. 저장소가 만드는 이름은 남긴다 —
-- 20260409_schema_fixes.sql 의 `create index if not exists` 를 다시 돌려도 지운 색인이 되살아나지 않게 하려는 것이다.
--
--   지우는 색인(운영에만 있음)                남는 색인(저장소 정의)                      정의
--   lead_contact_logs_lead_id_idx             idx_lead_contact_logs_lead_id               btree (lead_id)
--   idx_subscribers_email                     idx_newsletter_subscribers_email            btree (email)
--   idx_subscribers_status                    idx_newsletter_subscribers_status           btree (status)
--
-- 확인(2026-11-26, pg_indexes·pg_constraint 읽기 전용): 세 쌍 모두 indexdef 가 같고, 지우는 쪽은 제약(PK·UNIQUE·FK)을
-- 받치지 않는다. 두 표 모두 색인 하나가 16KB 인 작은 표라 얻는 것은 쓰기 때 색인 유지 1회분과 어드바이저 경고 정리다.
-- 스캔 횟수는 판단 근거가 아니다 — 정의가 같으면 플래너가 남은 쪽을 그대로 쓴다.
--
-- 적용 전에 다시 볼 것: 그 사이 누가 남는 쪽을 지웠으면 이 파일을 돌리지 않는다(둘 다 없어진다).
--   select indexname, indexdef from pg_indexes
--    where schemaname = 'public' and tablename in ('lead_contact_logs', 'newsletter_subscribers') order by 1;
--
-- 잠금: DROP INDEX 는 표에 ACCESS EXCLUSIVE 를 아주 짧게 잡는다. 표가 작아 유입 시간대에도 무리가 없다.
-- 롤백: supabase/rollbacks/20261126_drop_duplicate_indexes.rollback.sql

do $$
begin
  if to_regclass('public.idx_lead_contact_logs_lead_id') is not null then
    drop index if exists public.lead_contact_logs_lead_id_idx;
  else
    raise warning 'idx_lead_contact_logs_lead_id 가 없어 lead_contact_logs_lead_id_idx 를 지우지 않았습니다';
  end if;

  if to_regclass('public.idx_newsletter_subscribers_email') is not null then
    drop index if exists public.idx_subscribers_email;
  else
    raise warning 'idx_newsletter_subscribers_email 이 없어 idx_subscribers_email 을 지우지 않았습니다';
  end if;

  if to_regclass('public.idx_newsletter_subscribers_status') is not null then
    drop index if exists public.idx_subscribers_status;
  else
    raise warning 'idx_newsletter_subscribers_status 가 없어 idx_subscribers_status 를 지우지 않았습니다';
  end if;
end $$;
