# Chatbot Knowledge Base And FAQ Analytics Plan

기준 시점: 2026-04-21
문서 목적: 문서 탭과 제품/운영 정보를 챗봇 지식베이스로 쓰고, 고객이 자주 묻는 질문을 통계화해 FAQ와 문서 개선으로 되돌리는 구조를 정의한다.

## 1. Goal

챗봇은 고객 질문에 빠르게 답하되, 답변 근거는 항상 운영팀이 관리 가능한 원천에서 가져온다.

- 답변 원천: 문서 탭, FAQ, 요금/결제 정보, 하드웨어 정보, 도입/지원 정책, 업데이트 문서
- 분석 원천: 고객 질문, 검색 결과, 답변 모드, 상담 이관, 피드백
- 개선 결과: FAQ 후보, 문서 보강 큐, 상담 매크로, 챗봇 검색 품질 개선

원칙:

- 문서/정보는 답변 원천이고, 고객 질문 로그는 통계와 개선 원천이다.
- 챗봇이 답한 응답은 근거 문서 또는 정보 chunk를 추적할 수 있어야 한다.
- 낮은 신뢰도 답변은 억지로 생성하지 않고 문서 추천, 확인 질문, 문의 전환으로 처리한다.
- 개인정보가 섞일 수 있는 질문 원문은 정규화/마스킹 버전과 분리해 관리한다.

## 2. Existing Docs DB Baseline

문서센터 DB 설계는 이미 별도 기준 문서와 마이그레이션 초안이 있다.

- 설계 문서: [docs-center-db-design.md](./docs-center-db-design.md)
- 마이그레이션: [20260421_docs_center.sql](../../supabase/migrations/20260421_docs_center.sql)
- 정적 문서 원천: [lib/docs.ts](../../lib/docs.ts)

따라서 챗봇 지식베이스는 새 `knowledge_sources` 계층을 중복으로 만들기보다, 아래 기존 테이블을 우선 사용한다.

| 역할 | 기존 테이블 | 사용 방식 |
| --- | --- | --- |
| 문서/정보 원본 | `docs_articles` | 문서 탭, FAQ, 정보성 페이지, 요금/제품/지원 정책을 canonical source로 저장 |
| 변경 이력 | `docs_article_versions` | 게시 시점의 스냅샷과 롤백 기준 |
| 챗봇 검색 단위 | `docs_ai_chunks` | 제목, 섹션, 증상, FAQ 항목 단위로 쪼갠 RAG 검색 대상 |
| 문서 반응 | `docs_feedback` | 문서 자체의 도움이 됨/안 됨 |
| 검색어 로그 | `docs_search_events` | 문서 검색과 챗봇 검색 miss 분석 |

이 문서는 위 DB 위에 `chat_sessions`, `chat_messages`, `chatbot_answer_events`, `question_clusters` 같은 대화/FAQ 통계 레이어를 추가하는 설계다.

## 3. Knowledge Modeling

### 3.1 문서 탭

현재 `DocArticle`은 챗봇 ingest에 필요한 필드를 이미 갖고 있다.

- `title`, `description`: 검색 결과와 답변 요약
- `audience`: 원장, 운영팀, 교사, 학부모 등 대상자 힌트
- `tags`, `keywords`: 키워드 검색과 카테고리 분류
- `chatbotSummary`: 답변 생성 시 우선 참고하는 짧은 요약
- `sections`: chunk 생성 원천
- `relatedSlugs`: 관련 문서 확장 검색

변환 방식:

- `docs_articles.content_json`에는 `sections`, `steps`, `relatedSlugs` 등 구조화 데이터를 보관한다.
- `docs_articles.content_markdown`에는 사람이 읽을 수 있는 본문을 보관한다.
- `docs_ai_chunks`는 `summary`, `section-1`, `section-2`, `faq-item-*`처럼 검색 단위로 만든다.

### 3.2 정보 탭과 운영 정보

