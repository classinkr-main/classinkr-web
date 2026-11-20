# 챗봇 페르소나 상호 평가 루프 — 반복 실행 순서

공개 홈페이지 챗봇(`lib/chatbot/`)을 페르소나 질문으로 시험하고, 두 심사관의 엄격한 상호 평가에서 실패한 답을 고친다. 1회 실행이 한 회차다. 경위와 회차별 점수는 `docs/active/chatbot-cs-symptom-triage-2026-11-06.md`와 `data/chatbot-persona-loop-history.json`에 있다.

## 파일

| 파일 | 하는 일 |
|---|---|
| `data/chatbot-persona-eval-set.json` | 페르소나 10명(여 5·남 5)과 지금까지의 질문·정답 키. 회차가 끝나면 새 묶음을 덧붙인다. |
| `data/chatbot-persona-loop-history.json` | 회차별 점수 기록. 다음 회차 번호 N은 마지막 숫자 회차 + 1. |
| `scripts/chatbot-persona-loop/author-brief.md` | 새 질문을 쓰는 독립 작성자에게 그대로 주는 지침. |
| `scripts/chatbot-persona-loop/rubric.md` | 두 심사관 공통 기준표. 바꾸지 않는다(회차 간 점수를 비교하려고). |
| `scripts/chatbot-persona-loop/transcribe.mjs` | 질문을 챗봇에 넣어 심사용 대화 기록을 만든다(오프라인 결정 경로). |
| `scripts/chatbot-persona-loop/aggregate.mjs` | 두 심사관 결과를 합쳐 일치율·카파·이견 목록·최종 통과 수를 낸다. |
| `tests/chatbot/persona-eval-set.test.ts` | 평가셋 전체의 결정 경로 회귀(일반 폴백 0건, 근거 없는 문장·식별 정보 요구 금지 등). |
| `scripts/chatbot-live-eval.ts` | 질문 묶음을 실제 모델(Gemini)로 돌려 답을 JSONL로 남긴다. 아래 "실제 모델 측정". |
| `data/chatbot-holdout-sets.json` | 수정자가 보지 않는 시험 질문 묶음. 아래 "시험 질문 묶음". |

## 1회 실행 순서

작업 폴더(`WORK`)는 세션 스크래치패드 아래 `persona-loop-rN`으로 만든다. 심사 결과는 저장소에 커밋하지 않는다.

1. **최신 반영**
   - `git fetch origin` 뒤 작업 브랜치의 PR이 이미 머지됐는지 본다. 머지됐다면 최신 main에서 같은 브랜치 이름으로 다시 시작한다.
   - 아니면 `git merge origin/main`으로 최신 main을 합친다. `package-lock.json`이 바뀌었으면 `npm ci`.
   - `node scripts/sweep-chatbot-symptom-coverage.mjs`로 새로 생긴 문서 섹션 가운데 챗봇이 못 잇는 것을 확인한다.
2. **새 질문(묶음 N)**: 독립 작성자 에이전트 하나에 `author-brief.md`를 주고 회차 번호 N과 `WORK/batch-N.json` 경로를 알려 준다. 작성자는 저장소 코드와 문서를 읽지 않는다.
3. **대화 기록**: 새 묶음 N과 직전 묶음 N-1(수정 후 재답변)을 함께 기록한다.

   ```bash
   node scripts/chatbot-persona-loop/transcribe.mjs "$WORK/transcript-rN.json" "$WORK/batch-N.json" "data/chatbot-persona-eval-set.json#b(N-1)-"
   ```

4. **심사**
   - 서로 결과를 보지 않는 심사관 A·B 에이전트 둘을 동시에 띄운다. 각자 `rubric.md`, 페르소나, 대화 기록을 읽고 `WORK/judge-A-rN.json`, `WORK/judge-B-rN.json`에 쓴다.
   - 사실 확인은 기준표에 적힌 공개 문서만 쓰고, `lib/chatbot/` 구현 코드는 읽지 않는다.
   - `node scripts/chatbot-persona-loop/aggregate.mjs "$WORK" rN`을 돌리면 이견 목록이 `cross-A-rN.txt`·`cross-B-rN.txt`로 나온다.
   - 같은 심사관에게 상대의 판정을 보여 주고 엇갈린 행만 다시 판정하게 한다(`judge-A-rN-final.json`, `judge-B-rN-final.json`).
   - aggregate를 다시 돌린다. 최종 통과는 두 심사관이 모두 통과로 본 문항만 센다.
