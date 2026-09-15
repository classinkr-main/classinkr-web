# 네오CRM 되밀기 지침 — 리드 등록 · 콜 · 데모/방문/메모

상태: 현재 기준 실행 지침
범위: `lib/external-crm/*`, `lib/crm/activity-record-writeback.ts`, `app/api/admin/crm/write-requests/*`
관련: [Admin 지침 맵](admin-guidance-map.md), [Admin OS 운영 결정](admin-os-operating-decisions-2026-07-11.md)

우리 어드민의 기록을 외부 네오CRM(销售易 / XiaoshouYi)에 밀어 넣을 때 지켜야 하는 것들을 모았다.
Compass(`mkt.classin.co.kr`, `classinkr-main/crm`)도 같은 CRM에 같은 계정으로 쓰기 때문에,
양쪽이 어긋나면 영업 화면에서 중복·유령 기록으로 나타난다. 그래서 이 문서는 우리 쪽 규칙이면서
동시에 Compass와 맞춰야 하는 계약이기도 하다.

---

## 0. 먼저 알아야 할 세 가지

**하나 — 실패가 성공으로 보인다.** 이 API는 비즈니스 오류를 HTTP 200에 담아 보낸다.

```json
{ "code": 5000047, "msg": "Field data type mismatch", "data": null }
```

응답 껍데기(`response.ok`)만 보고 성공으로 판정하면 실패가 조용히 성공으로 기록된다.
반드시 본문의 `code`를 확인한다 — `lib/external-crm/xiaoshouyi-request.ts`의 `assertXiaoshouyiOk()`가
그 판정을 한곳에서 한다. 새 호출 경로를 만들면 이 함수를 통과시켜라.

**둘 — 더 조용한 실패가 따로 있다.** `groupId`가 틀리면 **에러가 나지 않는다.** 생성은 성공하고,
기록은 남의 피드 그룹에 꽂혀 화면에서 사라진다. 그래서 우리는 `groupId`를 모르면 아예 만들지 않는다
(`missing_group`). 추측하지 마라.

**셋 — 샌드박스가 없다.** `eeocrm-personal`의 `.env.example`에 `sandbox`가 적혀 있지만 코드가 쓰지 않는다.
기본 base URL은 `api-tencent.xiaoshouyi.com`(프로덕션)이고 로그인 스크립트는 실제 테넌트를 하드코딩한다.
**쓰기 검증은 로컬 오프라인 하네스로만 한다.** §7 참고.

---

## 1. 지금 프로덕션 상태 (2026-09-07 실측)

| 항목 | 상태 |
| --- | --- |
| 일일 동기화 크론 | **6일째 무동작** — 09-02부터 매일 `skipped: Missing Xiaoshouyi base URL` |
| `external_crm_records` 최신 | **2026-08-28T05:20** (account/contact/opportunity 공통) |
| `CollectionPlan__c` (미수) | **0행** — `CRM 2040004: column not exist[amount__c]`로 매 실행 실패 |
| 되밀기 큐 | 코드·정책·API 있음, **호출자 없음** |

프로덕션 환경변수 `XIAOSHOUYI_BASE_URL`이 없어서 커넥터가 "미설정"으로 판단하고 HTTP 200을 돌려준다.
크론은 초록불인 채 아무 일도 하지 않는다. **되밀기를 켜기 전에 이것부터 복구해야 한다** — 읽기가 죽어 있으면
`external_crm_records`가 낡아서 대상 id 조회 자체가 틀린다.

`CollectionPlan__c`는 `crm_xiaoshouyi_query_catalog`의 필드 목록에서 `amount__c`를 실제 API 명으로
고치거나 빼면 된다. 코드 배포 없이 DB 한 줄이다.

---

## 2. 대상 객체와 필드 계약

### 2-1. 리드 등록 — `lead`

정책: `lib/external-crm/xiaoshouyi-write.ts`의 `XIAOSHOUYI_WRITE_POLICIES.lead`
(2026-08-28에 describe 337필드 + 생성 성공으로 실측 검증됨).