요금, 도입, 하드웨어, 지원 정책 같은 정보도 `docs_articles`에 넣는다. 문서처럼 길게 보일 필요가 없는 정보는 `doc_type = 'reference'`로 두고, 공개 여부는 `visibility`로 제어한다.

권장 매핑:

| 정보 | `doc_type` | `product_area` | `visibility` |
| --- | --- | --- | --- |
| 요금/결제 방식 | `reference` 또는 `faq` | `billing` | `public` |
| 도입 절차/데모 신청 | `guide` | `onboarding` | `public` |
| ClassIn Board/설치/A/S | `reference` 또는 `manual` | `hardware` | `public` 또는 `unlisted` |
| 수업 장애/긴급 지원 | `troubleshooting` | `classroom` | `public` 또는 `unlisted` |
| 내부 상담 정책 | `reference` | `general` | `internal` |

정보성 데이터는 `content_json`에 구조화 값을 같이 둔다.

```json
{
  "kind": "pricing_policy",
  "billingMode": "subscription",
  "displaySummary": "구독형은 계정 수 기준으로 월 단위 결제합니다.",
  "requiredFieldsForSupport": ["계약 학원명", "결제일", "요청 증빙 종류"]
}
```

### 3.3 Chunk Metadata

`docs_ai_chunks.metadata`에는 검색과 통계에 필요한 힌트를 넣는다.

```json
{
  "categoryId": "help",
  "docType": "faq",
  "productArea": "billing",
  "visibility": "public",
  "audience": ["원장", "운영팀"],
  "keywords": ["결제", "영수증", "세금계산서"],
  "symptoms": [],
  "sourcePath": "/docs/help/payment-and-invoice-help"
}
```

초기 MVP는 `to_tsvector`, `pg_trgm`, `keywords`, `symptoms` 기반 검색으로 시작한다. 문서 수와 질문 로그가 충분히 쌓이면 `docs_ai_chunks.embedding`에 임베딩을 넣고 벡터 검색을 추가한다.

## 4. Chatbot Analytics Tables

문서센터 테이블은 “무엇을 알고 있는가”를 저장한다. 아래 테이블은 “고객이 무엇을 물었고 챗봇이 어떻게 답했는가”를 저장한다.

권장 마이그레이션 파일명: `supabase/migrations/20260421_z_chatbot_analytics.sql`

### 4.1 Sessions And Messages

```sql
create table if not exists public.chat_sessions (
  id uuid primary key default gen_random_uuid(),
  channel text not null default 'web'
    check (channel in ('web', 'admin_preview', 'partner_portal', 'manual_import')),
  anonymous_id text,
  lead_id uuid references public.leads(id) on delete set null,
  customer_name text,
  customer_email text,
  customer_phone text,
  consent_marketing boolean not null default false,
  handoff_requested boolean not null default false,
  handoff_reason text,
  user_agent text,
  referrer text,
  utm jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.chat_sessions(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system', 'staff')),
  content text not null,
  normalized_content text,
  pii_redacted boolean not null default false,
  language text not null default 'ko',
  created_at timestamptz not null default now()
);

create index if not exists chat_messages_session_idx
  on public.chat_messages(session_id, created_at);
```

### 4.2 Answer Events

```sql
create table if not exists public.chatbot_answer_events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.chat_sessions(id) on delete cascade,
  user_message_id uuid not null references public.chat_messages(id) on delete cascade,
  assistant_message_id uuid references public.chat_messages(id) on delete set null,
  normalized_question text not null,
  detected_intent text,
  detected_category text,
  answer_mode text not null
    check (answer_mode in ('direct_answer', 'doc_suggestion', 'clarifying_question', 'handoff', 'fallback')),
  confidence numeric(5,4),
  unresolved boolean not null default false,
  latency_ms integer,
  model_name text,
  prompt_tokens integer,
  completion_tokens integer,
  created_at timestamptz not null default now()
);

create index if not exists chatbot_answer_events_created_idx
  on public.chatbot_answer_events(created_at desc);
create index if not exists chatbot_answer_events_category_idx
  on public.chatbot_answer_events(detected_category);
create index if not exists chatbot_answer_events_unresolved_idx
  on public.chatbot_answer_events(unresolved);
```

