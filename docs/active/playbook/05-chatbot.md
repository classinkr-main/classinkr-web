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

- `lib/chatbot/service.ts`: 분류, 정해 둔 답 후보, 검색, 답변 조립, 근거 선별, 두 번째 검색, 고정 문구, 캐시, streaming
- `lib/chatbot/llm.ts`: 모델 체인, 생성 설정, 근거 선별·관문 판정·목차 고르기 호출, 결제·인증 실패 차단기, 공개 답변 sanitize와 길이 제어
- `lib/chatbot/answer-gate.ts`: 정해 둔 답 확인 관문(아래 §3)
- `lib/chatbot/doc-outline.ts`: 두 번째 검색이 쓰는 공개 정적 문서 목차(문서 제목 + 절 제목)
- `lib/chatbot/source-grounding.ts`: 출처에 문서 본문을 실어 모델에게 넘기고(응답·저장에는 실리지 않음), 본문을 번호 붙은 문장으로 나눈다
- `lib/chatbot/classification.ts`: intent와 handoff 분류
- `lib/chatbot/symptom-triage.ts`: "녹화 안 돼요", "기관 등록 안됨", "에러나요" 같은 증상형 질문을 공개 문제 해결 문서 섹션으로 잇는 결정형 답변. 답변 단계는 문서 섹션에서 그대로 뽑으며, 평가셋은 `data/chatbot-cs-symptom-set.json`
- `lib/chatbot/quick-answers-field.ts`: 길고 구체적인 상황 질문(결제·영업·계정·보안)에 바로 답하는 정해 둔 답
- `lib/chatbot/quick-answers-basics.ts`: 첫 방문자가 한 줄로 묻는 기본 사실 질문의 정해 둔 답. 기존 정해 둔 답이 모두 빗나간 뒤, 45자 이하이고 증상 표현이 없는 질문에만 쓴다. 평가셋은 `data/chatbot-first-contact-set.json`
- `lib/chatbot/self-knowledge.ts`: 챗봇 자기소개·잡담 답. 잡담 공감 답(`small_talk`)은 묻는 말 표시가 없을 때만 관문에서 빠진다(`CONVERSATIONAL_SELF_KNOWLEDGE_KEYS`, `hasQuestionSignal`)
- `lib/chatbot/tone.ts`: 공감 첫마디·상담 연결 앞세우기·끝 질문(말투 층)
- `lib/chatbot/conversation-context.ts`: 위젯이 보내는 직전 한 턴(`context.previousTurn`)과 문서 페이지 경로로 짧은 대답·지시어 후속 질문을 검색용 질문으로 넓힌다(아래 §3 0단계)
- `lib/chatbot/fixed-answers.ts`: 못 찾음·확정 못 함 고정 문구(§7)와 그 목록. 말투 층·끝 질문·서비스가 같은 목록을 본다
- `lib/chatbot/generated-answer.ts`: `generate` 모드에서 모델 글을 내보내기 전에 보는 순수 함수(추천 자료 토큰 떼기, 근거 문장 대조)
- `lib/chatbot/page-context.ts`, `teaser-policy.ts`, `pricing-policy.ts`: 공개 UX와 민감 정책
- `lib/chatbot/channel-handoff.ts`, `doc-gaps.ts`, `eval.ts`, `alpha-readiness.ts`, `alpha-db-contract.ts`
- `scripts/chatbot-live-eval.ts`: 질문 묶음을 실제 모델로 돌려 답을 JSONL로 남기는 측정 스크립트(사용법은 `scripts/chatbot-persona-loop/README.md`)
- `components/admin/cs/CsInquiryDashboard.tsx`, `components/admin/cs/CsConsoleNav.tsx`

임베딩 차원, 유사도 하한과 teaser 대상 페이지는 코드와 테스트를 정본으로 확인한다. 시점별 운영 수치나 활성화 건수는 이 플레이북에 복제하지 않는다. 구조를 바꾼 경위와 측정값은 기록 문서에 있다: [첫 방문자 질문 점검(2026-11-13)](../chatbot-first-contact-audit-2026-11-13.md), [구조 변경과 측정(2026-11-18)](../chatbot-structure-round-2026-11-18.md).

