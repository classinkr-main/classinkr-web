# CS 보강 큐 린 루프 — 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 내부 CS 미해결 신호(폴백 답변·수정요청)를 보강 큐(question_clusters)로 자동 유입시키고, 회귀 검수 판정 UI를 완성해 챗봇→내부 CS→보강 큐 루프를 닫는다.

**Architecture:** 새 테이블 없음. `question_clusters.metadata`에 source/참조를 싣는 멀티소스 큐 확장 + 기존 검토 PATCH·questions PATCH 핸들러에 훅. UI는 DocsGapsPanel(소스 배지/필터)과 InternalCsChatWorkspace(라이브 위젯·회귀 판정 패널) 두 곳만 수정.

**Tech Stack:** Next.js 16 App Router, Supabase(admin 클라이언트 — RLS 주의: 어드민 API는 항상 admin 클라이언트), vitest.

**설계 문서:** [cs-gap-queue-loop-design-2026-07-16.md](cs-gap-queue-loop-design-2026-07-16.md) — 인터페이스 계약 7개는 이 문서가 정본.

**공통 규칙:**
- 작업 전 수정 대상 파일을 반드시 먼저 읽고 기존 패턴(에러 처리, 응답 형태, 주석 밀도)을 따른다.
- 어드민 API는 기존 라우트와 동일한 인증 가드(`requireVerifiedAdminContext` 등 해당 파일이 이미 쓰는 것)를 유지.
- 각 태스크 완료 기준: 해당 태스크의 vitest 통과 + `npx eslint app components lib --max-warnings=0` 통과.
- 커밋은 태스크당 1~3개, 한국어 conventional commit (예: `feat(cs): ...`).

---

## 인터페이스 계약 (전 태스크 공통 — 변경 금지)

1. `question_clusters.metadata.source`: `"chatbot_mvp_exact_match" | "internal_cs_fallback" | "internal_cs_review"`
2. `question_clusters.metadata.internalCs`: `Array<{ conversationId: string; messageId: string }>` — 최신 우선, 최대 10개 유지
3. 내부 CS 메시지 검토 PATCH body 추가 필드: `excludeFromGapQueue?: boolean` (true면 유입 건너뜀)
4. `POST /api/admin/chatbot/recommended-questions` body 추가 필드: `clusterId?: string` — 있으면 같은 핸들러에서 해당 클러스터 `status="published"`까지 처리
5. `GET /api/admin/cs-chat/regression-candidates` → `{ items: Array<{ id: string; conversationId: string; excerpt: string; capturedAt: string; outcome: "not_evaluated"|"pass"|"needs_fix"|"promoted"|"excluded"; reviewState: string }> }` — limit 50, 미판정(`not_evaluated`) 우선 정렬
6. 딥링크: `/admin/cs-chatbot?conversation=<uuid>` → chat 탭 활성 + 해당 대화 선택
7. questions PATCH(`/api/admin/chatbot/questions/[id]`): `mappedArticleId`가 설정되고 클러스터 `metadata.internalCs`가 있으면, 참조된 메시지 중 `regression_outcome IN ('not_evaluated','needs_fix')`인 것만 `promoted`로 갱신

---

### Task 1: 백엔드 전체 — 유입 훅 + 루프 닫기 + 무음 실패 수리 (담당: Opus 서브에이전트)