답변 근거는 문서별 품질 통계를 위해 조인 테이블로 분리한다.

```sql
create table if not exists public.chatbot_answer_citations (
  answer_event_id uuid not null references public.chatbot_answer_events(id) on delete cascade,
  article_id uuid references public.docs_articles(id) on delete set null,
  chunk_id uuid references public.docs_ai_chunks(id) on delete set null,
  rank integer not null,
  score numeric(8,4),
  citation_kind text not null default 'retrieval'
    check (citation_kind in ('retrieval', 'related', 'manual')),
  created_at timestamptz not null default now(),
  primary key (answer_event_id, rank)
);

create index if not exists chatbot_answer_citations_article_idx
  on public.chatbot_answer_citations(article_id);
create index if not exists chatbot_answer_citations_chunk_idx
  on public.chatbot_answer_citations(chunk_id);
```

### 4.3 Question Clusters

```sql
create table if not exists public.question_clusters (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  canonical_question text not null,
  category text,
  mapped_article_id uuid references public.docs_articles(id) on delete set null,
  mapped_chunk_id uuid references public.docs_ai_chunks(id) on delete set null,
  status text not null default 'candidate'
    check (status in ('candidate', 'approved', 'published', 'ignored')),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  sample_questions text[] not null default '{}',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.question_cluster_events (
  cluster_id uuid not null references public.question_clusters(id) on delete cascade,
  answer_event_id uuid not null references public.chatbot_answer_events(id) on delete cascade,
  similarity numeric(5,4),
  created_at timestamptz not null default now(),
  primary key (cluster_id, answer_event_id)
);
```

### 4.4 Answer Feedback

```sql
create table if not exists public.chatbot_feedback (
  id uuid primary key default gen_random_uuid(),
  answer_event_id uuid not null references public.chatbot_answer_events(id) on delete cascade,
  rating text not null check (rating in ('helpful', 'not_helpful')),
  comment text,
  created_at timestamptz not null default now()
);
```

## 5. Answer Flow

1. 고객 질문을 받는다.
2. 질문을 정규화하고 개인정보 후보를 마스킹한다.
3. `docs_ai_chunks`에서 검색한다.
   - 1차: 키워드, symptoms, trigram
   - 2차: `metadata.productArea`, `metadata.categoryId` 필터
   - 3차: 관련 문서 그래프 확장
   - 4차: 이후 벡터 검색
4. 검색 결과가 충분하면 근거 chunk만 사용해 답한다.
5. 검색 결과가 애매하면 확인 질문 또는 문서 추천으로 전환한다.
6. 근거가 없거나 민감 주제면 상담 이관으로 전환한다.
7. `chat_messages`, `chatbot_answer_events`, `docs_search_events`를 저장한다.
8. 답변 피드백을 받으면 `chatbot_feedback`에 저장한다.

답변 정책:

- 결제, 계약, 환불, 개인정보, 수업 장애는 confidence가 낮으면 상담 이관한다.
- 답변에는 관련 문서 링크를 1-3개만 붙인다.
- 공개 챗봇은 `docs_articles.status = 'published'`이고 `visibility in ('public', 'unlisted')`인 chunk만 사용한다.
- 내부 상담 챗봇은 `internal` 문서를 사용할 수 있지만, 답변에 공개 URL로 노출하지 않는다.

## 6. FAQ Analytics

### 6.1 관리자 지표