> **2026-09-14부터 이 큐로 lead를 생성하지 않는다.** `create` 는 `리드 생성은 Compass 단일 경로` 로
> 거절된다(수정·담당 이전은 열려 있다). NEO lead 작성자는 Compass 하나다 — 푸시 전 중복 검사가 Compass에만 있고,
> 이 큐로 만든 lead(특히 `mobile`)는 그 검사가 찾지 못한다. 아래 표는 Compass 푸시와 공유하는 필드 계약으로 남긴다.
> 경위: [compass-integration-2026-09-14.md](./compass-integration-2026-09-14.md) §3

| 필드 | 값 | 비고 |
| --- | --- | --- |
| `name` | 담당자명 | **필수** |
| `companyName` | 학원명 | **필수** |
| `entityType` | `3581900737888896` (해외) | **필수**, 리드에서는 *리드 분류*를 뜻한다 |
| `dimDepart` | `3632980020953825` (South Korea) | 안 주면 실행 계정의 부서가 박힌다 |
| `territoryHighSeaId` | `3583229517234829` | 한국 공해 풀 |
| `ownerId` | 담당자 id | 안 주면 실행 계정 소유가 된다 |
| `phone` | `0082-1012345678` | **국제 표기**. §5 참고 |

### 2-2. 콜 · 데모 · 방문 · 메모 — `activityrecord`

이 객체는 **추가만** 한다(`operations: new Set(["create"])`). 남이 적은 기록은 건드리지 않는다.

| 필드 | 값 | 타입 함정 |
| --- | --- | --- |
| `content` | 본문 한 줄 | 목록에서 한 줄로 보인다 — 줄바꿈은 접고 길면 자른다 |
| `startTime` | **ms 숫자** 타임스탬프 | **필수**. 문자열로 보내면 `5000047` |
| `entityType` | 아래 3종 중 하나 | 활동에서는 *활동 유형*을 뜻한다 — 리드의 `entityType`과 의미가 다르다 |
| `groupId` · `endTime` · `belongId` · `itemId` | 우리가 보내는 값들 | **describe 102필드에 없다** — §2-4. `groupId` 는 틀려도 에러가 안 난다(§3) |
| `dimDepart` | `3632980020953825` | 필수, 자동 주입 아님 |
| `belongId` | `1` | |
| `activityRecordFrom` | `11`=리드, `1`=고객 | 다형 참조 — 허용 목록에 `lead` 포함(§2-3) |
| `activityRecordFrom_data` | 대상 id **문자열** | `activityRecordFrom` 과 짝을 이루는 다형 참조의 값. 복합 필드(`activityRecordFrom_compound`)로 묶어 보내면 타입 불일치로 거절 |
| `dbcRelation26` | 고객 id — **리드면 넣지 않는다** | describe 상 `referObjectApiKey: "account"` 전용 |
| `ownerId` | 담당자 id | **필수**(describe). 비우면 자동 주입돼 실행 계정 소유가 된다 |

활동 유형 3종 (`XIAOSHOUYI_ACTIVITY_ENTITY_TYPE`):

- `11010011100001` 快速沟通 — 전화·문자·카톡·메일 등 **원격 접촉**
- `11010011100002` 线下拜访 — 한국팀 실사용은 **설치·배송·세팅 점검 등 현장 작업**이다
  (실제 content: "전자칠판 설치", "하드웨어 배송을 보조함", "설치후 세팅 점검")
- `3588972666094228` 公司参访 — 라벨은 "회사 방문". **한국팀 실사용은 방문 데모·영업 방문**이다
  (실제 content: "7/22 방문데모…", "리첸 방문하여 추가 설명 진행"). 라벨의 문자 뜻으로 방향을 단정하지 마라.

> **"데모"에 해당하는 전용 유형은 없다.** 데모는 방향에 따라 위 둘 중 하나로 접힌다.
> 우리 `crm_tasks`에는 방향 칼럼이 없으므로 **호출자가 정해야 하고, 모르면 만들지 않는다**(`unknown_kind`).

### 2-3. 리드에 활동을 붙이는 법

**2026-09-07 실측으로 확정됐다.** `activityRecordFrom` 은 다형 참조(`referObjectApiKey: "xobject"`)이고
`multiReferObjectApiKeys` 허용 목록에 **`lead` 가 들어 있다.** 값 쪽은 `activityRecordFrom_data` 다.

