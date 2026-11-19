# 심사·점수 도구(답 색인 I1)

답 색인 사양의 측정 정의(§2.1 점수, §2.4 심사 절차, §4.2 정답 키)를 돌리는 도구다. 공식 숫자는 모두 이 절차(심사관 A → B → C → 합치기 → `score.ts`)로만 낸다. 대리 점수(`proxy-eval.ts`)는 매일 반복용이고 공식 판단에 쓰지 않는다.

| 파일 | 하는 일 |
|---|---|
| `scripts/chatbot-live-eval.ts` | 질문 묶음을 챗봇에 돌려 결과 JSONL 을 만든다(`--router`·결과 줄 필드는 `scripts/chatbot-persona-loop/README.md`) |
| `scripts/answer-index/judge/judge.ts` | `split`·`check`·`select-b`·`disagreements`·`merge` |
| `scripts/answer-index/judge/A.md`·`B.md`·`C.md` | 심사관 A·B·C 에게 그대로 주는 지시문(사양 §5.15 + §2.1 표) |
| `scripts/answer-index/judge/lib.ts` | 위 명령의 순수 함수(시험: `tests/chatbot/answer-index/judge.test.ts`) |
| `scripts/answer-index/score.ts` | 분류별 수, 점수, 부트스트랩 90% 구간 |
| `scripts/answer-index/proxy-eval.ts` | 측정 결과 + 정답 키 → 결정적 대리 점수 |

결과·심사 파일은 저장소에 넣지 않는다(작업 폴더에 둔다). 확정용 묶음(holdout3 등)의 결과는 측정 담당과 심사 에이전트만 보고, 수정자에게는 분류 통계만 준다(사양 §9.4).

## 순서 한눈에

아래에서 `$W`는 작업 폴더, `<set>`은 묶음 이름(`dev5`·`holdout1` …), `<run>`은 측정 이름(`legacy-off`·`r1` …)이다. `<set>`·`<run>`에는 영문·숫자·`_`·`.`·`-`만 쓴다.

```bash
# 0) 측정(모델 없는 목표 측정, 사양 §2.2)
npx tsx scripts/chatbot-live-eval.ts --in <set.json> --out "$W/<set>-<run>.jsonl" \
  --mode off --gate off --second-chance off --router compiled     # 비교 기준은 --router legacy

# 1) 50줄씩 나누기 → $W/judge/<set>-<run>-b01.json, -b02.json …
npx tsx scripts/answer-index/judge/judge.ts split --in "$W/<set>-<run>.jsonl" --set <set> --run <run> --out-dir "$W/judge"

# 2) 배치마다 심사관 A(A.md) → X.A.json. 심사관이 끝에 check 를 돌린다
npx tsx scripts/answer-index/judge/judge.ts check "$W/judge/<set>-<run>-b01.A.json"

# 3) 배치마다 B 입력 → X.Bin.json, 심사관 B(B.md, A 와 다른 에이전트) → X.B.json
npx tsx scripts/answer-index/judge/judge.ts select-b "$W/judge/<set>-<run>-b01.json"

# 4) 배치마다 A·B 가 다른 줄 → X.Cin.json, 줄이 있으면 심사관 C(C.md) → X.C.json
npx tsx scripts/answer-index/judge/judge.ts disagreements "$W/judge/<set>-<run>-b01.json"

# 5) 모든 배치 합치기 → 배치마다 X.final.json, 묶음 하나 judged-<set>-<run>.json(점수도 찍음)
npx tsx scripts/answer-index/judge/judge.ts merge "$W/judge/<set>-<run>-b01.json" "$W/judge/<set>-<run>-b02.json" …

# 6) 점수(merge 가 이미 찍지만, 따로 다시 낼 때)
npx tsx scripts/answer-index/score.ts "$W/judge/judged-<set>-<run>.json"
```

배치끼리는 서로 기다리지 않는다. 한 배치 안에서는 A → select-b → B → disagreements → C 순서다.

## 파일 이름 규칙

배치 입력이 `X.json`이면(`split`이 `<set>-<run>-bNN.json`으로 만든다):

| 파일 | 누가 쓰나 | 내용 |
|---|---|---|
| `X.json` | `split` | 심사 입력(stage `A`) |
| `X.A.json` | 심사관 A | A 결과 |
| `X.Bin.json` | `select-b` | B 입력(stage `B`) |
| `X.B.json` | 심사관 B | B 결과 |
| `X.Cin.json` | `disagreements` | C 입력(stage `C`, 줄마다 A·B 판정과 근거) |
| `X.C.json` | 심사관 C | C 결과(C 입력 줄이 0개면 없어도 된다) |
| `X.final.json` | `merge` | 배치 최종 |
| `judged-<set>-<run>.json` | `merge` | 여러 배치를 합친 묶음 최종 |

