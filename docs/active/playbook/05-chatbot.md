# 파트 가이드 — 챗봇 / CS

> 담당 에이전트: `.claude/agents/chatbot.md`

## 1. 책임 범위

공개 하이브리드 RAG 챗봇, 위젯·teaser, 챗봇/CS 운영 화면과 해당 API/repository를 소유한다.

- 공개 API: `app/api/chatbot/*`
- 공개 UI: `components/ui/FloatingChatbot.tsx`, `ChatbotTeaser.tsx`, `useChatbotTeaser.ts`
- 엔진: `lib/chatbot/*`, `data/chatbot-golden-set.json`
- 어드민 화면: `app/admin/chatbot`, `app/admin/cs-chatbot`, 상담 Inbox인 `app/admin/channel-talk`
- 어드민 API: `app/api/admin/chatbot/*`, `app/api/admin/cs-chat/*`, 상담 대화용 `app/api/admin/channel-talk/*`
- 데이터 구현: 챗봇 평가·질문·내부 CS·상담 대화 repository와 관련 테스트

`/admin/chatbot`은 redirect stub이 아니다. `ExternalChatbotOpsDashboard`와 `CsConsoleNav`를 렌더하는 현재 CS 운영 대시보드다. 문서 본문·문서 CRUD·채널톡 도움말 문서 동기화는 Content 소유이며, 챗봇/CS는 그 결과를 검색·평가·상담에 사용한다.

## 2. 핵심 파일

- `lib/chatbot/service.ts`: 분류, 검색, 답변 조립, fallback, 캐시, streaming
- `lib/chatbot/llm.ts`: 모델 체인, 생성 설정, 공개 답변 sanitize와 길이 제어
- `lib/chatbot/classification.ts`: intent와 handoff 분류
- `lib/chatbot/page-context.ts`, `teaser-policy.ts`, `pricing-policy.ts`: 공개 UX와 민감 정책
- `lib/chatbot/channel-handoff.ts`, `doc-gaps.ts`, `eval.ts`, `alpha-readiness.ts`, `alpha-db-contract.ts`
- `components/admin/chatbot/ExternalChatbotOpsDashboard.tsx`, `components/admin/cs/CsConsoleNav.tsx`

모델명, thinking 설정, 유사도 하한, 임베딩 차원과 teaser 대상 페이지는 코드와 테스트를 정본으로 확인한다. 시점별 운영 수치나 활성화 건수는 이 플레이북에 복제하지 않는다.

## 3. 강제 규칙

### 공개 답변 안전성

- 모델 호출이 실패하거나 잘린 경우 검색 raw chunk를 공개 답변으로 내보내지 않는다.
- non-stream과 stream 모두 동일한 사용성 게이트, 모델 fallback, deterministic fallback을 통과한다.
- 공개 답변에서 내부 출처 표현, 원본 URL/이미지, PII, 불필요한 마크다운을 제거한다.
- 검증된 큐레이션 직답은 임의로 모델이 재작성해 의미를 완화하지 않게 한다.
- 가격·계약·환불·계정·장애·설치·보안·API 범위는 확인된 정보만 말하고, 필요한 경우 상담 연결로 전환한다.
- 프롬프트나 검색/응답 계약을 바꾸면 관련 cache version과 골든셋 회귀를 확인한다.

### 시간 예산과 오류 처리

- `app/api/chatbot/query`는 느린 검색·임베딩·LLM 경로 때문에 500으로 끊기지 않도록 짧은 단계별 시간 예산과 deterministic fallback을 유지한다.
- `CHATBOT_KNOWLEDGE_SEARCH_TIMEOUT_MS`나 `CHATBOT_FINAL_ANSWER_TIMEOUT_MS`를 바꾸면 `CHATBOT_ROUTE_TIMEOUT_MS`와 클라이언트 timeout을 함께 검토한다.
- 잘못된 JSON 또는 body shape는 500이 아니라 400 계열로 응답한다.
- 문서 검색, 벡터 검색, 최종 생성 중 하나가 실패해도 안전한 답변 경로가 남아야 한다.

### 어드민과 CS

- `/admin/chatbot`은 외부 공개 챗봇 운영 지표 대시보드다. 상세 문서 보강·품질 검수는 `CsConsoleNav`가 연결하는 docs 탭과 역할을 나눠 가진다.
- `/admin/cs-chatbot`은 내부 CS 작업면, `/admin/channel-talk`은 상담 Inbox다.
- 내비의 표시 여부나 `nav_preset`은 보안 경계가 아니다. 각 admin API가 role/capability를 강제한다.
- AI 초안은 자동 게시·자동 발송하지 않는다.

## 4. 크로스컷

- Content가 `docs_articles`, `docs_ai_chunks`, slug, 가시성, 임베딩 계약을 바꾸면 챗봇 검색과 출처 중복 제거를 함께 검증한다.
- 공개 카피와 답변 원칙은 `lib/classin-positioning.ts`, UI는 `DESIGN.md`를 정본으로 삼는다.
- admin API는 Admin Core의 인증·응답 규약과 admin Supabase client 규약을 따른다.

## 5. 검증

```bash
npm run typecheck
npx eslint app components lib --max-warnings=0
npm run build
npm run check:alpha-db
```

변경 범위에 따라 `npx vitest run tests/chatbot`과 골든셋 평가를 실행한다. 특히 다음을 확인한다.

- LLM·벡터 검색 timeout/실패 시 deterministic fallback
- stream/non-stream의 동일한 안전 게이트
- 잘못된 JSON/body의 400 응답
- 가격·민감 주제의 핵심 문구 회귀
- `/admin/chatbot` 대시보드와 CS 콘솔 내비의 role/capability 강제

## 6. 먼저 읽을 것

1. `lib/chatbot/service.ts`
2. `lib/chatbot/llm.ts`
3. `lib/classin-positioning.ts`의 chatbot/brandVoice
4. `lib/chatbot/{teaser-policy,page-context,pricing-policy}.ts`
5. `docs/active/cs-admin-console-ia-2026-07-27.md`
