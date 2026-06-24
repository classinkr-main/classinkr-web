# 파트 가이드 — 챗봇 (Chatbot)

> 담당 에이전트: `.claude/agents/chatbot.md` · 기준 시점: 2026-06-23
> 변경 검증: `npx eslint app components lib --max-warnings=0` + `npm run build`

## 1. 파트 한 줄 정의

공개 사이트 챗봇은 **하이브리드 RAG(벡터+키워드+큐레이션 직답)로 사내 가이드 문서를 검색하고, "따뜻한 상담원" 톤으로 Gemini가 최종 답변을 작성하되, 가격·계약·장애·보안 같은 민감 영역은 단정 대신 상담 연결로 가드**하는 시스템. 상단 퍼널(체류 2분 선제 말풍선·페이지별 스타터)과 어드민 운영 콘솔(질문 백로그·골든셋 평가·문서 보강 큐)을 함께 갖췄다.

## 2. 핵심 디렉토리/파일 맵

- `lib/chatbot/service.ts` — 엔진의 심장: PII 마스킹, 분류, 검색(벡터/키워드/큐레이션), `composeAnswer`/`formatConsumerAnswer`, 사용성 게이트, 캐시, 스트리밍 진입점 `streamChatbotQuery`.
- `lib/chatbot/llm.ts` — Gemini 호출 래퍼: 모델 티어/체인, `generationConfig`(thinking 설정), `sanitizePublicAnswerText`, `clampAnswerToLength`, 임베딩, **시스템 프롬프트(답변 스타일 규칙의 본진)**.
- `lib/chatbot/classification.ts` — 질문 → 카테고리/intent/handoffIntent 분류.
- `lib/chatbot/vector-fallback.ts` — 클라이언트 측 코사인 유사도 폴백(`similarityFloor`).
- `lib/chatbot/page-context.ts` — 경로별 teaser 문구·스타터·eligible 여부.
- `lib/chatbot/teaser-policy.ts` — 선제 말풍선 트리거 순수함수 `shouldShowTeaser` + `TEASER_DWELL_THRESHOLD_MS = 120_000`.
- `lib/chatbot/pricing-policy.ts` — 견적 구성 항목 상수(OPS 제외) + 최종금액 단정 금지 문구.
- `lib/chatbot/open-chatbot.ts` — `classin:chatbot-open` window 이벤트 디스패처(button/teaser/cta source).
- `lib/chatbot/cs-figma-guides.ts` — CS 사용가이드 직답(실제 구현은 `lib/cs-figma-guides.ts` re-export).
- `lib/chatbot/channel-handoff.ts` — 채널톡 상담 핸드오프 생성(server-only).
- `lib/chatbot/doc-gaps.ts` — 문서 보강 큐 + AI 초안 생성(자동게시 금지).
- `lib/chatbot/eval.ts` / `alpha-readiness.ts` / `alpha-db-contract.ts` — 골든셋 평가, 알파 준비도 점검.
- `components/ui/FloatingChatbot.tsx` — 공개 위젯: NDJSON 스트림 소비, teaser 렌더, 퍼널 계측, 핸드오프 CTA.
- `components/ui/useChatbotTeaser.ts` / `ChatbotTeaser.tsx` — 체류 적립 훅(sessionStorage·visible 탭만) + 미니멀 칩 UI.
- `app/api/chatbot/{query,query/stream,feedback,recommended-questions}/route.ts` — 4개 공개 라우트(rate-limit 12/분, stream은 NDJSON).
- `app/admin/chatbot/page.tsx` — 어드민 "챗봇 운영" 콘솔.
- `lib/classin-positioning.ts` — `chatbot.answerPrinciples`/`brandVoice`/스타터의 SSOT(프롬프트가 여기서 주입).

## 3. 가장 중요한 업무

1. **답변 품질 게이트 유지** — Gemini 죽으면 raw 청크가 노출되던 사고의 재발 방지(`isUsableGeneratedAnswer` + 모델 폴백 체인 + 길이 클램프).
2. **민감 영역 가드** — 가격/계약/장애/학원결제/보안·프롬프트 인젝션을 단정 없이 상담 연결로 라우팅(`buildPolicyGuardResponse`).
3. **큐레이션 직답 vs RAG 분기** — 검증된 템플릿은 Gemini 재작성을 건너뛰고(드리프트·지연 방지), 나머지는 RAG.
4. **상단 퍼널 전환** — teaser 노출/클릭/오픈/첫질문 계측.
5. **KB 자가증식 루프** — 질문 백로그 → 문서 갭 → AI 초안 → 어드민 검토 게시.

