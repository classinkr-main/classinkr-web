# 챗봇 × 가이드 문서 활성화 런북 + 운영 지침

작성일: 2026-06-14
연계 기획: [chatbot-docs-hyperdevelop-plan-2026-06-13.md](./chatbot-docs-hyperdevelop-plan-2026-06-13.md)
목적: 코드로 완성된 챗봇/문서 루프를 실제로 켜는 운영 절차 + 확정된 결정 지침을 한 곳에 정리.

---

## 0. 현재 상태 (코드 완료, 아직 미활성)

루프는 코드로 완결됐으나 **운영 데이터가 비어 있어 작동 전**이다.

- `docs_ai_chunks`가 비어 있음 → 챗봇은 현재 정적 [lib/docs.ts](../../lib/docs.ts) 폴백만 사용.
- 프로드 `GEMINI_API_KEY` 설정 여부 미확인 → 미설정이면 사용자에겐 템플릿 답변만 나감.
- 임베딩 백필 미실행 → 시맨틱 검색은 키워드로 폴백.

구현된 조각:
- 답변 생성/검색: [lib/chatbot/service.ts](../../lib/chatbot/service.ts), [lib/chatbot/llm.ts](../../lib/chatbot/llm.ts)
- 품질 평가: [lib/chatbot/eval.ts](../../lib/chatbot/eval.ts) · [/api/admin/chatbot/eval](../../app/api/admin/chatbot/eval/route.ts)
- 문서 보강 큐 + AI 초안: [lib/chatbot/doc-gaps.ts](../../lib/chatbot/doc-gaps.ts) · [/api/admin/docs/gaps](../../app/api/admin/docs/gaps/route.ts)
- 알파 준비도 점검: [/api/admin/docs/alpha-readiness](../../app/api/admin/docs/alpha-readiness/route.ts) · `/admin/docs/gaps` 상단 패널
- 어드민 화면: `/admin/docs/gaps` ([app/admin/docs/gaps/page.tsx](../../app/admin/docs/gaps/page.tsx)) — 사이드바 `성장 > 문서 보강 큐` 또는 어드민 커맨드 팔레트(⌘K/Ctrl+K)에서 이동
- 골든셋: [data/chatbot-golden-set.json](../../data/chatbot-golden-set.json)

---

## 1. 확정된 결정 (지침)

| 항목 | 결정 | 근거 |
|---|---|---|
| 임베딩 모델 | `gemini-embedding-001`, **1536차원** | 현재 운영 DB 컬럼/RPC가 `vector(1536)` 기준. 768 전환은 별도 DDL 적용 후 `GEMINI_EMBED_DIM=768`로 맞춘다. |
| 답변 모델 | Gemini fast 티어 | 저지연·고빈도. tier 시스템은 [lib/chatbot/llm.ts](../../lib/chatbot/llm.ts) |
| 다국어 | 후순위 | 한국 98% → C4(다국어)는 보류 |
| 핸드오프 종착 | ChannelTalk(한국 서비스팀) | 기존 사용 채널. 절대적이진 않음 → 멀티턴/핸드오프 설계 시 참고 |
| AI 초안 | **자동 게시 금지** | `/admin/docs/gaps`에서 `draft + unlisted + noindex` 문서로 저장 후 어드민 편집 화면에서 검토 |
| 답변 가드 | 근거 기반 + 민감주제(결제·계약·장애) 저신뢰 시 핸드오프 | 환각 방지 |

---

## 2. 활성화 체크리스트 (운영 실행)

> env는 이름만 표기. 실제 값은 배포 환경/시크릿에서 주입한다.

- [ ] **0. 프로드 env 확인**
  - [ ] `GEMINI_API_KEY` (답변 + 임베딩 공용)
  - [ ] `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`(또는 `SUPABASE_SECRET_KEY`)
  - [ ] `/admin/docs/gaps` 상단 "챗봇 알파 준비도"에서 막힘 항목과 표시된 migration 목록 확인
  - [ ] [20260614_alpha_admin_base_schema.sql](../../supabase/migrations/20260614_alpha_admin_base_schema.sql) 적용 상태(관리자/리드/audit base)
  - [ ] [20260421_docs_center.sql](../../supabase/migrations/20260421_docs_center.sql) 적용 상태(문서센터 테이블)
  - [ ] [20260421_z_chatbot_analytics.sql](../../supabase/migrations/20260421_z_chatbot_analytics.sql), [20260520_chatbot_recommended_questions.sql](../../supabase/migrations/20260520_chatbot_recommended_questions.sql), [20260614211500_chatbot_recommended_questions_alpha_seed.sql](../../supabase/migrations/20260614211500_chatbot_recommended_questions_alpha_seed.sql), [20260604_docs_article_drafts.sql](../../supabase/migrations/20260604_docs_article_drafts.sql) 적용 상태
  - [ ] `npm run check:alpha-db` → `Status: ok` 확인