5. **고치기**: 최종 실패 행의 `issue`·`fix_hint`를 모아 고친다. 원칙은 아래와 같다.
   - 질문마다 정규식·정해 둔 답을 더하지 않는다. 처음 보는 질문에 통하지 않았다(근거와 예외는 `docs/active/playbook/05-chatbot.md` §8). 아래 파일에 더하는 것은 사람이 공개 범위를 정한 사실과 문서에 없는 확인된 사실에 한한다.
   - 답의 사실은 공개 문서(`lib/docs.ts`, `lib/docs-troubleshooting/*.ts`, `lib/cs-figma-guides.ts`와 그 파일이 내보내는 생성 캡처 가이드(사내 전용 slug 제외), `lib/classin-positioning.ts`)에서만 가져온다. `lib/docs.ts` 안이라도 검토 중(review)·초안(draft) 문서는 공개되지 않으니 쓰지 않는다. 문서에 없으면 "공개 안내에 없다"고 밝히고 상담으로 넘긴다. 반대로 문서에 있는 것을 없다고 하지 않는다.
   - 좁은 증상·사용법 주제는 `lib/chatbot/symptom-topics-field.ts`에 더한다. 단계는 문서 섹션에서 가져온다.
   - 첫 방문자가 한 줄로 묻는 기본 사실 질문(회사·기기·한도·보관·요금 기준 등)의 답은 `lib/chatbot/quick-answers-basics.ts`에 있다. 짧고 증상 표현이 없는 질문에만, 아래 정해 둔 답이 모두 빗나간 뒤에 쓰인다. 고치면 `npx vitest run tests/chatbot/basics-quick-answers.test.ts`를 돌린다.
   - 정해 둔 문장으로 바로 답할 것(결제·영업·계정·보안·개인정보 정책)은 `lib/chatbot/quick-answers-field.ts`에 더한다. 패턴은 좁게 쓰고, 고친 뒤 평가셋 전체 답을 수정 전과 비교해 다른 질문을 가로채지 않는지 본다. 기존 정해 둔 답은 `lib/chatbot/service.ts`의 `buildServiceQuickAnswer`에 있다.
   - 회차 블록을 붙인 뒤 `node scripts/chatbot-persona-loop/route-check.mjs <질문 파일>[#접두사] <블록 첫 id>`로 질문마다 기대한 답이 나가는지 본다. 첫 문단만 비교하면 "두 가지 답드릴게요." 같은 흔한 첫 줄 때문에 다른 답이 나가도 통과로 보이니, 이 스크립트처럼 먼저 맞는 답의 id와 둘째 문단을 함께 본다.
   - 끝에 붙는 확인 질문(질문 주도)은 `lib/chatbot/follow-up.ts`와 주제의 `followUp`에서 고친다. 질문은 하나만, 식별 정보는 묻지 않는다.
   - 말투·상담 연결은 `lib/chatbot/tone.ts`에서 고친다.
   - 아이디·전화번호·비밀번호·시리얼·카드 번호를 채팅창에 적으라고 하지 않는다. 가격·할인·환불·복구를 약속하지 않는다.
6. **평가셋에 덧붙이기**: `WORK/batch-N.json`의 문항을 `data/chatbot-persona-eval-set.json`의 `cases`에 붙인다(필드: id, persona, question, intent, must, must_not).
7. **검증**: 아래를 차례로 돌린다. 챗봇 DB 계약을 바꾸지 않았다면 `npm run check:alpha-db`는 필요 없다.

   ```bash
   NODE_OPTIONS=--max-old-space-size=6144 npm run typecheck
   ```

   ```bash
   npx eslint app components lib --max-warnings=0
   ```

   ```bash
   NODE_OPTIONS=--max-old-space-size=6144 npx vitest run tests/chatbot tests/channel-talk tests/internal-cs-chat
   ```

   채널톡·내부 CS 테스트도 함께 돌린다. 공개 챗봇 전용 지름길(정해 둔 답·트리아지·말투 처리)이 내부 CS 코파일럿 경로(`includeInternalDocs`)로 새면 여기서 깨진다. 전체 `npx vitest run`에서 `tests/marketing/meta-instagram-dashboard-cache.test.ts`, `tests/server/cron-auth.test.ts`는 이 작업 전부터 실패하던 테스트다.

   ```bash
   NODE_OPTIONS=--max-old-space-size=6144 npm run build
   ```

