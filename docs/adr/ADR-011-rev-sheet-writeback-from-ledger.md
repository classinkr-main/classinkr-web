# ADR-011: 매출 장부 반영 때 '2. REV' 주차 칸에도 쓴다

Status: accepted

Date: 2026-10-23

대체: [CRM 시트 매출 싱크 계획](../active/crm-sheet-revenue-sync-plan.md)의 "시트 ↔ 앱 양방향 쓰기 — 비권장(현 단계)"(§2 표)와
"시트 역방향 쓰기(앱 → 시트)는 … 도입하지 않음"(Phase 3). 이 ADR이 정한 범위(장부 반영 때 기존 행의 주차 칸 금액·글자색)에서만
대체한다. 그 밖의 앱 → 시트 쓰기는 여전히 하지 않는다.

## 1. Context

- '2. REV'는 KR 팀이 매일 금액을 치는 원장 탭이다. Home은 이 탭을 단방향으로 읽어 `branch_rev_deals`를 통째로
  갈아 끼운다(동기화). Compass(mkt.classin.co.kr)도 같은 탭을 매시 읽는다.
- [ADR-008](ADR-008-korea-sales-ledger-operating-record.md)에 따라 장부(`/admin/branch/ledger`)의 입력은 초안 큐를 거치고,
  체크된 초안을 반영하면 append-only 장부 항목(`branch_sales_ledger_entries`)이 생긴다. 반영해도 시트는 그대로라
  팀은 같은 값을 시트에 다시 쳐야 했고, 화면은 초안 오버레이로 두 값을 맞춰 보였다.
- 예전 문서가 역방향 쓰기를 막은 이유는 "full-replace 싱크와 충돌"이었다. 쓰기 대상을 아래처럼 좁히면 그 충돌은
  생기지 않는다. 앱은 시트에 쓴 뒤 다음 동기화가 그 값을 다시 읽고, 충돌하면 시트가 이긴다.
- 시트 실측(2026-10-21, 읽기 전용):
  - 2행 머리: A Account … M Sum, N부터 월 블록 12개(월 합계 칸 + 주차 칸 w1~w5, 2월은 w1~w4, 7월 다섯째는 머리 "5w"). 84열(A~CF), 3~450행.
  - 사람이 금액을 치는 칸은 주차 칸뿐이다. 월 합계 칸은 그 달 주차 칸을 더하는 수식이고 M·1행도 수식이다.
    월 합계 수식 19행은 다른 칸을 더하고(예: 9월 한 행이 AW 대신 AZ), 주차 칸 9개에 상수 산식(`=a*b`)이 있다.
  - 확도는 주차 칸 글자색이다. 빨강 = 확정(시작일이 미래면 예정 — Compass ADR-0062와 같은 규칙), 파랑 = 고확도, 검정·없음 = 예정.
    빈 주차 칸에도 빨강 418칸·파랑 673칸의 글자색이 숨어 있다.
  - 정렬·행 삽입으로 행 번호가 바뀐다. 행 번호로는 같은 행을 다시 찾을 수 없다.
  - 기본 필터(A2:CF450, 10월 월 합계 열 '¥ 0' 숨김 조건)와 필터 뷰 1개가 있다. 스프레드시트 시간대는 Etc/GMT다.

## 2. Decision

1. **쓰는 때**: 장부의 "반영(apply)" 때만 쓴다. `[id]`·`batch` 라우트의 반영은
   [apply-service.ts](../../lib/branch/sheet-writeback/apply-service.ts)의 `applyLedgerDraftsWithSheetWrite` 하나를 거친다.
   초안 만들기·체크·되돌리기(reverse)는 시트에 쓰지 않는다. Compass는 바꾸지 않는다(읽기만).