명령에는 늘 배치 입력 `X.json`을 준다(`check`만 결과 파일 `X.A.json`·`X.B.json`·`X.C.json`을 준다). 다른 단계 파일을 주면 오류다.

## 명령

모든 명령: `npx tsx scripts/answer-index/judge/judge.ts <명령> …`. 종료 코드 0 정상, 1 입력·형식 오류(메시지에 줄 id), 2 사용법 오류.

### split

```bash
judge.ts split --in <측정.jsonl> --set <set> --run <run> --out-dir <폴더> [--size 50]
```

- 입력: `scripts/chatbot-live-eval.ts`의 결과 JSONL(또는 같은 줄의 JSON 배열). 입력 순서를 지킨다. id 가 겹치면 오류.
- 출력: `<폴더>/<set>-<run>-b01.json` …(50줄씩). 심사관에게는 `id`·`question`·`answer`·`sources`만 준다. `decidedBy`·`router`·`answerIndex` 같은 경로 정보는 넣지 않는다. 답이 없는 오류 줄은 답 글이 `(답 없음: 측정 오류)`다.

### check

```bash
judge.ts check <X.A.json | X.B.json | X.C.json>
```

- 결과 파일이 답해야 할 입력(`X.json`·`X.Bin.json`·`X.Cin.json`)을 파일 이름으로 찾아 확인한다: JSON 파싱, `judge` 값, 입력의 모든 id 가 한 번씩(빠짐·더함·겹침 없음), `verdict` 값, 필수 근거(아래).
- 심사관이 결과를 쓴 뒤 직접 돌린다(지시문에 들어 있다). 통과하면 `통과: …`를 찍는다.

### select-b

```bash
judge.ts select-b <X.json>
```

- 입력: `X.json`, `X.A.json`(형식 확인을 통과해야 한다).
- 출력: `X.Bin.json`. A 가 `good`이 아니라고 본 줄 전부(`nf_ok` 포함)와, A 가 `good`이라고 본 줄 가운데 `ceil(15%)`개.
- good 표본은 `sha256("answer-index-judge-b/v1\n" + id)`가 작은 순서로 고른다. 줄 순서·실행 시각·사람과 상관없이 같은 입력이면 같은 표본이다. 소금 값은 바꾸지 않는다.

### disagreements

```bash
judge.ts disagreements <X.json>
```

- 입력: `X.json`, `X.A.json`, `X.Bin.json`, `X.B.json`.
- 출력: `X.Cin.json`. B 가 본 줄 가운데 A·B 의 `verdict`가 다르거나 `siteVerdict`(없으면 `verdict`)가 다른 줄. 줄마다 `judgments: [{ judge: "A", verdict, evidence, searched, note, siteVerdict? }, { judge: "B", … }]`가 붙는다. 0줄이면 빈 `rows`로 쓰고 C 단계는 건너뛴다.

### merge

```bash
judge.ts merge [--set <set>] [--run <run>] [--out-dir <폴더>] <X.json> [더 많은 X.json …]
```

- 배치마다 `X.A.json`·`X.Bin.json`·`X.B.json`(·`X.Cin.json`·`X.C.json`)을 읽어 `X.final.json`을 쓰고, 모든 배치를 합쳐 `<폴더>/judged-<set>-<run>.json`을 쓴다(`--out-dir`가 없으면 첫 배치의 폴더).
- 최종 분류: B 가 보지 않은 줄은 A, A·B 가 같으면 그 판정(근거는 A 의 것), 다르면 C. B 입력 줄의 B 결과나 A·B 가 다른 줄의 C 결과가 없으면 어느 줄이 빠졌는지 찍고 멈춘다.
- `set`·`run`은 배치 파일의 값을 쓴다. 다른 묶음·측정의 배치를 한 파일로 합칠 때만 `--set`·`--run`을 준다(id 가 겹치면 오류).
- 합친 뒤 `score.ts`와 같은 계산으로 점수·구간·이견 수를 찍고 파일의 `summary`에도 넣는다.

## 파일 형식

### 심사 입력(`X.json`, `X.Bin.json`)

