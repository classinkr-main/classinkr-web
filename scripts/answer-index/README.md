# 답 색인 자료 도구(I2 추출·목록, I3 스키마·검사기, I9 컴파일·보정·교차 검증·라벨용 덤프)

공개 챗봇 '답 색인'(compiled answer index)의 자료를 만들고 지키는 도구다. 자료는 `data/answer-index/`에 두고, 스키마의 정본은 `lib/chatbot/answer-index/types.ts`다(다른 구현 단위·자료 생성 단위의 계약). 심사·점수 도구(I1: `answer-index:judge`·`answer-index:score`·`answer-index:proxy`)는 [judge/README.md](judge/README.md)에 있다.

## 명령

| 명령 | 하는 일 |
|---|---|
| `npm run answer-index:extract` | 아래 셋을 한 번에 돌리고 `manifest.json`을 다시 쓴다 |
| `npx tsx scripts/answer-index/extract-units.ts` | 공개 문서 단위 → `units.json` |
| `npx tsx scripts/answer-index/extract-site-facts.ts` | 공개 페이지 사실 문장 → `site-facts.json` |
| `npx tsx scripts/answer-index/inventory.ts [--dev-sets …] [--failure-logs …]` | 기존 정해 둔 답 목록 → `inventory.json` |
| `npx tsx scripts/answer-index/search.ts "<낱말>" [--in unit,site,inventory] [--area <영역>] [--any] [--limit 20] [--json]` | 에이전트용 전문 검색 |
| `npx tsx scripts/answer-index/search.ts --unit "<단위 id>"` · `--site "<site id>"` | 단위 하나(번호 붙은 문장·표시·해시), 페이지 문장 하나 |
| `npx tsx scripts/answer-index/merge.ts [조각 …] [--dry-run] [--replace] [--keep-parts]` | 나눠 쓴 조각을 합친다 |
| `npm run answer-index:verify` (= `npx tsx scripts/answer-index/verify.ts`) | V-1~V-12 검사. 오류가 있으면 종료 코드 1 |
| `npm run answer-index:compile [-- --json]` | 런타임과 같이 자료를 읽고 색인을 만들어 판·색인 해시·개수·크기·걸린 시간·색인에서 뺀 카드(이유별)를 찍는다. 파일은 쓰지 않는다 |
| `npm run answer-index:calibrate [-- --dry-run] [-- --out <파일>] [-- --no-grid] [-- --report <보고.md>] [-- --no-cache]` | 질문 우주(`universe/`)를 관점 5겹으로 나눈 교차 맞춤으로 `calibration.json`을 쓰고 `manifest.json`을 다시 쓴다. 보정 묶음(`eval/calibration-set.json`)은 외부 확인 수치만 낸다. 쓸 우주 문항이 없으면 기본 문턱·계수로 만든다. 격자 108점을 다 훑으면 수십 분 걸려 진행을 찍고 격자 점 결과를 `node_modules/.cache/answer-index-calibrate/`에 둔다(`--report`: 점수 대 NODOC 곡선 등 질문 글 없는 보고) |
| `npm run answer-index:cv [-- --folds 5] [-- --out <파일>] [-- --no-votes]` | 변형 5겹 교차 검증: 1위·결정 정답률, 못 찾음·엉뚱한 카드 비율, 종류·영역별 표, 혼동 표 |
| `npm run answer-index:topk -- --in <질문.json> [--out <결과.jsonl>] [--k 20] [--data-dir <폴더>] [--no-votes]` | 라벨용 상위 카드 덤프: 질문마다 지금 색인(런타임과 같은 load·compile)의 상위 k 카드(id·종류·영역·주제·covers·notCovers·답 글 앞 200자·점수·확신도), 공백 카드 후보(없는 개념 적중), 지금 결정(kind·card·conf, `decide`와 같은 `decideWithAnalysis`)을 JSON Lines 로. 입력은 `[{ id, q }]`·우주 샤드·측정 입력·`{ items }`. 자료 폴더는 `--data-dir` 또는 런타임과 같은 `ANSWER_INDEX_DATA_DIR`. 런타임과 다른 점(개인정보 가리기·서비스 출처 표·색인 앞 단계 없음, 증상 판별 정규식)은 `lib/topk-core.ts` 머리말 |
| `npm run answer-index:judge -- <split·check·select-b·disagreements·merge> …` · `answer-index:score` · `answer-index:proxy` | 심사 절차·점수·대리 점수([judge/README.md](judge/README.md)) |
| `npx tsx scripts/answer-index/assist-check.ts run --set <이름>=<입력.json> --set … --out-dir <폴더> [--assist band\|always]` · `diff` · `compare` | 모델 선택 층(사양 §10, `lib/chatbot/answer-index/assist.ts`) 켜기 전 확인: 묶음마다 compiled 모델 없는 측정을 선택 층 끔·켬으로 돌려 답이 바뀐 줄만 심사 입력(`judge/<묶음>-assist-off-bNN.json`·`-assist-<범위>-bNN.json`)과 바뀐 꼴 표로 낸다. `compare --off <judged> --on <judged> --total N`이 순이득·좋음→나쁨·나쁨→좋음과 켜기 조건(순이득 > 0, 좋음→나쁨 < 나쁨→좋음, 좋음→나쁨 ≤ 1%)을 본다. 통과해야 `calibration.json` `assist.enabled=true`로 둔다 |

