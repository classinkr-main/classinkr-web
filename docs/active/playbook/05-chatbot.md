# 파트 가이드 — 챗봇 / CS

> 담당 에이전트: `.claude/agents/chatbot.md`

## 1. 책임 범위

공개 하이브리드 RAG 챗봇, 위젯·teaser, 챗봇/CS 운영 화면과 해당 API/repository를 소유한다.

- 공개 API: `app/api/chatbot/*`
- 공개 UI: `components/ui/FloatingChatbot.tsx`, `ChatbotTeaser.tsx`, `useChatbotTeaser.ts`
- 엔진: `lib/chatbot/*`, `data/chatbot-golden-set.json`, `data/chatbot-first-contact-set.json`
- 어드민 화면: `app/admin/chatbot`, `app/admin/cs-inquiries`, `app/admin/cs-chatbot`, 상담 Inbox인 `app/admin/channel-talk`
- 어드민 API: `app/api/admin/chatbot/*`, `app/api/admin/cs-chat/*`, 상담 대화용 `app/api/admin/channel-talk/*`
- 데이터 구현: 챗봇 평가·질문·내부 CS·상담 대화 repository와 관련 테스트

`/admin/chatbot`과 `/admin/cs-inquiries`는 redirect stub이 아니다. 둘 다 `CsConsoleNav` 아래에 `CsInquiryDashboard`(CS 문의 통합 대시보드)를 렌더한다. 옛 `ExternalChatbotOpsDashboard`는 더 이상 렌더하지 않는다. 문서 본문·문서 CRUD·채널톡 도움말 문서 동기화는 Content 소유이며, 챗봇/CS는 그 결과를 검색·평가·상담에 사용한다.

## 2. 핵심 파일

- `lib/chatbot/service.ts`: 분류, 검색, 답변 조립, fallback, 캐시, streaming
- `lib/chatbot/llm.ts`: 모델 체인, 생성 설정, 근거 선별 호출, 공개 답변 sanitize와 길이 제어
- `lib/chatbot/source-grounding.ts`: 출처에 문서 본문을 실어 모델에게 넘기고(응답·저장에는 실리지 않음), 본문을 번호 붙은 문장으로 나눈다
- `lib/chatbot/classification.ts`: intent와 handoff 분류
- `lib/chatbot/symptom-triage.ts`: "녹화 안 돼요", "기관 등록 안됨", "에러나요" 같은 증상형 질문을 공개 문제 해결 문서 섹션으로 잇는 결정형 답변. 답변 단계는 문서 섹션에서 그대로 뽑으며, 평가셋은 `data/chatbot-cs-symptom-set.json`
- `lib/chatbot/quick-answers-field.ts`: 길고 구체적인 상황 질문(결제·영업·계정·보안)에 바로 답하는 정해 둔 답. 패턴을 좁게 쓴다
- `lib/chatbot/quick-answers-basics.ts`: 첫 방문자가 한 줄로 묻는 기본 사실 질문(회사·대표, 전자칠판 필수 여부, 지원 기기, 한도, 보관 기간, 원가·고객사 등)의 정해 둔 답. 기존 정해 둔 답이 모두 빗나간 뒤, 45자 이하이고 증상 표현이 없는 질문에만 쓴다. 평가셋은 `data/chatbot-first-contact-set.json`, 경위는 `docs/active/chatbot-first-contact-audit-2026-11-13.md`
- `lib/chatbot/page-context.ts`, `teaser-policy.ts`, `pricing-policy.ts`: 공개 UX와 민감 정책
- `lib/chatbot/channel-handoff.ts`, `doc-gaps.ts`, `eval.ts`, `alpha-readiness.ts`, `alpha-db-contract.ts`
- `components/admin/cs/CsInquiryDashboard.tsx`, `components/admin/cs/CsConsoleNav.tsx`

모델명, thinking 설정, 유사도 하한, 임베딩 차원과 teaser 대상 페이지는 코드와 테스트를 정본으로 확인한다. 시점별 운영 수치나 활성화 건수는 이 플레이북에 복제하지 않는다.

모델을 바꾸거나 점검할 때는 `models.list`가 아니라 실제 `generateContent` 호출로 확인한다. 종료된 모델도 목록에는 남아 있고(2026-11 gemini-2.5 계열), 모델마다 받는 `thinkingLevel`이 달라 지원하지 않는 값을 보내면 400으로 실패한다. 모델 호출이 전부 실패해도 오류 없이 결정형 초안이 나가므로, 답이 문서 조각처럼 보이면 런타임 로그의 `[chatbot] Gemini call failed`부터 본다.

최종 답변에 모델을 쓰는 방식은 `CHATBOT_FINAL_ANSWER_LLM`으로 고른다. 기본값 `select`는 모델이 문서에서 답 문장의 번호만 고르고 답은 그 문장 그대로 나간다. `generate`는 고른 문장을 근거로 모델이 답을 다시 쓰고, `off`는 모델을 쓰지 않는다. 기본값의 측정 근거와 방식별 수치는 `docs/active/chatbot-first-contact-audit-2026-11-13.md`에 있다.

## 3. 강제 규칙

### 공개 답변 안전성