8. **기록**: `data/chatbot-persona-loop-history.json`에 회차를 더하고, 기록 문서의 회차 표에 한 줄을 더한다. 커밋 메시지는 `챗봇: 페르소나 루프 N — …`로 쓰고 작업 브랜치에 푸시한다.

## 실제 모델 측정(`scripts/chatbot-live-eval.ts`)

위 루프의 `transcribe.mjs`는 모델 없는 결정 경로다. 관문·근거 선별·두 번째 검색처럼 모델이 정하는 경로는 이 스크립트로 잰다. 질문마다 세션 없이 공개 경로 코어(`evaluateChatbotQuery`, 말투·끝 질문 포함)를 따로 돌리고, 대화 기록을 저장하지 않는다. 데이터베이스 없이 정적 문서 검색으로만 돈다(Supabase 값은 `.env.local`에서도 읽지 않는다). `GEMINI_API_KEY`는 환경 또는 `.env.local`에서 읽는다.

```bash
npx tsx scripts/chatbot-live-eval.ts --in <questions.json> --out <results.jsonl> [플래그]
```

| 플래그 | 기본값 | 뜻 |
|---|---|---|
| `--in` | 필수 | 입력. `[{ id, question, group?, expectTopic?, pagePath? }]` 또는 `{ cases: [...] }`(`data/chatbot-first-contact-set.json` 등). 대화 형식은 아래 "대화 입력". id가 없으면 `q001`처럼 붙이고, 중복 id는 오류다. |
| `--out` | 필수 | 결과 JSONL. 동시에 돌아도 줄 순서는 입력 순서다. |
| `--concurrency` | `4` | 동시에 돌릴 질문 수(1~16). |
| `--mode` | `select` | `CHATBOT_FINAL_ANSWER_LLM` 값. `select`·`generate`·`off`. `off`가 아니면 키가 있어야 한다. |
| `--gate` | `on` | `CHATBOT_ANSWER_GATE`(정해 둔 답 확인 관문). |
| `--second-chance` | `on` | `CHATBOT_SECOND_CHANCE`(못 찾았을 때 목차에서 다시 고르는 두 번째 검색). |
| `--router` | 없음 | `CHATBOT_ANSWER_ROUTER`(답 라우터 `legacy`·`shadow`·`compiled`). 주면 서비스 모듈을 불러오기 전에 환경변수를 그 값으로 둔다. 안 주면 환경변수를 그대로 쓴다. |
| `--repeat` | `1` | 입력마다 N번(1~50) 되풀이해 돌린다(대화면 대화 전체). 요약에 같은 질문의 답이 갈린 비율(`--repeat N: 답이 갈린 질문 a/b`)이 찍힌다. 결과 줄은 `repeatIndex`로 구별한다. 2 이상이면 답 캐시·관문 판정 캐시를 끈다(`CHATBOT_ANSWER_CACHE=off`). 켜 두면 앞 실행의 답이 캐시에서 나와 갈림이 0으로 찍힌다. |
| `--simulate-gemini` | 없음 | `402`·`429`·`hang`. Gemini 호출만 가짜 응답으로 바꾼다(실제 호출 0, 비용 0). `402`·`429`는 그 상태 코드, `hang`은 응답 없이 호출 쪽 시간 초과를 기다린다. 키가 없어도 돈다. 장애 때의 동작을 잴 때 `--allow-model-errors`와 함께 쓴다. |
| `--allow-model-errors` | 꺼짐 | 무효 측정 종료와 조기 중단을 끈다. 모델이 죽은 상태의 동작을 일부러 잴 때만 쓴다. |

