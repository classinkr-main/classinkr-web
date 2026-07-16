# CS 코파일럿 지식 확장 + CS 표면 재구성 — 설계·구현 계획

> **For agentic workers:** 각 태스크는 독립 worktree에서 실행. 계약(아래) 변경 금지. TDD, 한국어 conventional commit, push 금지.

**Goal:** 내부 CS 코파일럿에 ①채널톡 상담 내역(벡터 검색) ②brand-canon 상세 원문(internal 문서) ③주제 크로스워크를 연결하고, ALL_NEW1 융합에서 가려진 챗봇 운영 가시성을 복원한다.

**전제 (탐색으로 검증된 사실):**
- 조립기 `lib/internal-cs-chat/context.ts` `buildInternalCsCopilotContext()`는 현재 knowledge.ts(하드코딩 13항목) + `evaluateChatbotQuery`(공개 리트리버, internal 제외) 2개 소스만 결합.
- 채널톡 상담: `lib/repositories/channel-conversations.ts`가 JSON 파일 폴백(운영 휘발). transcript 전문·tags·matched_lead 구조화 존재. 동기화는 `lib/channel-talk-sync.ts` (수동/크론/웹훅→알림만).
- brand-canon SSOT(docs/active/brand-canon/* 등)는 DB 미적재 — knowledge.ts sourceRefs가 라벨로만 인용.
- 분류 6종+ 병존, 허브 후보 = `ChatbotCategory`(lib/chatbot/classification.ts 8종) + question_clusters.
- 임베딩 컨벤션: `scripts/embed-docs-chunks.ts` (Gemini text-embedding-004, 768d).
- PII: `redactPii`(lib/chatbot/service.ts export됨) 재사용.
- nav: "챗봇 운영" 항목은 ALL_NEW1 IA에서 의도적 흡수(admin-ia-redesign-2026-06-29.md) — 복원은 라벨·아이콘 가시성만.

## 인터페이스 계약 (전 태스크 공통 — 변경 금지)

1. **`channel_conversations`** (신규 테이블): `id text PK`(=채널톡 userChatId), `name/email/phone text`, `state text`, `tags text[]`, `first_question text`, `matched_lead_id`, `matched_org text`, `last_message_at timestamptz`, `transcript jsonb`, `synced_at timestamptz`. RLS `is_active_admin()` (기존 internal_cs_* 패턴).
2. **`channel_conversation_chunks`**: `id uuid PK`, `conversation_id text FK→channel_conversations ON DELETE CASCADE`, `seq int`, `content text`(**redactPii 통과본만 저장**), `category text NULL`(ChatbotCategory 값), `embedding vector(768)`, `created_at`. `UNIQUE(conversation_id, seq)`. RLS 동일.
3. **RPC `match_channel_conversation_chunks(query_embedding vector(768), match_count int, min_similarity float)`** → `{chunk_id, conversation_id, content, category, similarity, tags, first_question, matched_org, last_message_at}` (conversations 조인 포함).
4. **repo 듀얼모드**: `lib/repositories/channel-conversations.ts`의 기존 export 시그니처 전부 유지. Supabase 우선, 미설정/실패 시 기존 JSON 폴백. 기존 소비자(channel-talk-mining, lead-digest-alerts, admin channel-talk API) 무회귀.
5. **`searchConsultationEvidence(question: string, opts?: { limit?: number }): Promise<ConsultationEvidence[]>`** (lib/internal-cs-chat/consultation-search.ts 신규) — `ConsultationEvidence = { conversationId, excerpt, category, tags, matchedOrg, occurredAt, similarity }`. never-throw, 3.5s 타임아웃 시 `[]` (context.ts publicEvidence 패턴 준수).
6. **`evaluateChatbotQuery` options 확장**: `includeInternalDocs?: boolean` (기본 false) → `match_docs_ai_chunks` RPC에 `include_internal boolean DEFAULT false` 파라미터 추가로 스레딩. **공개 챗봇 경로는 어떤 호출도 true를 넘기지 않음** — 회귀 테스트로 고정.
7. **`normalizeTopicTags(tags: string[]): ChatbotCategory | null`** (lib/chatbot/topic-crosswalk.ts 신규) + 태그 사전 상수 `TOPIC_TAG_DICTIONARY`. 미매칭 시 `detectChatbotCategory` 폴백, 그래도 없으면 null.
8. **context.ts 3번째 소스**: 섹션 라벨 "과거 상담 사례". sourceRefs 항목 `{ id: "channel:"+conversationId, label: "[상담] "+excerpt요약, href: null }` — 기존 근거 Disclosure UI가 자동 렌더(잠금 아이콘 허용).
9. **seed 대상**: `docs/active/brand-canon/*.md` + knowledge.ts sourceRefs가 인용하는 docs/active 문서들(구현자가 대조 확정) → `docs_articles(visibility="internal", noindex=true, updated_by="seed-internal-canon")` + chunks + 임베딩.

---

### Task 1: 데이터 기반 (Opus, worktree: t1-data)

**소유 파일**: `supabase/migrations/20260716_channel_conversations.sql`(신규), `supabase/migrations/20260716_docs_match_internal_param.sql`(신규 — RPC 교체), `lib/repositories/channel-conversations.ts`, `lib/channel-talk-sync.ts`, `scripts/embed-channel-chunks.ts`(신규), `scripts/seed-internal-canon.ts`(신규), `lib/chatbot/service.ts`(evaluateChatbotQuery 옵션만), 관련 테스트(신규 `tests/channel-talk/`, 기존 영향분).

스텝: (1) 대상 파일 정독 — 특히 기존 JSON repo 시그니처·sync 로직·embed-docs-chunks 패턴·match_docs_ai_chunks RPC 정의. (2) 마이그레이션 2개 작성 (계약 1·2·3·6 — RPC는 CREATE OR REPLACE로 기존 시그니처+새 파라미터, 기본값으로 기존 호출 무회귀). (3) TDD로 repo 듀얼모드 승격 (fake supabase, JSON 폴백 경로 유지 검증). (4) sync 확장: Supabase upsert + frontMessageId 변경 대화만 chunk 재생성(트랜스크립트→고객/상담원 턴 단위 청킹, redactPii, normalizeTopicTags로 category 스탬프 — T2의 topic-crosswalk를 import하게 되므로 **주의: 이 파일은 T2 소유가 아님. crosswalk 없이 category null로 두고 TODO 남길 것** — T2 랜딩 후 통합 단계에서 배선). (5) embed-channel-chunks.ts (백필, 배치, 기존 embed 스크립트 컨벤션). (6) seed-internal-canon.ts (계약 9, 멱등 재실행 가능). (7) service.ts includeInternalDocs 옵션 스레딩 + **공개 경로 무회귀 테스트** (include_internal 미전달=false 검증). (8) 게이트: 관련 vitest + `npx eslint app components lib --max-warnings=0`. 커밋 2~3개.

### Task 2: 검색 + 배선 + 크로스워크 (Opus, worktree: t2-wiring)

**소유 파일**: `lib/internal-cs-chat/consultation-search.ts`(신규), `lib/internal-cs-chat/context.ts`, `lib/chatbot/topic-crosswalk.ts`(신규), `app/api/admin/cs-chat/conversations/[id]/generate/route.ts`, 관련 테스트.

스텝: (1) 정독 — context.ts 병합 구조·publicEvidence 타임아웃 패턴·generate 라우트 queueContext·classification.ts. (2) TDD로 topic-crosswalk (계약 7 — 채널톡/내부CS 실태그 예시 사전 포함: 예 "결제"→billing, "전자칠판"→hardware 등 사전은 실데이터 감각으로 15~25개). (3) TDD로 consultation-search (계약 5 — RPC는 fake로, 임베딩 호출 mock, 타임아웃·never-throw 검증). (4) context.ts 3번째 소스 결합 (계약 8 — publicEvidence와 동일 패턴, 실패 시 조용히 빈 배열, deterministicFallback 문구에 상담사례 유무 반영). (5) generate 라우트 queueContext에 정규화 주제 라인(`normalizeTopicTags(conversation.tags)`) 추가 + `includeInternalDocs: true`로 publicEvidence 호출 전환(계약 6). (6) 게이트 + 커밋 2개.

### Task 3: 표면 (Sonnet, worktree: t3-surface)

**소유 파일**: `components/admin/admin-nav.ts`, `components/admin/cs-chat/InternalCsChatWorkspace.tsx`, `tests/admin/sidebar-docs-gaps.test.ts`.

스텝: (1) 정독. (2) nav: "문서 보강 큐"→라벨 "챗봇 운영·보강 큐", icon Search→Bot(import 정리), keywords 유지. (3) 워크스페이스 ±275 구식 링크 `/admin/chatbot`→`/admin/docs?tab=gaps` (title "챗봇 운영 현황" 유지). (4) 근거 Disclosure가 `channel:` prefix sourceRefs를 안전 렌더하는지 확인(sourceHref가 null 반환→잠금 아이콘이면 OK, 크래시만 없으면 통과 — 필요 시 최소 방어). (5) sidebar 테스트 갱신. (6) 게이트: `npx eslint components/admin --max-warnings=0` + 관련 vitest. 커밋 1개.

### Task 4: 통합 (오케스트레이터)

(1) T1→T2→T3 머지 (T1·T2 모두 chatbot lib 근처지만 파일 disjoint — service.ts는 T1만, 신규 파일은 각자). (2) 통합 배선 1건: channel-talk-sync의 category 스탬프 TODO에 topic-crosswalk 연결 (오케스트레이터 직접 소커밋). (3) vitest 전체 관련 스위트 + eslint + build. (4) Codex 독립 리뷰. (5) 운영 적용은 별도 확인 단계: 마이그레이션 2개 적용 → sync 1회 → embed 백필 → seed-canon 실행.

## 비범위
공개 챗봇 동작 변경(무회귀가 요구사항), 통합 taxonomy 신설, 채널톡 웹훅 실시간 본문 수집, 코파일럿 UI 대개편.