## 3. 공개 답 결정 흐름

`buildChatbotCoreBase`(`lib/chatbot/service.ts`)가 아래 순서로 답을 정한다. 내부 CS 코파일럿 경로(`includeInternalDocs`)는 정해 둔 답·증상 트리아지·관문·두 번째 검색을 건너뛰고 내부 문서까지 검색한다.

0. **대화 맥락.** 요청이 직전 한 턴(`context.previousTurn`: 질문 200자 이하·직전 답이 물은 정보 `askedSlot`·답 모드, 꼴이 틀리면 400)을 함께 보내면, 짧은 대답("휴대폰이요")·답 모양(askedSlot)·지시어 후속 질문("그러면 아이패드는요", "아까 그거 다시요")을 '직전 질문 + 지금 말'로 넓혀 아래 단계와 답 색인(compiled)에 넘긴다. 혼자서도 정해 둔 답이 서는 짧은 말은 넓히지 않는다. DB 이력은 쓰지 않는다(측정과 운영이 같은 입력을 본다). 같은 대화를 가리키는 말이면 '지난 문의는 볼 수 없어요' 지름길을 타지 않고, 증상 안내 뒤 "해 봤는데 또 안 돼요"는 상담 연결로 보낸다. 직전 턴 없이 지시어만 있으면(대상 불명) 못 찾음 대신 되묻기와 처음 온 사람용 칩을 준다. 문서 페이지(`/docs/<분류>/<slug>`)에서 "방금 본 내용"처럼 그 문서를 가리키면 그 문서 절을 검색 후보 맨 앞에 둔다. 말투(감정 신호)는 넓히기 전 이번 말로 본다. 직전 턴이 없는 한 줄 질문의 흐름은 바뀌지 않는다.
1. **정해 둔 답 후보.** 인사, 정책 가드, 정해 둔 답(`buildServiceQuickAnswer`: 필드·기본 사실·자기소개 답 등), 즉시 상담 연결, 증상 트리아지, CS 운영 가이드 순으로 정규식이 후보를 고른다. 정규식은 후보 고르기에만 쓴다.
2. **관문.** 후보 가운데 관문 대상(`gateOriginal`이 있는 답)은 `gatePreparedCore` → `checkPreparedAnswer`(`lib/chatbot/answer-gate.ts`)로 보낸다. 모델은 "이 답이 이 질문에 대한 답인가"만 판정하고 글은 쓰지 않는다.
   - `kept`: 정해 둔 답을 그대로 낸다. `skipped`(꺼짐·실패): 판정 없이 그대로 낸다.
   - `rejected`: 정해 둔 답을 버리고 `answerFromDocumentsAfterGate`로 간다(아래 3·4·5단계와 같은 문서 경로).
   - 관문 대상이 아닌 답: 거절 답(보안·범죄·모델 정보), 화난·반복 문의나 직접 청한 상담 연결, 묻는 말 표시가 없는 잡담 공감 답(`small_talk`).
   - 검색 뒤 `composeAnswer`가 만든 분류별·제목 틀 답(`template:*`)도 같은 관문을 거친다. 검색 조각 초안·되묻기·못 찾음 안내는 대상이 아니다.
