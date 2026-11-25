-- 수동 비상 롤백 전용. supabase/migrations 에 넣거나 평상시 실행하지 않는다.
-- 20261125_chatbot_handoff_claim_retry.sql 을 되돌린다. 옛 check 제약에는 'sending'·'abandoned' 가 없으므로 그 행을 먼저 failed 로 바꾼다.
-- 바꿔도 코드(lib/chatbot/channel-handoff.ts)는 같은 보장을 한다: sending 행은 last_error 의 'sending:' 표시가 남아 다시 보내지 않고
-- (cron 이 '보냈는지 모름'으로 포기), abandoned 행은 payload.retry.gaveUpAt 표시가 남아 다시 집지 않는다.

begin;

update public.chatbot_channel_handoffs
   set status = 'failed', updated_at = now()
 where status in ('sending', 'abandoned');

drop index if exists public.chatbot_channel_handoffs_retry_idx;

alter table public.chatbot_channel_handoffs
  drop constraint if exists chatbot_channel_handoffs_status_check;

alter table public.chatbot_channel_handoffs
  add constraint chatbot_channel_handoffs_status_check
  check (status in ('pending', 'sent', 'skipped', 'failed'));

commit;
