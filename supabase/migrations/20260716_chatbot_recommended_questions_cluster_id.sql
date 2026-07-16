-- 추천 질문 ↔ 클러스터 링크의 멱등을 DB 가 보증하도록 전용 컬럼 + unique 인덱스를 추가한다.
-- 기존에는 metadata->>'clusterId' SELECT-then-INSERT 라 유니크 제약이 없어 동시 발행 시
-- 같은 클러스터의 추천 질문이 중복 생성될 수 있었다 (Codex 동시성 리뷰 P1-1).
-- metadata.clusterId 는 API 응답/표시 계약으로 계속 유지하고, cluster_id 는 중복 방지 키로만 쓴다.

alter table public.chatbot_recommended_questions
  add column if not exists cluster_id uuid;

comment on column public.chatbot_recommended_questions.cluster_id is
  'question_clusters.id 링크. 발행 멱등 키 (unique) — 표시용 링크는 metadata.clusterId 를 함께 유지한다.';

-- 기존 행 백필: metadata 링크가 UUID 형식일 때만 옮긴다.
update public.chatbot_recommended_questions
   set cluster_id = (metadata->>'clusterId')::uuid
 where cluster_id is null
   and metadata->>'clusterId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';

-- 레이스로 이미 생긴 중복은 최신 행만 링크를 유지하고 나머지는 링크를 끊는다.
-- 행 삭제는 하지 않는다 (데이터 보존) — unique 인덱스 생성의 선행 조건 정리.
with ranked as (
  select id,
         row_number() over (
           partition by cluster_id
           order by updated_at desc, created_at desc, id desc
         ) as rn
    from public.chatbot_recommended_questions
   where cluster_id is not null
)
update public.chatbot_recommended_questions q
   set cluster_id = null,
       metadata = q.metadata - 'clusterId'
  from ranked
 where q.id = ranked.id
   and ranked.rn > 1;

-- NULL 끼리는 충돌하지 않으므로 partial 이 아닌 전체 unique 인덱스로 둔다
-- (PostgREST upsert 의 on_conflict 추론은 partial unique 인덱스를 지원하지 않는다).
create unique index if not exists chatbot_recommended_questions_cluster_id_key
  on public.chatbot_recommended_questions (cluster_id);