3. **문서 검색·근거 선별.** 정해 둔 답이 없으면 검색하고, 검색 조각으로 만든 초안은 근거 선별(`applyEvidenceSelection`)을 거친다. 모델은 문서 문장의 번호만 고르고, 답은 그 문장 그대로 나간다(`select`). 앞 문장에 기대는 문장("그래도 안 되면…")은 바로 앞 문장이 함께 골렸을 때만 남긴다. 고른 문장이 없으면 못 찾았다고 답한다. `generate` 모드면 문장을 고른 답만 그 문장을 근거로 모델이 다시 쓴다. 정해 둔 답·관문을 거친 답·틀 답·fallback 초안은 다시 쓰지 않는다. 모델 글은 끝까지 받은 것(finishReason STOP)만 쓰고, 추천 자료 토큰을 먼저 뗀 뒤 사용성 검사와 근거 문장 대조(`checkGeneratedAnswer`)를 통과해야 나간다. 못 쓰면 고른 문장 답을 낸다.
4. **보류.** `withholdUnverifiedDraft`가 확인되지 않은 초안(검색 조각 초안 또는 첫 출처 점수 240 미만)을 그대로 내보내지 않는다. 선별 실패면 `MODEL_UNAVAILABLE_ANSWER`, 선별이 꺼진 상태의 낱말 목록 밖 질문이면 `NO_SOURCE_FACT_ANSWER`로 바꾼다.
5. **두 번째 검색.** 못 찾음 답(`NO_SOURCE_FACT_ANSWER`·`WEAK_SOURCE_DRAFT_ANSWER`)이 나가려는 사실 질문이면 `applySecondChanceRetrieval`이 공개 문서 목차(`doc-outline.ts`, 정적 문서 기준)에서 절을 고르고 → 그 절 문장으로 근거 선별 → 관문 판정을 한 번 더 한다. 셋 다 통과하면 문서 문장으로 답한다. 사람이 공개 범위를 정한 주제(`isPolicyGovernedTopic`: 금액·원가·요금제 이름·무료 체험·국적·특정 학원·최대/무대 인원·전자칠판 크기)는 돌리지 않는다.
6. **못 찾음.** 여기까지 답 문장이 없으면 못 찾음 답이 나간다.

관문이 버린 뒤의 문서 경로(`answerFromDocumentsAfterGate`)는 문장을 못 고르면 버린 답이나 분류별 틀·되묻기 문구로 돌아가지 않고, 순서대로 판단한다: 고른 문장 → 선별 호출 실패면 `MODEL_UNAVAILABLE_ANSWER` → 사실 질문이면 `NO_SOURCE_FACT_ANSWER`(뒤이어 두 번째 검색) → 증상 신고이거나 버린 답이 증상·가이드 답이면 `SYMPTOM_AFTER_GATE_ANSWER` → 그 밖은 일반 되묻기(`buildGeneralClarify`). 사람이 공개 범위를 정한 주제는 문서 문장을 붙이지 않고 `POLICY_TOPIC_AFTER_GATE_ANSWER`로 간다.

스트림 경로는 같은 코어를 `generateAnswer=false`, `deferEvidenceSelection`, `answerGate: true`로 부르고, 선별·보류·두 번째 검색을 일반 경로와 같은 함수로 이어서 한다. 관문 판정과 선별이 끝나기 전에는 아무 글자도 내보내지 않는다. `generate` 모드의 모델 글도 끝까지 모아 일반 경로와 같은 검사를 마친 뒤 replace 한 번으로 내보낸다(delta 없음). 답이 바뀌면 말투 층(`applyConversationTone`)을 다시 입혀 두 경로의 답과 상담 버튼 표시를 맞춘다.

## 4. 모델 호출이 실패할 때

모델 호출이 실패해도 요청은 오류 없이 끝난다. 단계별 동작은 다음과 같다.

| 단계 | 실패하면 |
|---|---|
| 관문 판정 | 기존 정해 둔 답을 그대로 낸다(`skipped`, `skipReason`: `error`·`timeout`·`model_unavailable`). 답 캐시에 넣지 않는다. |
| 근거 선별(모델 켜짐) | 확인되지 않은 검색 조각 대신 `MODEL_UNAVAILABLE_ANSWER`(상담 버튼)를 낸다. 낱말 목록 안팎, 상담 연결 초안을 가리지 않는다. 답 캐시에 넣지 않고, 두 번째 검색도 돌리지 않는다. 시간 초과(`select` 3.5초, `generate` 2초)도 실패다. |
| 관문 뒤 문서 경로의 선별 | 못 찾음·되묻기 대신 `MODEL_UNAVAILABLE_ANSWER`. |
| 두 번째 검색 | 오류·시간 초과·차단기로 끝내지 못하면 못 찾음을 단정하지 않고 '지금 확인하지 못함'(`MODEL_UNAVAILABLE_ANSWER`, 차단기가 열려 있으면 변형)으로 바꾼다. 캐시에 넣지 않는다. |
| 답 다시 쓰기(`generate`) | 선별이 문장을 고른 답만 다시 쓴다. 다시 쓰기가 실패·시간 초과·끊김(`MAX_TOKENS` 등 STOP 이 아닌 끝, 끊긴 스트림)이거나 검사에 걸리면 선별한 문장 답을 낸다. |
| 질문 임베딩 | 키워드 검색만으로 찾는다(Supabase 경로). |

