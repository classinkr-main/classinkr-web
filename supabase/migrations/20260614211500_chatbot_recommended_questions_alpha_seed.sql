-- Add one more starter prompt so the public chatbot alpha has at least four
-- meaningful first-question chips. This is idempotent for manual re-runs.

insert into public.chatbot_recommended_questions
  (label, prompt, placement, status, order_index, category, metadata)
select
  '전자칠판 설치·A/S',
  '전자칠판 설치나 A/S는 어떻게 진행되나요?',
  'starter',
  'published',
  40,
  'hardware',
  '{"seed": true, "alpha": true}'::jsonb
where not exists (
  select 1
  from public.chatbot_recommended_questions
  where placement = 'starter'
    and prompt = '전자칠판 설치나 A/S는 어떻게 진행되나요?'
);
