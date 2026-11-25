-- 챗봇 피드백을 답(answer_event_id) 하나에 한 행으로 묶는다(백엔드 점검 R11·B3).
--
-- 왜: 같은 답에 '별로예요'를 여러 번 누르면 행이 그만큼 쌓여 피드백 통계가 부풀었다(채널톡 글 중복은 코드에서 따로 막았다 —
-- lib/chatbot/channel-handoff.ts 의 payload.feedback 선점).
--
-- ⚠ 보류 중(supabase/pending): supabase/migrations 에 두지 않는다. 그곳에 두면 이름순 적용(supabase db push 등)으로
-- service.ts 변경보다 먼저 걸려, 지금의 insert 경로에서 같은 답 두 번째 클릭('도움 됐어요 → 별로예요' 전환 포함)이
-- 23505 로 실패하고 피드백 API 가 500·상담 전환 생략·위젯 '저장하지 못했어요'가 된다.
-- 옮기는 때: lib/chatbot/service.ts saveChatbotFeedback 의 insert 를 saveChatbotFeedbackOnce(lib/chatbot/channel-handoff.ts)
-- 호출로 바꾼 커밋이 운영에 배포된 뒤, 그날 날짜를 붙여 supabase/migrations/<YYYYMMDD>_chatbot_feedback_answer_unique.sql 로 옮긴다.
--
-- 먼저 확인할 것: 운영에 이미 같은 답의 피드백이 여러 행이면 아래 검사는 색인을 만들지 않고 WARNING 만 남긴다
-- (조용히 지우지 않고, 같은 묶음의 다른 마이그레이션도 멈추지 않는다 — 코드는 색인 없이도 깨지지 않는다).
--   select answer_event_id, count(*) from public.chatbot_feedback
--    group by answer_event_id having count(*) > 1 order by count(*) desc;
-- 정리하기로 했다면(가장 최근 행만 남김 — saveChatbotFeedbackOnce 가 최근 행을 고치는 것과 같다) 사람이 확인한 뒤 실행한다:
--   delete from public.chatbot_feedback f
--    using public.chatbot_feedback newer
--    where newer.answer_event_id = f.answer_event_id
--      and (newer.created_at, newer.id) > (f.created_at, f.id);

do $$
declare
  duplicate_answers integer;
begin
  select count(*) into duplicate_answers
    from (
      select answer_event_id
        from public.chatbot_feedback
       group by answer_event_id
      having count(*) > 1
    ) d;
  if duplicate_answers > 0 then
    raise warning '같은 답의 피드백 중복 % 건 — 유니크 색인을 만들지 않았다. 이 파일 머리 주석의 확인·정리 쿼리를 실행한 뒤 다시 적용하세요.', duplicate_answers;
  else
    create unique index if not exists chatbot_feedback_answer_event_uidx
      on public.chatbot_feedback (answer_event_id);
  end if;
end $$;

-- 롤백(수동): drop index if exists public.chatbot_feedback_answer_event_uidx;
