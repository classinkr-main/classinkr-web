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
   - 답의 사실은 공개 문서(`lib/docs.ts`, `lib/docs-troubleshooting/*.ts`, `lib/cs-figma-guides.ts`와 그 파일이 내보내는 생성 캡처 가이드(사내 전용 slug 제외), `lib/classin-positioning.ts`)에서만 가져온다. 문서에 없으면 "공개 안내에 없다"고 밝히고 상담으로 넘긴다. 반대로 문서에 있는 것을 없다고 하지 않는다.
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

## 심사관에게 주는 지시(복사해 쓴다)

> 당신은 심사관 A(또는 B)입니다. ClassIn 한국 홈페이지 챗봇의 첫 답변을 엄격하게 채점합니다. 기준표(`scripts/chatbot-persona-loop/rubric.md`)를 먼저 읽고 그대로 따르세요. 페르소나는 `data/chatbot-persona-eval-set.json`의 `personas`, 채점할 대화 기록은 `<WORK>/transcript-rN.json`입니다. 사실 확인은 기준표에 적힌 공개 문서만 쓰고, `lib/chatbot/` 아래 구현 코드와 다른 심사관의 결과 파일은 읽지 마세요. 결과는 기준표의 출력 형식으로 `<WORK>/judge-A-rN.json`에 쓰고, 파일을 쓴 뒤 JSON 파싱과 행 수를 확인하세요. 너그럽게 보지 말고, 문서에 없는 사실이 있는지와 문서에 있는 내용을 없다고 하지 않는지 직접 찾아 확인하세요. 최종 답장에는 묶음별 통과 수, 태그별 개수, 가장 심각한 문제 3개만 짧게 쓰세요.

상호 검토 때는 같은 심사관에게 `cross-A-rN.txt`(A에게는 B의 판정)를 주고, 엇갈린 행만 다시 판정해 `judge-A-rN-final.json`에 그 행들만 쓰게 한다.

## 반복 실행과 멈추기

- 이 순서는 예약 작업으로 2시간마다 같은 세션에서 다시 돈다. 한 회차가 끝나기 전에 다음 예약 시각이 오면, 앞 회차가 끝난 뒤에 이어서 돈다.
- 멈추려면 그 세션에서 "페르소나 루프 멈춰"라고 하면 예약 작업을 지운다.
- 한 회차에 심사관 둘이 120문항씩 읽어 토큰을 많이 쓴다. 새 질문 실패가 연속으로 줄지 않으면 간격을 늘리거나 멈추는 것을 검토한다.