### 대화 입력

한 줄 질문 대신 `{ id, turns, pagePath? }`를 줄 수 있다. `turns`는 질문 문자열(또는 `{ question }`) 배열이다. 한 파일에 두 형식을 섞어도 된다.

```json
[
  { "id": "c1", "turns": ["프린터가 안 돼요", "휴대폰이요"] },
  { "id": "c2", "pagePath": "/docs/guide/example", "turns": ["방금 본 거 다시 알려줘"] }
]
```

- 턴을 순서대로 돌리고, 앞 턴의 질문(200자까지)·`askedSlot`(앞 턴 답 끝 질문의 종류, `detectAskedSlot`)·`answerMode`로 `previousTurn`을 만들어 다음 턴의 `evaluateChatbotQuery(message, { previousTurn, pagePath })`에 넘긴다. DB 이력은 쓰지 않는다. 앞 턴이 답을 못 냈으면 다음 턴에 `previousTurn`을 넘기지 않는다.
- 서비스가 아직 그 옵션을 받지 않는 판이면 옵션은 무시되고 한 줄 질문처럼 돈다.
- 결과 줄은 턴마다 하나이고 `id`는 `<id>#t<순번>`이다. `conversationId`·`turn`·`previousTurn`·`pagePath`가 함께 실린다. 한 줄 질문의 `id`는 그대로다.

결과 줄 필드:

| 필드 | 뜻 |
|---|---|
| `id`, `group`, `question`, `expectTopic` | 입력 그대로 |
| `router` | 답 라우터: `--router` 값, 없으면 `CHATBOT_ANSWER_ROUTER`, 그것도 없으면 `legacy` |
| `answer`, `answerMode`, `confidence`, `unresolved`, `needsHandoff`, `handoffIntent`, `detectedCategory`, `detectedIntent`, `warning` | 공개 답과 판정 값. `needsHandoff`가 true면 위젯에 상담 버튼이 뜬다. |
| `sources` | `{ title, path, heading, score }` 목록 |
| `decidedBy` | 어느 경로가 답했는지: 답 색인이 정한 답이면 `index:<카드>`·`index-partial:<카드>`(없는 부분 꼬리가 붙음)·`index-gap:<카드>`·`index-abstain`·`index-clarify`. 그 밖은 `second_chance`, `model_unavailable`(선별 실패 고정 문구), `gate_evidence_select`·`gate_not_found`(관문이 버린 뒤 문서 경로), 관문이 유지한 답의 출처(`template:*`·`guide:*`·`self:*` 등), `field:<id>`, `basics:<id>`, `symptom`, `not_found`(못 찾음 고정 문구: 약한 출처·출처 없는 사실 질문), `evidence_select`·`generate`·`draft`, `policy`(답에 쓰이는 모델을 부르지 않은 지름길), `unknown` |
| `answerIndex` | 코어가 낸 답 색인 흔적(`version`·`router`·`scope`·`decision`·`top`·`conf` …, 답 색인 사양 §3.7). 코어에 없으면 이 필드가 없다 |
| `gate`, `gateOriginal`, `gateMs`, `gateSkipReason` | 관문 결과(`kept`·`rejected`·`skipped`·`none`), 판정 대상이던 정해 둔 답의 출처, 판정 시간, `skipped`의 이유(`off`·`no_key`·`llm_off`·`timeout`·`error`·`model_unavailable`) |
| `secondChance`, `secondChanceMs`, `secondChanceReason` | 두 번째 검색 결과(`hit`·`miss`·`none`), 시간, `miss`·`none`의 이유 |
| `latencyMs` | 그 질문의 처리 시간 |
| `geminiCalls`, `geminiStatuses`, `geminiKinds` | 그 질문에서 나간 Gemini 호출 수, HTTP 상태(네트워크 오류는 0), 종류별 수(`generateContent`·`embedContent`) |
| `geminiBlocked`, `geminiBlockedKinds` | 결제·인증 실패 차단기 때문에 보내지 않은 호출 수(관문이 차단기를 보고 넘긴 것 포함)와 종류별 수(`embedContent`·`generateContent`) |
| `modelError` | 아래 무효 측정 기준에 걸린 줄 |
| `attempts`, `error` | 시도 횟수와 오류. 모든 호출이 429·5xx·네트워크 오류로 끝나면 최대 3번 다시 돈다. 이때 `answer`·`decidedBy`는 마지막 시도다. |
| `firstAttempt` | 재시도 전 첫 시도의 `{ answer, decidedBy, modelState }`. 운영은 첫 시도가 곧 답이므로 장애 영향은 이 값으로 본다. |
| `attemptLog` | 시도마다 `{ attempt, answer, decidedBy, modelState, geminiStatuses, error }`. |
| `modelState` | `ok`·`circuit_open`(차단기가 막음)·`timeout`(상태 0)·`error`(4xx·5xx). 서비스가 `modelState` 흔적을 내면 그 값, 아니면 호출 기록에서 가린다. |
| `contextExpanded` | 서비스의 대화 맥락 확장 흔적(참·거짓). 서비스가 내지 않으면 `null`. |