**차단기**(`lib/chatbot/llm.ts`). Gemini가 401·402·403(결제 크레딧 소진·키 인증 실패)을 돌려주면 그 프로세스에서 60초(`MODEL_CIRCUIT_OPEN_MS`) 동안 챗봇의 Gemini 호출(관문·선별·목차 고르기·답 생성·스트림·임베딩)을 네트워크로 보내지 않고, 한 호출 안의 모델 체인도 다음 모델로 넘어가지 않는다. 열릴 때마다 `[chatbot] Gemini HTTP 402: Gemini 결제 크레딧 소진 또는 키 인증 실패로 보임 …` 오류 로그를 한 번 남긴다(키는 남기지 않는다). 60초 뒤 호출 하나만 시험으로 보내, 401·402·403이 아니면 풀고(`[chatbot] Gemini 호출이 다시 응답해 차단을 풀었습니다.`) 같으면 60초 더 닫는다. 429·5xx·시간 초과·404는 세지 않는다(기존 재시도·체인 폴백이 맡는다). `CHATBOT_PROVIDER`로 고르는 다른 답 생성 제공자 경로(`lib/chatbot/answer-provider.ts`)는 차단기를 거치지 않는다.

차단기가 열린 동안의 `MODEL_UNAVAILABLE_ANSWER`는 '잠시 뒤 다시'를 뺀 변형(`MODEL_UNAVAILABLE_CIRCUIT_OPEN_ANSWER`)을 쓴다. 측정 호출(`evaluateChatbotQuery`) 결과에는 답에 쓰인 모델 호출 상태 `modelState`(ok·circuit_open·timeout·error)와 대화 맥락 흔적(`contextExpanded`·`conversationReason`)이 실린다. compiled 라우터는 켜 둔 카드가 없는 색인이면 색인으로 정하지 않고 legacy 흐름으로 보낸다(흔적 `unavailable=empty_index`).

`MODEL_UNAVAILABLE_ANSWER`가 늘면 런타임 로그의 `[chatbot] Gemini HTTP`·`[chatbot] Gemini call failed`부터 본다.

## 5. 환경변수 스위치

| 이름 | 기본값 | 끄거나 바꾸면 |
|---|---|---|
| `GEMINI_API_KEY` | 없음 | 없으면 관문·근거 선별·두 번째 검색·답 생성이 모두 꺼진다. 선별 실패를 모델 장애로 보지 않으므로 `MODEL_UNAVAILABLE_ANSWER`도 나가지 않는다. |
| `CHATBOT_FINAL_ANSWER_LLM` | `select` | `generate`: 고른 문장을 근거로 모델이 답을 다시 쓴다. `off`: 모델을 쓰지 않는다(관문·선별·두 번째 검색도 꺼짐). 정해 둔 답과 결정형 초안만 나가고, 확인되지 않은 낱말 목록 밖 초안은 `NO_SOURCE_FACT_ANSWER`로 보류한다. |
| `CHATBOT_ANSWER_GATE` | on | `off`: 정해 둔 답을 판정 없이 낸다(두 번째 검색의 확인 단계도 건너뛰고 고른 문장을 쓴다). |
| `CHATBOT_ANSWER_GATE_MODEL` | 없음(lite 우선 체인) | 살아 있는 모델명을 주면 관문 체인 맨 앞에 둔다. 종료된 모델·`gemini-2.5*`는 무시한다. |
| `CHATBOT_ANSWER_GATE_TIMEOUT_MS` | `3000` | 관문 판정 한 번의 예산. 넘기면 기존 답을 낸다. |
| `CHATBOT_SECOND_CHANCE` | on | `off`: 못 찾음 답을 그대로 낸다. |
| `CHATBOT_PROVIDER` | `gemini` | 다른 값은 최종 답 생성 제공자를 바꾼다(`lib/chatbot/answer-provider.ts`). 관문·선별·두 번째 검색은 Gemini 그대로다. |
| `CHATBOT_ENABLE_DEEP_FALLBACK` | 없음 | `1`이면 답 생성이 basic 티어 뒤 reasoning·advanced 티어까지 시도한다. |
| `GEMINI_FAST_MODEL`·`GEMINI_REASONING_MODEL`·`GEMINI_MODEL` | 아래 §6 | 티어별 맨 앞 모델을 바꾼다. 종료된 모델명이면 무시하고 기본값을 쓴다. |
| `CHATBOT_LOG_GEMINI_FAILURES` | 켜짐 | `0`이면 Gemini 실패 로그를 끈다. |
| `CHATBOT_KNOWLEDGE_SEARCH_TIMEOUT_MS`·`CHATBOT_FINAL_ANSWER_TIMEOUT_MS`·`CHATBOT_FINAL_ANSWER_STREAM_TIMEOUT_MS`·`CHATBOT_ROUTE_TIMEOUT_MS` | 2800·6000·8000·13000 | 단계별 시간 예산. 바꾸면 §7의 시간 예산 규칙을 따른다. |

