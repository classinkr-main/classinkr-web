# REV 시트 쓰기 런북 (장부 반영 → '2. REV')

상태: 현재 기준 운영 문서
범위: 매출 장부(`/admin/branch/ledger`) 반영 때 '2. REV' 주차 칸에 쓰는 기능의 켜기·끄기, 행 ID 관리, 결과 코드 대응, 감사 조회
결정 정본: [ADR-011](../adr/ADR-011-rev-sheet-writeback-from-ledger.md)

## 0. 한눈에

- **기본은 꺼짐이다.** 켜지는 조건은 Production 배포에서 env `BRANCH_REV_SHEET_WRITE_ENABLED`가 글자 그대로 `1`일 때뿐이다.
  `VERCEL_ENV`가 `production`이 아니면 어떤 값을 넣어도 꺼져 있다. Preview·로컬에서는 시트에 쓰지 않는다.
- 꺼져 있으면 반영은 지금과 똑같이 장부(DB)에만 남는다. 결과 코드는 `disabled`다.
- 켜지면 기존 행(edit-row) 반영이 그 달 주차 칸(w1~w5)의 금액·확도 글자색도 쓴다. 새 행(new-row)은 여전히 장부에만 남는다.
  지난 주차 금액(이번 달 지난 주의 확도 색만 예외)·지난 달 이전 칸·칸 비우기·달 삭제·수식 칸은 쓰지 않는다. 시트에서 직접 고친다.
- 시트에 쓰는 런타임 경로는 [sheets-client.ts](../../lib/branch/sheet-writeback/sheets-client.ts) 하나다.
  반영 진입점은 [apply-service.ts](../../lib/branch/sheet-writeback/apply-service.ts) 하나다.
- 모든 시도는 `public.branch_sales_ledger_sheet_writes`에 한 행씩 남는다(§4). 이 표는 지우지 않는다.

## 1. 켜기 순서

순서를 바꾸지 않는다. 시트에 쓰는 단계(5·6·9)는 사람이 결과를 확인하고 진행한다.

1. **마이그레이션 적용** — 서울 프로젝트에
   [20261023_branch_rev_sheet_writes.sql](../../supabase/migrations/20261023_branch_rev_sheet_writes.sql)을 적용한다
   ([DB 마이그레이션 런북](db-migration-runbook.md)). 재실행해도 무해하다.
2. **`npm run check:db -- --strict`** — `branch_sales_ledger_sheet_writes`·`apply_branch_sales_ledger_draft_if_unchanged()` 프로브가 ok여야 한다. 두 프로브는 warning 등급이다.
   그래서 `--strict` 없이 돌리면 미적용이어도 exit 0이 나온다.
3. **배포(꺼진 채)** — 코드를 Production에 올린다. env를 넣지 않았으므로 반영은 지금과 같다.
   이때 바뀌는 것은 REV 동기화가 `A1:CZ1000`까지 읽는다는 점이다. 동기화 경고에
   "Row ID 열 없음 — 시트 쓰기 불가(행 ID 스크립트 필요)"가 붙는다. 5·6단계 전에는 정상이다.
4. **시트 정리(사람)** — 아래 두 가지를 팀과 확인한다. 고치지 않아도 그 행·칸은 쓰기가 거절될 뿐이다. 잘못 쓰이지는 않는다.
   - 월 합계 수식 19행: 다른 칸을 더한다(예: 9월 한 행이 AW 대신 AZ, 6월 한 행이 AA를 두 번).
     그 달 반영은 `month_formula_irregular`로 거절된다.
   - 주차 칸 상수 산식 9칸(`=a*b` 등): 그 칸 반영은 `formula_cell`로 거절된다.