## 4. 지침 & 규칙 (인용 위치)

- **답변 스타일**("따뜻한 상담원 +20%, 이모지 X, 깊이별 길이, `- ` 불릿, 줄바꿈"): `lib/chatbot/llm.ts` `BASE_SYSTEM_INSTRUCTION` — "이모지 안 씀", "넓은 질문 3~4줄·6줄 안팎 상한", "2개 이상 나열은 `- ` 불릿 2~4개", "요약:/권장 순서: 같은 라벨 금지". 원칙은 `CLASSIN_POSITIONING.chatbot.answerPrinciples`에서 주입.
- **답변 상태 모델**: "확인됨/조건부 가능/확인 필요/제공하지 않음/상담 연결" 먼저 정하고 작성.
- **모델 config**(`lib/chatbot/llm.ts`): 기본 fast=`gemini-2.5-flash`, reasoning/advanced=`gemini-2.5-pro`. `buildGenerationConfig`: **2.5-flash 만 `thinkingBudget:0`**, gemini-3 계열은 `thinkingLevel`, `maxOutputTokens` flash 600 / pro 2048. `UNSUPPORTED_GEMINI_MODELS`에 들어온 env 모델은 기본값으로 폴백.
- **유사도 하한**: `VECTOR_SIMILARITY_FLOOR = 0.5`(골든셋 측정 마진), 클라이언트 폴백 `0.7`.
- **임베딩**: `gemini-embedding-001`, 1536차원(`CHATBOT_EMBED_MODEL`/`CHATBOT_EMBED_DIM`).
- **가격 가드레일**: OPS는 견적 항목 아님(`pricing-policy.ts` `PRICE_COMPOSITION_ITEMS`에 OPS 없음). 견적 안내는 "전자칠판+OPS, 카메라·스탠드/벽걸이, 소프트웨어, 설치·온보딩" 구성으로만, 최종금액 단정 금지. 학원결제 자체기능은 "제공하지 않습니다" 직답.
- **teaser 트리거**: 누적 체류 2분 초과·세션당 1회·닫으면 끝. eligible 페이지: 홈·`/product/*`·`/contact`·`/docs/*`만. **`/pricing`은 노출 안 함**(DEFAULT → `teaserEligible:false`).
- **rate-limit**: query/stream 12회/분, feedback 20회/분.
- **공개 답변에서 출처/URL/이미지/마크다운 노출 금지**: `sanitizePublicAnswerText`(서버) + FloatingChatbot 클라이언트 재정제.

## 5. 절대 깨면 안 되는 것 / 주의점

- **raw-chunk 노출 트랩**: Gemini가 조용히 실패하면 검색 raw 청크가 그대로 나간다. 방어선 = (a) `isUsableGeneratedAnswer`(길이≥24, 자모/쉼표 끝 거부, ClassIn 앵커 필수, 종결어미 필수), (b) `resolveModelChain` 폴백, (c) `clampAnswerToLength`(문장 경계 보존 — 단순 slice 하면 멀쩡한 답이 통째로 버려짐). 스트리밍 경로도 동일 게이트 통과.
- **thinking-token drain**: 2.5-flash 에 thinking 켜면 thoughts가 `maxOutputTokens`를 다 써 빈/잘린 응답 → 게이트 거부 → raw 폴백. `thinkingBudget:0` 유지 필수. **모델 변경 전 운영 결정 이력 재확인**(과거 `gemini-3.1-pro`(404)·`3.5-flash`(503) 등 죽은 모델 강행 사고).
- **가격 가드레일 / OPS 제외**: 최종 견적·금액 단정 금지(상담 연결). OPS는 별도 견적 항목으로 노출 금지. 학원비 결제·수납·정산을 기본 기능처럼 말하면 안 됨.
- **민감 분기 단정 금지**: 가격·계약·환불·계정·장애·장비상태·설치가능·API/자동화 범위는 "확인 필요/상담 연결"로. Gemini가 안전 초안의 "미지원/확인 필요"를 "가능/지원"으로 완화 금지(`FINAL_SYSTEM_INSTRUCTION`).
- **큐레이션 = 최종본**: 큐레이션 직답은 Gemini 재작성을 건너뜀(`shouldUseAiFinalAnswer`, `isCuratedTemplateQuestion`). 회귀 핵심 문구 보존.
- **캐시 버전 bump**: 답변/검색 스키마·프롬프트 바꾸면 `ANSWER_CACHE_VERSION`·`RETRIEVAL_CACHE_VERSION` bump 안 하면 stale 답변이 5분간 노출.
- **pgvector 인자**: `match_docs_ai_chunks` 임베딩은 `JSON.stringify`로 문자열 전달(배열 직접 넘기면 거부).

