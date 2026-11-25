-- 챗봇 피드백을 답(answer_event_id) 하나에 한 행으로 묶는다(백엔드 점검 R11·B3).
--
-- 왜: 같은 답에 '별로예요'를 여러 번 누르면 행이 그만큼 쌓여 피드백 통계가 부풀었다(채널톡 글 중복은 코드에서 따로 막았다 —
-- lib/chatbot/channel-handoff.ts 의 payload.feedback 선점).
--
-- 적용 순서 주의: lib/chatbot/service.ts saveChatbotFeedback 의 insert 를 saveChatbotFeedbackOnce(같은 파일 channel-handoff.ts)
-- 호출로 바꾼 뒤에 적용한다. 지금의 insert 그대로 이 색인을 걸면 두 번째 클릭이 23505 로 실패해 피드백 API 가 500 을 돌려준다.
--
-- 먼저 확인할 것: 운영에 이미 같은 답의 피드백이 여러 행이면 아래 검사가 마이그레이션을 멈춘다(조용히 지우지 않는다).
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
    raise exception '같은 답의 피드백 중복 % 건 — 이 파일 머리 주석의 확인·정리 쿼리를 먼저 실행하세요.', duplicate_answers;
  end if;
end $$;

create unique index if not exists chatbot_feedback_answer_event_uidx
  on public.chatbot_feedback (answer_event_id);