추출은 같은 입력이면 같은 바이트를 쓴다(시각·난수 없음). 문서(`lib/docs.ts`·`lib/docs-troubleshooting/*`·화면 가이드)를 바꾸면 `answer-index:extract`를 다시 돌리고 `answer-index:verify`로 낡은 카드를 본다. 문서를 바꾸고 다시 만들지 않으면 V-1이 실패한다.

## 자료 파일

| 파일 | 만드는 곳 | 내용(형은 `types.ts`) |
|---|---|---|
| `units.json` | extract-units | 공개 문서 단위 741개(요약 77·절 555·공개 가이드 109)와 번호 붙은 문장·해시·표시(`AnswerIndexUnitsFile`) |
| `site-facts.json` | extract-site-facts | 공개 페이지 문장(회사 소개·서비스 소개서·체크아웃·개인정보처리방침 현재판·약관·데이터 삭제·문의·푸터), `site:<경로>:<줄>`(`SiteFact[]`) |
| `inventory.json` | inventory | 기존 정해 둔 답 전부(답변 사항 점검 D3 의 입력, 런타임은 읽지 않음)(`AnswerIndexInventoryFile`) |
| `manifest.json` | extract·merge | 원천 파일 해시, 자료 버전 `dataVersion`(= `ANSWER_INDEX_VERSION`), 자료 파일 해시·개수, 조각별 생성 기록 |
| `cards/<영역>.json` | D1·D2·D4·D5 | 답 카드와 nav 표시(`CardFileEntry[]`) |
| `variants/<영역>.json` | D1·D4·D5·D7 | 카드 id → 변형(`VariantsFile`) |
| `universe/<샤드>.json` | D8·D9 | 질문 우주와 라벨(`UniverseItem[]`) |
| `lexicon.json`·`generic-words.json` | D6 | 개념 사전, 뜻 없는 낱말 |
| `absent.json` | D5 | 문서에 없는 방문자 개념(검증 기록 포함) |
| `legacy-alias.json` | D4 | 옛 답 id(inventory id) → 카드 id 또는 null |
| `audit/<묶음>.jsonl`·`audit/human-queue.json` | D3 | 답변 사항 점검 기록(줄마다 `AuditRecord`), 사람 결정 대기열 |
| `calibration.json` | I9 | 점수 가중치·확신도 계수·문턱. `fit`은 맞춤 자료(`universe-oof@<해시>`)·쓴 우주 문항 수(`n`)·외부 확인 문항 수(`check`)·우주 중첩 교차 검증 관점 군집 부트스트랩 10번째 백분위(`bootstrapP10`) |
| `eval/calibration-set.json`·`eval/answer-keys/<묶음>.json` | D10·D12 | 보정 묶음(보정 외부 확인 전용), 개발용 정답 키(질문 글 없이 id 와 정답만, 선택 칸 `reject`·`siteAccept`·`area`·`areaFrom`·`evidenceScope`·`searched`·`note`·`keyGroup` — [judge/README.md](judge/README.md)). 런타임 아님 |

`dataVersion`은 런타임 자료의 내용 해시다(`inventory.json`·`audit/`·`eval/`·`manifest.json`은 넣지 않는다).

### 단위·문장