5. **행 ID 스크립트 미리보기** — `npm run rev:row-ids`. 시트에 쓰지 않는다. `.env.local`에 서비스계정과
   `GOOGLE_BRANCH_DASHBOARD_SHEET_ID`가 있어야 한다. 출력에서 다음을 확인한다.
   - 대상: spreadsheetId·파일 이름·탭 `'2. REV'`·gid `957802439`, 서비스계정 이메일, 행×열(지금은 450행 × 84열).
   - env: "GOOGLE_BRANCH_DASHBOARD_SHEET_ID = 허용 목록 id".
   - 머리: "Row ID 열 없음 → CG 새로 붙임"(처음) 또는 "있음(CG) → 다시 씀"(재실행).
   - 행: 고객 행 수, ID 있음·없음(새로 부여)·형식 오류·중복.
   - 기본 필터: `A2:CF450 → A2:CG450`. filterSpecs·sortSpecs 개수와 조건 JSON이 지금 조건(10월 열 '¥ 0' 숨김 등)과 같아야 한다.
   - 필터 뷰: 범위만 `…CF → …CG`.
   - 요청 목록과 요청 요약(JSON).
   - "막음:" 줄이 하나라도 있으면 exit 1이다. §5를 보고 정리한 뒤 다시 미리보기를 돌린다.
6. **`npm run rev:row-ids -- --apply`** — 미리보기를 사람이 확인한 뒤에만 돌린다. 하는 일은 이렇다.
   - 대상이 허용 목록 id와 env 둘 다와 같은지 다시 확인한다.
   - 요청 허용 목록을 검사한다.
   - batchUpdate를 한 번(원자적) 보낸다. 내용은 열 붙이기, CG2 "Row ID", CG 숨김, 빈 칸에만 행 ID, 기본 필터(조건 복사), 필터 뷰 범위다.
   - 다시 읽어 사후 검증한다.
   - "사후 검증 통과"가 나와야 한다. exit 1이면 §5.
7. **동기화 한 번** — KR Team 화면의 동기화 버튼을 누르거나 `POST /api/admin/branch/sync` `{"sources":["rev"]}`를 부른다.
   응답 `warnings`에 Row ID 경고("Row ID 열 없음…", "Row ID 없음 N · 중복 N · 형식 오류 N")가 없어야 한다.
8. **env 넣기** — Vercel Production 범위에만 `BRANCH_REV_SHEET_WRITE_ENABLED=1`을 넣는다.
   Preview·Development 체크는 끈다. 값은 정확히 `1`이다(`true`·` 1`은 꺼짐).
9. **재배포** — env는 배포에 묶인다. Production을 다시 배포해야 켜진다.
10. **1건 시험 반영** — 이번 주차 이후의 칸 하나를 장부에서 고쳐 반영한다. 값이 하나뿐인 달이나 빈 달의 기존 행이 좋다.
    화면 상단에 "반영하면 '2. REV' 시트에도 씁니다 · 지난 주차 금액은 시트에서 직접(이번 달 지난 주는 확도만)"이 보이면 켜진 것이다.
11. **확인 항목**(§6)을 전부 본다. 하나라도 어긋나면 §2로 끈다.

## 2. 끄기

- Vercel Production env에서 `BRANCH_REV_SHEET_WRITE_ENABLED`를 지우고 다시 배포한다. 그 뒤 반영은 장부에만 남는다(`disabled`).
- 이미 시트에 쓴 값은 그대로 남는다. 자동으로 되돌리지 않는다. 되돌릴 칸은 감사 행의 `cells`(칸 주소·쓰기 전·쓴 뒤 값과 색)를 보고
  사람이 시트에서 고친다.
- 감사 표·Row ID 열은 그대로 둔다. 다시 켤 때 그대로 쓴다.

## 3. 결과 코드와 대응

반영 응답의 `sheet.code`와 감사 행 `code`는 같은 닫힌 목록이다
([messages.ts](../../lib/branch/sheet-writeback/messages.ts)). 화면 문구도 그 파일에서 온다.