## 6. 모델 체인

`lib/chatbot/llm.ts`가 정본이다. 2026-11 기준 기본값은 아래와 같다. 같은 모델이 겹치면 한 번만 부른다.

- basic 티어(근거 선별·답 생성): `gemini-3.5-flash` → `gemini-3.1-flash-lite` → `gemini-flash-lite-latest`
- reasoning·advanced 티어: `gemini-3.1-pro-preview` → `gemini-3.5-flash` → `gemini-flash-lite-latest`
- 관문 판정·목차 고르기(lite 우선): `gemini-3.1-flash-lite` → `gemini-3.5-flash` → `gemini-flash-lite-latest`
- 임베딩: `gemini-embedding-001`(`GEMINI_EMBED_MODEL`, 차원은 `GEMINI_EMBED_DIM`)

모델을 바꾸거나 점검할 때는 `models.list`가 아니라 실제 `generateContent` 호출로 확인한다. 종료된 모델도 목록에는 남아 있고(2026-11 gemini-2.5 계열), 모델마다 받는 `thinkingLevel`이 달라 지원하지 않는 값을 보내면 400으로 실패한다.

## 7. 고정 문구

모델이 쓰지 않고 코드에 박힌 공개 답이다. 못 찾음·확정 못 함 다섯 개와 차단기용 변형은 `lib/chatbot/fixed-answers.ts`가 정본이다(`service.ts`는 같은 이름으로 다시 내보낸다). 문구를 바꾸면 테스트(`tests/chatbot/model-unavailable.test.ts`, `after-gate-fixed-answers.test.ts`)와 측정 스크립트의 판별(첫 줄 비교)을 함께 본다.

