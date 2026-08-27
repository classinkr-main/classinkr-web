-- channel_conversations.{message_count,last_message_text} — 어드민 상담 목록의 transcript 과다 페치 제거 (레버 08).
--
-- ⚠️ 수동 적용 필요: 이 파일은 저장만으로 라이브에 반영되지 않는다.
--    Supabase SQL Editor 또는 `supabase db push`로 직접 적용해야 한다.
--    적용 전에도 코드는 안전하다 — lib/repositories/channel-conversations.ts의
--    listDurableConversationsLite()가 컬럼 부재(42703)를 감지하면 기존 전체(transcript 포함) 조회로
--    폴백한다(무음 실패 없음). 폴백 시 응답은 정상이지만 페이로드가 다시 무거워질 뿐이다.
--
-- 배경: listDurableConversations()가 목록 화면용으로 transcript(상담 전문 jsonb) 전체를 select하지만
--   목록 라우트(app/api/admin/channel-talk/route.ts)는 받자마자 버린다(void transcript). 실제로 목록이
--   transcript에서 뽑아 쓰는 값은 messageCount(길이)·lastMessageText(마지막 메시지 text) 2개뿐이다.
--   firstAskedAt은 이 목록 응답의 소비처(app/admin/channel-talk/page.tsx의 Conversation 타입,
--   computeChannelConversationStats)가 쓰지 않아 생성 컬럼을 추가하지 않았다 — mine/route.ts(FAQ
--   마이닝·근본원인 후보 도출)와 sync 경로는 여전히 listDurableConversations()로 원문 transcript
--   전체를 읽으므로 firstAskedAt 값 손실은 없다.
--
-- jsonb_typeof 가드: transcript는 앱 코드가 항상 배열로 쓰지만(기본값 '[]'::jsonb), 생성 컬럼은
--   ALTER TABLE 시점에 기존 행 전체를 즉시 백필하므로 배열이 아닌 값(있다면)에서 jsonb_array_length가
--   던져 백필 전체가 실패하는 일을 막기 위해 방어적으로 0/NULL 처리한다.
--
-- STORED 생성 컬럼은 추가 시 기존 행에 대해 즉시 계산·백필된다(별도 UPDATE 불필요).

alter table public.channel_conversations
  add column if not exists message_count int
  generated always as (
    case when jsonb_typeof(transcript) = 'array' then jsonb_array_length(transcript) else 0 end
  ) stored;

alter table public.channel_conversations
  add column if not exists last_message_text text
  generated always as (
    case when jsonb_typeof(transcript) = 'array' then transcript -> -1 ->> 'text' else null end
  ) stored;

comment on column public.channel_conversations.message_count is
  'transcript 배열 길이 생성 컬럼 — 목록 조회가 transcript 전체 대신 이 값을 읽는다(레버 08).';
comment on column public.channel_conversations.last_message_text is
  'transcript 마지막 원소의 text 생성 컬럼 — 목록 조회가 transcript 전체 대신 이 값을 읽는다(레버 08).';