```json
{
  "set": "dev5",
  "run": "legacy-off",
  "batch": 1,
  "stage": "A",
  "rows": [
    { "id": "dev5-parent-16", "question": "…", "answer": "…", "sources": [{ "path": "/docs/…", "heading": "…", "title": "…" }] }
  ]
}
```

`X.Cin.json`은 `stage: "C"`이고 줄마다 `judgments`(위 disagreements)가 더 있다.

### 심사관 결과(`X.A.json`, `X.B.json`, `X.C.json`) — 심사관이 쓴다

```json
{
  "judge": "A",
  "results": [
    {
      "id": "dev5-parent-16",
      "verdict": "nf_ok",
      "evidence": [{ "path": "/docs/<분류>/<문서>" }],
      "searched": ["낱말1", "낱말2", "낱말3"],
      "note": "판단 이유",
      "siteVerdict": "nf_doc_has"
    }
  ]
}
```

| 필드 | 규칙 |
|---|---|
| `judge` | `"A"`·`"B"`·`"C"`(파일 이름과 같아야 함) |
| `results[]` | 그 단계 입력의 모든 id 가 한 번씩 |
| `verdict` | `good`·`partial`·`nf_ok`·`wrong`·`nf_doc_has`·`needless_clarify` |
| `evidence[]` | `{ path, quote? }`. `path`는 `/docs/...` 또는 `lib/...`·`app/...` 파일 경로, `quote`는 문서 문장 그대로 |
| `searched[]` | 찾아본 낱말 |
| `note` | 판단 이유 |
| `siteVerdict` | 선택. 공개 페이지(개인정보처리방침·약관·푸터 등) 사실까지 근거로 칠 때 분류가 달라지면 그 분류(사양 §2.1) |

필수 근거(`check`·`select-b`·`disagreements`·`merge`가 모두 막는다):

- `nf_ok`: `searched` 3개 이상 + `evidence`에 `path` 1개 이상.
- `nf_doc_has`·`wrong`: `evidence`에 `path`와 `quote`가 모두 있는 항목 1개 이상.

### 최종(`X.final.json`, `judged-<set>-<run>.json`)

```json
{
  "set": "dev5", "run": "legacy-off", "batches": [1, 2, 3], "n": 144, "disagreements": 7,
  "rows": [
    {
      "id": "dev5-parent-16", "verdict": "nf_ok", "siteVerdict": "nf_doc_has",
      "evidence": [], "searched": [], "note": "",
      "decidedBy": "AB", "disagreement": false, "judges": { "A": "nf_ok", "B": "nf_ok" }
    }
  ],
  "sources": ["dev5-legacy-off-b01.json", "…"],
  "summary": { "n": 144, "counts": { "good": 0 }, "score": 0, "ci90": { "low": 0, "high": 0 } }
}
```

- `decidedBy`: `A`(B 가 보지 않음)·`AB`(A·B 같음)·`C`(C 가 정함). `disagreement`는 A·B 의 `verdict`가 달랐는지(이견 수는 이 값을 센다). `X.final.json`에는 `batches`·`n`·`disagreements`·`summary` 대신 `batch` 하나가 있다.
- 줄에 질문·답 글은 넣지 않는다. 필요하면 `X.json`과 id 로 맞춘다.

## 점수(`score.ts`)

```bash
npx tsx scripts/answer-index/score.ts <judged.json> [더 많은 judged.json …] [--json] [--seed 20261119] [--iterations 10000]
```

- 점수 = (`good` + `nf_ok` + 0.5 × `partial`) ÷ 전체 × 100.
- 부트스트랩 90% 구간: 줄 n 개를 복원 추출로 n 개 다시 뽑아 점수를 1만 번 낸 뒤 정렬해 5번째·95번째 백분위(`[floor(B×0.05)]`, `[ceil(B×0.95)−1]`). 난수는 고정 시드 mulberry32(기본 20261119)라 같은 입력이면 같은 구간이다.
- `siteVerdict`가 있는 줄이 있으면 그 분류로 바꾼 '공개 페이지 포함' 점수를 한 줄 더 찍는다(사양 §2.1: 두 방식의 점수를 함께 적는다).
- 입력은 `judged-*.json`, 심사관 결과 파일, 또는 `{ id, verdict }` 배열. 여러 파일은 한 묶음으로 센다(id 겹치면 오류).
- 숫자를 기록할 때는 묶음 이름, 라우터, 측정 플래그, 심사 절차를 함께 적는다.

## 대리 점수(`proxy-eval.ts`)