| 상수 | 언제 나가는가 | 상담 버튼 |
|---|---|---|
| `MODEL_UNAVAILABLE_ANSWER` "지금은 안내 문서에서 답을 확인하지 못했어요. 추측해서 답하지는 않을게요." | 모델이 켜져 있는데 근거 선별 호출이 실패했을 때, 관문 뒤 문서 경로의 선별이 실패했을 때, 두 번째 검색을 끝내지 못했을 때(오류·시간 초과·차단기). 차단기가 열려 있으면 '잠시 뒤 다시'를 뺀 `MODEL_UNAVAILABLE_CIRCUIT_OPEN_ANSWER` | 있음(`handoff`, `needsHandoff`) |
| `NO_SOURCE_FACT_ANSWER` "이 질문에 대한 내용은 공개 안내에서 찾지 못했어요. …" | 출처 없는 사실 질문, 관문 뒤 문서 경로에서 문장을 못 고른 사실 질문, 선별이 꺼진 상태의 확인되지 않은 낱말 목록 밖 초안 | 없음(문구로 "상담원 연결" 안내) |
| `WEAK_SOURCE_DRAFT_ANSWER` "이 질문에 딱 맞는 안내는 아직 찾지 못했어요. …" | 약한 근거만 있는 공개 초안(`doc_suggestion`), 근거 선별이 답 문장을 못 찾았을 때 | 없음 |
| `POLICY_TOPIC_AFTER_GATE_ANSWER` "이 질문은 채팅에서 확정해 말씀드리기 어려운 내용이라, …" | 사람이 공개 범위를 정한 주제에서 관문이 정해 둔 답을 버렸을 때 | 있음 |
| `SYMPTOM_AFTER_GATE_ANSWER` "딱 맞는 해결 안내를 아직 찾지 못했어요. …" | 관문이 증상·가이드 답을 버렸고(또는 증상 신고) 문서에서도 해결 문장을 못 골랐을 때 | 있음(`handoffIntent=support`) |
| `GENERAL_CLARIFY_LEADS`(`buildGeneralClarify`) | 관문이 버린 뒤 사실 질문도 증상 신고도 아닐 때, 출처 없는 모호한 입력 | 없음(되묻기) |

위 다섯 고정 문구(와 차단기 변형)에는 말투 층이 안내형 첫마디("순서대로 알려 드릴게요")와 끝 질문을 붙이지 않는다(화난·반복 문의의 사과만 붙는다). 두 조각 질문에서 정해 둔 답이 한 조각만 답했으면 답하지 못한 조각을 끝에 한 줄로 알린다.

## 8. 강제 규칙

### 작업 원칙: 질문마다 정규식·정해 둔 답을 더하지 않는다

틀린 답 하나를 고치려고 정규식이나 정해 둔 답을 더하지 않는다. 고칠 곳은 구조(관문·검색·근거 선별·두 번째 검색)와 공개 문서다. 근거는 2차 측정이다. 정규식을 좁히고 정해 둔 답 52개를 더해 수정자가 본 371문항은 크게 좋아졌지만, 처음 보는 질문의 좋은 답 비율은 29%(1차의 새 질문 180개)에서 30%(2차, 수정자가 못 본 90개)로 거의 그대로였고, 그 90개의 실패 44건 중 20건이 정규식 가로채기였다(측정 표는 [2026-11-18 기록](../chatbot-structure-round-2026-11-18.md)).

- 정해 둔 답은 사람이 공개 범위를 정한 사실(정책 답)과 문서에 없는 확인된 사실에만 둔다. 더할 때는 패턴을 좁게 쓰고, 기존 평가 질문 전체의 답을 수정 전과 비교해 다른 질문을 가로채지 않는지 본다.
- 낱말 하나로 주제를 정하지 않는다. '접속'만으로 로그인 문제, 'OPS'만으로 장비 구성, '녹화 … 저장'만으로 권한 안내로 보내면 사실 질문에 엉뚱한 답이 나간다.
- 구조 변경의 효과는 수정자가 보지 않은 시험 질문 묶음(`data/chatbot-holdout-sets.json`)으로 잰다. 수정자는 이 파일을 열지 않고, 수정 근거로 한 번 쓴 묶음은 `dev`로 내린다.

### 공개 답변 안전성

