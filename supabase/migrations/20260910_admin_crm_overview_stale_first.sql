-- CRM 개요 스냅샷 — 조회 경로에서 동기 재계산 제거(stale-first)
--
-- 배경(docs/active/admin-performance-round3-2026-09-10.md §3.1):
-- 20260613_admin_crm_overview_snapshot.sql 의 admin_crm_business_overview() 는
-- "dirty 마커가 있거나 p_max_age_seconds 를 넘으면" 조회가 재계산(admin_crm_compute_
-- business_overview, 무거운 10개 집계)을 **동기로 기다린다**. 저장된 payload 를 그대로
-- 돌려주는 경로는 다른 트랜잭션이 advisory lock 을 쥐고 있을 때뿐이었다.
--
-- dirty 트리거가 partner_accounts·customers·deals·quotes·contracts·receipts·activity_logs·
-- quote_documents·contract_documents·payments_v2·receipts_v2·calendar_events 12개 테이블에
-- STATEMENT 단위로 걸려 있다 — 즉 어드민에서 쓰기가 한 번이라도 일어나면 **다음 조회가
-- 재계산 비용을 문다**. 2라운드 실측의 366콜 평균 969ms·콜당 1,748블록이 여기서 나왔다.
--
-- 이 마이그레이션이 바꾸는 계약:
--   1. 스냅샷 행이 있으면 **항상 즉시 반환**한다. 신선도는 stale 플래그와 refreshedAt 으로
--      사실만 표기하고, 화면이 "N분 전 기준"으로 정직하게 보여준다.
--   2. 동기 재계산은 세 경우로만 한정한다.
--      (a) 스냅샷이 한 번도 만들어진 적 없을 때 — 빈 화면 대신 기다리는 게 맞다.
--      (b) p_force = true — 사용자가 새로고침을 눌렀을 때.
--      (c) p_hard_max_age_seconds 를 넘겼을 때 — 무한 stale 을 막는 안전핀.
--   3. 평상시 갱신은 앱이 소유한다. 응답을 보낸 뒤 after() 로 p_force=true 를 호출한다
--      (lib/admin-crm-overview.ts 의 scheduleAdminCrmOverviewRefresh).
--
-- vercel.json 에 크론을 추가하지 않는다 — Hobby 의 하루 1회 제한(AGENTS.md)에 걸리고,
-- after() 백그라운드 갱신이면 그 제약을 건드리지 않는다.
--
-- ⚠️ 오버로드를 만들지 않고 기존 2인자 함수를 DROP 한 뒤 3인자로 다시 만든다.
-- PostgREST 는 인자 "이름"으로 후보를 고르므로, 같은 이름의 함수가 둘이면 이름이 겹치는
-- 순간 양쪽 다 PGRST203(ambiguous)으로 죽는다. 앱은 p_max_age_seconds·p_force 두 개만
-- 이름으로 넘기고 세 번째는 DEFAULT 로 채워지므로 기존 호출부는 그대로 동작한다.

DROP FUNCTION IF EXISTS public.admin_crm_business_overview(INTEGER, BOOLEAN);

