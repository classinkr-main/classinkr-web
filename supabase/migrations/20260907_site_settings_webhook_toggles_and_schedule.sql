-- 웹훅별 켜기/끄기와 알림 발송 스케줄을 site_settings 로 옮긴다(2026-09-07).
--
-- 배경 1: 켜고 끄기가 wecom_ops 하나에만 boolean 컬럼으로 있었고 그 컬럼을 바꾸는
--         UI 가 없었다. 그래서 운영자가 URL 칸에 'disabled' 라고 적어서 껐다.
--         나머지 8개 웹훅은 아예 끌 방법이 없어 URL 을 지워야 했는데, 설정 화면은
--         빈 문자열을 "유지"로 해석해서 그것도 되지 않았다.
-- 배경 2: 발송 시각이 vercel.json(트리거)과 lead-morning-brief.ts(집계 창) 두 곳에
--         나뉘어 박혀 있어서 한쪽만 바꾸면 리드가 이중 집계되거나 빠졌다.
--
-- 옛 wecom_ops_webhook_enabled 컬럼은 드롭하지 않는다. 마이그레이션과 배포 사이
-- 구간에서 이전 코드가 여전히 그 컬럼을 읽는다.

ALTER TABLE public.site_settings
  ADD COLUMN IF NOT EXISTS webhook_enabled_json jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.site_settings
  ADD COLUMN IF NOT EXISTS notification_schedule_json jsonb NOT NULL DEFAULT '{}'::jsonb;

-- 기존 wecom_ops 스위치를 새 맵으로 옮긴다. 켜짐(true/NULL)은 적지 않는다 —
-- 키가 없으면 켜짐이라, 기본값을 나중에 바꿔도 옛 행이 옛 값을 붙들지 않는다.
UPDATE public.site_settings
SET webhook_enabled_json = webhook_enabled_json || '{"wecomOpsWebhookUrl": false}'::jsonb
WHERE wecom_ops_webhook_enabled IS FALSE
  AND NOT (webhook_enabled_json ? 'wecomOpsWebhookUrl');

-- 발송 시각의 기본값은 2026-09-07 이전 고정 동작과 같은 값이다.
-- deliveryHourKst 11 = 크론 '10 2 * * *'(11:10 KST), windowEnd 10:10 = REPORT_HOUR/MINUTE_KST.
UPDATE public.site_settings
SET notification_schedule_json = jsonb_build_object(
  'leadDaily', jsonb_build_object(
    'deliveryHourKst', 11,
    'windowEndHourKst', 10,
    'windowEndMinuteKst', 10,
    'weekdaysOnly', true
  )
)
WHERE notification_schedule_json = '{}'::jsonb;

-- 'disabled' 는 URL 이 아니다. 스위치가 없던 시절 끄기 위해 적어둔 문자열이라,
-- 스위치가 생긴 지금 그대로 두면 다시 켜는 순간 이 문자열로 POST 를 시도한다.
UPDATE public.site_settings
SET wecom_ops_webhook_url = NULL,
    wecom_ops_webhook_enabled = false,
    webhook_enabled_json = webhook_enabled_json || '{"wecomOpsWebhookUrl": false}'::jsonb
WHERE wecom_ops_webhook_url IS NOT NULL
  AND wecom_ops_webhook_url NOT LIKE 'http%';

COMMENT ON COLUMN public.site_settings.webhook_enabled_json IS
  'Per-webhook on/off map keyed by SiteSettings webhook key. Missing key = enabled. URL is kept when disabled.';
COMMENT ON COLUMN public.site_settings.notification_schedule_json IS
  'Operator-editable notification send schedule. See lib/notifications/schedule.ts. Hobby cron is hour-granular (±59min).';