라이브 레코드 대조:

| 출처 | `activityRecordFrom` | `activityRecordFrom_data` | `dbcRelation26` |
| --- | --- | --- | --- |
| 리드 | `11` | 리드 id | **`null`** |
| 고객 | `1` | 고객 id | 같은 고객 id(중복 기재) |

즉 **`dbcRelation26` 은 고객 전용**이고 리드 출처 레코드에서는 전부 비어 있다.
리드에 붙일 때 여기에 리드 id 를 넣으면 고객 참조에 리드 id 가 들어간다 — 넣지 마라.

⚠️ 여전히 **실제 생성은 해 보지 않았다.** 위는 기존 레코드 조회로 확인한 것이고,
`fromLead: true` 로 만든 payload 가 실제로 통과하는지는 미확인이다.

### 2-4. describe 실측 (2026-09-07, 102필드)

**생성 필수**: `content`, `dimDepart`, `ownerId`, `startTime`, `entityType`
(`createdAt` 도 required 지만 `creatable: false` 라 시스템이 채운다).

→ **`ownerId` 는 선택이 아니라 필수다.** 비우면 자동 주입에 기대게 되는데, 그러면 실행 계정 소유가 된다.

⚠️ **`groupId` · `itemId` · `endTime` · `belongId` 는 102개 필드 목록에 없다.**
우리 payload 는 이 넷을 보내고 있고 코드 주석은 실측이라고 적혀 있다. 레코드 조회로는 보이는 값이
describe 에 없을 수 있으므로(피드/시스템 필드) 당장 빼지는 않았지만, **검증된 계약이 아니다.**
첫 실제 생성 때 이 넷을 넣은 경우와 뺀 경우를 각각 시험해 확정할 것.

---

## 3. `groupId` — 가장 위험한 필드

`groupId`는 활동 유형별 상수가 **아니다**. 대상 레코드마다 다른 피드 그룹 id다.
SOQL로는 안 나오고, 단건 조회로만 나온다.

```ts
import { fetchXiaoshouyiGroupId, getXiaoshouyiConfig, getAccessToken } from "@/lib/external-crm/xiaoshouyi-request"

const config = getXiaoshouyiConfig()
const token = config ? await getAccessToken(config) : null
const groupId = config && token
  ? await fetchXiaoshouyiGroupId({ config, token, objectApiKey: "account", recordId: externalAccountId })
  : null
```

`null`이 돌아오면 **활동을 만들지 마라.** 빌더가 `missing_group`으로 막아 주지만, 호출자가
빈 문자열 같은 걸 억지로 채워 넣으면 막을 방법이 없다.

---

## 4. 순서 — 한 번에 밀 수 없다

의존 관계는 셋이다.

1. **리드/고객이 네오CRM에 먼저 있어야 한다.** 활동은 대상 id 없이 못 붙는다.
2. **한 리드 안에서는 시간순.**
3. **데모·미팅은 리드 상태 변경과 함께.** 상태를 안 밀면 "연락만 한 리드"가 데모 기록을 달고 있게 된다.

그런데 **`crm_write_requests`에는 의존성 칼럼이 없다.** `depends_on`도 `parent_request_id`도 없고,
리드 생성이 성공해도 새 id는 그 행의 `response_payload`에만 남을 뿐 다른 요청의 payload로 전파되지 않는다.

따라서 현재 유일하게 옳은 절차는 **순차 실행**이다.

```
① 리드 생성 요청 draft → 승인 → 실행
② 성공 응답의 response_payload 에서 새 리드 id 를 읽는다
③ confirmLeadNeoLink(leadId, neoId) 로 crm_source_links 에 기록
④ 그 id 로 fetchXiaoshouyiGroupId 를 호출해 groupId 확보
⑤ 그제야 활동 요청 draft 를 만들고 → 승인 → 실행
```

②~⑤를 자동으로 잇는 코드는 아직 없다. 넣는다면 큐에 의존성을 다는 것이 정공법이고,
그 전까지는 **리드 배치와 활동 배치를 다른 실행으로 분리**해라.

