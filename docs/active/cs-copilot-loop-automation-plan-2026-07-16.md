# CS 코파일럿 계기판 + 루프 자동화 — 설계·구현 계획

> **For agentic workers:** 독립 worktree에서 실행. 계약 변경 금지. TDD, 한국어 conventional commit, push 금지.

**Goal:** 내부 CS 코파일럿에 ①운영 지표 계기판 ②회귀 자동 평가(제안) ③검토 수정문의 지식 승격을 추가해 측정·자동화 루프를 완성한다.

**전제 (검증된 사실):**
- 내부 CS 지표 API 부재. assistant 메시지 metadata에 origin(fallback 여부)/citations(sourceRefs)/attemptedModels가 기록됨(generate 라우트). internal_cs_messages에 review_state/regression_outcome/corrected_content, conversations에 status/created_at/resolved_at.
- 공개 챗봇 평가 인프라: `lib/chatbot/eval.ts`의 `runGoldenEval`(judge 옵션 포함) — 패턴 참조용.
- internal 문서 적재 인프라: `scripts/seed-internal-canon.ts`가 docs_articles(visibility=internal)+chunks+임베딩 로직 보유 — lib 공용화 대상. `include_internal` 검색 경로 기존재.
- 다른 세션의 베이스라인 측정 존재: `tmp/db-probe-cs-eval.mjs` (참조 가능). internal_cs 마이그레이션은 라이브 미적용 상태 — 지표 API는 코드 우선, 빈 데이터에서 0/None으로 안전 렌더.
- 컨텍스트 조립: `buildInternalCsCopilotContext`(context.ts). 상담원 human-in-the-loop 원칙 유지 — 자동화는 전부 "제안"까지만.

## 인터페이스 계약 (변경 금지)

1. **`GET /api/admin/cs-chat/metrics?days=7|30`** → `{ range: { days, from, to }, volume: { questions, conversations }, fallbackRate: number|null, evidenceMix: { knowledge: number, docs: number, channel: number, none: number }, review: { approved, changesRequested, pending, approvalRate: number|null }, regression: { notEvaluated, pass, needsFix, promoted, excluded }, leadTimeHours: { median: number|null, p90: number|null } }` — 분모 0이면 rate는 null. 인증 가드는 기존 cs-chat 라우트 동일.
2. **`POST /api/admin/cs-chat/regression-eval`** body `{ messageIds?: string[], limit?: number }` (미지정 시 미판정 후보 최신 limit=5, MAX 10) → `{ items: Array<{ messageId: string, conversationId: string, suggestedOutcome: "pass"|"needs_fix", rationale: string, regeneratedExcerpt: string, judgeModel: string }>, skipped: Array<{ messageId: string, reason: string }> }`. 평가는 제안일 뿐 DB의 regression_outcome을 변경하지 않는다.
3. **`POST /api/admin/cs-chat/messages/[messageId]/promote-knowledge`** → 성공 `{ articleId: string, slug: string, reused: boolean }`. 대상: review_state=approved && corrected_content 존재. 멱등: 같은 메시지 재승격 시 기존 문서 갱신(reused: true). 문서는 visibility="internal", noindex=true, updated_by="cs-knowledge-promotion", metadata에 { sourceMessageId, sourceConversationId } 백링크.
4. **공통**: 신규 lib은 `lib/internal-cs-chat/` 하위. seed-internal-canon의 article+chunk+임베딩 로직은 `lib/internal-cs-chat/internal-article-writer.ts`(신규)로 추출해 스크립트와 승격이 공용. 추출 후 seed 스크립트 동작 불변(테스트/실행 경로 확인).
5. **TB UI 소비 지점**: tools 탭 지표 카드 행(계약 1), 회귀 패널 "자동 평가 실행" 버튼+항목별 제안 배지(계약 2 — 제안 배지는 기존 판정 버튼 옆 표시, 클릭 확정은 기존 PATCH 그대로), 검토 패널·회귀 항목의 "지식으로 승격" 버튼(계약 3 — 성공 시 articleId 링크 토스트/알림).

---

### Task A: 백엔드 — 지표·러너·승격 (Opus, worktree: ta-loop)

**소유**: `lib/internal-cs-chat/{metrics.ts,regression-eval.ts,internal-article-writer.ts}`(신규 3), `lib/repositories/internal-cs-chat.ts`(집계·조회 함수 추가), `app/api/admin/cs-chat/metrics/route.ts`(신규), `app/api/admin/cs-chat/regression-eval/route.ts`(신규), `app/api/admin/cs-chat/messages/[messageId]/promote-knowledge/route.ts`(신규), `scripts/seed-internal-canon.ts`(공용 lib로 위임 리팩터), 테스트(tests/internal-cs-chat/ 신규 3+).

스텝: (1) 정독 — generate 라우트의 metadata 기록 필드 실명(origin/citations 정확 키), repo 기존 함수·부분 인덱스, eval.ts judge 패턴, seed 스크립트 로직, 20260715 스키마. (2) TDD 지표: repo 집계 함수(단일/소수 쿼리, 서버 집계 우선 — 500행 JS 집계 금지) → metrics.ts 조립 → 라우트. 빈 DB에서 null/0 shape 검증. (3) TDD 러너: 후보 조회 → 각 항목 재생성(buildInternalCsCopilotContext+generateInternalCsAnswer 재사용, includeInternalDocs true) → judge 프롬프트(corrected_content 기준 정합 판정, eval.ts judge 패턴 참조, 실패 시 skipped로) → 계약 2 shape. LLM 호출 전부 mock 테스트. DB 비변경 검증. (4) TDD 승격: internal-article-writer 추출(seed와 공용, 스크립트 위임 후 기존 seed 테스트/드라이런 무회귀) → 승격 라우트(자격 검증 400/404, 멱등 reused, 백링크). (5) 게이트: 관련 vitest + `npx eslint app components lib --max-warnings=0` + tsc. 커밋 2~3개.

### Task B: 표면 (Sonnet, worktree: tb-loop)

**소유**: `components/admin/cs-chat/InternalCsChatWorkspace.tsx` 단독.

스텝: (1) 정독 — tools 탭 위젯 패턴(docsGaps/회귀 패널), 검토 패널, 기존 fetch 헬퍼. (2) 지표 카드 행: tools 탭 상단, 계약 1 소비, 로드 실패 시 조용한 플레이스홀더(기존 패턴), demoMode는 빈 상태. (3) 회귀 패널 확장: "자동 평가 실행" 버튼(로딩/결과 상태) → 계약 2 응답의 제안을 항목별 배지("제안: 통과"/"제안: 수정 필요"+rationale 툴팁 or 접이식)로 표시. 확정은 기존 판정 버튼(변경 금지). skipped는 목록 하단 경고 1줄. (4) 승격 버튼: 회귀 패널 항목(corrected 존재 시)과 검토 패널 승인 완료 상태에 "지식으로 승격" — 성공 시 articleId 표시(+/admin/docs/{id}/edit 링크), reused면 문구 구분, 실패 에러 표시. 이중 클릭 방지 pending. (5) 게이트: eslint components/admin + 관련 vitest(있으면). 커밋 1개.

### Task C: 통합 (오케스트레이터)
머지 A→B → vitest(internal-cs-chat/chatbot/channel-talk/admin) + eslint + build → Codex 리뷰(범위: 이 유닛 diff) → 보고.

## 비범위
자동 확정(제안까지만), 크론 상시 평가, knowledge.ts 제거, 클러스터링 개선, 공개 챗봇 변경.