**무효 측정 감지.** 그 줄의 답에 쓰이는 Gemini 호출(관문·근거 선별·목차 고르기·답 생성)이 401·402·403(결제 크레딧 소진·키 인증 실패)을 받았거나, 차단기가 그런 호출을 막았거나(`geminiBlockedKinds`의 `generateContent`), `gateSkipReason`·`secondChanceReason`이 `model_unavailable`이면 `modelError`가 true다. 요약에 `모델 호출 실패 줄: N / 전체`와 질문당 Gemini 호출 수 중앙값이 찍힌다.

- 요약에는 `첫 시도 기준`(decidedBy 분포, 첫 시도가 모델 장애였던 비율), `gate skipped` 비율, `modelState` 분포, `contextExpanded` 비율(흔적이 있는 줄 기준), `--repeat` 답 갈림 비율이 찍힌다.
- 키 없이 장애 동작 보기: `npx tsx scripts/chatbot-live-eval.ts --in <in.json> --out <out.jsonl> --mode off --simulate-gemini 402 --allow-model-errors`
- `modelError`가 아닌 것: 모델 단계(`--mode`·`--gate`·`--second-chance`)를 모두 끈 측정의 줄(모델을 일부러 끔), 임베딩(`embedContent`)만 실패·차단된 줄(이 스크립트는 벡터 검색이 없어 임베딩 결과를 답에 쓰지 않는다), 답 글에 `MODEL_UNAVAILABLE_ANSWER`가 있어도 위 신호가 없는 줄.
- `modelError` 줄이 전체의 5%를 넘으면 `측정 무효: 모델 호출 실패(HTTP 4xx) 줄이 N개`를 찍고 종료 코드 2로 끝난다.
- 끝난 순서로 처음 20줄을 보고, 그중 답에 쓰이는 모델을 부른 줄(임베딩 빼고 나간 호출 + 막힌 호출 > 0, 또는 `modelError`)이 모두 `modelError`면 남은 질문을 돌리지 않고 멈춘 뒤 같은 메시지로 종료 코드 2.
- 모델 없는 측정(`--mode off --gate off --second-chance off`)은 질문당 Gemini 호출이 0이어야 한다. 호출이 나갔거나 차단기에 막힌 줄이 있으면 `--router compiled`는 `측정 무효: 모델 없는 compiled 측정인데 …`를 찍고 종료 코드 3, 그 밖은 경고와 줄 수·종류만 찍는다. 지금 legacy 경로는 키가 있으면 질문마다 임베딩을 한 번 부르므로(Supabase 가 없어도) 이 경고가 나온다.
- 종료 코드: 0 정상, 2 무효 측정 또는 사용법 오류(필수 인자 없음, 잘못된 값, `--mode`가 `off`가 아닌데 키 없음), 3 모델 없는 compiled 측정에서 Gemini 호출이 나감, 1 그 밖의 실패. 2·3이 나온 결과는 채점하지 않는다.
- 결과를 심사·점수로 잇는 도구(50줄씩 나누기, 심사관 A·B·C, 점수·구간, 정답 키 대리 점수)는 `scripts/answer-index/judge/README.md`에 있다.