2. **쓰는 것**: 기존 행(edit-row) 그 달 주차 칸(w1~w5)의 금액(정수, numberValue)과 확도 글자색만 쓴다.
   - 쓰는 색은 정확히 확정 `{1,0,0}`, 고확도 `{0,0,1}`, 예정 `{0,0,0}`이다. foregroundColor와 foregroundColorStyle에 같은 값을 쓴다.
   - 빈 칸에 값을 쓸 때는 색을 늘 명시한다. 숨은 글자색이 확도로 읽히지 않게 덮기 위해서다.
   - 값 있는 칸의 색은 사용자가 그 칸의 확도를 직접 바꿨을 때만 쓴다(`metadata.confidenceTouched`, 주차 단위 초안은 주차별
     `metadata.weeklyConfidenceTouched`). 화면이 채운 기본 확도(매트릭스 팝오버의 그 달 우세 확도, 레일의 행 확도 시드, 콕핏
     리스트 톤)는 고른 것이 아니다 — 시작 전 빨강 주차는 앱에서 '예정'이고, 주차 칸에도 달 전체 확도가 보여 시트 글자색과 다를 수 있다.
     골랐어도 보이던 확도와 같으면 고르지 않은 것으로 본다. 주차별 표시가 없는 주차 단위 초안은 초안이 가리킨 주차(`metadata.week`)만
     고른 것으로 본다.
   - 새 행(new-row)은 지금처럼 장부에만 남는다(`new_row_app_only`).
   - 쓰지 않는 것: 속성 칸(A~L), 수식 칸(1행·M Sum·월 합계 12열·H Status), 달 전체 삭제, 칸 비우기(`clear_not_supported`).
   - 수식이 든 주차 칸(상수 산식 포함)은 쓰지 않는다(`formula_cell`).
   - 그 달 월 합계 수식이 그 달 주차 칸 전부를 정확히 더하지 않으면 쓰지 않는다(`month_formula_irregular`).
     다른 달 합계가 대상 칸을 더해도 마찬가지다.
3. **지난 주차 금액은 손대지 않는다**: 대상 주차의 시작일(1·8·15·22·29일)이 "이번 주차 시작일"보다 앞이면 금액 쓰기를
   거절한다(`past_week`). 다만 **이번 달의 지난 주는 확도 글자색만 바꿀 수 있다** — 결제가 들어와 확정(빨강)을 칠하는 일은
   보통 그 주가 지난 뒤에 하기 때문이다(2026-10-23 사용자 결정). 지난 달 이전 칸은 색도 거절한다. 빈 달의 첫 결제 주차가
   이미 지났으면 이번 주차에 쓴다.
   이번 주차 시작일은 KST 오늘이 든 주차 칸의 시작일이다. 지난 달 전체도 같다.
4. **주차 고르기**(월 칸 수정, 주차별 값 없음):
   - 그 달 값 있는 주차가 1칸이면 그 칸에 쓴다.
   - 0칸(빈 달)이면 순서대로 고른다. 첫 결제일(First Payment)이 그 달이면 그 주차, 아니고 그 달이 이번 달이면 오늘이 든 주차, 아니면 w1이다.
     4칸인 달(2월)은 마지막 칸으로 자른다.
   - 값 있는 주차가 2칸 이상인데 금액이 바뀌면 막는다(`week_ambiguous`).
   - 확도만 바꾸고 금액이 그대로면 값 있는 칸을 전부 그 색으로 바꾼다.
   - 초안이 주차 하나를 가리키면(`metadata.week` `w1`~`w5`, 주차별 값 없음 — 매트릭스 주차 칸·레일의 주차 고르기)
     빈 달은 첫 결제일·오늘 주차보다 그 주차를 먼저 고른다. 장부가 그 주차에 두기 때문이다.
     값 있는 칸이 고른 주차 하나가 아니면(다른 주차 1칸·여러 칸) 장부는 그 달 값을 고른 주차로 옮기므로 시트도 원래 칸을 비워야 한다
     → 금액이 그 달 합계와 같아도 막는다(`clear_not_supported`).
   - 칸이 4개인 달(2월)의 baseline은 시트 칸 수로 자른다. 파이프라인이 주차 값을 늘 5칸으로 채워 보내기 때문이다
     ([baseline.ts](../../lib/branch/sheet-writeback/baseline.ts) `buildSheetBaseline`).
5. **충돌은 시트 우선**: 초안은 만들 때 본 그 달 주차 칸 값·색(baseline, `sourceSnapshot.sheetBaseline`)을 싣는다.
   서버는 쓰기 직전에 시트를 다시 읽어 같을 때만 쓴다. 다르면 쓰지 않는다(`conflict`).
   다만 시트가 이미 의도한 값이면 쓰지 않고 장부만 기록한다(`already_written`). 결과를 모르던 이전 시도를 마무리하는 경로다.
   baseline이 없는 예전 초안은 거절한다(`no_baseline`).
