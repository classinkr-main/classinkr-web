# 홈페이지 MCP 운영 문서

상태: 현재 기준 운영 문서(2026-11-25)
범위: `POST /api/mcp`(홈 MCP, 내부 직원용) — 토큰, 범위, 쓰기 안전장치, 연락처 가림, 감사, 공용 도구 레지스트리

코드 정본:

- 프로토콜·토큰 해석: [lib/mcp/server.ts](../../lib/mcp/server.ts)
- MCP 어댑터(범위 확인·가림·직렬화): [lib/mcp/tools.ts](../../lib/mcp/tools.ts)
- 엔드포인트: [app/api/mcp/route.ts](../../app/api/mcp/route.ts)
- 공용 도구 레지스트리: [lib/ops-tools/registry.ts](../../lib/ops-tools/registry.ts)(정의 꼴 [types.ts](../../lib/ops-tools/types.ts), 범위 [actor.ts](../../lib/ops-tools/actor.ts), 안전장치 [guard.ts](../../lib/ops-tools/guard.ts), 가림 [redact.ts](../../lib/ops-tools/redact.ts))
- 시험: `tests/mcp/home-mcp.test.ts`, `tests/mcp/home-mcp-safety.test.ts`, `tests/ops-tools/registry.test.ts`

배경 점검: 갈매봇 점검 R1·R3·R7·R8·R9·R22·R25·R26·R30(묶음 B3). 갈매봇 쪽 구조는
[admin-ai-structure-worklist-2026-09-29.md](./admin-ai-structure-worklist-2026-09-29.md)를 따른다.

## 1. 토큰 형식 두 가지

운영 환경변수 `HOME_MCP_TOKENS` 에 쉼표로 이어 적는다. 줄마다 형식을 고를 수 있고 섞어 써도 된다.
비어 있으면 `/api/mcp` 는 늘 401 이다. 토큰은 16자 이상, 사람마다 다르게.

| 형식 | 꼴 | 허용 |
| --- | --- | --- |
| 옛 형식 | `이름:토큰` | 읽기 전부, 쓰기 둘(견적 초안·HW 배송 예정), `chatbot_ask internal=true`. 연락처는 가린다. 만료 없음 |
| 넓힌 형식 | `이름:토큰;scope=범위+범위;exp=YYYY-MM-DD;admin=이메일` | 적힌 범위만, 만료일 그날 끝(KST)까지 |

넓힌 형식 예: `moon:3f9c…(긴 무작위);scope=read+write:quote;exp=2027-03-31;admin=moon@classin.kr`

- `scope`(필수): `+` 로 잇는다. 모르는 범위가 있으면 그 줄 전체가 무효다.
- `exp`(필수): `YYYY-MM-DD`. 그날 23:59:59 KST 까지 유효하고, 지나면 401(로그 `reason=expired`).
- `admin`(선택): 어드민 계정 이메일. 감사 기록 payload 의 `admin_email` 에만 실린다(로그에는 없다).
- 구분 규칙: 첫 `:` 뒤에 `;scope=` 가 있으면 넓힌 형식, 아니면 옛 형식이다. 옛 형식의 토큰은 전처럼
  "첫 `:` 뒤 전부"다. 옛 형식 토큰 문자열 안에 `;scope=` 가 들어 있으면 넓힌 형식으로 읽혀 깨진다 —
  무작위 토큰에는 없지만, 바꾸기 전에 확인한다.
- 넓힌 형식 줄이 틀렸으면(모르는 범위·없는 날짜·모르는 키·`exp` 없음) 그 줄은 어떤 토큰과도 맞지 않는다(닫힌 쪽으로 실패).
- 넓힌 형식 줄 전체(`토큰;scope=…`)를 Bearer 로 보내도 옛 형식으로 통과하지 않는다.

## 2. 범위(scope) 뜻

| 범위 | 여는 것 |
| --- | --- |
| `read` | 조회 도구 전부(`hw_stock`·`hw_movements`·`hw_sales`·`deals_list`·`quotes_list`·`quote_get`·`quote_templates`·`chatbot_ask`·`site_traffic`) |
| `write:quote` | `quote_create_draft` |
| `write:hw` | `hw_plan_movement` |
| `internal` | `chatbot_ask` 의 `internal=true`(내부 CS 문서 근거). 없으면 플래그를 무시하고 결과에 `internal_ignored` 를 싣는다 |
| `pii` | 조회 결과의 사람 연락처(전화·이메일) 원문. 없으면 가린다 |