모델 없는 답과 비교하려면 같은 입력을 `--mode off`로 한 번 더 돌린다. 측정 순서와 채점 분류는 `docs/active/chatbot-structure-round-2026-11-18.md`의 "다시 재는 방법"에 있다.

## 시험 질문 묶음(`data/chatbot-holdout-sets.json`)

구조 변경이 처음 보는 질문에 통하는지는 수정자가 보지 않은 질문으로만 잴 수 있다. 수정자가 본 질문은 고친 만큼 좋아 보인다.

- `sets[]`마다 `key`, `status`(`unseen`·`dev`), `statusNote`, `cases[{ id, group, question }]`가 있다.
- 챗봇을 고치는 작업자(사람·에이전트)는 이 파일을 열지 않는다. 측정 담당만 묶음을 꺼내 측정 스크립트 입력으로 만든다. 질문을 문서·커밋 메시지·테스트에 옮기지 않는다.
- 테스트와 `lib/`에서 불러오지 않는다.
- 측정 결과(실패 행·답)를 수정 근거로 한 번 쓴 묶음은 `status`를 `dev`로 내리고 `statusNote`에 언제 무엇에 썼는지 적는다. 다음 측정에는 새 `unseen` 묶음을 만들어 더한다. `dev` 묶음은 회귀 확인용으로만 쓴다.
- 2026-11-18 기준 holdout1은 3차 수정의 실패 분석에 쓰여 `dev`, holdout2는 모델 호출이 전부 실패한 상태(무효 측정)에서만 돌았고 수정 근거로 쓰이지 않아 `unseen`이다.
- 새 묶음을 더하면 기존 묶음과 공백·문장부호를 뺀 질문이 겹치지 않는지 본다(지금 두 묶음 사이 0건).

## 심사관에게 주는 지시(복사해 쓴다)

> 당신은 심사관 A(또는 B)입니다. ClassIn 한국 홈페이지 챗봇의 첫 답변을 엄격하게 채점합니다. 기준표(`scripts/chatbot-persona-loop/rubric.md`)를 먼저 읽고 그대로 따르세요. 페르소나는 `data/chatbot-persona-eval-set.json`의 `personas`, 채점할 대화 기록은 `<WORK>/transcript-rN.json`입니다. 사실 확인은 기준표에 적힌 공개 문서만 쓰고, `lib/chatbot/` 아래 구현 코드와 다른 심사관의 결과 파일은 읽지 마세요. 결과는 기준표의 출력 형식으로 `<WORK>/judge-A-rN.json`에 쓰고, 파일을 쓴 뒤 JSON 파싱과 행 수를 확인하세요. 너그럽게 보지 말고, 문서에 없는 사실이 있는지와 문서에 있는 내용을 없다고 하지 않는지 직접 찾아 확인하세요. 최종 답장에는 묶음별 통과 수, 태그별 개수, 가장 심각한 문제 3개만 짧게 쓰세요.

상호 검토 때는 같은 심사관에게 `cross-A-rN.txt`(A에게는 B의 판정)를 주고, 엇갈린 행만 다시 판정해 `judge-A-rN-final.json`에 그 행들만 쓰게 한다.

## 반복 실행과 멈추기

- 이 순서는 예약 작업으로 2시간마다 같은 세션에서 다시 돈다. 한 회차가 끝나기 전에 다음 예약 시각이 오면, 앞 회차가 끝난 뒤에 이어서 돈다.
- 멈추려면 그 세션에서 "페르소나 루프 멈춰"라고 하면 예약 작업을 지운다.
- 2026-11-09 21회차를 끝으로 사용자 요청에 따라 예약 작업을 지웠다. 다시 돌리려면 이 순서를 그대로 쓰는 예약 작업을 새로 만든다.
- 한 회차에 심사관 둘이 120문항씩 읽어 토큰을 많이 쓴다. 새 질문 실패가 연속으로 줄지 않으면 간격을 늘리거나 멈추는 것을 검토한다.