- 단위 id: `doc:<문서 경로>#summary`(문서 설명 + 챗봇 요약), `doc:<문서 경로>#<절 번호>`(`doc.sections` 위치, 0부터), `guide:<가이드 slug>`(공개 가이드 문서 페이지 글).
- 범위: `listDocs()` 중 공개 챗봇 문서(`isPublicChatbotDoc`)이면서 `status ?? "published"`가 `published`인 것, 그리고 `CS_FIGMA_GUIDES`(내부 전용 slug 제외).
- 문장 나누기: 본문을 줄 단위로 먼저 나누고(경로 줄·목록 줄·표 줄이 다음 문장과 붙지 않게), 줄마다 `splitIntoSentences`(`lib/chatbot/source-grounding.ts`)를 쓴다. 이미지·링크 주소·굵게·목록·인용 표시를 지운다. 같은 단위 안의 같은 문장은 한 번만 넣는다.
- 해시: `sentenceHash` = sha256(NFC + 공백 하나로 접은 문장) 앞 16자(`lib/chatbot/answer-index/hash.ts`, 런타임도 같은 함수를 쓴다).
- 단위 나누기·문장 나누기의 정본은 `lib/chatbot/answer-index/doc-units.ts`·`sentences.ts`다. 런타임 `load.ts`가 같은 함수로 '지금 문서'를 다시 나눠 카드 문장 해시를 대조하고, `scripts/answer-index/lib/units.ts`·`sentences.ts`는 영역 표만 더하거나 다시 내보낸다.
- 표시(`flags`): `caption` 화면 캡션·빨간 박스, `meta` 문서 자체 안내("아래 순서대로…", "이 문서는…"), `nav` 다른 문서를 보라는 말, `connective` 접속어·지시어로 시작(앞 문장과 함께만), `table` 표의 한 줄. `caption`·`meta`·`nav` 문장은 답으로 쓰지 않는다(V-3).

### 영역

영역 12개(`start`·`account`·`classroom`·`course`·`recording`·`homework`·`admin`·`board`·`pricing`·`company`·`trust`·`support`)는 `scripts/answer-index/lib/areas.ts`의 결정적 표로 정한다. 질문으로 정하지 않는다.

- 문서 단위: 절 지정(`SECTION_AREA`) → 절 제목 규칙(`HEADING_AREA_RULES`) → 문서 지정(`DOC_AREA`) → 문서 분류 기본값(`CATEGORY_AREA`)
- 공개 가이드: 제목 규칙(`GUIDE_TITLE_RULES`) → 가이드 분류 기본값
- 정해 둔 답: 근거 문서가 있으면 그 문서 단위의 영역 → 답 id 규칙(`ANSWER_ID_RULES`) → 답 분류 기본값

### inventory

id 접두: `field:`·`basics:`·`symptom:`·`svc:`·`template:`·`self:`·`guide:`. `svc:<이름>`은 `buildServiceQuickAnswer`의 답(이름은 판별 정규식 상수 이름, 예: `SHOWROOM_CONFIRM_RE` → `svc:showroom-confirm`)과 `buildPolicyGuardResponse`의 관문 대상 답(`svc:policy-academy-payment`). `template:<절 제목>`은 `formatConsumerAnswer`가 출처 절 제목으로 고르는 틀 답이다(경로로 고르면 `template:<경로>#<함수>`). 보안·범죄·토큰 낭비 거절, 영어 안내, 즉시 상담 연결처럼 compiled 앞단에 그대로 남는 답은 넣지 않는다.

항목마다: 답 글(`text`, 질문에 따라 바뀌는 갈래는 `textAlternatives`), `textHash`, `gateOriginal`(지금 관문에 넘기는 이름), 분류, 상담 버튼, 근거 문서, 판별식 원문과 정규식(`match`), 걸림 수(`hits`: 판별식에 걸리는 질문 수)·뽑힘 수(`wins`: 모듈 안 순서로 이 답이 뽑히는 수), 자동 표시(`flags`: 낡을 수 있는 사실, 부재 주장, 약속하지 않음 문장, V-3 규칙 위반), 비슷한 답(`nearDuplicates`: 첫 40자 같음 또는 2-gram 자카드 0.8 이상), 화면 이름과 그것을 2개 이상 함께 쓰는 답(`screenNamePeers`), 실패 기록의 가로채기 언급 수(`hijackMentions`), 정의 위치.