쓰기 범위만 있고 `read` 가 없으면 조회 도구는 못 부른다. 범위가 없는 도구를 부르면 `isError` 결과로
"이 토큰에는 … 범위가 없다"가 온다(로그 `code=scope_denied`). `tools/list` 는 범위와 관계없이 전체 목록을 낸다.

## 3. 옛 형식에서 넓힌 형식으로 옮기는 절차

운영 환경변수는 사용자(관리자)가 바꾼다. 코드 배포만으로는 아무 토큰도 바뀌지 않는다.

1. 사람마다 필요한 범위를 정한다. 권장: 기본 `read`, 쓰기는 필요한 사람에게만 `write:quote`·`write:hw`,
   `internal`·`pii` 는 꼭 필요한 사람만. 만료는 3~6개월.
2. 새 무작위 토큰을 만든다(예: `openssl rand -base64 32`). 같은 토큰 문자열을 그대로 두고 `;scope=…;exp=…` 만
   붙여도 동작하지만, 그러면 그 사람의 권한이 옛 형식보다 좁아지는 순간이 배포 시점과 같아진다.
3. Vercel 프로젝트 환경변수 `HOME_MCP_TOKENS` 에 넓힌 형식 줄을 더한다(옛 줄은 당분간 같이 둔다).
4. 재배포한다(환경변수는 배포 때 읽힌다).
5. 그 사람의 클라이언트 연결을 새 토큰으로 바꾼다:
   `claude mcp add --transport http classin-home https://classin.co.kr/api/mcp --header "Authorization: Bearer <새 토큰>"`
6. 런타임 로그에서 그 사람의 `tools/call` 줄에 `legacy=1` 이 더 나오지 않는지 본다.
7. 옛 줄을 지우고 다시 배포한다. 퇴사·권한 회수도 같은 방법(줄 삭제 + 재배포)이다 — DB 에 묶인 토큰이 아니라
   재배포 전까지는 살아 있다(점검 결정 2의 다음 단계: DB `mcp_tokens` 해시 + admin_users 연결).

## 4. 쓰기 안전장치

확인 방식은 지금처럼 **호출하는 쪽(Claude 클라이언트) 승인 창**에 맡긴다. 서버는 막을 수 있는 것을 막는다.

- **묶음 하나에 쓰기 1개**: JSON-RPC 묶음(배열) 안에 쓰기 도구 호출이 둘 이상이면 두 번째부터는 실행하지 않고
  그 호출만 `isError`("한 요청 묶음에 쓰기 도구는 1개까지")로 답한다(로그 `code=batch_write_limit`). 읽기는 전처럼 20개까지.
- **호출자별 분당 상한**: 쓰기는 호출자(토큰 이름)마다 1분에 10번까지. 넘으면 `isError`(로그 `code=rate_limited`).
- **idempotency_key**(쓰기 도구의 선택 인자, 1~200자): 같은 호출자·같은 도구·같은 키면 두 번 만들지 않고 처음 결과를
  `{ replayed: true, note, result }` 로 돌려준다. 같은 키를 다른 내용에 쓰면 거절한다(`code=idempotency_conflict`).
  키를 안 주면 전처럼 매번 실행한다.
  - `hw_plan_movement`: 키를 `hardware_movements.raw.mcp.idempotency_key` 에 싣고, 메모리에 없으면 DB 에서 같은 키를 찾는다.
  - `quote_create_draft`: 키를 실을 칸이 없어(마이그레이션 없이) **인스턴스 메모리만** 쓴다.

### 인스턴스 메모리 한계

분당 상한과 idempotency_key 기억(24시간, 최대 1000건)은 서버리스 인스턴스 메모리에 있다.

- Vercel 은 요청을 여러 인스턴스에 나눠 보내고, 식은 인스턴스는 기억을 잃는다. 실제 분당 상한은 10 × 동시 인스턴스 수다.
- 견적 초안은 다른 인스턴스로 간 재시도를 막지 못한다. 확실한 중복 방지는 갈매봇 오더 원장(`admin_ai_orders`, S2) 때 DB 유니크 키로 옮긴다.
- 메모리 장치는 사고를 줄이는 장치지 정확한 한도가 아니다.

## 5. 이번에 달라진 동작(2026-11-25, 묶음 B3)

옛 형식 토큰을 그대로 쓰는 사람에게도 달라지는 것:

1. 조회 결과의 전화·이메일이 가려져 온다(`010-****-5678`, `***@도메인`, `+82-10-****-5432`). id·번호 칸(`…_id`·`…Id`·`…_number`·`…_no`)은 그대로.
2. 연락처가 든 조회는 `audit_logs` 에 `mcp.read_contacts`(도구 이름·대상 id·칸 수, 값 없음)로 남는다.
3. `hw_plan_movement` 는 새 품목을 만들지 않는다. `item_id` 가 없으면 이름(공백 정리)이나 별칭이 **정확히 같은 기존 품목이 하나**일 때만
   진행하고, 아니면 후보(item_id·이름 최대 10개)를 싣고 거절한다. `item_id` 가 있으면 그 품목이 있어야 하고, 기록의 품목 이름은
   그 품목의 이름을 쓴다(받은 이름이 다르면 `warnings` 에 `product_name_differs`).
4. `quote_create_draft` 에서 기준 단가(템플릿 표준가)와 다른 `unit_price` 를 주면 결과에 `price_warnings`(줄·기준 단가·지정 단가·차이·변동률)와
   안내가 붙고, 견적 내부 메모에 "단가 지정 N줄(기준 단가와 다름 — 확인 필요)"이 더해진다. 합계는 전처럼 서버 계산값만 쓴다.
5. 쓰기 뒤 감사 기록이 실패하면 결과에 `audit_warning`(코드)이 붙는다. `hw_plan_movement` 결과는 보통 전처럼 배열이지만,
   경고나 감사 실패가 있으면 `{ movements: [...], warnings?, audit_warning? }` 객체로 온다.
6. 모르는 DB 오류는 원문 대신 "서버 쪽에서 실패했다(코드 db_23505)" 꼴로 온다(전에는 Postgres 영문 오류가 4xx 로 분류돼 원문이 나간 경우가 있었다).
   저장소의 한국어 규칙 오류(중복·재고 부족 등)는 전처럼 글이 온다.
7. 묶음 쓰기 1개·분당 10번 상한(§4).
8. 로그 줄에 `code=…`, 옛 형식이면 `legacy=1` 이 붙고, 인증 실패는 `[mcp] auth=denied reason=missing|unconfigured|invalid|expired` 한 줄로 남는다.
   오류 글 원문은 로그에 싣지 않는다.

달라지지 않은 것: 엔드포인트·연결 명령, `tools/list` 의 도구 이름·설명·스키마(쓰기 도구에 선택 인자 `idempotency_key` 만 더), 옛 형식 토큰의 읽기·쓰기·internal 권한, 401 응답 꼴.

## 6. 공용 도구 레지스트리

`lib/ops-tools/` 가 도구 정의의 정본이고 `lib/mcp/tools.ts` 는 이를 MCP 꼴로 내보내는 어댑터다.

- 정의: `id`(점 표기)·`mcpName`·`risk`(R0 조회 / R1 등록)·`requiredScope`·`inputSchema`.
- R0 은 `run` 하나. R1 은 `run` 이 없고 `preview`(검증·조회·계산, 쓰기 없음)와 `execute`(preview 결과로 실제 쓰기)로 나뉜다.
- MCP 는 지금처럼 `preview → execute` 까지 한 번에 간다. 갈매봇은 `preview` 만 부르고 `execute` 는 사람이 확인한 서버 경로에서만
  부르게 할 준비다(기획 "확인 경로에 모델 없음").
- 행위자: `{ name, scopes, adminEmail?, legacy }`. 감사 `actor_display_name` 은 `mcp:<이름>`, `actor_role` 은 `MCP`,
  payload 에 `token_format`(legacy/scoped)과 있으면 `admin_email`.
- 계약 시험: 쓰기 정의에 `run` 없음, MCP `tools/list` 이름 집합·순서 = 레지스트리 `mcpName`,
  `tools/list` 가 바꾸기 전 고정 파일(`tests/mcp/fixtures/tools-list.before.json`)과 같음(새 선택 인자 제외).

## 7. 남은 일

- 토큰을 DB(`mcp_tokens` 해시)와 admin_users 에 묶어 호출마다 계정 상태·역할을 다시 읽기(결정 2의 다음 단계).
- MCP 쓰기를 오더 티켓 + 어드민 확인으로 통일(결정 1 b, S2).
- `quote_create_draft` 의 단가 지정 대신 할인 지시 받기(결정 8 c) — 이번에는 단가를 그대로 받고 경고만 싣는다.
- `deals_list` 를 DB 쪽 검색·range 로 내리기, 결과에 `admin_path` 싣기(R30 일부).
- 도구 설명 문구 바로잡기(예: `hw_plan_movement` 의 item_id 설명) — `tools/list` 를 그대로 두려고 이번에는 고치지 않았다.