한 가지 더: 활동은 등록보다 **먼저 생기는 게 일상**이다(당일 전화, 등록은 나중).
그러므로 되밀기는 일회성 작업이 아니라 **큐**여야 하고, 커서는 `created_at`이 아니라 `id`여야 한다 —
기록 시각은 과거로 지정할 수 있어서 `created_at` 커서는 건너뛴다.

---

## 5. 담당자 지정과 전화번호

### 담당자

`ownerId`는 **지정된다.** 외부 CRM 클라이언트가 `if (!data.ownerId) data.ownerId = <로그인 계정>`으로
채우기 때문에, 명시하면 명시값이 이긴다.

⚠️ 다만 **`ownerId`는 describe 상 필수 필드다**(§2-4). "안 주면 실행 계정" 은 자동 주입에 기대는 것이지
선택이라는 뜻이 아니다. 되밀기에서는 **항상 명시해라** — 안 그러면 전부 실행 계정 소유로 쌓인다.

**작성자(`createdBy`)는 못 바꾼다.** impersonate/runAs 기능이 없다. 즉 네오CRM에서는
"실행 계정이 만든, 담당자가 다른 사람인 기록"으로 보인다. 감사 관점에서 이건 의도된 모델이다.

⚠️ **`dimDepart`도 같은 방식으로 자동 주입된다.** 사람별로 명시하지 않으면 조작자의 부서가 박힌다.
담당자를 바꿔 넣을 때는 부서도 함께 넣어라.

⚠️ **우리 어드민 계정 → 네오CRM `ownerId` 매핑이 아직 없다.** `lib/external-crm/owner-names.ts`는
반대 방향(id → 표시명)만 한다. `externalOwnerId`를 누가 채울지 정하는 것이 되밀기를 켜기 전 숙제다.

### 전화번호

네오CRM 저장 형식은 `82-1012345678`, XLSX 업로드 양식은 `0082-…`, 우리 화면은 `010-1234-5678`이다.
**우리에게는 로컬 → 국제 변환 함수가 없다.** `lib/crm/phone.ts`는 들어오는 방향만 정규화한다.

`leads.phone`을 그대로 밀면 기존 네오CRM 레코드와 표기가 어긋나 영업이 번호로 검색해도 못 찾는다.
그리고 국가번호 이중 계산이 실제로 발생한 적이 있다 — Compass에서 `+82 10 9999 0010`이
`82-821099990010`으로 나가 중복 리드를 만들었고, 오프라인 하네스가 그걸 잡았다.
**변환을 새로 쓸 때는 숫자만 남긴 뒤 `0082`/`82` 접두를 `0`으로 되돌리고 시작해라**(국내 번호는 항상 `0`으로 시작한다).

---

## 6. 권한

| 행위 | 허용 역할 | 이유 |
| --- | --- | --- |
| 큐 조회 (`GET`) | `CRM_STAFF_ADMIN_API_ROLES` | 외부로 나갈 대기열은 고객 정보다 — VIEWER는 뺀다 |
| 초안 작성 (`POST`) | `CRM_STAFF_ADMIN_API_ROLES` | 실무자(EDITOR 8명 포함)가 쌓을 수 있어야 한다 |
| 승인 (`PATCH approve`) | `STAFF_ADMIN_API_ROLES` | 바깥으로 나가는 것을 허가하는 행위 |
| 실행 (`POST execute`) | `STAFF_ADMIN_API_ROLES` | 남의 CRM에 실제로 쓰는 유일한 지점, 되돌릴 수 없다 |

**쌓는 것과 보내는 것을 갈랐다.** 예전에는 인자를 비워 메서드 기본값에 맡겼는데, 그러면
`GET`이 VIEWER까지 열리고 의도가 코드에 남지 않았다.

---

## 7. 테스트 — 로컬에서만

### 우리 쪽 `dryRun`

```
POST /api/admin/crm/write-requests   { objectApiKey, operation, payload, dryRun: true }
```

`buildCrmWritePreview`만 돌려 **실제로 나갈 요청의 형태**(`method`/`urlPath`/`body`)를 돌려준다.
Supabase에 흔적을 남기지 않고, CRM을 호출하지 않고, 환경변수가 설정됐는지조차 보지 않는다.