## 6. 관련 문서

- `docs/active/chatbot-knowledge-base-audit-2026-06-17.md` — KB 인벤토리/SSOT 맵.
- `docs/active/chatbot-docs-activation-runbook-2026-06-14.md` — 활성화 절차 + 확정 지침(임베딩 1536d, fast 티어, AI초안 자동게시 금지, 핸드오프=채널톡).
- `docs/active/chatbot-docs-hyperdevelop-plan-2026-06-13.md` — 문서×챗봇 루프 기획.
- `docs/active/chatbot-knowledgebase-faq-analytics-plan.md` — FAQ/애널리틱스 기획.
- SSOT 정렬: `lib/classin-positioning.ts`, 품질게이트 `data/chatbot-golden-set.json` + `tests/chatbot/`.

## 7. 현재 목표 & 백로그 (2026-06-23 스냅샷)

- **상단 퍼널 C/D 로드맵(미구현, 다음 사이클)**: **C** = 만족·재사용(세션 기억·재방문), **D** = 상담·리드 전환(핸드오프 조건 확대·리드 캡처·예약). 외부 CTA→챗봇 시범 연결(`openChatbot` 유틸 준비됨, `source:"cta"` 타입 존재하나 미배선) — 별도 비주얼 검토 후.
- **`/pricing` teaser 노출**: 현재 의도적 hidden, 추후 검토.
- **KB 활성화 상태**: 코드 루프 완결. 채널톡 동기화로 `docs_ai_chunks` 적재·임베딩 백필되어 **하이브리드 검색 가동 중**. 채널톡 수치는 실제 Supabase 카운트로 재확인 권장. 운영 의존: prod `GEMINI_API_KEY` 미설정이면 임베딩→키워드 폴백·답변→템플릿 폴백.
- **성능(완료)**: 큐레이션 직답 Gemini 스킵, 무세션 답변 캐시, history 병렬, embed 타임아웃 2s. 어드민 SQL 집계 마이그(`20260618_*`)은 DB 적용 필요.
- **어드민 콘솔 백로그 구동**: 질문 백로그 분류, 추천질문 운영, 알파 준비도, 골든셋 평가.

## 8. 검증 방법

```bash
npx eslint app components lib --max-warnings=0
npm run build
```
챗봇 전용: `tests/chatbot/`(vitest, node 환경·DOM 없음 → 순수함수만: teaser-policy·page-context·pricing-policy). UI는 lint+build로만 검증. 골든셋 평가: 어드민 `/admin/chatbot` "골든셋 평가" 버튼 → `/api/admin/chatbot/eval`(`data/chatbot-golden-set.json`, 통계 오염 없음). 회귀 시 핵심 문구 보존 확인.

## 9. 작업 시작 시 먼저 읽을 것

1. `lib/chatbot/service.ts` — 검색→분류→답변 조립→사용성 게이트→스트림 전체 파이프라인.
2. `lib/chatbot/llm.ts` — 시스템 프롬프트(답변 스타일)·모델 티어/체인·thinking 설정·sanitize/clamp.
3. `lib/classin-positioning.ts`의 `chatbot`/`brandVoice` — 톤·가격·민감주제 원칙 SSOT.
4. `lib/chatbot/teaser-policy.ts`/`page-context.ts`/`pricing-policy.ts` — 상단 퍼널·가격 가드 순수함수.
5. `docs/active/chatbot-knowledge-base-audit-2026-06-17.md` — KB 구조.
