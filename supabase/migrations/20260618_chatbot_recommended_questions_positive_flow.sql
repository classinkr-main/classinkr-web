-- Refresh public chatbot starter prompts into a realistic positive flow.
-- Existing seed rows are updated in place; manual rows are left alone unless
-- they match a previous seed prompt or the new target prompt.

with desired(label, prompt, order_index, category, legacy_prompts) as (
  values
    (
      '차이 이해',
      'Classin이 Zoom이나 일반 전자칠판과 뭐가 다른가요?',
      10,
      'onboarding',
      array['우리 학원에 맞는 도입 방식이 궁금해요']::text[]
    ),
    (
      '90일 도입',
      '우리 학원 90일 도입 순서를 어떻게 잡으면 좋을까요?',
      20,
      'consultation',
      array['수업 중 집중도와 출석 관리를 개선하고 싶어요']::text[]
    ),
    (
      '수업 흐름',
      '전자칠판·녹화·EDB·LMS를 수업 흐름으로 쓰는 방법이 궁금해요',
      30,
      'classroom',
      array['결제, 영수증, 계정 문제를 상담받고 싶어요']::text[]
    ),
    (
      '견적 구성',
      '요금/견적은 어떤 항목으로 구성되나요?',
      40,
      'billing',
      array['전자칠판 설치나 A/S는 어떻게 진행되나요?']::text[]
    )
),
updated as (
  update public.chatbot_recommended_questions question
  set
    label = desired.label,
    prompt = desired.prompt,
    placement = 'starter',
    status = 'published',
    order_index = desired.order_index,
    category = desired.category,
    metadata = question.metadata || jsonb_build_object('seed', true, 'positive_flow', true),
    updated_at = now()
  from desired
  where question.placement = 'starter'
    and (
      question.prompt = desired.prompt
      or question.label = desired.label
      or question.prompt = any(desired.legacy_prompts)
    )
  returning desired.prompt
)
insert into public.chatbot_recommended_questions
  (label, prompt, placement, status, order_index, category, metadata)
select
  desired.label,
  desired.prompt,
  'starter',
  'published',
  desired.order_index,
  desired.category,
  '{"seed": true, "positive_flow": true}'::jsonb
from desired
where not exists (
  select 1
  from public.chatbot_recommended_questions question
  where question.placement = 'starter'
    and question.prompt = desired.prompt
);