- [ ] **1. 문서 시드** — `docs_articles` + `docs_ai_chunks` 채우기 (임베딩은 아직 null)
  - [ ] 운영 DB 확인: `select slug, status, updated_at from docs_articles order by updated_at desc limit 10;` (어드민 편집본 덮어쓰기 방지 — 비었거나 시드 이력만 있으면 안전)
  - [ ] `npx tsx scripts/seed-docs.ts --dry-run` (수량 확인)
  - [ ] `NEXT_PUBLIC_SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… npx tsx scripts/seed-docs.ts`

- [ ] **2. 벡터 검색 마이그레이션 적용**
  - [ ] [20260613_docs_chunk_vector_search.sql](../../supabase/migrations/20260613_docs_chunk_vector_search.sql)
  - 참고: [20260613_docs_chunk_embedding_768.sql](../../supabase/migrations/20260613_docs_chunk_embedding_768.sql)은 선택적 768 전환용이다. 이 DDL을 실제 DB에 적용한 뒤에만 `GEMINI_EMBED_DIM=768`로 바꾼다.

- [ ] **3. 임베딩 백필** (gemini-embedding-001, 1536d)
  - [ ] `… npx tsx scripts/embed-docs-chunks.ts --dry-run` (대상 수)
  - [ ] `GEMINI_API_KEY=… NEXT_PUBLIC_SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… npx tsx scripts/embed-docs-chunks.ts`
  - [ ] 검증: `select count(*) from docs_ai_chunks where embedding is not null;`

- [ ] **4. baseline 측정**
  - [ ] `/admin/docs/gaps` → "평가 실행" (또는 `POST /api/admin/chatbot/eval` body `{"judge":true}`)
  - [ ] 카테고리 적중 / 출처 확보 / 환각률 기록
  - [ ] `/admin/docs/gaps` → 갭 질문에서 "AI 초안 생성" → "초안을 문서로 저장" → 편집 화면에서 검수

- [ ] **5. 눈으로 확인**
  - [ ] 챗봇에 골든셋 질문(예: "세금계산서 발급되나요?") → 답이 docs 출처로 나오는지

각 단계가 푸는 것: **1** = 폴백 탈출(DB 문서 답변) · **3** = 키워드→시맨틱 승급 · **4** = 개선 기준선.

---

## 3. 데이터 우선순위 (품질 천장 올리기)

RAG 챗봇은 모델이 아니라 **콘텐츠가 천장**이다. 임팩트 순:

1. **아직 문서화 안 된 원문** — 요금·세금계산서 정책, 전자칠판 설치/A·S, 도입 절차, 정원/규격 등. 챗봇은 `docs_ai_chunks`에 있는 것만 답한다. (최대 공백)
2. **실제 상담·문의 로그** (채널톡/전화 메모/영업 FAQ) — 골든셋을 진짜 질문으로 교체 + 질문 분포로 문서 우선순위 결정.
3. **FAQ 원본** — 클러스터·골든셋 즉시 시드.
4. **제품 사실 표** (가격/정원/스펙 수치) — 환각 방지의 근거.

수집 형식: PDF·Notion·워드·시트 무엇이든. → `lib/docs.ts` 또는 `docs_articles` 시드 형식으로 변환 가능.

---

## 4. 다음 (Tier B 후보)

baseline 측정 후 우선순위 재조정. 현재 후보:
- **B1 멀티턴 대화** (체감 품질 최대 레버 — 후속질문 이해)
- **A2 환각 자기검증** (eval 환각률이 높을 때만)
- **B2 스트리밍 응답**
- **C1 시맨틱 질문 클러스터링** (보강 큐 품질↑ — 현재 정확일치 클러스터)
- `/admin/docs/gaps`는 사이드바 `문서 보강 큐` 독립 항목으로 승격 완료. 이후 후보는 질문 클러스터링 품질 개선.

---

## 5. 참조 — 이번에 추가된 API/마이그레이션

| 종류 | 경로 |
|---|---|
| 알파 준비도 | `GET /api/admin/docs/alpha-readiness` |
| 품질 평가 | `POST /api/admin/chatbot/eval` |
| 문서 보강 큐 | `GET /api/admin/docs/gaps` |
| AI 초안 생성 | `POST /api/admin/docs/gaps/draft` → 관리자 화면에서 `POST /api/admin/docs/articles`로 draft 문서 저장 |
| 검색 RPC | `match_docs_ai_chunks(vector(1536), int)` |
| 백필 | [scripts/embed-docs-chunks.ts](../../scripts/embed-docs-chunks.ts) |
| 시드 | [scripts/seed-docs.ts](../../scripts/seed-docs.ts) |