| 코드 | 뜻 | 할 일 |
| --- | --- | --- |
| `written` | 시트에 쓰고 확인했고 장부에도 반영됨 | 없음 |
| `already_written` | 시트가 이미 그 값이라 장부만 기록 | 없음. 결과 모름 뒤 다시 누른 경우가 대부분이다 |
| `no_change` | 시트에서 바뀌는 칸이 없어 장부만 기록(금액·색이 이미 그대로, 확도를 직접 고르지 않음) | 없음. 시트에 쓴 것이 없으므로 장부 되돌리기도 막지 않는다 |
| `disabled` | 스위치 꺼짐 — 장부에만 | 없음 |
| `new_row_app_only` | 새 행 — 장부에만 | 시트에 새 행이 필요하면 사람이 친다 |
| `conflict` | 초안을 만든 뒤 시트 그 달 주차 칸이 바뀜(방금 시트에 쓴 행·달을 동기화 전에 다시 고친 경우 포함) | 새로고침 뒤 다시 입력. 방금 반영한 행이면 REV 동기화를 한 번 돌린 뒤 다시 입력 |
| `past_week` | 이번 주차보다 앞 주차 | 시트에서 직접 |
| `week_ambiguous` | 값 있는 주차가 여럿인 달의 금액 변경 | 주차별로 고치거나 시트에서 직접 |
| `clear_not_supported` | 칸 비우기·달 삭제, 또는 주차 칸을 가리킨 초안이 값 있는 다른 주차 칸의 금액을 옮기려 함(금액이 그 달 합계와 같아도) | 시트에서 직접 |
| `amount_invalid` | 정수 금액이 아님(0 이하 포함) | 금액 확인 |
| `formula_cell` | 대상 주차 칸에 수식(상수 산식 포함) | 시트에서 직접 |
| `month_formula_irregular` | 그 달 합계 수식이 다른 칸을 더함 | 시트 수식부터 고친다(§1-4) |
| `month_not_in_sheet` | 그 달 블록이 시트 머리에 없음 | 시트에서 직접 |
| `no_baseline` | 예전 방식으로 만든 초안 | 칸을 다시 입력 |
| `no_row_id` | 그 행에 Row ID 없음 | 행 ID 스크립트 다시(§5) |
| `row_not_found` | 시트에 그 Row ID 행이 없음 | 새로고침. 계속되면 §5 |
| `row_id_duplicate` | 같은 Row ID가 여러 행 | §5 중복 정리 |
| `identity_changed` | 그 행 A열 고객이 초안과 다름 | 새로고침. 정렬로 ID가 떨어졌으면 §5 |
| `layout_changed` | 2행 머리 구조가 바뀜 | 관리자 확인 — 머리를 되돌리기 전까지 쓰기 전부 거절 |
| `not_allowed` | 대상(id·탭·gid·env)이나 요청이 허용 목록 밖 | `GOOGLE_BRANCH_DASHBOARD_SHEET_ID` 확인. 시트는 그대로다 |
| `sheet_permission` | 401·403 | 서비스계정 공유 확인. 시트는 그대로다 |
| `sheet_error` | 그 밖 4xx 또는 다시 읽기 실패 | 시트는 그대로다. 잠시 뒤 다시 |
| `outcome_unknown` | 5xx·8초 마감·되읽기 없음 — 썼는지 모름(202) | **다시 보내지 않았다.** 잠시 뒤 다시 반영을 누르면 다시 읽어 판정한다(이미 쓰였으면 `already_written`) |
| `row_shifted` | 쓰는 사이 행이 움직임 — 그 자리 행의 원래 값·색으로 되돌림(`error` = `restored`) | 감사 행 `cells`로 그 자리 칸이 원래대로인지 확인 |
| `row_shifted_unrestored` | 쓰는 사이 행·열이 움직였는데 **되돌리지 못함** — 남의 칸에 쓴 값이 남아 있다. `error`: `restore_not_found`(옮겨 온 행에 Row ID 없음·원래 칸이 수식·글자), `restore_failed: …`(되돌리기 호출 실패), `layout_changed`(열이 끼거나 빠짐 — 되돌리기를 시도하지 않음) | 감사 행 `cells`(a1·before·after)로 그 칸을 시트에서 사람이 원래 값·색으로 고친다. 열이 바뀐 경우 `a1`은 쓰기 전 열 기준이다 |
| `verify_mismatch` | 되읽은 값·색·월 합계가 기대와 다름 — 장부 반영 안 함 | 시트 칸을 직접 본다. 값이 맞으면 다시 반영 → `already_written`. 다르면 시트에서 고친다 |
| `db_apply_failed` | 시트에는 썼는데 장부 기록 실패 | 다시 반영을 누른다 → `already_written`으로 마무리 |
| `active_correction` | 같은 딜·월에 이미 활성 정정 항목이 있다 — 장부 유일성(딜·월당 활성 정정 1건)에 걸릴 것이 확실해 **시트에 쓰기 전에** 멈춤 | 새로고침 뒤 다시 입력한다(동기화가 돌면 행이 새 딜 id 로 바뀐다). 기존 항목이 시트에 쓰지 않은 정정이면 큐에서 먼저 되돌린 뒤 다시 반영 |
| `draft_changed` | 시트에 쓰는 사이 같은 초안이 고쳐짐 — 시트에는 고치기 전 초안 값이 들어갔고 장부에는 적지 않음 | 새로고침해 시트 칸을 본다. 고친 값이 맞으면 다시 반영(시트가 바뀌었으면 `conflict` — 다시 입력) |
| `not_applied` | 시트에 손대기 전에 멈춤(체크 완료 아님·감사 기록 실패·50건 초과 등) | 문구대로. 시트는 그대로다 |