6. **계정**: 기존 서비스계정([lib/google.ts](../../lib/google.ts)의 `GOOGLE_SERVICE_ACCOUNT_EMAIL`·`GOOGLE_PRIVATE_KEY`)을 쓴다. 새 계정은 만들지 않는다.
7. **권한**: 지금 반영할 수 있는 사람(`CRM_STAFF_ADMIN_API_ROLES`) 전원이 쓴다. 따로 능력을 주지 않는다.
8. **행 ID**: '2. REV' 맨 오른쪽(CG, 0-based 84) 숨김 "Row ID" 열에 `r_` + Crockford base32 소문자 12자를 둔다
   ([row-id.ts](../../lib/branch/sheet-writeback/row-id.ts)).
   - 일괄 부여는 [scripts/assign-rev-row-ids.ts](../../scripts/assign-rev-row-ids.ts)가 한다. 기본은 미리보기이고, 쓰기는 `--apply` 때만 한다.
   - 행 ID가 없는 행은 거절한다(`no_row_id`). 같은 ID가 여러 행이면 `row_id_duplicate`다.
   - 그 행 A열 고객이 baseline과 다르면 `identity_changed`다.
9. **스위치**: env `BRANCH_REV_SHEET_WRITE_ENABLED`가 글자 그대로 `"1"`이고 `VERCEL_ENV`가 글자 그대로 `"production"`일 때만
   켜진다([config.ts](../../lib/branch/sheet-writeback/config.ts)). 기본은 꺼짐이다. 꺼져 있으면 반영은 지금과 똑같이 장부에만 남는다(`disabled`).
10. **작업 중 원본 시트는 건드리지 않는다**: 구현·테스트는 googleapis를 목으로 둔다. 원본 시트에 쓰는 일(행 ID 스크립트 `--apply`,
    스위치 켜기)은 [런북](../active/rev-sheet-writeback-runbook.md) 순서대로 사람이 한다.
11. **쓰기 경계**(위 결정을 코드로 고정한 것):
    - 대상은 상수 `REV_WRITE_TARGET`(spreadsheetId·탭 `2. REV`·gid 957802439)이고, env `GOOGLE_BRANCH_DASHBOARD_SHEET_ID`와도 같아야 한다.
    - 요청 허용 목록: `updateCells`만, 3행부터, layout이 정한 주차 칸만, fields는 값+색·값·색 세 조합만 쓴다.
      칸 비우기는 행 이동 되돌리기(`restoreRequestsForShift`)에서만 허용한다.
      저장소의 Sheets 쓰기 호출은 허용 목록 파일에만 둔다(`tests/branch/sheet-write-surface.test.ts` 래칫).
    - 같은 (딜, 월)에 이미 활성 정정 항목이 있으면 장부 반영이 유일성 인덱스(딜·월당 활성 정정 1건)에 걸릴 것이 확실하다 —
      시트에 쓰기 전에 멈춘다(`active_correction`). 확인 조회가 실패하면 쓰지 않는다.
    - 시트에 보내기 전에 감사 행(`branch_sales_ledger_sheet_writes`, status `sending`)을 먼저 남긴다. 못 남기면 쓰지 않는다.
    - batchUpdate는 한 번만 보낸다. 재시도는 없고, 호출마다 8초 마감이 있다.
      5xx·마감 초과·되읽기 없음은 결과 모름(`outcome_unknown`, 202)으로 남기고 다시 보내지 않는다.
    - 되읽은 그리드로 확인한다. 머리 구조가 바뀌었으면(열이 끼거나 빠짐) 되돌리기를 시도하지 않는다(`row_shifted_unrestored`,
      error `layout_changed`). 행이 움직였으면 한 번 되돌리기를 시도해 되돌렸으면 `row_shifted`, 못 되돌렸으면
      `row_shifted_unrestored`다(남의 칸에 쓴 값이 남는다 — 감사 행 `cells`로 사람이 복구). 값·월 합계가 다르면 `verify_mismatch`다.
      확인된 것만 장부에 반영한다.
    - 장부 반영은 시트 쓰기를 계획할 때 본 초안(updated_at)이 그대로일 때만 한다
      (`apply_branch_sales_ledger_draft_if_unchanged` — 초안을 잠그고 비교한 뒤 기존 apply RPC). 그사이 고쳐졌으면 장부에 적지 않는다
      (`draft_changed` — 시트에 쓴 것과 다른 금액을 장부에 남기지 않는다).
    - 시트에서 바뀌는 칸이 없으면 장부만 기록한다(`no_change`).
    - 시트에는 썼는데 장부 반영이 실패하면 감사 행을 written + `db_apply_failed`로 남긴다.
      다시 누르면 `already_written`으로 마무리된다.
    - 시트에 반영된 초안은 앱에서 되돌리지 않는다(409). 시트에서 직접 되돌리거나 원래 값으로 다시 입력한다. `no_change`는 시트에 쓴
      것이 없어 막지 않는다. 반영을 시도한 적 있는 초안(감사 행 있음)은 삭제 대신 취소로 정리한다(감사 FK — DELETE 409).
    - 한 번에 50건까지 보낸다. 넘는 몫은 400이고, 화면이 나눠 보낸다.