- 모델 호출이 실패하거나 잘린 경우 검색 raw chunk를 공개 답변으로 내보내지 않는다(§4).
- 검색 조각으로 만든 초안은 근거 선별을 거친다. 문서에 답이 없는데 모델이 답을 쓰게 두면 없는 단계나 근거 없는 "안 됩니다"가 나온다(실측: 답 문장이 없을 때 근거 밖 단정 56%).
- 모델에게 근거를 줄 때는 문장이 온전한 문서 본문을 준다. 220자 요약처럼 문장 중간에서 끊긴 조각을 주면 모델이 뒷부분을 지어 잇는다.
- 근거가 없는 사실(회사·대표·고객사·한도·보관 기간·기능 목록, 지역·업종의 도입 추세, 사례의 성과)은 모델이 지어내지 않게 한다. `generate` 모드의 프롬프트에는 요청마다 근거 범위를 다시 적는 요구가 붙는다(`lib/chatbot/llm.ts`).
- 못 찾았다는 답에는 안내형 첫마디("순서대로 알려 드릴게요")나 영업용 끝 질문을 붙이지 않는다. 모델 장애로 확인하지 못한 경우는 못 찾음과 구별해 `MODEL_UNAVAILABLE_ANSWER`로 답한다.
- "공개 안내에 없다"고 답하기 전에 도움말 문서만이 아니라 홈페이지의 다른 공개 페이지(회사 소개, 서비스 소개서, 체크아웃, 개인정보처리방침)도 확인한다.
- non-stream과 stream 모두 동일한 관문, 근거 선별, 보류, 두 번째 검색, deterministic fallback을 통과한다.
- 공개 답변에서 내부 출처 표현, 원본 URL/이미지, PII, 불필요한 마크다운을 제거한다.
- 검증된 큐레이션 직답은 임의로 모델이 재작성해 의미를 완화하지 않게 한다.
- 가격·계약·환불·계정·장애·설치·보안·API 범위는 확인된 정보만 말하고, 필요한 경우 상담 연결로 전환한다.
- 프롬프트나 검색/응답 계약을 바꾸면 관련 cache version(답 캐시, 관문 판정 캐시 `ANSWER_GATE_CACHE_VERSION`)과 골든셋 회귀를 확인한다.
- 증상형 질문은 "안 돼/안됨" 같은 증상 표현만으로 특정 주제(예: 로그인)에 묶지 않는다. 트리아지 답변에는 아이디·연락처 같은 식별 정보를 채팅으로 적으라는 안내를 넣지 않는다.
- 공개 위젯 전용 지름길(정해 둔 답·증상 트리아지·말투 층·관문·두 번째 검색)은 내부 CS 코파일럿 경로(`includeInternalDocs`)에서 건너뛴다(`tests/channel-talk/include-internal-docs.test.ts`).

### 시간 예산과 오류 처리

- `app/api/chatbot/query`는 느린 검색·임베딩·LLM 경로 때문에 500으로 끊기지 않도록 짧은 단계별 시간 예산과 deterministic fallback을 유지한다. 두 번째 검색은 요청 시작부터 11초 안에 끝날 만큼만 돈다(라우트 예산 13초).
- `CHATBOT_KNOWLEDGE_SEARCH_TIMEOUT_MS`나 `CHATBOT_FINAL_ANSWER_TIMEOUT_MS`를 바꾸면 `CHATBOT_ROUTE_TIMEOUT_MS`와 클라이언트 timeout을 함께 검토한다.
- 잘못된 JSON 또는 body shape는 500이 아니라 400 계열로 응답한다.
- 판정·검색을 못 받은 답(관문 `skipped` 실패, 두 번째 검색 실패, 선별 실패)은 답 캐시에 넣지 않는다. 시간 초과 때의 정적 대체 검색 결과도 검색 캐시에 넣지 않는다.
- 답 캐시 열쇠는 대화 맥락으로 넓힌 검색용 질문이다(페이지 맥락을 쓴 답만 경로 포함). 세션 이력은 `generate` 모드에서만 답에 들어가므로 `select`·`off` 모드는 세션이 있어도 캐시를 쓴다.

### 어드민과 CS

- `/admin/chatbot`(=`/admin/cs-inquiries`)은 CS 문의 통합 대시보드다. 상세 문서 보강·품질 검수는 `CsConsoleNav`가 연결하는 docs 탭과 역할을 나눠 가진다.
- `/admin/cs-chatbot`은 내부 CS 작업면, `/admin/channel-talk`은 상담 Inbox다.
- 내비 표시 여부나 사이드바 배치(`nav_overrides`·숨김)는 보안 경계가 아니다. 각 admin API가 role/capability를 강제한다.
- AI 초안은 자동 게시·자동 발송하지 않는다.

## 9. 크로스컷