- 걸림 수는 질문 글 없이 숫자만 남긴다. 저장소 평가셋(first-contact·fresh-open·golden·cs-symptom·persona-eval)은 늘 세고, 저장소 밖 개발용 묶음은 `--dev-sets name=path,…` 또는 `ANSWER_INDEX_DEV_SETS`로 줄 때만 `dev` 칸에 더한다. 확정용 묶음(holdout2·3·4)은 넣지 않는다.
- `--failure-logs`·`ANSWER_INDEX_FAILURE_LOGS`: 개발용 실패 기록(JSON 배열)의 `rootCause`·`whereInCode`·`fixHint`만 읽어 가로채기 언급을 센다.
- 저장소 밖 입력은 `manifest.json`의 `inputs`에 이름과 해시만 남는다. 저장소에 넣은 inventory 는 dev5·holdout1·371 묶음과 개발용 실패 기록을 준 결과다. 같은 입력 없이 다시 만들면 `hits.dev`·`hijackMentions`가 null 이 된다(검사는 답 글 해시만 본다).

## 나눠 쓰기와 합치기(merge.ts)

자료 단위(D1~D13)는 같은 파일을 동시에 쓰지 않게 조각 파일로 쓴다: `<기본 이름>.<조각>.json(l)`.

- `cards/account.D1-07.json` → `cards/account.json`, `variants/account.D1-07.json` → `variants/account.json`, `universe/s003.D9-12.json` → `universe/s003.json`, `audit/C-02.D3-02b.jsonl` → `audit/C-02.jsonl`, `lexicon.D6-03.json` → `lexicon.json`, `absent.D5-01.json`, `legacy-alias.D4-01.json`, `audit/human-queue.D3-01.json`, `eval/answer-keys/dev5.D12-01.json`도 같다.
- 카드·없는 개념·대기열·옛 id 대응·점검 기록·정답 키는 id(키)로 합친다. 같은 id 가 다르면 충돌로 그 파일을 쓰지 않는다(`--replace`면 나중 조각 것으로 바꾼다).
- 변형은 카드별로 덧붙이고, 같은 정규화 변형이 이미 있으면(다른 카드 포함) 나중 것을 버리고 알린다.
- 우주는 id 로 합치고 빈 칸(label·label2·conf·labeler)을 채운다. 사전은 개념 id 로 합치고 형태를 합집합으로 한다.
- 합친 조각은 지운다(`--keep-parts`면 남긴다). `manifest.json`의 `generation`에 조각별 파일·개수·작성자·검수자·해시가 남는다.

## 검사(verify.ts)