### ADR-008과의 관계

- ADR-008 결정 8~11은 그대로다: 초안 큐, 체크된 초안만 반영, 반영 = append-only 장부 항목, 정정은 reverse/새 항목.
- 바뀌는 것: 스위치가 켜지면 edit-row 반영이 시트의 주차 칸도 바꾼다. ADR-008 Consequences의 "without immediately changing
  source revenue totals"는 이 경우 성립하지 않는다. 시트가 바뀌고, 다음 REV 동기화부터 서버 집계가 그 값을 본다.
- 이중 집계 처리: 시트 쓰기가 written이고 그 뒤 성공한 REV 동기화가 있으면, 장부 화면은 그 초안의 오버레이를 빼고
  미러 값을 쓴다. 미반영 배너도 그 항목을 미반영에서 뺀다. 기준 시각은 그 동기화 시작과 읽는 쪽이 실제로 가진 시트 행의 데이터
  시각(미러 `synced_at`·액티브 임포트 캡처 시각) 중 이른 쪽이다(`absorptionCutoff`) — 화면 행이 그 동기화보다 오래됐으면 그 행에는
  쓰기가 아직 없다. 두 곳은 같은 함수([ledger-rules.ts](../../lib/branch/sheet-writeback/ledger-rules.ts) `isSheetWriteAbsorbed`·
  `absorptionCutoff`)를 쓴다. 되돌리기 가드(`sheetWriteBlocksReverse` — written·sending이면 409, `no_change`는 제외)도 같은 파일이다.

### Compass를 바꾸지 않는 근거

Compass 저장소 `lib/revenue.ts`(읽기 확인, 2026-10-23)의 동작은 이렇다.

- 월 열은 순수 숫자 머리로 찾는다. 마지막 월 블록(3월, CA)의 끝은 `ci + 6`(배타) = CF까지라 CG "Row ID"를 읽지 않는다.
- 결제 판정은 주차 칸 `effectiveFormat.textFormat.foregroundColor`의 r>0.7·g<0.3·b<0.3이다.
  앱이 쓰는 확정 `{1,0,0}`은 결제, 고확도·예정은 결제가 아니다. 사람이 칠한 색과 같은 판정이다.
- 앱이 쓴 값은 Compass 다음 동기화에 사람이 친 값과 똑같이 들어간다.

## 3. Consequences

### Positive

- 반영 한 번으로 장부와 시트가 같은 값을 갖는다. 팀이 같은 금액을 두 번 치지 않는다.
- 충돌하면 시트가 이긴다. 앱은 다시 읽은 값이 baseline과 같을 때만 쓰고, 다르면 사람에게 넘긴다.
- 쓰는 칸·색·대상이 코드와 래칫으로 고정돼, 수식·속성·다른 탭에 닿는 쓰기는 보내기 전에 막힌다.
- 모든 시도가 감사 표에 남아 "썼는지·왜 안 썼는지"를 행 단위로 설명할 수 있다.