시트에 반영된 초안은 앱에서 되돌리지 않는다(409). 시트에서 직접 되돌리거나 원래 값으로 다시 입력한다(`no_change`는 예외 — 시트에
쓴 것이 없다). 반영을 한 번이라도 시도한 초안(감사 행 있음 — 거절·실패 포함)은 감사 기록을 지키려고 삭제할 수 없다(409).
큐에서 취소로 정리한다.

값 있는 칸의 글자색은 사용자가 그 칸(주차 단위면 그 주차)의 확도를 직접 바꿨을 때만 쓴다. 화면이 채운 기본 확도(매트릭스 팝오버의
그 달 우세 확도, 레일의 행 확도 시드, 콕핏 리스트 톤)는 시트 글자색과 다를 수 있어 고른 것으로 보지 않는다. 빈 칸에 새로 쓰는
값은 늘 그 확도 색으로 쓴다(숨은 색을 덮는다).

## 4. 감사 조회 SQL

전부 읽기 전용이다. 서울 프로젝트 SQL Editor에서 돌린다. 표는 RLS 정책이 없어 service role로만 읽힌다.

```sql
-- 최근 시도
select created_at, status, code, ledger_month, sheet_row, row_id, actor, error, written_at, entry_id
from public.branch_sales_ledger_sheet_writes
order by created_at desc
limit 50;

-- 최근 7일 상태·코드 분포
select status, code, count(*) as n
from public.branch_sales_ledger_sheet_writes
where created_at > now() - interval '7 days'
group by status, code
order by n desc;

-- 결과를 모르거나 보내는 중에 멈춘 시도(cells 의 a1·before·after 로 시트 칸을 직접 본다)
select id, draft_id, created_at, status, code, row_id, ledger_month, cells, error
from public.branch_sales_ledger_sheet_writes
where status in ('sending', 'unknown')
order by created_at desc;

-- 시트에는 썼는데 장부 기록이 실패한 것(초안이 바뀐 draft_changed 포함)
select id, draft_id, written_at, code, row_id, ledger_month, error
from public.branch_sales_ledger_sheet_writes
where status = 'written' and code in ('db_apply_failed', 'draft_changed')
order by written_at desc;

-- 행·열이 움직였는데 되돌리지 못한 것 — cells 의 a1·before 로 사람이 시트 칸을 고친다
select id, draft_id, created_at, row_id, ledger_month, cells, error
from public.branch_sales_ledger_sheet_writes
where code = 'row_shifted_unrestored'
order by created_at desc;

-- 한 초안의 시도 이력
select created_at, batch_id, status, code, sheet_row, row_id, cells, error, written_at, entry_id
from public.branch_sales_ledger_sheet_writes
where draft_id = '<초안 id>'
order by created_at desc;
```