- Top Questions: 기간별 질문 클러스터 순위
- Rising Questions: 전주 대비 증가율이 큰 질문
- Unanswered Questions: fallback, handoff, low confidence 질문
- Bad Answers: `not_helpful` 비율이 높은 질문
- Deflection Rate: 상담 이관 없이 해결된 비율
- Handoff Reasons: 결제, 기술 장애, 도입 상담 등 이관 사유
- Document Coverage: 질문 클러스터별 연결 문서 존재 여부
- Search Misses: 검색 결과가 없거나 클릭이 없는 질문

### 6.2 Daily Stats View

```sql
create view public.v_chatbot_daily_question_stats
with (security_invoker = true)
as
select
  date_trunc('day', e.created_at)::date as day,
  coalesce(qc.id::text, 'unclustered') as cluster_id,
  coalesce(qc.label, e.normalized_question) as question_label,
  e.detected_category,
  count(*) as question_count,
  count(*) filter (where e.unresolved) as unresolved_count,
  count(*) filter (where e.answer_mode = 'handoff') as handoff_count,
  count(*) filter (where e.answer_mode = 'direct_answer') as direct_answer_count,
  avg(e.confidence) as avg_confidence
from public.chatbot_answer_events e
left join public.question_cluster_events qce on qce.answer_event_id = e.id
left join public.question_clusters qc on qc.id = qce.cluster_id
group by 1, 2, 3, 4;
```

### 6.3 Feedback Stats

```sql
create view public.v_chatbot_feedback_stats
with (security_invoker = true)
as
select
  e.detected_category,
  coalesce(qc.label, e.normalized_question) as question_label,
  count(f.id) as feedback_count,
  count(f.id) filter (where f.rating = 'helpful') as helpful_count,
  count(f.id) filter (where f.rating = 'not_helpful') as not_helpful_count
from public.chatbot_answer_events e
left join public.question_cluster_events qce on qce.answer_event_id = e.id
left join public.question_clusters qc on qc.id = qce.cluster_id
left join public.chatbot_feedback f on f.answer_event_id = e.id
group by 1, 2;
```

### 6.4 FAQ Promotion Loop

자주 묻는 질문은 자동 공개하지 않는다. 후보를 만들고 관리자가 승인한다.

1. 최근 7일 또는 30일 질문 수가 임계값을 넘은 cluster를 후보로 표시한다.
2. 연결된 문서가 있으면 `/docs/...` 링크를 추천한다.
3. 연결 문서가 없으면 `문서 보강 필요`로 표시한다.
4. 관리자가 `approved`로 바꾸면 FAQ 문서 또는 FAQ 섹션에 반영한다.
5. 반영 후 같은 질문의 unresolved rate가 내려가는지 추적한다.

권장 임계값:

- 7일 5회 이상: FAQ 후보
- 7일 3회 이상 + unresolved 50% 이상: 문서 보강 후보
- `not_helpful` 30% 이상: 답변 검토 후보

## 7. API Shape

Public:

- `POST /api/chatbot/query`
  - input: `sessionId?`, `message`, `anonymousId?`, `context?`
  - output: `answer`, `sources`, `answerEventId`, `needsHandoff`, `suggestedQuestions`
- `POST /api/chatbot/feedback`
  - input: `answerEventId`, `rating`, `comment?`
- `POST /api/chatbot/handoff`
  - input: `sessionId`, `reason`, `contact`
  - effect: create/update `leads`, mark session handoff

Admin:

- `POST /api/admin/chatbot/reindex`
  - rebuild `docs_ai_chunks` from `docs_articles` or selected article
- `GET /api/admin/chatbot/stats`
  - query by `from`, `to`, `category`, `status`
- `GET /api/admin/chatbot/questions`
  - returns clusters, samples, mapped docs, unresolved rate
- `PATCH /api/admin/chatbot/questions/:clusterId`
  - approve, ignore, map to doc, rename label

Implemented MVP files:

- [lib/chatbot/service.ts](../../lib/chatbot/service.ts)
- [app/api/chatbot/query/route.ts](../../app/api/chatbot/query/route.ts)
- [app/api/chatbot/feedback/route.ts](../../app/api/chatbot/feedback/route.ts)
- [app/api/admin/chatbot/stats/route.ts](../../app/api/admin/chatbot/stats/route.ts)
- [app/api/admin/chatbot/questions/route.ts](../../app/api/admin/chatbot/questions/route.ts)
- [app/api/admin/chatbot/questions/[id]/route.ts](../../app/api/admin/chatbot/questions/[id]/route.ts)

MVP notes:

- `POST /api/chatbot/query` searches `docs_ai_chunks` when Supabase env is available.
- If Supabase is not configured or DB search returns nothing, it falls back to static [lib/docs.ts](../../lib/docs.ts).
- Every persisted answer stores messages, answer event, citations, docs search event, and an exact-match question cluster.
- The first clustering strategy is exact normalized question matching. Semantic clustering can replace or augment it after embeddings are stable.

## 8. Admin UI

### 지식베이스

- source count, chunk count, last indexed
- 문서/FAQ/정보/요금/하드웨어/업데이트 목록
- 질문 입력 후 매칭 chunk와 score를 보는 검색 테스트

### 질문 통계

- 기간 필터: 7일, 30일, 이번 달
- Top Questions
- Rising Questions
- 카테고리 분포
- 상담 이관/미해결 추이

### 개선 큐

- 문서 없음
- 답변 신뢰도 낮음
- 도움 안 됨 많음
- 상담 이관 많음
- 관리 액션: 문서 연결, FAQ 승격, 무시, 담당자 배정

## 9. RLS And Privacy

권장 접근 정책:

- 공개 페이지는 published/public 또는 unlisted 문서만 읽는다.
- 챗봇 API는 서버 route에서 검색하고, 브라우저가 `docs_ai_chunks`를 직접 조회하지 않게 한다.
- 대화 이벤트는 API route로만 insert한다.
- admin 조회는 `is_active_admin()` 또는 service role 서버 route로 제한한다.
- 통계와 cluster에는 원문 대신 정규화/마스킹 질문을 사용한다.
- 연락처는 `leads`와 연결하고, FAQ 통계 화면에는 직접 노출하지 않는다.

## 10. Implementation Roadmap

### Phase 1: Docs DB And Static Seed

- `20260421_docs_center.sql` 적용
- `lib/docs.ts`를 `docs_articles`와 `docs_ai_chunks`로 seed
- [scripts/seed-docs.ts](../../scripts/seed-docs.ts) dry-run 후 실제 seed 실행
- 공개 문서는 DB 우선, 실패 시 정적 데이터 fallback

### Phase 2: Chatbot Query MVP

- `20260421_z_chatbot_analytics.sql` 추가
- `POST /api/chatbot/query`
- 키워드 검색 기반 문서 답변
- 답변 근거 링크 반환
- 질문/답변 이벤트 저장

### Phase 3: FAQ Analytics

- 질문 cluster 생성 job
- daily stats view
- 관리자 질문 통계 화면
- FAQ 후보 승인 상태

### Phase 4: Quality Loop

- 답변 피드백 UI
- 문서 보강 큐
- 벡터 검색 추가
- FAQ 문서 자동 초안 생성 후 관리자 승인

## 11. First Implementation Slice

가장 작은 실사용 단위:

1. 기존 문서센터 migration을 기준으로 `docs_articles`와 `docs_ai_chunks`를 만든다.
2. `lib/docs.ts` 문서를 seed한다.
3. 챗봇 analytics migration을 추가한다.
4. `/api/chatbot/query`에서 `docs_ai_chunks` keyword search로 관련 문서 3개를 찾는다.
5. 답변과 함께 출처 문서를 반환하고 이벤트를 저장한다.
6. 관리자에서 Top Questions와 Unanswered Questions를 먼저 본다.

이 slice만으로도 문서/정보 기반 챗봇 DB와 고객 FAQ 통계의 뼈대가 완성된다.