| # | 검사 | 실패 |
|---|---|---|
| V-1 | `units.json`이 지금 문서로 다시 만든 단위와 같다. doc 카드의 (단위, 문장 번호, 해시)·리드 근거·공백 카드 관련 문장이 지금 `units.json`·지금 문서에서 같은 해시로 찾아진다. howto 카드의 증상 주제·가이드가 있다 | 오류(꺼진 카드는 경고) |
| V-2 | FIX·policy 카드 `textHash` = 글 해시 = 점검 통과본(`auditRef`). KEEP(`curatedRef`) 해시 = 지금 옛 답 글 해시(런타임 `load.ts`와 같은 조건: fixed·policy 카드의 `curatedRef`, policy 카드에 `curatedRef`를 두면 V-12 오류). `curatedRef.module`이 `svc`·`template`인 KEEP 카드는 런타임이 옛 답을 id 로 부를 수 없어 꺼지므로(`curated.ts`, `CURATED_MODULES_WITHOUT_RUNTIME`) 거부한다 — FIX text 카드로 쓴다(같은 글이면 textHash 같음). 점검 기록의 모든 인용이 그 단위 문장·페이지 줄에 글자 그대로 있고 지금 문서와 같다. `site-facts.json`·`inventory.json`이 낡았으면 경고 | 오류 |
| V-3 | 리드가 허용 목록 안, `yes_can`·`not_supported`면 `leadBasis`. 답 글(doc 문장·FIX·policy·KEEP 글)에 식별 정보 요구·금액 숫자·할인/환불 약속 없음(`lib/text-rules.ts`). `caption`·`meta`·`nav` 문장 안 씀, `connective` 문장은 앞 문장과 함께. 50자 이하 단편 하나는 경고. 정책 구절: 결정(`decision`)이 비어 있는 대기열 항목의 `blockPhrases` 하나가 active 카드 답 글 — doc(고른 문장 글)·howto(증상 주제·가이드 답 글)·fixed(FIX text, KEEP 은 지금 옛 답 글)·gap(관련 문장 글) — 에 정규화(NFC·소문자·글자와 숫자만) 포함되면 오류("정책 대기 HQ-xx 구절: 카드를 review 로 두거나 policy 카드로 보낸다"). 예외는 active policy 카드 전부(어느 항목을 `policyRef`로 가리키든)와 review·disabled 카드다: 정책 주제는 지금 운영에서도 사람이 쓴 정해 둔 답 글로만 답하고 policy 카드 text 는 그 글 그대로라, 다른 대기 항목 구절로 막으면 지금 운영보다 더 막혀 요금 질문이 답을 잃는다. 문서에서 고른 글과 FIX·KEEP 글은 지금처럼 막는다(KEEP 글은 결정이 나도 바뀌지 않으므로 policy 카드로 보낸다) | 오류 |
| V-4 | 같은 정규화 변형이 두 카드에 없음, 변형 2~60자, 작성 변형(g=A) 최소 head 60·standard 25·gap 15(`--require-blind`면 블라인드 g=B 15·10·5도), 변형의 카드 id 가 있음 | 오류 |
| V-5 | 없는 개념 형태가 문서·페이지 문장에 나오면(같은 뜻이 아니라는 `verified.sameMeaningNote` 없을 때), 기록한 적중 수가 다시 센 값과 다르면, 공백 카드 변형이 문서 카드 변형과 겹치면 | 경고 |
| V-6 | 모호 규칙 없이 한 형태가 두 개념에 걸림, 4어절 이상 형태, 3글자 이하 형태를 `{ form, boundary: "both" }`로 적지 않음, 없는 상위 개념·모호 규칙 참조 | 오류 |
| V-7 | 변형·우주·반례·사전 형태·없는 개념 형태·보정 묶음이 개발용 질문과 정규화 동일·편집거리 2 이하(둘 다 8글자 이상일 때)·2-gram 자카드 0.8 이상, 사전·없는 개념 형태는 8자 이상 연속 일치 | 오류 |
| V-8 | 보정 묶음 문항이 변형·우주와 겹침(V-7 과 같은 기준) | 오류 |
| V-9 | 공개 단위가 카드(doc 문장 단위·howto 가이드) 하나 이상에 덮이거나 nav 표시 | 카드가 있는 영역은 오류, 아직 없는 영역은 알림(`--strict`면 모두 오류) |
| V-10 | inventory 의 옛 답 id 가 모두 `legacy-alias.json`에 있음(카드 또는 null), 키·값이 실제 옛 id·카드 | 대응을 시작한 영역은 오류, 아직 없는 영역은 알림(`--strict`면 모두 오류) |
| V-11 | active policy 카드의 `policyRef`가 대기열에 있음, `evidenceScope: "site"` 카드는 사람 결정 전 `review`, 우주 라벨이 review·disabled 카드를 가리키면 경고 | 오류 |
| V-12 | 런타임 자료 합계 25MB 이하, 카드 id 형식과 종류·영역, 카드 id 중복, 파일별 스키마(대기열 `blockPhrases`는 문자열 배열, 정답 키 선택 칸 꼴), 우주 라벨·반례 행선 형식, 정답 키에 질문 글 없음, `calibration.json`·`manifest.json` 낡음(경고) | 오류 |

- `--only <파일>`: 그 파일에 묶인 결과만 보인다(검사는 자료 전체로 돈다). 자료 에이전트는 자기 조각 파일로 돌려 오류 0을 확인한다: `npx tsx scripts/answer-index/verify.ts --only cards/account.D1-07.json --only variants/account.D1-07.json`.
- 개발용 질문(V-7): 저장소 평가셋은 늘 쓴다. 저장소 밖 묶음(dev5·holdout1·371·dev6~dev8)은 `--dev-sets name=path,…` 또는 `ANSWER_INDEX_DEV_SETS`. 겹친 자료 쪽 글과 묶음 이름만 찍고 평가 질문 글은 찍지 않는다.
- 확정용 묶음(측정 담당만): `--with-holdout <경로[#묶음 key]>,…` 또는 `ANSWER_INDEX_HOLDOUT_SETS`. 문장은 기계적으로만 읽고 파일별 겹친 개수만 찍는다. `data/chatbot-holdout-sets.json`은 `#holdout2`처럼 묶음을 골라 준다. 저장소에는 확정용 묶음 문장을 넣지 않는다.
- V-5의 '색인 1위 + 확신도 ≥ θ' 판정은 색인(I5·I6)이 생긴 뒤 더한다. 지금은 변형 겹침 기준으로 경고한다.
- 편집거리 2 기준은 정규화 길이 8글자 이상인 글끼리만 쓴다. 짧은 글은 두 글자만 바꿔도 다른 질문이라(예: '줌 연동 돼요'와 '줌 녹화 돼요') 정규화 동일·자카드로만 본다.