- `sending`이 오래 남아 있으면 감사 행을 남긴 뒤 함수가 끝까지 못 간 것이다. `unknown`처럼 다룬다.
  `cells`의 칸을 시트에서 보고, 그 초안을 다시 반영하면 다시 읽어 판정한다.
  - 장부 항목이 이미 있는 `sending`(장부 반영 뒤 감사 행 갱신만 실패)은 화면에 "확인 중"으로 남고 되돌리기도 막힌다.
    앱에는 이 행을 written으로 고치는 경로가 없다. 시트 칸과 장부 항목(`entry_id` 대신 `draft_id`로 찾는다)을 사람이 맞춰 본다.
    이 행은 매출시트 미반영 배지에서 빠지지 않는다(과대집계 쪽).
- 런타임 로그는 `[branch/sheet-writeback/apply]` 라벨로 찾는다.

## 5. 행 ID 관리

Row ID는 '2. REV' 맨 오른쪽 숨김 열(CG, 머리 "Row ID")의 `r_` + 12자다. 시트 쓰기가 행을 찾는 유일한 열쇠다.
ID는 행 번호와 무관해서 정렬해도 행과 같이 움직인다. 단 정렬 범위에 CG가 들어 있어야 한다.

| 증상(동기화 경고·스크립트 "막음:") | 원인 | 정리 |
| --- | --- | --- |
| "Row ID 열 없음 — 시트 쓰기 불가(행 ID 스크립트 필요)" | 스크립트 전이거나 열이 지워짐 | §1-5·6 |
| "Row ID 없음 N" | 새로 끼운 행 | 미리보기 → `--apply`(빈 칸에만 채운다) |
| "Row ID 중복 N", 스크립트 "같은 Row ID 가 여러 행에 있습니다" | 행을 통째로 복사해 붙임 | 미리보기가 행 번호를 보여 준다. CG를 잠시 펼쳐 **복사로 생긴 쪽** 칸을 비우고 다시 돌린다 |
| "Row ID 형식 오류 N" | 누가 CG에 다른 글자를 침 | 그 칸을 비우고 다시 돌린다 |
| "Row ID 열이 여럿 — 시트 쓰기 불가(관리자 확인 필요)" | "Row ID" 머리가 둘 이상 | 여분 머리를 지운다(쓰기는 그동안 `layout_changed`) |
| 스크립트 "env … 다릅니다" | `.env.local`의 `GOOGLE_BRANCH_DASHBOARD_SHEET_ID`가 허용 목록 id가 아님 | env를 고친다. 스크립트는 다른 시트에 쓰지 않는다 |
| 스크립트 "열이 N개입니다(84개일 때만…)" | Row ID 머리 없이 시트 오른쪽에 열이 늘어남 | 사람이 오른쪽 열을 확인한다. 스크립트는 열 위치를 짐작하지 않는다 |
| 스크립트 "기본 필터 … 바로 앞에서 끝나지 않습니다" | 기본 필터가 마지막 열까지 덮지 않음 | 필터 범위를 사람이 확인한다 |
| 스크립트 "기본 필터에 정렬(sortSpecs N개)이 있습니다" | 기본 필터에 정렬 표시가 남아 있음 | 필터를 다시 걸면 그 정렬로 행이 다시 정렬될 수 있다. 팀과 확인한 뒤에만 `--keep-sort`를 붙인다. 행 ID를 필터보다 먼저 쓰므로 ID는 행과 같이 움직인다 |
| 스크립트 "행이 N개입니다 — 앱 읽기 범위(1000행)…" | 시트가 1000행을 넘음 | 앱·동기화 읽기 범위(`A1:CZ1000`)부터 넓혀야 한다(코드 변경) |
| 스크립트 사후 검증 실패 | batchUpdate 뒤 다시 읽은 시트가 기대와 다름(그 사이 정렬·편집 등) | 출력된 항목을 시트에서 확인하고 미리보기를 다시 돌린다. 실행 중에는 시트를 정렬하지 않는다 |

동기화 경고는 위 세 가지(열 없음·열 여럿·"Row ID 없음 N · 중복 N · 형식 오류 N", 0인 항목은 빠짐)다.
범위 상한 경고와 같이 나오면 " / "로 이어지고 상한 경고가 앞에 온다. 실패가 아니라 경고다.

