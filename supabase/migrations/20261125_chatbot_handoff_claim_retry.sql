-- 챗봇 → 채널톡 상담 전환: 보내기 전 선점(sending)과 재전송 포기(abandoned) 상태를 더한다(백엔드 점검 R11·B3).
--
-- 왜: 같은 전환 건을 두 요청(질문의 부수효과·'별로예요' 피드백)이 거의 동시에 읽으면 둘 다 pending 을 보고 둘 다 보냈다.
-- 코드(lib/chatbot/channel-handoff.ts claimHandoff)는 이제 보내기 전에
--   update ... set status='sending', attempt_count=n+1 where id=? and status in ('pending','failed') and attempt_count=n
-- 로 선점하고, 선점한 요청만 보낸다. 재전송 cron(app/api/cron/chatbot-handoff-retry)은 15분 넘은 pending·failed 를 다시 보내고,
-- 3회를 넘기면(또는 sending 이 15분 넘게 남아 보냈는지 모르면) abandoned 로 표시하고 알림을 한 번 보낸다.
--
-- 이 마이그레이션 전에도 코드는 깨지지 않는다: 'sending'·'abandoned' 갱신이 check 제약(23514)에 걸리면 상태는 그대로 두고
-- attempt_count 조건과 last_error 의 'sending:' 표시·payload.retry.gaveUpAt 표시만으로 같은 보장을 한다.
--
-- 통계 영향: 챗봇 운영 대시보드(summarizeChannelHandoffs)는 상태 분포에 sending·abandoned 를 그대로 세고, total 에 포함한다.
-- sent/pending/failed/skipped 개별 값은 그대로다. lead-digest-alerts 는 sent 만 센다.

alter table public.chatbot_channel_handoffs
  drop constraint if exists chatbot_channel_handoffs_status_check;

alter table public.chatbot_channel_handoffs
  add constraint chatbot_channel_handoffs_status_check
  check (status in ('pending', 'sending', 'sent', 'skipped', 'failed', 'abandoned'));

comment on column public.chatbot_channel_handoffs.status is
  'pending: 아직 안 보냄 / sending: 한 요청이 선점해 보내는 중(또는 보낸 뒤 기록 실패) / sent / skipped: dry run / failed: 보내기 실패(cron 이 다시 보냄) / abandoned: 재전송 포기(알림 1회)';

-- 재전송 cron 의 스캔(status in (...) and updated_at < now()-15분 order by updated_at).
create index if not exists chatbot_channel_handoffs_retry_idx
  on public.chatbot_channel_handoffs (updated_at)
  where status in ('pending', 'failed', 'sending');
