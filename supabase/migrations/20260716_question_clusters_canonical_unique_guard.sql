-- upsertQuestionCluster 의 동시 insert 재병합(23505 감지 → 승자 행 재조회→재병합, Codex
-- 동시성 리뷰 P1-2)은 canonical_question 의 unique 인덱스가 전제다.
-- 20260421_z_chatbot_analytics.sql 에 이미 선언돼 있으나, 부분 부트스트랩된 환경에서도
-- 불변식이 보장되도록 방어적으로 재선언한다 (기적용 환경에서는 no-op).
create unique index if not exists question_clusters_canonical_question_idx
  on public.question_clusters (canonical_question);