중복은 3행부터 **고객명이 빈 행까지** 센다(앱 쓰기의 행 찾기와 같은 범위). 고객명을 지운 행에 ID를 남겨 두거나 그 칸을
다른 행에 복사하면 살아 있는 행이 `duplicate`가 된다. 고객 행을 지울 때는 CG 칸도 같이 비운다.

하지 말 것:

- CG 열을 지우거나, A~CF만 골라 정렬(데이터 → 범위 정렬)하지 않는다. ID가 행에서 떨어진다.
  떨어지면 쓰기가 `identity_changed`·`row_not_found`로 거절되고 잘못 쓰이지는 않는다.
  다만 그 행들의 ID를 다시 맞춰야 한다. 정리 순서는 이렇다.
  1. 어긋난 칸을 비운다.
  2. 스크립트를 다시 돌린다.
  3. 그 행의 예전 초안은 다시 입력한다.
- ID를 되살리려고 시트 버전 기록을 통째로 복원하지 않는다. 그 사이 다른 사람이 친 값까지 되돌아간다.
- 새 필터 뷰를 만들 때는 범위에 CG를 넣는다.

## 6. 첫 시험 반영 확인 항목

| 확인 | 기대 |
| --- | --- |
| 반영 응답 | `sheet.code = written`, 화면 결과 줄 "1건 시트에 반영" |
| 시트 칸 | 그 주차 칸에 금액, 글자색이 확도(확정 빨강·고확도 파랑·예정 검정) |
| 월 합계 칸 | 그 달 합계가 새 주차 합으로 다시 계산됨 |
| 감사 행 | `status = written`, `code = written`, `written_at`·`entry_id` 채워짐, `cells`에 before/after |
| 다음 REV 동기화 뒤 | 장부 화면에서 그 금액이 두 번 더해지지 않음(오버레이가 미러 값으로 넘어감), 미반영 배너에서 빠짐 |
| Compass 다음 매시 동기화 | 그 칸만 바뀐 값으로 들어옴(빨강이면 결제) |

아래 두 가정은 원본 시트에 쓰지 않는 원칙 때문에 사전 실측하지 않았다. 시험 반영에서 이렇게 드러난다.

- 그리드보다 넓은 읽기 범위(`'2. REV'!A1:CZ1000`)를 API가 잘라 주지 않으면 다시 읽기가 실패한다. 결과는 `sheet_error`(502)이고
  시트는 그대로다. 끄고 읽기 범위를 고친다.
- batchUpdate 응답의 월 합계가 재계산 전 값이면 `verify_mismatch`가 된다. 그러면 시트에는 값이 쓰여 있고 장부는 반영되지 않는다.
  시트 칸이 맞으면 다시 반영해 `already_written`으로 마무리한다. 매번 이렇게 되면 끄고 확인 로직을 고친다.

## 7. 평소 점검

- 장부 GET 응답의 `sheetWrite.health.ok`가 false면(화면 상단 한 줄) 감사 표나 마지막 동기화 시각 조회가 실패한 것이다.
  장부 화면은 그대로 뜨지만 배지·이중 집계 제외가 비어 있을 수 있다. 서버 로그를 본다.
- 매출시트 화면(`/admin/crm/deals/rev-sheet`)의 미반영 배지는 시트에 쓴 정정을 **다음 REV 동기화 뒤에** 뺀다.
  쓴 직후부터 동기화 전까지는 미반영으로 센다(정상).
- 이중 집계 제외의 기준 시각은 마지막 성공 REV 동기화 시작과 그 화면이 가진 시트 행의 데이터 시각(미러 `synced_at`·액티브 임포트
  캡처 시각) 중 이른 쪽이다. 다른 화면이 동기화했거나 재캡처가 실패해 화면 행이 옛것이면 정정 오버레이를 그대로 둔다 — 새로고침하면
  넘어간다.
- §4의 7일 분포를 본다. `conflict`·`unknown`·`failed`가 늘면 원인을 코드표(§3)로 가른다.
- 동기화 경고의 Row ID 줄이 0이 아니면 §5를 처리한다.
- 반영 라우트는 `maxDuration` 60초다. 시트 호출은 각각 8초 마감이고, 읽기 + 쓰기(+ 되돌리기) + DB가 그 안에 든다.