## 런타임 연결(I7·I8)과 컴파일·보정·교차 검증(I9)

- 라우터: `CHATBOT_ANSWER_ROUTER` = `legacy`(기본, 값이 없어도 legacy) · `shadow`(손님에게는 legacy 답, 응답 뒤 `[chatbot] answer-index shadow {…}` 로그에 색인 판정 — 질문 해시 앞 12자·길이·결정·상위 3 id·확신도·legacy 출처만) · `compiled`. 연결은 `lib/chatbot/service.ts` `buildChatbotCoreBase`(사양 §3.2 순서), 묶음은 `lib/chatbot/answer-index/index.ts`.
- compiled 의 범위 안 짧은 질문은 색인이 정하고 모델·네트워크를 부르지 않는다(관문·근거 선별·보류·두 번째 검색·`MODEL_UNAVAILABLE_ANSWER` 없음). 인사·거절 답(보안·범죄·토큰 낭비·모델 정보·잡담 공감)·관문 밖 정해 둔 답(시험 정답 거절)·영어 안내·강한 상담 연결·이미 해 봤다는 화난 문의는 색인 앞에서 그대로 답한다. 정규식이 고른 정해 둔 답(field·basics·자기소개·학원 결제 안내 등)은 답을 정하지 않고 `legacy-alias.json`을 거쳐 표(vote)로만 쓴다. 범위 밖(공백 뺀 80자 초과·문장 4개 이상·영문만)은 지금 흐름이다.
- 답 조립(`respond.ts`): doc 카드는 문장을 지금 문서에서 다시 꺼내 해시를 대조하고 근거 선별 답과 같은 문단 규칙(`paragraphs.ts`)으로 묶는다. KEEP(`curatedRef`)는 `curated.ts`가 옛 답을 id 로 찾는다 — field·basics·self·symptom·guide 만 된다. svc·template 은 service.ts 안의 조건 갈래라 id 로 부를 함수가 없어 load 때 빠지고(`stale: 옛 답 없음`) verify V-2 가 거부한다. 그런 답은 D4 가 FIX(text) 카드로 만든다(글이 같으면 textHash 도 같다). 리드는 `CHATBOT_COMPILED_FRAMING=full`(기본)일 때 묻는 꼴에 맞으면만 붙인다(yes_can·not_supported 는 yes/no 질문 + 검증된 근거 문장, how_to 는 방법·가능 여부 질문 또는 묻는 꼴 모름).
- 결정 규칙(`decide.ts` 머리말, 진단 R1): 조각 답·공백은 그 종류 θ + 0.1(`SEGMENT_CONF_MARGIN`) 이상일 때만 낸다(R15). 확신도 특징 마지막 자리 `knnCount1`은 1위 카드 라벨인 우주 이웃 수를 log1p 로 누른 값이다(R02, 라벨이 갈린 이웃은 반). `calibration.json` 계수 길이가 특징 수와 다르면 그 종류는 기본 계수로 돌아가고 `[chatbot] answer-index calibration feature count mismatch` 경고를 한 번 낸다 — 특징을 바꾸면 `calibrate.ts`를 다시 돌린다. 정해 둔 답 승격(R07, `CHATBOT_COMPILED_VOTE_RESCUE`: 기본 켬·`off` 끔·`override`): 옛 정규식 표 카드가 원문 상위 3 안이고 active·doc/howto/fixed/policy 이며 범위 관문·없는 개념(그 카드가 덮음)·공백(결정이 gap 아님, 되묻기·두 조각 이은 답 제외)·NODOC(반례 none 자리가 1위 아님, 우주 이웃 none 몫 0.5 미만) 검사를 통과하면 문턱에 못 미쳐 답하지 않던 질문을 그 카드로 답한다. `override`는 1위가 다른 카드로 답했어도 표 카드로 바꾼다(혼합 P3 그대로, 보정 묶음에서는 이 부분이 손해라 기본에서 뺐다). legacy 문서 초안 경로는 쓰지 않는다.
- 흔적: `evaluateChatbotQuery`가 compiled 라우터일 때 `answerIndex`를 돌려주고 측정 스크립트가 결과 줄에 싣는다. `card`·`partial`(실제로 꼬리를 붙였는지)·`absentTail`·`pre`(색인 앞 단계)·`unavailable`(카드를 답으로 못 만들어 못 찾음으로 바꾼 이유)·`decidedBy`(정해 둔 답 승격이면 `index:vote-rescue`, 측정 줄 decidedBy 는 카드 대조용 `index:<card>` 그대로).
- 자료 폴더: `ANSWER_INDEX_DATA_DIR`(상대 경로는 작업 폴더 기준, 없으면 `data/answer-index`). 작업 폴더 자료를 `scripts/chatbot-live-eval.ts --router compiled`로 잴 때 쓴다. 판정할 때마다 읽어, 색인 캐시(마지막 폴더 하나)·판(`answerIndexVersion()`: 그 폴더 manifest dataVersion + 계산 규칙 판)·흔적의 `version`이 그 폴더를 따른다. 런타임은 합치지 않은 조각을 읽지 않으므로 작업 폴더도 `merge.ts`로 합친 뒤 잰다.
- 답 캐시 열쇠에 라우터, 판(`answerIndexVersion()`), 자료 폴더가 들어간다(`ANSWER_INDEX_VERSION`은 모듈을 처음 읽을 때 폴더의 판).
- 컴파일(`compile.ts`): `answerIndexHash`는 같은 자료면 같다. 첫 컴파일 시간·메모리는 사양 §3.10 예산과 비교한다(2안 번들은 아직 없음).
- 보정(`calibrate.ts`, `lib/calibrate-core.ts` 머리말): 사양 §8.2 를 진단 R1(R02·R05·R06·R12·R13)대로 바꾼 방법이다(아래 '보정이 사양 §8.2 와 다른 점'). 우주 쓸 문항(라벨이 색인 카드·none·gap:*·clarify, 범위 안)을 관점 단위 5겹으로 나눠 겹마다 그 겹 우주를 뺀 색인을 다시 컴파일해 분석하고(OOF), 옛 정규식 표를 런타임처럼 넘긴다. 확신도는 표준화 특징 + L2 로지스틱(종류별, 맞춤 행 20개 미만·한쪽 답뿐인 종류는 종류 one-hot 공용 모델)이고, θ 는 교차 맞춤 확신도에서 '세 비율 재가중 대리 최대, 단 진짜 NODOC 답함 ≤ 8%'로 고른다. 가중치 격자 108점(knn 0 포함)은 같은 θ 절차로 중첩 교차 검증해 고른다. 지금 `calibration.json`은 읽지 않고 기본값에서 시작한다(같은 자료·같은 우주 → 같은 바이트, 캐시와 무관). `calibration.json`의 `dataVersion`은 calibration.json 을 뺀 런타임 자료 해시(`manifest.ts calibrationBasisVersion`)이고 V-12 가 이 값과 비교한다. 개발용·확정용 묶음은 쓰지 않는다.
- 교차 검증(`cv.ts`, `lib/cv-core.ts`): sha256(질문 쪽 정규화 글 `prepareText(변형).compact`) % 겹 수로 나눠(정규화가 같은 변형은 카드가 달라도 같은 겹, 진단 R19) 겹마다 그 변형을 뺀 색인을 컴파일하고 뺀 변형으로 판정한다. 옛 정규식 표는 런타임처럼 `collectLegacyVotes(변형, null, legacy-alias)`로 넘긴다(진단 R13, `--no-votes`로 끔). `CHATBOT_COMPILED_*` 환경변수는 쓰지 않는다.
- 끔 동등성: `tests/chatbot/answer-index/fixtures/legacy-equivalence.json`(평가셋 전 문항의 legacy 답 해시, 글 없음)을 라우터 없음·legacy·shadow 에서 대조한다. 옛 흐름을 일부러 바꾼 커밋에서만 `ANSWER_INDEX_WRITE_LEGACY_EQUIVALENCE=1 npx vitest run tests/chatbot/answer-index/legacy-equivalence.test.ts`로 다시 만든다.