**Files:**
- Create: `lib/internal-cs-chat/gap-ingest.ts`
- Create: `app/api/admin/cs-chat/regression-candidates/route.ts`
- Create: `tests/internal-cs-chat/gap-ingest.test.ts`
- Create: `tests/internal-cs-chat/regression-candidates-route.test.ts`
- Modify: `lib/chatbot/service.ts` — `upsertQuestionCluster`(±3049 근처) 확장
- Modify: `lib/repositories/internal-cs-chat.ts` — 회귀 후보 목록/판정 전파 함수 추가
- Modify: `app/api/admin/cs-chat/conversations/[id]/generate/route.ts` — 폴백 유입 훅
- Modify: 내부 CS 메시지 검토 PATCH 라우트(`app/api/admin/cs-chat/` 하위 `messages/[messageId]/route.ts` — 정확한 경로는 먼저 찾아 읽을 것) — 수정요청 유입 훅 + `excludeFromGapQueue`
- Modify: `app/api/admin/chatbot/questions/[id]/route.ts` — promoted 전파 (계약 7)
- Modify: `app/api/admin/chatbot/recommended-questions` POST 핸들러 — `clusterId` 통합 처리 (계약 4)
- Modify(tests): 기존 `tests/internal-cs-chat/generate-route.test.ts` 등 훅 영향 받는 테스트 갱신

**Steps:**

- [ ] **1-1. 대상 파일 정독** — 위 Modify 파일 전부 + `lib/chatbot/doc-gaps.ts`(gap 판정 조건), 공개 챗봇의 redaction 헬퍼 위치 확인 (`service.ts` 내 canonical_question 생성 경로 추적). 검토 PATCH 라우트의 실제 경로/필드명 확정.
- [ ] **1-2. 실패 테스트 작성: gap-ingest** — `tests/internal-cs-chat/gap-ingest.test.ts`. 최소 케이스:
  - 폴백 소스 유입 시 `upsertQuestionCluster`가 `metadata.source="internal_cs_fallback"`과 internalCs 참조 1개로 호출된다
  - 동일 canonical 질문 재유입 시 internalCs 참조가 누적되고 10개 초과분은 오래된 것부터 잘린다
  - `excludeFromGapQueue` 경로에서는 호출되지 않는다 (검토 훅 단위)
  - 질문 텍스트에 전화번호/이메일이 있으면 redaction 후 저장된다 (공개 챗봇과 동일 헬퍼)
  - 유입 함수가 내부에서 throw해도 호출부에 전파되지 않고 `console.error` 1회 (spy 검증)
  - 기존 mock 패턴은 `tests/internal-cs-chat/generate-route.test.ts`를 그대로 따른다
- [ ] **1-3. 테스트 실패 확인** — `npx vitest run tests/internal-cs-chat/gap-ingest.test.ts` → 모듈 없음으로 FAIL
- [ ] **1-4. `gap-ingest.ts` 구현** — 시그니처(계약):
  ```ts
  export type InternalCsGapSource = "internal_cs_fallback" | "internal_cs_review"
  export async function ingestInternalCsGap(input: {
    question: string
    conversationId: string
    messageId: string
    source: InternalCsGapSource
  }): Promise<void> // 절대 throw하지 않음. 실패는 console.error
  ```
  내부에서 redaction → `upsertQuestionCluster` 확장 시그니처 호출.
- [ ] **1-5. `upsertQuestionCluster` 확장** — 옵션 인자 `{ source?: string; internalCsRef?: { conversationId: string; messageId: string } }` 추가. 기존 호출부는 무변경(기본값 `chatbot_mvp_exact_match` 유지). 기존 행 갱신 시 internalCs 배열 병합(중복 messageId 제거, 최신 우선 10개 캡). 기존 행이 `ignored`/`published` 상태면 유입이 status를 되돌리지 않는다(그대로 둠 — 의도적 억제 존중).
- [ ] **1-6. 생성 라우트 훅** — generate 라우트에서 assistant 저장 후 응답이 폴백 origin이면 `ingestInternalCsGap(... source: "internal_cs_fallback")`. 어떤 필드가 폴백을 나타내는지는 1-1에서 확인한 실제 metadata 필드 사용.
- [ ] **1-7. 검토 PATCH 훅** — changes_requested 전이 시 `excludeFromGapQueue !== true`이면 `source: "internal_cs_review"`로 유입. 유입용 질문 텍스트는 해당 assistant 메시지에 선행하는 user 질문(대화에서 조회).
- [ ] **1-8. 테스트 통과 확인** — `npx vitest run tests/internal-cs-chat/` → PASS (기존 테스트 포함 전부)
- [ ] **1-9. 커밋** — `feat(cs): 내부 CS 폴백·수정요청을 보강 큐로 자동 유입`
- [ ] **1-10. 실패 테스트 작성: 회귀 후보 라우트 + promoted 전파** — `tests/internal-cs-chat/regression-candidates-route.test.ts`:
  - GET이 계약 5의 shape로 응답한다 (미판정 우선 정렬, limit 50)
  - questions PATCH에 `mappedArticleId` 설정 + 클러스터 metadata.internalCs 존재 시, `not_evaluated`/`needs_fix` 메시지만 `promoted`로 갱신되고 `pass`/`excluded`는 불변