```bash
npx tsx scripts/answer-index/proxy-eval.ts --results <측정.jsonl> --keys data/answer-index/eval/answer-keys/<set>.json \
  [--units data/answer-index/units.json] [--inventory data/answer-index/inventory.json] [--cards data/answer-index/cards] \
  [--area <영역,…>] [--top1] [--out <줄별 판정.json>] [--json]
```

- 정답 키(사양 §4.2, 형은 `types.ts` `AnswerKey`): `{ "set", "keys": [{ "id", "accept": [], "partialAccept": [], "nodoc": false, "clarifyOk": false }] }`. `accept`·`partialAccept`는 옛 답 id(`basics:`·`field:`·`svc:`·`symptom:`·`guide:` …, inventory 의 id 그대로)와 문서 단위 id(`unit:<unitId>`, 예: `unit:doc:/docs/teacher/course-members#4`).
  선택 칸: `reject`(이 id 로 답하면 `accept`와 겹쳐도 `wrong`, 심사 범위 밖 사실을 단정하는 옛 답 등. compiled 줄은 카드가 실제로 내는 글의 id — 문장 단위·`curatedRef`·증상·가이드, 그리고 글이 그 옛 답 글과 같은 text 카드의 `provenance.legacyIds` — 로만 대조한다. 고친 글(FIX)·문서 문장(CONVERT) 카드의 provenance 는 출처일 뿐이라 reject 에 걸지 않는다), `siteAccept`(공개 페이지 근거로만 맞는 답 — 대리 점수 계산에는 쓰지 않음), `area`(질문의 영역, `--area`가 거름), `areaFrom`(영역을 정한 근거), `evidenceScope`(`docs`·`site`), `searched`(nodoc 일 때 찾아본 낱말), `note`, `keyGroup`(같은 정답을 공유하는 키 묶음).
- `--area pricing,company`: 키의 `area`가 그 영역인 줄만 센다(키가 없거나 `area`가 없는 줄은 뺀다).
- `--top1`: compiled 줄에서 결정과 무관하게 흔적 1위 카드(`answerIndex.top`의 첫 카드, `none` 자리는 건너뜀)의 id 가 `accept`에 드는 비율(`accept`가 있는 키만, `reject`에 걸리면 넣지 않음)과, `nodoc` 키인데 답해 버린(못 찾음·공백·되묻기가 아닌) 비율을 더 찍는다. 문턱을 고치기 전 순위 자체가 맞는지 보는 숫자다.
- `--units`·`--inventory`·`--cards`는 기본 경로에 파일이 없으면 그 대조만 건너뛰고 `참고:`로 알린다.
- 출력: 대리 점수·구간·분류별 수, legacy·compiled 줄 따로, 키 없는 줄·줄 없는 키·id 를 못 만든 답의 수. `--out`이면 줄마다 `{ id, router, route, decidedBy, kind, ids, matched, unmapped, verdict, reason }`.

### 줄 → id 바꾸기

**compiled 줄**(결과 줄의 `answerIndex`로 다시 계산한 `decidedBy`가 `index`로 시작):

| decidedBy | 종류 | id |
|---|---|---|
| `index:<카드>`·`index-partial:<카드>` | 답 | 그 카드(와 `answerIndex.segments[]`가 배열이면 답한 조각의 카드)의 `provenance.legacyIds` + `answer.sentences[].unit`마다 `unit:<unit>` + 보조로 `answer.curatedRef`(`<module>:<id>`, `service`는 `svc:`), `answer.symptomTopic`(`symptom:<id>`), `answer.guide`(`guide:<slug>`·`unit:guide:<slug>`) |
| `index-gap:<카드>`·`index-abstain` | 못 찾음 | — |
| `index-clarify` | 되묻기 | — |

카드는 `--cards` 폴더의 `*.json`(카드 배열)에서 id 로 찾는다. 없으면 그 줄은 id 를 못 만든 답이다.

`decidedBy`는 `scripts/lib/chatbot-live-eval-checks.ts`의 `decidedByFromAnswerIndex`가 정한다(측정 스크립트와 같은 함수). 읽는 흔적 필드: `router`(compiled 가 아니면 legacy 줄), `scope`(`out`이면 legacy 줄), `decision`, 고른 카드 `card`·`cardId`(없으면 `top[0].id`), 꼬리 표시 `partial`·`tail`(없으면 `absentTail`·`absentHit`가 있거나 조각 배열 일부만 답했으면 `index-partial`), 공백 카드는 `card`·`cardId`·`gap:`으로 시작하는 `absentHit`·`top[0].id` 순서. 조각 배열은 `kind`(또는 `decision`)와 `card`를 읽는다.