- Content가 `docs_articles`, `docs_ai_chunks`, slug, 가시성, 임베딩 계약을 바꾸면 챗봇 검색과 출처 중복 제거를 함께 검증한다. 공개 정적 문서(`lib/docs.ts`)의 절을 바꾸면 두 번째 검색 목차도 바뀐다.
- 공개 카피와 답변 원칙은 `lib/classin-positioning.ts`, UI는 `DESIGN.md`를 정본으로 삼는다.
- admin API는 Admin Core의 인증·응답 규약과 admin Supabase client 규약을 따른다.

## 10. 검증과 측정

```bash
npm run typecheck
npx eslint app components lib --max-warnings=0
npm run build
npm run check:alpha-db
```

변경 범위에 따라 다음을 실행한다.

- `npx vitest run tests/chatbot`과 골든셋 평가.
- 증상 트리아지·공개 문제 해결 문서의 섹션 제목을 바꾸면 `tests/chatbot/symptom-triage.test.ts`.
- 기본 사실 답이나 분류·검색 조건을 바꾸면 `tests/chatbot/basics-quick-answers.test.ts`와 `tests/chatbot/structural-hijack-regression.test.ts`.
- 근거 선별·모델 프롬프트·모델 체인을 바꾸면 `tests/chatbot/evidence-selection.test.ts tests/chatbot/model-chain.test.ts`.
- 관문·두 번째 검색·고정 문구·차단기를 바꾸면 `tests/chatbot/answer-gate.test.ts tests/chatbot/second-chance.test.ts tests/chatbot/after-gate-fixed-answers.test.ts tests/chatbot/model-unavailable.test.ts`.
- 모델이 답을 다시 쓰는 경로를 시험하는 테스트는 `tests/chatbot/helpers/final-answer-llm.ts`로 `generate` 모드를 켜고 선별 호출을 따로 답한다. 이 도우미는 테스트마다 차단기를 닫는다.

특히 다음을 확인한다.

- LLM·벡터 검색 timeout/실패 시 deterministic fallback, 선별 실패 시 검색 조각이 나가지 않는지
- stream/non-stream의 동일한 안전 게이트와 같은 답·같은 상담 버튼 표시
- 잘못된 JSON/body의 400 응답
- 가격·민감 주제의 핵심 문구 회귀
- `/admin/chatbot` 대시보드와 CS 콘솔 내비의 role/capability 강제

**실제 모델 측정.** 구조나 모델 경로를 바꿨으면 단위 테스트(모의 응답)만으로 끝내지 않고 `scripts/chatbot-live-eval.ts`로 실제 Gemini에 돌린다. 데이터베이스 없이 정적 문서 경로로만 잰다(운영 벡터 검색 경로는 재지 않는다).

1. 같은 입력을 `--mode off`로도 돌려, 모델 없는 답이 수정 전과 같은지 비교한다.
2. 수정자가 본 질문(평가셋)과 보지 않은 시험 질문 묶음을 따로 잰다. 효과 판단은 보지 않은 묶음으로만 한다.
3. 결과 줄의 `modelError`가 5%를 넘으면 스크립트가 "측정 무효"로 종료 코드 2를 낸다. 무효 측정은 채점하지 않는다. 모델이 죽은 상태의 동작을 일부러 잴 때만 `--allow-model-errors`를 준다.
4. 채점은 사람 검수 또는 모델 심사(1차 심사 → 실패 건 독립 재확인)로 하고, 문서에 어느 쪽인지 적는다.

플래그·결과 필드·시험 질문 묶음 규칙은 `scripts/chatbot-persona-loop/README.md`, 다시 재는 명령은 [2026-11-18 기록](../chatbot-structure-round-2026-11-18.md)의 "다시 재는 방법"에 있다.

## 11. 먼저 읽을 것

1. `lib/chatbot/service.ts`(`buildChatbotCoreBase`부터)
2. `lib/chatbot/answer-gate.ts`, `lib/chatbot/llm.ts`
3. `lib/classin-positioning.ts`의 chatbot/brandVoice
4. `lib/chatbot/{teaser-policy,page-context,pricing-policy}.ts`
5. `docs/active/cs-admin-console-ia-2026-07-27.md`