- [ ] **1-11. 구현** — repo에 `listInternalCsRegressionCandidates(limit)` / `promoteRegressionOutcomes(refs: {messageId: string}[])` 추가 → 신규 GET 라우트 + questions PATCH 핸들러에서 전파 호출. 전파 실패는 응답을 막지 않되 `console.error`.
- [ ] **1-12. recommended-questions 통합** — POST가 `clusterId` 받으면 등록+클러스터 published를 한 핸들러에서 처리. 클러스터 갱신 실패 시 500과 명확한 에러 메시지(부분 성공 상태를 응답 body에 명시: `{ recommended: true, clusterUpdated: false }` 형태).
- [ ] **1-13. 전체 테스트 + 게이트** — `npx vitest run tests/` 관련 스위트 PASS, `npx eslint app components lib --max-warnings=0` PASS
- [ ] **1-14. 커밋** — `feat(cs): 회귀 후보 목록 API + 문서 매핑 시 promoted 자동 전파 + 추천질문 원자화`

---

### Task 2: 보강 큐 패널 UI (담당: Sonnet 서브에이전트) — Task 1과 파일 겹침 없음

**Files:**
- Modify: `components/admin/docs/DocsGapsPanel.tsx` (이 파일만)

**Steps:**

- [ ] **2-1. 파일 정독** — 1,113줄 전체. 특히 gapClusters 렌더(±553), DraftButton, saveDraftAsArticle(±388)의 `.catch(() => null)`(±408), publishClusterAsRecommended(±286).
- [ ] **2-2. 소스 배지 + 필터** — 각 gap 클러스터 카드에 `metadata.source` 기준 배지: `챗봇`(기본/`chatbot_mvp_exact_match`/미지정), `내부CS 폴백`, `내부CS 검토`. 목록 상단에 필터 칩 3개(전체/챗봇/내부CS) — 클라이언트 필터만, API 변경 없음. 배지 색은 DESIGN.md 팔레트 내 뉴트럴+그린 액센트, 보더 `1px solid rgba(0,0,0,0.08)`.
- [ ] **2-3. 대화 딥링크** — `metadata.internalCs[0].conversationId`가 있으면 카드에 "대화 열기" 링크 → `/admin/cs-chatbot?conversation={id}` (계약 6).
- [ ] **2-4. 무음 실패 (a) 수리** — saveDraftAsArticle의 클러스터 PATCH `.catch(() => null)` 제거 → 실패 시 화면에 경고 배너("문서는 저장됐지만 큐 상태 갱신 실패") + "상태 갱신 재시도" 버튼(PATCH만 재호출).
- [ ] **2-5. 추천 질문 단일 호출 전환** — publishClusterAsRecommended가 recommended-questions POST에 `clusterId`를 실어 1회 호출로 전환(계약 4). 별도 questions PATCH 호출 제거. 응답의 `clusterUpdated: false`면 경고 표시.
- [ ] **2-6. 게이트** — `npx eslint components/admin/docs --max-warnings=0` PASS. UI 로직 변경이므로 vitest 신규 없음(이 패널은 기존에도 컴포넌트 테스트 없음 — 패턴 유지).
- [ ] **2-7. 커밋** — `feat(docs): 보강 큐 소스 배지·필터·CS 대화 딥링크 + 무음실패 2곳 수리`