- 모델 호출이 실패하거나 잘린 경우 검색 raw chunk를 공개 답변으로 내보내지 않는다. 검색 점수가 낮은 문서만 있을 때(doc_suggestion) 공개 경로의 초안은 그 조각을 붙이지 않고 못 찾았다고 밝힌다(`WEAK_SOURCE_DRAFT_ANSWER`).
- 검색 조각으로 만든 초안은 근거 선별을 거친다. 문서에 질문에 직접 답하는 문장이 있으면 그 문장으로 답하고, 없으면 못 찾았다고 답한다. 문서에 답이 없는데 모델이 답을 쓰게 두면 없는 단계나 근거 없는 "안 됩니다"가 나온다(실측: 답 문장이 없을 때 근거 밖 단정 56%).
- 모델에게 근거를 줄 때는 문장이 온전한 문서 본문을 준다. 220자 요약처럼 문장 중간에서 끊긴 조각을 주면 모델이 뒷부분을 지어 잇는다.
- 근거가 없는 사실(회사·대표·고객사·한도·보관 기간·기능 목록, 지역·업종의 도입 추세, 사례의 성과)은 모델이 지어내지 않게 한다. `generate` 모드의 프롬프트에는 요청마다 근거 범위를 다시 적는 요구가 붙는다(`lib/chatbot/llm.ts`). 시스템 지시의 일반 원칙만으로는 지켜지지 않았다.
- 못 찾았다는 답에는 안내형 첫마디("순서대로 알려 드릴게요")나 영업용 끝 질문을 붙이지 않는다.
- "공개 안내에 없다"고 답하기 전에 도움말 문서만이 아니라 홈페이지의 다른 공개 페이지(회사 소개, 서비스 소개서, 체크아웃, 개인정보처리방침)도 확인한다. 도움말에 없어도 그 페이지에 실린 내용을 없다고 하면 오답이다.
- non-stream과 stream 모두 동일한 사용성 게이트, 모델 fallback, deterministic fallback을 통과한다.
- 공개 답변에서 내부 출처 표현, 원본 URL/이미지, PII, 불필요한 마크다운을 제거한다.
- 검증된 큐레이션 직답은 임의로 모델이 재작성해 의미를 완화하지 않게 한다.
- 가격·계약·환불·계정·장애·설치·보안·API 범위는 확인된 정보만 말하고, 필요한 경우 상담 연결로 전환한다.
- 프롬프트나 검색/응답 계약을 바꾸면 관련 cache version과 골든셋 회귀를 확인한다.
- 증상형 질문은 "안 돼/안됨" 같은 증상 표현만으로 특정 주제(예: 로그인)에 묶지 않는다. 대상이 없는 오류 질문은 오류 문구·화면·기기를 되묻고, 대상이 있으면 해당 문제 해결 문서 섹션으로 답한다. 트리아지 답변에는 아이디·연락처 같은 식별 정보를 채팅으로 적으라는 안내를 넣지 않는다.
- 낱말 하나로 주제를 정하지 않는다. '접속'만으로 로그인 문제, 'OPS'만으로 장비 구성, '녹화 … 저장'만으로 권한 안내로 보내면 사실 질문("한 교실에 최대 몇 명까지 접속", "OPS 원가", "녹화본 몇 달 저장")에 엉뚱한 답이 나간다. 정해 둔 답을 더하면 기존 평가 질문 전체의 답을 수정 전과 비교해 다른 질문을 가로채지 않는지 본다.
- 증상 트리아지·말투 계층 같은 공개 위젯 전용 결정형 조기 답변은 내부 CS 코파일럿 경로(`includeInternalDocs`)에서 건너뛴다. 내부 경로는 내부 문서 검색까지 가야 한다(`tests/channel-talk/include-internal-docs.test.ts`).

### 시간 예산과 오류 처리

- `app/api/chatbot/query`는 느린 검색·임베딩·LLM 경로 때문에 500으로 끊기지 않도록 짧은 단계별 시간 예산과 deterministic fallback을 유지한다.
- `CHATBOT_KNOWLEDGE_SEARCH_TIMEOUT_MS`나 `CHATBOT_FINAL_ANSWER_TIMEOUT_MS`를 바꾸면 `CHATBOT_ROUTE_TIMEOUT_MS`와 클라이언트 timeout을 함께 검토한다.
- 잘못된 JSON 또는 body shape는 500이 아니라 400 계열로 응답한다.
- 문서 검색, 벡터 검색, 최종 생성 중 하나가 실패해도 안전한 답변 경로가 남아야 한다.

### 어드민과 CS

- `/admin/chatbot`(=`/admin/cs-inquiries`)은 CS 문의 통합 대시보드다. 상세 문서 보강·품질 검수는 `CsConsoleNav`가 연결하는 docs 탭과 역할을 나눠 가진다.
- `/admin/cs-chatbot`은 내부 CS 작업면, `/admin/channel-talk`은 상담 Inbox다.
- 내비 표시 여부나 사이드바 배치(`nav_overrides`·숨김)는 보안 경계가 아니다. 각 admin API가 role/capability를 강제한다.
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

변경 범위에 따라 `npx vitest run tests/chatbot`과 골든셋 평가를 실행한다. 증상 트리아지·공개 문제 해결 문서의 섹션 제목을 바꾸면 `npx vitest run tests/chatbot/symptom-triage.test.ts`도 실행한다. 기본 사실 답이나 분류·검색 조건을 바꾸면 `npx vitest run tests/chatbot/basics-quick-answers.test.ts`(첫 방문자 질문 192개가 기대한 답으로 가는지, 되묻기·약한 문서 제시가 0건인지)도 실행한다. 근거 선별이나 모델 프롬프트를 바꾸면 `npx vitest run tests/chatbot/evidence-selection.test.ts tests/chatbot/model-chain.test.ts`를 실행하고, 모델이 답을 쓰는 경로를 바꿨다면 실제 호출로 답을 근거와 대조한다(방법은 위 점검 기록의 "다시 돌리는 법"). 모델이 답을 다시 쓰는 경로를 시험하는 테스트는 `tests/chatbot/helpers/final-answer-llm.ts`로 `generate` 모드를 켜고 선별 호출을 따로 답한다. 특히 다음을 확인한다.

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