## 보정이 사양 §8.2 와 다른 점(진단 R1 단계 1·3)

사양 §8.2 대로 보정 묶음(D10)만으로 맞추면 묶음이 작아(쓸 문항 271, 확인용 90) θ 선택 폭이 크고(부트스트랩 폭 약 15점), 코드에 확정 결함이 있었다(진단 R06·R13). 그래서 아래처럼 바꿨다. 사양 문구는 고치지 않았고, 이 절이 지금 동작의 정본이다.

| 사양 §8.2 | 지금(`lib/calibrate-core.ts`) | 까닭 |
|---|---|---|
| 1 맞춤 자료: 보정 묶음 2/3 맞춤·1/3 확인 | 질문 우주(D8·D9 라벨)를 관점(p) 단위 5겹으로 나눈 교차 맞춤. 겹마다 그 겹 우주를 뺀 색인을 다시 컴파일해 분석한다(자기 자신·같은 관점 문항이 kNN 이웃·IDF 에 남는 누설 차단). 보정 묶음은 외부 확인 수치만 낸다(`fit.check`는 그 문항 수) | R02: 묶음 확인용 90문항은 폭이 너무 크고, 우주를 그대로 쓰면 자기 자신이 이웃이라 누설된다 |
| 2 확신도: 종류별 로지스틱(원 특징), 20개 미만 종류는 기본 계수 | 맞춤 행으로 표준화한 특징 + L2 λ=1, 원 척도 계수로 되돌려 쓴다(런타임 형식 그대로). 20개 미만·한쪽 답뿐인 종류는 종류 one-hot 공용 모델 | R12: howto·gap 이 기본 계수로 남아 거의 답하지 않았다 |
| 3 가중치: 확인용에서 격자를 기본 문턱으로 채점, knn {0.3,0.5,0.7} | 격자 108점(knn {0,0.3,0.5,0.7}). 점마다 θ 고르기와 같은 절차를 중첩 교차 검증으로 돌린다: 바깥 겹마다 나머지 겹에서 θ 를 고르고 그 겹을 채점(θ 를 고른 자료로 채점하지 않음). vote 0.5점 규칙은 그대로 | R06: 기본 문턱(0.55/0.6)으로 고른 가중치가 실제 θ 와 맞지 않았고 같은 자료를 두 번 썼다. R18: knn 0 은 보정이 거르게 넣는다 |
| 3·런타임 후보 풀: (명시 없음) | 옛 정규식 표(`collectLegacyVotes(질문, null, alias)`)를 보정·교차 검증에도 넘긴다. 서비스가 더하는 정해 둔 답 출처 이름(`gateOriginal`)은 없다 | R13: 표 없이 맞추면 vote 가중을 잴 수 없고 후보 풀이 런타임과 달랐다 |
| 4 θ ∈ {0.30,…,0.90}, 부트스트랩 10번째 백분위 최대, 세 비율 차 1점 초과 θ 버림(모두 넘으면 차가 가장 작은 θ) | θ ∈ {0.10,…,0.95}. 세 비율 재가중 대리 평균 최대, 단 우주 OOF 진짜 NODOC(라벨 none·gap:* 이고 label2 도 카드가 아님) 답함 ≤ 8%. 벌점 λ 이분 탐색 + 종류별 좌표 탐색, 제약 안에서 다듬기. 퍼짐은 같은 점수일 때만 본다 | R06: 퍼짐 최소가 5~8점이라 1점 규칙은 만족될 수 없었고, 대체 규칙(퍼짐 최소)이 θ 를 하한 0.30 쪽으로 끌어내렸다. R05: 파일럿 관문(NODOC 답함 8%)을 θ 선택의 제약으로 넣는다 |
| 7 `fit.bootstrapP10`: 확인용 문항 부트스트랩 | 우주 중첩 교차 검증 점수의 관점 군집 부트스트랩(1,000회, 고정 시드) 10번째 백분위 | 같은 관점 문항끼리 닮아 문항 단위 부트스트랩은 폭을 과소평가한다 |

- 범위 관문(`isCompiledScope`) 밖 우주 문항은 런타임에서 색인이 정하지 않으므로 뺀다.
- 우주 OOF 는 우주의 80%만 이웃으로 써서 런타임보다 knnShare·knnCount1 이 조금 낮다(진단 R02 위험). 우주 문항 가운데 변형과 글이 같은 것(수십 개)은 그 변형이 색인에 남는다.
- 보고(`--report`)에는 고른 값, 우주 중첩 점수와 관점 부트스트랩, 우주 OOF, 보정 묶음 외부 확인(1위 정답·결정 정답·진짜 NODOC 답함·세 비율 대리), 점수 대 NODOC 곡선(λ 경로·네 답 종류 공통 θ), 격자 상위가 들어간다. 질문 글은 넣지 않는다.