---

### Task 3: 워크스페이스 검수 강화 (담당: Codex) — Task 1·2와 파일 겹침 없음

**Files:**
- Modify: `components/admin/cs-chat/InternalCsChatWorkspace.tsx` (이 파일만)

**Steps:**

- [ ] **3-1. 파일 정독** — 2,119줄 전체. 특히 OPERATING_TOOLS(±210)의 "문서 보강 · 회귀 검수" 카드, tools 탭 렌더(±1835), 검토 패널(±1981), submitReview(±1162), 대화 선택 상태 관리.
- [ ] **3-2. 딥링크 수신** — `useSearchParams`로 `?conversation=<uuid>` 읽어 마운트 시 chat 탭 활성 + 해당 대화 로드(계약 6). 존재하지 않는 id면 조용히 무시(기본 화면).
- [ ] **3-3. 라이브 위젯** — tools 탭의 정적 "문서 보강 · 회귀 검수" 카드를 위젯으로 교체: `GET /api/admin/docs/gaps` 호출 → 클러스터를 `metadata.source`로 분류해 `챗봇 N · 내부CS N` 카운트 표시(응답이 30개 캡이므로 30개면 "30+"), 클릭 시 기존처럼 `/admin/docs?tab=gaps` 이동. 로드 실패 시 기존 정적 카드 형태로 폴백.
- [ ] **3-4. 회귀 검수 미니 패널** — tools 탭 신규 섹션: `GET /api/admin/cs-chat/regression-candidates`(계약 5) 목록 + 항목별 판정 버튼 4종(`통과`=pass, `수정 필요`=needs_fix, `반영됨`=promoted, `제외`=excluded) → 기존 메시지 PATCH(`regressionOutcome`) 재사용. 판정 후 목록에서 제거(옵티미스틱, 실패 시 복원+에러 표시). "대화 보기" 링크 포함.
- [ ] **3-5. 보강 큐 제외 체크박스** — 검토 패널의 "수정 요청" 흐름에 `보강 큐 제외` 체크박스(기본 미체크). 체크 시 PATCH body에 `excludeFromGapQueue: true`(계약 3).
- [ ] **3-6. 게이트** — `npx eslint components/admin/cs-chat --max-warnings=0` PASS.
- [ ] **3-7. 커밋** — `feat(cs): 워크스페이스 보강큐 라이브 위젯 + 회귀 판정 패널 + 큐 제외 옵션`

---

### Task 4: 통합 검증 (오케스트레이터 직접)

- [ ] **4-1.** T1→T2→T3 순 머지 (파일 disjoint — 충돌 없어야 정상)
- [ ] **4-2.** `npx vitest run tests/internal-cs-chat/ tests/chatbot/` PASS
- [ ] **4-3.** `npx eslint app components lib --max-warnings=0` PASS
- [ ] **4-4.** `npm run build` PASS
- [ ] **4-5.** 수동 확인: 폴백 유입→큐 배지→초안→매핑→promoted 전파 시나리오 1회

## Self-Review 체크 결과

- 스펙 커버리지: 설계 §1→T1(1-2~1-9), §2→T2, §3→T3, §4→T1(1-10~1-12)+T2(2-4,2-5). 계약 7개 모두 태스크에 배정됨.
- 타입 일관성: `ingestInternalCsGap` 시그니처·계약 5 shape·`excludeFromGapQueue` 필드명이 태스크 간 동일.
- 의도적 위임: service.ts 등 대형 파일의 정확한 삽입 코드는 워커가 파일 정독 후 기존 패턴으로 작성(각 태스크 Step 1이 정독 단계). 계약과 동작 명세는 본 문서가 고정.
