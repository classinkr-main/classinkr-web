-- 내부 CS 브리지 웹훅: 이벤트를 먼저 선점(claim)하고 대화는 그 뒤에 만든다.
-- 선점 시점에는 대화가 아직 없을 수 있어 conversation_id 를 NULL 허용으로 바꾼다.
-- 코드는 이 마이그레이션 전에도 동작한다(NOT NULL 위반 23502 를 받으면 옛 순서로 물러난다).
ALTER TABLE public.internal_cs_integration_events
  ALTER COLUMN conversation_id DROP NOT NULL;