검증하는 것: 객체 허용 여부, 필드 허용 목록, 필수 생성 필드, 스칼라/배열 형태.
**검증하지 않는 것: 라이브 현실 전부.** 필드가 실제로 존재하는지, 피크리스트 값이 맞는지,
대상 id가 실재하는지는 하나도 보지 않는다.

### Compass 오프라인 하네스

같은 CRM을 상대하는 유일한 종단 검증 수단이다. 로컬 Postgres 16 + 가짜 MCP 서버 + 인메모리 가짜 네오CRM으로
프로덕션 스크립트를 **수정 없이** 돌린다.

```bash
EEOCRM_DIR=/path/to/eeocrm-personal bash scripts/neocrm-test/run.sh
```

프로덕션에 닿지 않는 것이 설계로 보장돼 있다 — `DATABASE_URL`을 물려받지 않고 스크래치 값을 주입하며,
목은 `127.0.0.1`에만 바인드하고, `curl`은 `--noproxy '*'`를 쓴다. 전제조건은 `eeocrm-personal` 클론 +
`npm install`, 그리고 로컬 Postgres 16 바이너리다.

한계: **리드 푸시 전용이고 활동은 다루지 않는다.** 그리고 필드맵을 그대로 믿는다 —
목의 `crm_describe_fields`는 "실물 스키마가 아니라 그럴듯한 최소치"이고, 생성 시 필드 이름이나
피크리스트 값을 그 메타데이터와 대조하지 않는다.

### 로컬 테스트를 다 통과해도 남는 것

필드명 변경, 피크리스트 값 변경, 테넌트 측 검증 규칙, 실행 중 토큰 만료(2시간),
레이트리밋, 그리고 **생성 성공 후 마킹 실패**(네오CRM에 고아 레코드가 남고 우리 쪽에 흔적이 없다).
이것들은 프로덕션에서만 드러난다.

---

## 8. 되밀기를 켜기 전 확인 절차

전부 **읽기 전용**이다. 로컬 MCP 서버(`eeocrm-personal`)가 필요하고, 로그인은 사람이 해야 한다
(브라우저 OAuth, 토큰 2시간, 자격증명이 `hostname + OS 사용자명`에 묶여 있어 다른 기계로 복사되지 않는다).

1. ~~`crm_describe_fields({ objectApiKey: "activityrecord" })`~~ — **완료(2026-09-07).**
   리드 전용 참조 필드는 없고 `activityRecordFrom` 이 다형 참조로 `lead` 를 받는다. §2-3 참고.
2. ~~`activityRecordFrom = 11` 레코드 대조~~ — **완료.** `activityRecordFrom_data` 에 리드 id,
   `dbcRelation26` 은 null. entityType 라벨도 `crm_entity_type_map` 으로 확정했다.
3. **남음 —** 리드 1건을 단건 조회해 `groupId` 가 리드에도 있는지 확인한다.
   없으면 리드 대상 활동에 `groupId` 를 못 채운다.
4. **남음 —** 테스트 리드 1건으로 활동 1건 생성. `groupId`·`endTime`·`belongId`·`itemId` 를
   넣은 경우와 뺀 경우를 각각 시험해 §2-4 를 확정한다. **프로덕션 리드로 시험하지 마라.**

실행 환경(2026-09-07 실측): MCP 서버는 로컬 **3010** 포트에 뜬다(스크립트 기본값 3001 아님).
`MCP_URL=http://localhost:3010/sse`, `EEOCRM_DIR=~/Desktop/Projects/eeocrm-personal` 로 넘겨야 붙는다.
로그인 계정이 곧 작성자가 되므로, 누구 계정으로 로그인했는지 확인하고 시작할 것.

---

## 9. 아직 없는 것

- 큐의 의존성/순서 (`depends_on`) — 지금은 사람이 순차 실행해야 한다
- 어드민 계정 → 네오CRM `ownerId` 매핑
- 로컬 → 국제 전화번호 변환
- 리드 생성 UI (정책은 있으나 이 요청을 만드는 버튼이 없다)
- 활동용 오프라인 하네스 (Compass 것은 리드 전용)
- `executeCrmWriteRequest`·상태머신·실제 HTTP 계층의 테스트 (현재 순수 함수만 커버)