### Negative · 알려진 한계

- **읽기~쓰기 사이 틈**: Sheets API에는 조건부 쓰기가 없다. 다시 읽은 뒤 batchUpdate가 닿기 전에 사람이 같은 칸을 고치면
  앱 값이 이긴다. 행 이동은 되읽기 확인(`row_shifted`)으로 잡지만 같은 칸 값 편집은 잡지 못한다.
- **복사로 생기는 ID 중복**: Row ID 열은 숨김일 뿐 보호되지 않는다. 행을 통째로 복사해 붙이면 같은 ID가 두 행에 생기고,
  그 두 행은 쓰기가 거절된다(`row_id_duplicate`). 동기화 경고로 드러나고, 사람이 복사본 칸을 비운 뒤 스크립트를 다시 돌린다.
  새로 끼운 행은 ID가 없어 스크립트를 다시 돌리기 전까지 거절된다(`no_row_id`).
- **서버 집계는 다음 동기화 때 반영**: KR Team·KPI·매출시트 화면처럼 미러를 읽는 집계는 다음 REV 동기화 뒤에 새 값을 본다.
  장부 화면은 그 사이 초안 오버레이로 같은 값을 보인다. 매출시트 미반영 배지도 다음 동기화 뒤에 그 정정을 뺀다.
- **반영 직후 같은 달 다시 고치기**: 초안 baseline은 미러 값으로 만든다. 시트에 쓴 뒤 다음 REV 동기화 전에 같은 행·달을
  다시 고치면 baseline이 옛 값이라 `conflict`로 막힌다(안전 쪽). 동기화를 한 번 돌린 뒤 다시 입력한다(동기화는 미러 행을 새 딜 id 로
  다시 만든다). 같은 딜 id 의 활성 정정이 남아 있는 채로 반영하면 시트에 쓰기 전에 `active_correction`으로 멈춘다.
- **지난 주차 금액·삭제는 시트에서**: 지난 주차 금액(이번 달 지난 주의 확도 색은 앱에서 가능), 지난 달 이전 칸, 칸 비우기, 달 전체 삭제, 주차가 여럿인 달의 금액 변경, 수식 칸은 앱으로 못 한다.
  시트에서 직접 고친다.
- **켜기 전 사본 확인이 필요한 가정**: 아래 두 가지는 원본 시트에 쓰지 않는 원칙 때문에 실측하지 않았다.
  첫 시험 반영에서 확인한다(런북 §6).
  - 그리드보다 넓은 읽기 범위(`A1:CZ1000`)를 API가 그리드 크기로 잘라 주는지.
  - batchUpdate 응답의 월 합계가 재계산된 값으로 오는지.
- DSH 실적(Status)은 사람이 치는 칸이라 앱 쓰기로 바뀌지 않는다.

## 4. Related docs/code

- [REV 시트 쓰기 런북](../active/rev-sheet-writeback-runbook.md)
- [DB 마이그레이션 런북](../active/db-migration-runbook.md)
- [ADR-008 Korea Sales Ledger 운영 정본](ADR-008-korea-sales-ledger-operating-record.md)
- [ADR-010 예약 작업·외부 의존성 장애 격리](ADR-010-operational-failure-containment.md)
- [lib/branch/sheet-writeback/](../../lib/branch/sheet-writeback/config.ts) — config·row-id·colors·baseline·layout·month-formula·target·messages·ledger-rules·plan·requests·verify·sheets-client·apply-service
- [lib/repositories/branch-sales-ledger-sheet-writes.ts](../../lib/repositories/branch-sales-ledger-sheet-writes.ts)
- [supabase/migrations/20261023_branch_rev_sheet_writes.sql](../../supabase/migrations/20261023_branch_rev_sheet_writes.sql)
- [lib/branch/parsers/rev.ts](../../lib/branch/parsers/rev.ts) — Row ID·주차 색 읽기
- [scripts/assign-rev-row-ids.ts](../../scripts/assign-rev-row-ids.ts), [scripts/lib/assign-rev-row-ids-plan.ts](../../scripts/lib/assign-rev-row-ids-plan.ts)
- [tests/branch/sheet-write-surface.test.ts](../../tests/branch/sheet-write-surface.test.ts)