**legacy 줄**(그 밖, 범위 밖 `scope: "out"` 줄 포함). 코드 상수 `LEGACY_DECIDED_BY_RULES`·`LEGACY_NOT_FOUND_DECIDED_BY`·`LEGACY_SELECTED_EVIDENCE_DECIDED_BY`·`LEGACY_TOP_SOURCE_DECIDED_BY`(`proxy-eval.ts`)와 같은 표다:

| decidedBy | 종류 | inventory id |
|---|---|---|
| `field:<id>`·`basics:<id>` | 답 | 그대로 |
| `guide:<slug>` | 답 | 그대로 + 첫 출처의 `unit:`(가이드 단위 `unit:guide:<slug>`) |
| `self:<key>` | 답 | 그대로 |
| `template:<이름>` | 답 | 그대로 + 첫 출처의 `unit:`(틀을 고른 절) |
| `symptom` | 답 | 결과 줄 `gateOriginal`의 `symptom:<topicId>`(`symptom:triage`는 id 없음 → 아래 답 글 대조) |
| `service`·`policy`·`policy:<이름>`·`handoff:<이름>`·`unknown` | 답 | decidedBy 에 id 가 없다 → inventory 항목 가운데 `gateOriginal`이 이 decidedBy 와 같은 것이 하나뿐이면 그 id(`policy:academy-payment` → `svc:…`), 아니면 inventory 답 글 대조 |
| `evidence_select`·`generate`·`gate_evidence_select`·`second_chance` | 답(근거 선별이 고른 문서 문장) | 출처 전부의 `unit:<unitId>` |
| `draft` | 답(첫 출처의 검색 조각) | 첫 출처의 `unit:<unitId>` |
| `not_found`·`gate_not_found`·`model_unavailable` | 못 찾음 | — |
| (예전 결과 파일) `answerMode: "doc_suggestion"` + `unresolved: true` + 출처 없음 | 못 찾음 | — |
| `answerMode: "clarifying_question"` | 되묻기 | — |

- **출처 → `unit:<unitId>`:** `units.json`에서 경로(`path`, 끝 `/`·`?`·`#` 뗌)와 절 제목(`heading`, 공백 접고 앞 번호 뗌)이 같은 단위. 출처 제목이 `요약`이거나 없으면 그 문서의 요약 단위(`kind: "summary"` 또는 제목 없는 단위). 정해 둔 답(`field:`·`basics:` 등)에 붙은 출처는 장식이라 쓰지 않는다.
- **inventory 답 글 대조:** inventory 항목(`id` 또는 `answerId`, 답 글 `text`·`answer`·`answerText`와 `textAlternatives`)의 첫 문단(12자 이상)이 측정 답 글(공백 접음)에 들어 있으면 그 id. 여러 개면 가장 긴 첫 문단과 같은 길이의 것을 모두 쓴다. 규칙 표가 낸 id 가 inventory 에 있으면 쓰지 않고, 없으면(예: 함수로 만드는 틀 답은 inventory 에서 `template:<경로>#<함수>`) 규칙 id 에 더한다.
- 위 표에 없는 decidedBy 도 답 글 대조를 한다.

### 판정

| 종류 | 키 | 분류 |
|---|---|---|
| 못 찾음 | `nodoc: true` | `nf_ok` |
| 못 찾음 | `nodoc: false` | `nf_doc_has` |
| 되묻기 | `clarifyOk: true` | `good` |
| 되묻기 | 그 밖 | `needless_clarify` |
| 답 | id 가 `reject`에 있음(아래 둘보다 먼저, compiled 는 카드가 내는 글의 id 만) | `wrong` |
| 답 | id 가 `accept`에 있음 | `good` |
| 답 | id 가 `partialAccept`에 있음 | `partial` |
| 답 | 그 밖(또는 id 를 못 만듦) | `wrong` |
| 측정 오류(답 없음) | — | `wrong` |

`nodoc: true`이면서 `accept`가 있는 키(예: 문서에 없는 것을 묻지만 상담 경로 답도 받아들임)는 못 찾음도 `nf_ok`, `accept`의 답도 `good`이다. 정답 키가 없는 줄은 점수에서 뺀다. 반복마다 대리 점수와 심사 점수의 차이를 적어 대리 점수를 믿을 만한지 본다(사양 §2.4).