CREATE OR REPLACE FUNCTION public.admin_crm_business_overview(
  p_max_age_seconds INTEGER DEFAULT 60,
  p_force BOOLEAN DEFAULT FALSE,
  p_hard_max_age_seconds INTEGER DEFAULT 3600
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_lock_key CONSTANT BIGINT := hashtextextended('admin_crm_overview:business', 0);
  v_row public.admin_crm_overview_snapshots%ROWTYPE;
  v_dirty TIMESTAMPTZ;
  v_payload JSONB;
  v_started TIMESTAMPTZ;
  v_max_age INTERVAL := make_interval(secs => GREATEST(COALESCE(p_max_age_seconds, 60), 0));
  -- 안전핀은 소프트 TTL보다 짧을 수 없다 — 잘못 넘어와도 계약이 뒤집히지 않게 바닥을 깐다.
  v_hard_age INTERVAL := make_interval(
    secs => GREATEST(COALESCE(p_hard_max_age_seconds, 3600), GREATEST(COALESCE(p_max_age_seconds, 60), 0))
  );
  v_is_stale BOOLEAN;
BEGIN
  SELECT * INTO v_row FROM admin_crm_overview_snapshots WHERE snapshot_key = 'business';
  SELECT max(marked_at) INTO v_dirty
  FROM admin_crm_overview_dirty_log
  WHERE snapshot_key = 'business';

  IF v_row.snapshot_key IS NOT NULL THEN
    -- 소프트 기준: 이 둘 중 하나라도 걸리면 "낡았다"고 표기한다. 반환은 막지 않는다.
    v_is_stale := v_row.refreshed_at < now() - v_max_age
      OR (v_dirty IS NOT NULL AND v_dirty > v_row.refreshed_at);

    -- 즉시 반환 경로 — stale-first 의 본체.
    -- 강제 갱신도 아니고 안전핀도 안 넘겼으면, 낡았더라도 저장된 payload 를 그대로 준다.
    IF NOT COALESCE(p_force, FALSE) AND v_row.refreshed_at >= now() - v_hard_age THEN
      RETURN jsonb_build_object(
        'refreshedAt', v_row.refreshed_at,
        'stale', v_is_stale,
        'payload', v_row.payload
      );
    END IF;
  END IF;

  -- 여기부터는 재계산이 필요한 경우다(스냅샷 없음 · p_force · 안전핀 초과).
  -- 동시 refresh 스탬피드 방지: 다른 트랜잭션이 갱신 중이면 기존 스냅샷을 그대로 반환.
  IF NOT pg_try_advisory_xact_lock(v_lock_key) THEN
    IF v_row.snapshot_key IS NOT NULL THEN
      RETURN jsonb_build_object(
        'refreshedAt', v_row.refreshed_at,
        'stale', TRUE,
        'payload', v_row.payload
      );
    END IF;
    -- 스냅샷이 아직 한 번도 없으면 선행 refresh를 기다렸다가 재사용한다.
    PERFORM pg_advisory_xact_lock(v_lock_key);
    SELECT * INTO v_row FROM admin_crm_overview_snapshots WHERE snapshot_key = 'business';
    IF v_row.snapshot_key IS NOT NULL THEN
      RETURN jsonb_build_object(
        'refreshedAt', v_row.refreshed_at,
        'stale', FALSE,
        'payload', v_row.payload
      );
    END IF;
  END IF;

  v_started := clock_timestamp();
  v_payload := admin_crm_compute_business_overview();

  INSERT INTO admin_crm_overview_snapshots (snapshot_key, payload, refreshed_at, refresh_duration_ms)
  VALUES (
    'business',
    v_payload,
    v_started,
    GREATEST(0, round(extract(epoch FROM clock_timestamp() - v_started) * 1000))::int
  )
  ON CONFLICT (snapshot_key) DO UPDATE
    SET payload = EXCLUDED.payload,
        refreshed_at = EXCLUDED.refreshed_at,
        refresh_duration_ms = EXCLUDED.refresh_duration_ms;

  -- 이번 refresh가 반영한 dirty 마커는 정리한다.
  -- (compute 중에 커밋된 쓰기는 marked_at이 v_started 이후라 남는다)
  DELETE FROM admin_crm_overview_dirty_log
  WHERE snapshot_key = 'business'
    AND marked_at <= v_started;

  RETURN jsonb_build_object(
    'refreshedAt', v_started,
    'stale', FALSE,
    'payload', v_payload
  );
END;
$fn$;

COMMENT ON FUNCTION public.admin_crm_business_overview(INTEGER, BOOLEAN, INTEGER) IS
  'CRM 개요 스냅샷 조회. 스냅샷이 있으면 항상 즉시 반환하고 낡음은 stale 플래그로만 표기한다. '
  '동기 재계산은 스냅샷 부재·p_force·p_hard_max_age_seconds 초과 세 경우뿐이다. '
  '평상시 갱신은 앱이 응답 후 after()로 p_force=true를 호출해 수행한다.';

REVOKE EXECUTE ON FUNCTION public.admin_crm_business_overview(INTEGER, BOOLEAN, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_crm_business_overview(INTEGER, BOOLEAN, INTEGER) TO service_role;
