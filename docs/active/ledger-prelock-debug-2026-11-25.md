# 매출 장부 — 12월 1일 시트 고정 전 미리 디버깅 (2026-11-25)

상태: **구현 3단계 커밋됨(e09338f · 882b987 · 066ce8d) · 검토에서 확인된 문제 31건 중 4건이 막는 것(blocker) — 아직 안 고침 · 배포 보류**
관련: [사용 검토](ledger-revenue-usage-review-2026-11-25.md) · [필터 기획](ledger-filter-plan-2026-11-24.md) · [시트 쓰기 런북 §8 · §9](rev-sheet-writeback-runbook.md#8-시트-고정12월-1일--branch_rev_sheet_locked_at)

## 1. 무엇을 했나

1. **찾기** — 장부를 7개 렌즈(필터 논리, 실제 브라우저, 입력 흐름, 숫자, 시간 경과, 고정 준비, 테스트 공백)로 뒤졌다. 의심 52건을 건마다 회의적 검증 2명(재현 · 의도 확인)이 다시 봤다. **48건 확인**, 4건 반박(F-12 · F-14 · F-38 · F-49).
2. **설계** — 고정 전에 남은 네 가지: 장부 화면 숫자 하나로(U-1 ①), 시트 고정 스위치(D5), 읽기 전용 대조 스크립트(U-2 ①), DSH 실적 장부 계산(D4).
3. **구현** — 파일을 겹치지 않게 나눈 3단계. 단계마다 typecheck · eslint(경고 0) · 디자인 토큰 · 전체 vitest를 통과시킨 뒤 커밋했다.
   - 1단계 e09338f: 오버레이(시트 + 장부 항목) 공용 모듈 · 고정 스위치(서버) · 시트 읽기와 확도 캐논 · 체크 큐
   - 2단계 882b987: 서버 매출 = 시트 + 장부 · DSH 실적 장부 계산 · 대조 스크립트 · 시트/매트릭스 표시 · 머리줄
   - 3단계 066ce8d: 장부 화면 연결(숫자 · 날짜 · 입력 흐름 · 고정 표시 · DSH)
   - 결과: tsc 깨끗, vitest 12,494 통과 / 실패 2(작업 전부터 있던 날짜 · env 의존 2건).
4. **검토** — 8개 렌즈로 56건. 검증이 끝난 33건 중 31건 확인, 2건 반박. **나머지 23건은 사용량 한도로 검증하지 못했다(§5).** 수정 · 최종 브라우저 확인 · 문서 단계는 돌지 못했다.

## 2. 채택한 결정 (운영자용)

- **매출 하나(D1)**: 시트 행(액티브 임포트, 없으면 미러, 음수 포함) + 반영된 장부 항목(정정은 그 행의 그 달을 대체, 새 행은 더함). 화면과 서버가 같은 함수(`lib/branch/ledger-overlay.ts`, `lib/branch/ledger-revenue.ts`)로 센다. 같은 칸 정정이 둘이면 늦게 반영한 것만 센다. **고정 스위치와 무관하게 지금부터** KR Team 타일 · KPI · 히트맵 · 주간 보고 · CRM 매출 · 주간 마감이 장부 항목을 포함한다. CRM '장부 미반영' 표시는 '장부 입력 N건 포함'으로 바뀐다.
- **환불(D2)**: 음수 달도 센다. 값 있음 = 합계 ≠ 0. 음수는 빼기표 + 중립색. 시트 값이 음수인 칸은 장부에서 고칠 수 없다('환불 — 시트 값').
- **장부 합계 안내 삭제(D3)**: '장부 가감' 타일 = (장부 포함 확정) − (시트만 확정), 같은 기간 · 범위.
- **시트 고정 스위치**: env `BRANCH_REV_SHEET_LOCKED_AT=2026-12-01`(KST 날짜). 비우면 지금과 같다. 그날 0시부터 시트 쓰기 꺼짐, 동기화는 REV를 건너뛰고 DSH · KPI · HW만, 장부 머리에 '시트는 12월 1일 기준으로 고정 — 이후 원본은 장부', 동기화 버튼은 'DSH·HW 동기화', 관리자(ADMIN · SUPER_ADMIN)에게 '12/1 스냅샷 다시 읽기'. 절차는 런북 §8.
- **확도는 읽을 때 판정**: 빨간 금액은 그 주 시작일(KST)부터 확정, 색 없는 행은 이번 달(KST) 전 달만 확정. 다시 읽지 않아도 된다.
- **날짜는 모두 KST 영업일**: 12/1 00:00~08:59에 11월로 열리던 문제를 고쳤다(장부 화면 기준 — KR Team은 §4 R-21).
- **새 행은 계약(신규/갱신) · 경로(직접/채널) 필수**. 정정은 원래 행의 계약 · 경로를 이어받는다.
- **DSH 실적(D4)**: 고정 뒤 12월부터 장부 확정으로 계산, 목표는 시트 그대로, 12월 한 달은 시트 실적을 옆에 흐리게 보인다. 담당자가 DSH 명단에 없으면 '미배정'.
- **미룬 것**: DB 마이그레이션(정정 중복을 막는 인덱스 등), 서버 쪽 중복 방지 키, 환불 초안 종류, 확도 5단계, C-10 연장 규칙 구현, 회계연도 전환 화면.

## 3. 찾은 문제 48건 — 상태

모두 코드에 반영했다. '검토에서 남은 것'은 검토가 고침이 덜 됐다고 확인한 항목(§4)이다.

| id | 내용 | 심각도 | 상태 | 검토에서 남은 것 |
|---|---|---|---|---|
| F-01 | Server-side revenue figures never include applied ledger entries: on one screen the 확정 매출/달성률/Gap ti… | blocker | 고침 | R-01 · R-02 · R-27 |
| F-02 | A second week entered in the same month replaces the first week's amount (revenue silently lost) | blocker | 고침 | R-14 · R-16 |
| F-03 | Refund (negative) amounts are clamped to blank/0 across the ledger: cells, FY 합계, sum row, result li… | important | 고침 | 검증 못 함: REV 분석 머리·목표 차트 범례의 음수 크림슨 |
| F-04 | A corrected month stays editable on the original row, and active-correction uniqueness is keyed on t… | important | 고침 | R-15 |
| F-05 | Re-entering a week cell while its save is in flight, or after a lost response, creates duplicate dra… | important | 고침 | R-17 |
| F-06 | One failed cancel/delete/check/undo request switches the whole draft queue to local mode for the res… | important | 고침 | R-18 |
| F-07 | If the sheet-write flag is still on when '2. REV' is protected, every edit-row apply fails permanent… | important | 고침 |  |
| F-08 | Red (확정) amounts in weeks after the parse date are classified once, at parse time. With REV sync sto… | important | 고침 | R-25 · R-31 |
| F-09 | The no-colour fallback in rev-confirmed.ts is calendar-dependent and evaluated inconsistently. The m… | important | 고침 |  |
| F-10 | '이번 달', the FY and the quarter come from the UTC month: from 00:00 to 08:59 KST on the 1st (Dec 1 lo… | important | 고침 | R-21 · R-22 · R-26 |
| F-11 | A ledger tab left open across midnight keeps the old month, FY options and week dot until reload; ne… | important | 고침 | R-20 · R-24 |
| F-12 | The default filter '11월 계 값 있음' also filters the sum row, so 12월 계, 1–3월 and FY 합계 show about half t… | - | 반박됨(구현 안 함) | |
| F-13 | While pipeline or ledger-drafts is still loading (or after the pipeline fails), the sheet, result li… | important | 고침 | 검증 못 함: 보드·REV 카드·콕핏 |
| F-14 | Month-only amounts (월합계만 sheet rows and manual entries saved without a week) are placed in W5: they … | - | 반박됨(구현 안 함) | |
| F-15 | A month cell typed 0 while its week cells hold red amounts makes the canon report 확정 greater than th… | important | 고침 |  |
| F-16 | The overlay silently ignores later sheet changes to a corrected month, and counts a manual-new deal … | important | 고침 | R-05 |
| F-17 | Corrections saved from a sheet cell lose 계약/경로 (shown as 기타/기타), so applying a correction removes th… | important | 고침 | R-03 · R-04 |
| F-18 | Ledger-only new rows record no Status, Type or First Payment, so they fall into 기타 and the D4 DSH sp… | important | 고침 |  |
| F-19 | Sheet week cells never show the amount just entered: an empty cell stays blank and an edited cell ke… | important | 고침 |  |
| F-20 | The bottom-bar bulk apply, the queue-footer bulk apply and row 적용 can all run at the same time on th… | important | 고침 | R-19 |
| F-21 | The queue-footer bulk apply covers every manager's checked drafts, while the bottom-bar button with … | important | 고침 |  |
| F-22 | With the sheet-write flag off after the lock, 적용 되돌리기 stays blocked for drafts already written to th… | important | 고침 |  |
| F-23 | '장부 가감' / '장부 합계' adds full-FY, all-manager, confidence-blind new-row entries to a period- and manag… | important | 고침 | R-06 · R-07 · R-08 |
| F-24 | In 내 담당 scope the DSH lens progress overview always says 'DSH 진도를 계산할 데이터가 없습니다' | important | 고침 | R-28 · R-29 · R-30 |
| F-25 | The CRM '장부에서 확인' link (origin=draft&period=Y) lands under the default '11월 계 값 있음' filter and shows… | important | 고침 |  |
| F-26 | The REV snapshot's fiscal year comes from the wall clock (refFy = fyOf(new Date()), parseRev default… | important | 고침 |  |
| F-27 | At the fiscal-year rollover the previous FY becomes unreachable in the ledger (applied March entries… | important | 고침 | R-23 |
| F-28 | The REV and DSH parsers read formattedValue and silently drop refunds shown as '(1,750)', '¥(1,750)'… | important | 고침 |  |
| F-29 | Ledger entries are capped at 1,000 active rows across all years, with no FY filter or pagination; be… | important | 고침 |  |
| F-30 | No behavioural tests cover the overlay that becomes the post-lock source of truth (sheet rows + appl… | important | 고침 |  |
| F-31 | February shows and allows editing of a W5 the sheet does not have; month-only February amounts appea… | minor | 고침 |  |
| F-32 | A ledger correction row shows the same # and the same tooltip "시트 '2. REV' N행(동기화 시점)" as its origin… | minor | 고침 |  |
| F-33 | After an apply timeout or network failure, the UI states the apply failed, does not reload the list,… | minor | 고침 |  |
| F-34 | The 기관별 month-cell editor stays open after a failed save, and pressing Enter again sends nothing | minor | 고침 |  |
| F-35 | Sheet week cells show no sheet-write hint, so past-week or unsupported entries are refused only at a… | minor | 고침 | 검증 못 함: 미리 경고 |
| F-36 | No behavioural tests cover the cell commit merge, the apply in-flight guard or bulk-apply scope; an … | minor | 고침 |  |
| F-37 | D5 (stop REV sync, keep DSH/HW) cannot be switched on as the code stands: syncRev bundles REV, DSH a… | minor | 고침 | R-09 · R-10 · R-11 · R-13 |
| F-38 | Filter changes only call history.replaceState, so Back cannot undo '이 열만 보기' or other filter commits… | - | 반박됨(구현 안 함) | |
| F-39 | In the check queue, keyboard focus drops to <body> after pressing a 체크 pill, on success or failure | minor | 고침 |  |
| F-40 | The '전기 대비' chip compares a server sheet-only, manager-scoped 확정 with a client baseline that include… | minor | 고침 |  |
| F-41 | With a manager set, the summary tiles ignore the team filter, while the table applies team ∩ manager | minor | 고침 |  |
| F-42 | Manager matching differs by surface: summary and 매니저별 are case-insensitive, pipeline rows (the 내 담당 … | minor | 고침 |  |
| F-43 | 매니저별 team subtotals group rows by the person's DSH home team, not by the row's team, so they differ … | minor | 고침 |  |
| F-44 | The same figures are formatted inconsistently on one screen (¥1,200만 vs ¥1200.0만, ¥92만/¥92.0만/¥920,0… | minor | 고침 | 검증 못 함: 기관별 승인 막대 cny() |
| F-45 | SSR output depends on render-time Date: when server and browser clocks fall on different sides of a … | minor | 고침 |  |
| F-46 | Queue month labels drop the year: '4월' means both 2026-04 and 2027-04 | minor | 고침 |  |
| F-47 | The status rail promises '매일 17:38(KST) 자동 동기화', but the cron runs at 09:00, 13:00 and 17:00 KST | minor | 고침 |  |
| F-48 | The planned C-10 overdue rule ('다음 주 월요일 09:00 KST') does not fit the ledger's day-of-month week cel… | minor | 고침 |  |
| F-49 | The 40px # column truncates sheet row numbers with 5 or more digits… | - | 반박됨(구현 안 함) | |
| F-50 | For period=Q or Y the pipeline cache key contains a millisecond timestamp, so the page prefetch and … | minor | 고침 |  |
| F-51 | parseSheetFilters slows quadratically on repeated column keys in a long cf value | minor | 고침 |  |
| F-52 | P0 leftovers: dead exports, a hard-coded confidence legend, and the '장부 합계' hint that D3 removes is … | minor | 고침 |  |

## 4. 검토에서 확인된 문제 31건 — 아직 안 고침

막는 것 4건(R-01 · R-14 · R-15 · R-31)은 **배포 전에 반드시** 고친다. 자세한 고칠 방향은 부록 A.

| id | 심각도 | 내용 |
|---|---|---|
| R-01 | blocker | KR Team surfaces still read sheet-only /api/admin/branch/pipeline rows: the goal chart, week chart, hero 'remaining 고확도', HQ weekly report 本月收款 and the pipeline table, kanban and action board never include ledger entries. After 12/1 they show only the snapshot, while the hero 확정 next to them is D1 (F-01 only partly fixed) |
| R-02 | important | Ledger head tiles (확정 매출 / 장부 가감 / Gap / 달성률 / 전기 대비) are not refetched after apply or reverse. They disagree with the sheet, sum row and board on the same screen until a manual refresh |
| R-03 | important | REV rail customer detail: '실적 합계' and the '구성 행' amounts use the stale row.revenue. A corrected month is counted twice (sheet pre-correction 확정 + correction), and 예정/고확도 ledger entries are counted as 실적 |
| R-04 | minor | Opening a corrected row in the rail pre-fills the amount with the pre-correction sheet value (deals/[id] is sheet-only). Re-saving silently reverts the correction |
| R-05 | important | 내 담당 / manager-scoped ledger view shows a false '장부에서 반영한 수정 N건의 원래 시트 행을 찾지 못했습니다' warning for every other manager's correction |
| R-06 | minor | Server tiles and monthly_series use the raw canon (confirmedMonthAmount). The screen, goal chart and DSH 실적 use ledgerMonthBucket, which folds a negative 예정 out of 확정. Mixed-sign months give different 확정 |
| R-07 | important | Team-filtered view: when a correction's team differs from its (re-synced) sheet row's team, the server tile and the client table disagree |
| R-08 | minor | Rail copy for ledger rows says corrections are not in 확정 매출 and new rows are '별도 합산' — the opposite of D1 |
| R-09 | important | Insights cron stops running from the lock day: its gate only accepts sync runs recorded as 'all' or 'rev' |
| R-10 | important | CRM 매출시트 shows an amber 'not synced for over a day' warning on every day of the lock (no lock awareness; the frozenLabel plumbing is never used) |
| R-11 | important | Ledger status rail shows a permanent '정합 이슈' (DQ-10 '재동기화 확인') from the lock day, because the frozen mirror is compared with a live parse at today's date |
| R-12 | minor | An open ledger tab never picks up the lock at midnight: lock state is read only from the drafts GET at mount |
| R-13 | minor | scripts/run-branch-sync.ts bypasses the lock: it re-reads REV, replaces the mirror without font colours and records source 'all' |
| R-14 | blocker | A week-cell commit drops the confidence of the row's other sheet weeks, so applying a forecast week turns the month's 확정 into 예정 (screen tiles, server D1 totals and post-lock DSH 실적) |
| R-15 | blocker | Empty week cells of an applied ledger row's own month are editable: on a manual-new row the commit re-sends the entry's weeks as a new-row draft and double counts; on a correction row it makes a draft the server always refuses |
| R-16 | important | A month-level pending draft becomes the start value of every week cell in that month; a confidence key (E/H/C) or Ctrl+D on an empty week silently raises the month |
| R-17 | important | F-05 not fully fixed: a lost POST plus a failed reload, then a re-edit of another week, makes the resend create a second draft for the same (deal, month) |
| R-18 | important | F-06 regression: unsent local drafts are now resent from shared browser storage, so two open tabs each POST the same unsent rail draft |
| R-19 | important | After a real 409 on a cell PATCH, the next queued PATCH for the same draft is sent with the server's fresh updatedAt and silently overwrites the other edit |
| R-20 | important | Ledger tab left open across midnight: the screen's own month rolls forward, but the server data is never re-read, so the lock never switches on and quarter tiles show the previous quarter |
| R-21 | important | KR Team dashboard (/admin/branch) still takes '이번 달' and the FY from the UTC month: on 12/1 from 00:00 to 08:59 KST it opens on November and offers no December |
| R-22 | important | CRM revenue dashboard: the month window and timestamp bucketing use the server-local clock (UTC on Vercel), so December is missing on the 1st before 09:00 KST and early-morning payments land in the previous month |
| R-23 | important | F-27 minimal is incomplete: an out-of-FY ?month= opens that FY's grid but loads data from another FY. The ledger-drafts ?fy= support exists but is never sent, and the pipeline ignores &fy= |
| R-24 | minor | Parts of the ledger screen do not re-evaluate read-time confidence on the business-day tick (기관별/매니저별, week projection, DSH cards) |
| R-25 | minor | Confirmed-month lock ignores read-time promotion: a red week that becomes 확정 after the lock date stays unlocked and editable |
| R-26 | minor | Insights pacing takes the quarter from UTC on the raw now while the month and FY are KST |
| R-27 | important | sales-counts reads the REV mirror without raw and without ledger entries, so confirmed-customer counts freeze at the 11/30 classification after the lock |
| R-28 | important | If the ledger can't be read, DSH 실적 for 12월+ quietly drops every ledger entry but is still labelled '장부 확정' (no banner). The KPI route has the same gap. |
| R-29 | minor | DSH 실적 and the 확정 tile use two different 'confirmed' formulas, so Team KR's month can differ from the tile for the same month and scope |
| R-30 | minor | No route-level test runs the real D4 splice under the lock: both summary and kpi route tests mock applyLedgerStatusToDsh |
| R-31 | blocker | The 12/1 snapshot re-read stores a red refund in a later week twice. 확정 then reads too low from that week to FY end, the 12/1 reconcile says 같음, and later runs blame '동기화 뒤 시트 변경' |

## 5. 검증하지 못한 검토 결과 23건

사용량 한도로 회의적 검증을 못 돌렸다. 고치기 전에 재현부터 한다.

- **[important]** The '화면 식 ↔ 서버 식' parity check compares the bucket with itself and never runs the tile formula, so a real tile ↔ table difference passes as 같음 — `lib/branch/reconcile/rev-ledger-reconcile.ts`, `lib/branch/computations/pipeline.ts`, `lib/branch/computations/core-kpi.ts`
  - 제안: In buildChecks, build the server cells per manager × month with the tile function: confirmedRevenueInMonths(merged.deals filtered by reconcileManagerKey, [month], readDate). Compare its 확정 with accLedger's confirmed, and keep the bucket-vs-bucket comparison only for total, 고확도 and 예정. Separately (numbers owner), make revenueFromRev/confirmedRevenue
- **[important]** A --manager name that matches nobody (typo) reports 같음 — 차이 없음 with exit 0, while the correctly spelled name is blocked — `lib/branch/reconcile/rev-ledger-reconcile.ts`, `scripts/lib/reconcile-rev-ledger-args.ts`, `lib/branch/reconcile/run-reconcile.ts`
  - 제안: After the labels are built in reconcileRevLedger, collect every manager key from sheetNowRows, dbRows, overlay.rows, ledger.entries and ledger.openDrafts. If filterKey is not among them, either throw a typed error that runReconcile maps to exit 2 ('--manager 와 맞는 담당이 시트·장부에 없습니다: 예시AA — 있는 담당: …', listing labels.label of the known keys), or push it
- **[minor]** --tolerance=0 (or -0) blocks identical inputs: every zero month becomes 'sheet_changed', 71 columns 'unexplained', 96 parity cells — `lib/branch/reconcile/rev-ledger-reconcile.ts`, `lib/branch/reconcile/rev-ledger-render.ts`, `scripts/lib/reconcile-rev-ledger-args.ts`
  - 제안: Use one helper everywhere: `const exceeds = (x: number, tol: number) => x !== 0 && Math.abs(x) >= tol`. Or define tolerance as 'allowed difference' and use `Math.abs(x) > tol`. Alternatively reject tolerance ≤ 0 in parseReconcileArgs (exit 2). Add a test with tolerance 0 on identical inputs.
- **[minor]** Section 3 and CSV row lines for ledger_edit take the delta from today's sheet, not the DB row, so they don't add up to the cell's 장부 입력 and the detail names the wrong replaced amount — `lib/branch/reconcile/rev-ledger-reconcile.ts`, `lib/branch/reconcile/rev-ledger-render.ts`
  - 제안: In diffLedgerRows, set `sheet` for ledger_edit to splitOfRow(target, month, readDate), the DB row. Mention the live sheet value in the detail only when it differs ('지금 시트 ¥450 — 동기화 뒤 바뀜'). Add a test that sums the CSV row lines per cause against the cell lines.
- **[minor]** The read-only guarantee is tested only by text scans of the reconcile files. The repository functions it actually calls are not covered — `tests/branch/reconcile/reconcile-readonly.test.ts`, `lib/branch/reconcile/read-sources.ts`
  - 제안: Promote the probe to tests/branch/reconcile/read-sources-readonly.test.ts: - vi.mock '@/lib/supabase/admin' with a call-recording Proxy client and '@/lib/google' with a recording sheets proxy. - Make next/cache revalidateTag throw. - Run readLiveReconcileLedger for each dbSource and readLiveReconcileSheet. - Assert the allowed method set and a sing
- **[important]** F-01 / D1 not met on the KR Team dashboard: the monthly goal chart and week forecast stay sheet-only beside D1 tiles and pacing. Not fixed and not deferred. — `components/admin/branch/sections/RevenueFlowSection.tsx`, `lib/branch/pipeline-rows.ts`, `app/api/admin/branch/pipeline/route.ts`
  - 제안: Give the KR Team flow its own D1 rows without double-counting on the ledger screen. Two options: - (a) Add a server option on the pipeline route, e.g. `?ledger=1`, that returns rows from mergeLedgerSources(readLedgerRevenueDeals) through listRevRevenue. Only RevenueFlowSection would request it; the ledger screen keeps its client overlay. - (b) In u
- **[important]** KST business-date decision not met on the KR Team dashboard: it still turns 'now' into a month and FY with UTC, so it opens on November from 00:00 to 08:59 KST on 12/1 — `components/admin/branch/BranchDashboardClient.tsx`, `components/admin/branch/sections/RevenueFlowSection.tsx`, `lib/branch/insights/input-builder.ts`
  - 제안: In BranchDashboardClient, replace `ymKeyUtc(new Date())` and `fiscalYearOf(now)` with businessYm() and businessFy() from lib/branch/fiscal.ts. Keep ymKeyUtc only where it formats a Date built with Date.UTC. In input-builder, normalise `now` through businessDateAsUtc(now), or use businessQuarter(now). Add tests at 2026-11-30T15:05Z. Coordinate with 
- **[minor]** Commits edit SyncStatusBar and KR Team section files that no package owned, and that another session was editing the same day — `components/admin/branch/SyncStatusBar.tsx`, `components/admin/branch/BranchDashboardClient.tsx`, `components/admin/branch/sections/RevenueFlowSection.tsx`
  - 제안: Before merging, hand these hunks to the session that owns SyncStatusBar and the KR Team sections, or get its confirmation. Rebase against its branch so neither side's edits are lost. Record the change in B's F-37 deferral and E1's F-25 deferral as "applied by integrator".
- **[minor]** Server 확정 (summary tiles, prev_confirmed) and client/DSH 확정 use different functions and can disagree for the same row and month (D1 'same pure functions') — `lib/branch/computations/pipeline.ts`, `lib/branch/computations/core-kpi.ts`, `lib/branch/computations/revenue-core.ts`
  - 제안: Move the positive-total fold into the canon (splitMonthConfidence, plus the confirmed amount it returns), so the canon, the bucket, the tiles, weekly close and CRM all agree. Or make revenueFromRev and confirmedRevenueInMonths sum ledgerMonthBucket(...).confirmed. Add a parity test on this fixture: revenueFromRev(deal) must equal the sum of ledgerM
- **[minor]** Dead code and parallel duplicate helpers left by the concurrent packages — `components/admin/branch/ledger/workbench-shared.tsx`, `components/admin/branch/ledger/ledger-business-day.ts`, `lib/branch/computations/revenue-core.ts`
  - 제안: Delete buildFiscalMonthOptions, businessMonthKey and fiscalYearOf from workbench-shared (or make them thin re-exports of ledger-business-day), and move their tests. Fix the route comment. Delete EMPTY_LEDGER_BUCKET. Either use sumLedgerRevenue in buildRevMonthScalars and the server, or delete it. Keep one rowMonthHasRefund and one month-week-count 
- **[minor]** F-44 gap: the 기관별 approval bar and candidate picker still use ¥{cny()} ('¥1200.0만') while the 기관별 table shows '¥1,200만'. Not deferred. — `components/admin/branch/ledger/LedgerSimpleEdit.tsx`
  - 제안: In LedgerSimpleEdit, replace `¥{cny(x)}` with formatMoney(x) and put formatMoneyExact(x) in a title. Add a render assertion that the ApprovalBar shows '¥1,200만' for 12,000,000.
- **[minor]** F-08 doc fix not done: the review doc §3.3 still states the pre-fix behaviour as fact — `docs/active/ledger-revenue-usage-review-2026-11-25.md`
  - 제안: Update the four §3.3 rows (REV 미러, DSH 탭 실적, 시트 쓰기, 목표). Point them to rev-sheet-lock.ts, ledger-overlay.ts with tests/branch/ledger-overlay.test.ts, dsh-ledger-status.ts and runbook §8, and say what remains frozen (the 12/1 REV snapshot only).
- **[minor]** Risky workbench logic is guarded only by source-text assertions, not behaviour — `tests/branch/cell-sheet-hint-weekly.test.ts`, `tests/branch/ledger-workbench-lock-entry.test.tsx`, `components/admin/branch/SalesLedgerWorkbench.tsx`
  - 제안: Extract the commit decision (sheetBlock or validation outcome → {persist:false, toast} or chainCellCommit) into a pure helper in components/admin/branch/ledger/ledger-cell-flight.ts and table-test it. Give the snapshot-reread button an explicit `canRereadSnapshot` prop path that a render test can drive (e.g. an initial role prop), instead of relyin
- **[important]** After the lock, a second correction of an already-corrected row and month can be typed into the ledger but is always refused at apply (row_corrected), with no warning beforehand — `components/admin/branch/ledger/rev-matrix-logic.ts`, `components/admin/branch/ledger/RevMatrix.tsx`, `components/admin/branch/ledger/ledger-sheet-logic.ts`
  - 제안: Pick one rule. For (b): in matrixCellLockKind, while sheetWrite.lock.active, treat rows with ledgerOrigin 'draft' and draftKind 'edit-row' (and sheet rows whose month is in correctedMonths) as a whole-month lock. In DraftQueue, flag edit-row drafts whose (sheetBaseline.rowId, month) matches an active manual-edit entry that was not written to the sh
- **[important]** In the default 내 담당 (manager-scoped) view, every colleague's applied correction raises a false '원래 시트 행을 찾지 못했습니다' warning — `components/admin/branch/SalesLedgerWorkbench.tsx`, `components/admin/branch/ledger/ledger-revenue-tiles.ts`, `lib/branch/ledger-overlay.ts`
  - 제안: Before ledgerOverlayNotices, drop unresolved rows whose manager does not match the scoped managers (branchManagerMatches), the way team scoping already works. Alternatively, pass the scoped manager into buildLedgerOverlay and skip resolution for entries outside that manager's rows.
- **[minor]** F-13 stops at the 건별 sheet: board, REV cards and cockpit show ledger-only totals as final while the pipeline loads or after it fails — `components/admin/branch/SalesLedgerWorkbench.tsx`, `components/admin/branch/ledger/ForecastBoard.tsx`, `components/admin/branch/ledger/CockpitDealList.tsx`
  - 제안: Pass ledgerSheetLoadState(...).pending and .partial to ForecastBoard (header and goal chart), to the REV cards' month scalars (revMonthScalars cards) and to the cockpit 현황 strip. Render '불러오는 중' or SHEET_PARTIAL_NOTICE instead of the sums.
- **[minor]** Negative confidence totals still render in crimson in the REV analysis header and the goal-chart legend (D2) — `components/admin/branch/ledger/RevAuxAnalysisSection.tsx`, `components/admin/branch/MonthlyGoalBowlChart.tsx`
  - 제안: Use the neutral class or colour when the value is ≤ 0, in both RevAuxAnalysisSection's 확정/예정 spans and the MonthlyGoalBowlChart legend items.
- **[minor]** F-44 residue: the approval bar still uses cny() (¥1257.1만) next to formatMoney (¥1,652.1만), and 기관별 negatives read '¥ -3만' — `components/admin/branch/ledger/LedgerSimpleEdit.tsx`, `components/admin/branch/ledger/LedgerSimpleView.tsx`
  - 제안: Replace `¥{cny(...)}` in ApprovalBar and the candidate label with formatMoney(...). In LedgerSimpleView's Yen cell, put the sign before the ¥ glyph, or hide the glyph column for negatives and render formatMoney.
- **[minor]** A red cell in a week that has not started reads '예정' but is locked as '시트 확정 값이라 잠금' — `components/admin/branch/ledger/rev-matrix-logic.ts`, `components/admin/branch/ledger/RevMatrix.tsx`
  - 제안: In matrixCellLockKind, take 'confirmed' from the read-time split (ledgerMonthBucket or the pendingCells promotion), or add a distinct title when the cell is a pending red cell.
- **[minor]** The snapshot re-read confirm puts focus on the action button, so Enter, Enter re-reads at once — `components/admin/branch/ledger/LedgerTopBar.tsx`
  - 제안: In SnapshotRereadControl, focus the 취소 button when the confirm opens.
- **[minor]** One failed save is reported four times with three different retry labels; after a sheet_locked failure the bulk '시트·장부에 반영' button stays enabled — `components/admin/branch/SalesLedgerWorkbench.tsx`, `components/admin/branch/ledger/LedgerSimpleEdit.tsx`, `components/admin/branch/ledger/DraftQueue.tsx`
  - 제안: Drop the amber notice and the toast when the page-level unsynced or sheet-problem band is visible. Use '다시 보내기' everywhere. While sheetWritePageProblem is non-null, disable the bulk sheet apply.
- **[minor]** (Predates this effort) Tab-focused grid cells show no focus indicator in the 건별 sheet and the REV matrix — `components/admin/branch/ledger/RevMatrix.tsx`
  - 제안: Add focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#084734]/50 (or the selected ring) to the week and month cell classes.
- **[minor]** (Predates this effort) REV matrix week cells clip 6-digit locked amounts and 8-digit amounts — `components/admin/branch/ledger/RevMatrix.tsx`
  - 제안: Reuse the 건별 sheet's compact-font rule for long values, or move the lock icon out of the text flow.

## 6. 남은 일 (순서대로)

1. 막는 것 4건 고치기: R-14(주 칸 입력이 같은 달 다른 주의 확도를 지움) · R-15(반영된 장부 행의 빈 주 칸이 다시 입력돼 두 번 셈) · R-31(스냅샷 다시 읽기가 빨간 환불을 두 번 저장) · R-01(KR Team 차트 · 주간 보고 · 파이프라인 표가 아직 시트만 봄).
2. 중요(important) 17건 고치기 — 특히 고정 당일에 바로 보이는 R-09 · R-10 · R-11(고정 뒤 인사이트 크론 멈춤, CRM 경고, 상태 레일 '정합 이슈'), R-21 · R-22(KR Team · CRM이 UTC 달).
3. §5의 23건 재현 → 진짜만 고치기.
4. 실제 브라우저 최종 확인(고정 꺼짐 · 켜짐, 1440 · 1920), 전체 게이트.
5. 그다음 Preview 배포 → 런북 §8 리허설(지난 날짜) → Production env 설정(D-3까지).

## 7. 운영 쪽 열린 질문

- '12/1 스냅샷 다시 읽기'를 ADMIN까지 누를 수 있게 둘지, SUPER_ADMIN만으로 좁힐지.
- 12/1에 '2. REV' 탭만 보호할지, 파일 전체를 보기 전용으로 할지(탭만 보호하면 DSH 목표 행을 12월에도 고칠 수 있다).
- '1. DSH' 탭도 함께 잠그는지 — 잠그면 11월 DSH 실적 입력을 11/30 안에 끝내야 한다.
- 매니저 안내: 12월부터 DSH 실적은 장부 확정에서 계산, 새 행은 계약 · 경로를 꼭 고를 것, 장부 담당자 이름이 DSH 이름과 다르면 '미배정'.

## 부록 A. 검토 확인 31건 — 고칠 방향 (검증 메모 원문)

### R-01 (blocker) KR Team surfaces still read sheet-only /api/admin/branch/pipeline rows: the goal chart, week chart, hero 'remaining 고확도', HQ weekly report 本月收款 and the pipeline table, kanban and action board never include ledger entries. After 12/1 they show only the snapshot, while the hero 확정 next to them is D1 (F-01 only partly fixed)

- 파일: `lib/branch/pipeline-rows.ts`, `components/admin/branch/sections/RevenueFlowSection.tsx`, `components/admin/branch/sections/OverviewHeroCard.tsx`, `components/admin/branch/sections/HqWeeklyReport.tsx`
- 고칠 방향: **1. `lib/branch/pipeline-rows.ts`: add a D1 variant** - Add `withLedger?: boolean` to `BranchPipelineRowsQuery`. - Put it in a separate `unstable_cache`, e.g. key `branch-pipeline-rows-ledger-v1`. - Tags: `[SALES_LEDGER_IMPORTS_CACHE_TAG, BRANCH_REV_DEALS_CACHE_TAG, ...LEDGER_REVENUE_CACHE_TAGS]`. - Wrap it in `shareInFlightByArgs` as the existing cache does. - Build the rows like this: 1. `fy = fyOf(periodDate ?? new Date())`. 2. `const { deals } = await readLedgerRevenueDeals({ fiscalYear: fy })` (all teams, merged). 3. `listRevRevenue(deals, { team, manager, region }, period && periodDate ? { period, now: periodDate } : undefined)`. 4. `.map(readTimeFieldAttacher(deals))`. - Keep the exi

### R-02 (important) Ledger head tiles (확정 매출 / 장부 가감 / Gap / 달성률 / 전기 대비) are not refetched after apply or reverse. They disagree with the sheet, sum row and board on the same screen until a manual refresh

- 파일: `components/admin/branch/SalesLedgerWorkbench.tsx`, `components/admin/branch/ledger/useLedgerDraftQueue.ts`
- 고칠 방향: **Fix (in SalesLedgerWorkbench.tsx only; the hook and the server need no change):** 1. Add a summary-only refresh counter: `const [summaryRefreshKey, setSummaryRefreshKey] = useState(0)` and `const bumpLedgerTotals = useCallback(() => setSummaryRefreshKey((v) => v + 1), [])`. 2. Use `refreshKey + summaryRefreshKey` as the key for the `summary` useBranchJson. Do the same for `kpi` and `ledgerKpi`, since the KPI route is now D1 too. - Both counters only grow, so their sum still changes on every bump. - Do not add it to the pipeline, hardware or CRM keys, so applying does not reload sheet rows. - clearBranchRequestCache is not needed. The successful PATCH already cleared the /api/admin/branch m

### R-03 (important) REV rail customer detail: '실적 합계' and the '구성 행' amounts use the stale row.revenue. A corrected month is counted twice (sheet pre-correction 확정 + correction), and 예정/고확도 ledger entries are counted as 실적

- 파일: `components/admin/branch/SalesLedgerWorkbench.tsx`, `components/admin/branch/ledger/RevMobileList.tsx`, `lib/branch/ledger-overlay.ts`
- 고칠 방향: Fix this on the client display side. Do not redefine `revenue` in lib/branch/ledger-overlay.ts: ledgerMonthNet and rowMonthAmount still fall back to row.revenue for draft rows, and the server-merge parity depends on those row shapes. 1. **Group total and 구성 행 (components/admin/branch/SalesLedgerWorkbench.tsx, revCustomerGroups useMemo, about lines 1644-1751)** - Replace `group.revenueTotal += row.revenue` with the row's D1 period 확정: `periodMonths.reduce((s, m) => s + rowMonthBucket(row, m, businessToday).confirmed, 0)`. periodMonths is defined at :740; add it to the deps array. - In period M this makes 실적 합계 equal the 확정 line. In Q and Y it matches the server's period 확정 for untouched rows 

### R-04 (minor) Opening a corrected row in the rail pre-fills the amount with the pre-correction sheet value (deals/[id] is sheet-only). Re-saving silently reverts the correction

- 파일: `components/admin/branch/SalesLedgerWorkbench.tsx`, `app/api/admin/branch/deals/[id]/route.ts`
- 고칠 방향: Files: components/admin/branch/SalesLedgerWorkbench.tsx. Optionally, a new pure helper beside it, for example in components/admin/branch/ledger/workbench-shared.tsx or a small new module. 1. Amount seed in `loadDealDetail` (:2733-2747): - Do not take `amount` from `data.deal.monthly_payments[current.month]` when either is true: - the row is a ledger row (`row.ledgerOrigin === "draft"`); - the row is a sheet row and `editRowOverrideMonths.get(row.id)?.has(current.month)`. - In those cases keep the ledger value, `rowMonthAmount(row, current.month)` (the overlay row's own month). For an overridden sheet month, keep `current.amount`. - Pull the decision into a pure helpe

### R-05 (important) 내 담당 / manager-scoped ledger view shows a false '장부에서 반영한 수정 N건의 원래 시트 행을 찾지 못했습니다' warning for every other manager's correction

- 파일: `components/admin/branch/SalesLedgerWorkbench.tsx`, `lib/branch/ledger-overlay.ts`, `components/admin/branch/ledger/ledger-revenue-tiles.ts`
- 고칠 방향: Files: `components/admin/branch/SalesLedgerWorkbench.tsx` (around lines 3303-3311) and `components/admin/branch/ledger/ledger-revenue-tiles.ts`. Optionally `lib/branch/ledger-overlay.ts` if the scope goes into the overlay instead. 1. Add a pure helper to `ledger-revenue-tiles.ts`, for example `scopeOverlayWarnings(overlay, { team, manager })`. It returns `{ unresolved, superseded, drift, duplicates }` counts, keeping an entry only when `inScope(row) = (!team || team === 'ALL' || row.team === team) && (!manager || branchManagerMatches(row.manager, manager))`. - Apply it to `overlay.unresolved` (the correction row) and to `overlay.duplicates[].row` (the new row). - `superseded` and `drift` can

### R-06 (minor) Server tiles and monthly_series use the raw canon (confirmedMonthAmount). The screen, goal chart and DSH 실적 use ledgerMonthBucket, which folds a negative 예정 out of 확정. Mixed-sign months give different 확정

- 파일: `lib/branch/computations/core-kpi.ts`, `lib/branch/computations/pipeline.ts`, `lib/branch/summary-payload.ts`, `lib/branch/computations/revenue-core.ts`
- 고칠 방향: Preferred fix: make the canon itself fold, so every server surface agrees with the screen without rewiring callers. That covers the summary tile, monthly_series, deal_mix, team totals, prev_confirmed, CRM revenue and performance, weekly close, kpi and heatmap. 1. In lib/branch/computations/rev-confirmed.ts: - confirmedAt, signed branch (the `isSignedMonth(...) ? fromMap : ...` line, not the mismatch branch): when total > 0, let `high = monthAmount(d.monthly_high_conf, ym) ?? 0` and `deficit = fromMap + high - total`. If deficit > 0, return `fromMap - Math.max(0, deficit - Math.max(high, 0))`; otherwise return fromMap. - splitMonthConfidence, signed branch, same rule 

### R-07 (important) Team-filtered view: when a correction's team differs from its (re-synced) sheet row's team, the server tile and the client table disagree

- 파일: `lib/branch/ledger-overlay.ts`, `lib/branch/ledger-revenue.ts`
- 고칠 방향: Fix this only in lib/branch/ledger-overlay.ts, in planLedgerOverlay. Make the team-filtered client overlay use the server's attribution: a correction belongs to the entry's team, and it always removes the month from its target row. 1. Scope by month only before resolving. In planLedgerOverlay, filter entryCandidates and fallbackCandidates by month only (`!months || months.includes(month)`), not by team. Keep the reversed, local and absorbed filters as they are. 2. Resolve and pick winners against all candidates. Run resolveCorrectionTargets, the F-04 supersede grouping and the `overrides` map over these candidates. A correction of a loaded MKT row with team BD then s

### R-08 (minor) Rail copy for ledger rows says corrections are not in 확정 매출 and new rows are '별도 합산' — the opposite of D1

- 파일: `components/admin/branch/SalesLedgerWorkbench.tsx`
- 고칠 방향: **File:** components/admin/branch/SalesLedgerWorkbench.tsx, around lines 5154-5159 (the `selectedRow.ledgerOrigin === "draft"` box in the rail detail). **Copy to show, by row type:** - **Resolved edit-row** (the row is not in `ledgerOverlay.unresolved`): "장부 정정 — 시트 {selectedRow.sheetRow}행의 {formatMonthLabel(draftMonth)}을 대체해 모든 합계에 들어갑니다". Use "장부 정정 — 시트 행의 그 달을 대체해 모든 합계에 들어갑니다" when there is no sheetRow or no month. This matches the F-32 title '장부 정정 · 시트 342행의 11월을 대체'. - **Unresolved edit-row**: a correction whose target was not found still counts, as an additive row. The client keeps it in appliedRows with no override; the server turns it into a separate ledger deal. Suggested copy: "

### R-09 (important) Insights cron stops running from the lock day: its gate only accepts sync runs recorded as 'all' or 'rev'

- 파일: `app/api/cron/sync-branch-insights/route.ts`, `lib/branch/sync/sync-parts.ts`
- 고칠 방향: Fix the gate in app/api/cron/sync-branch-insights/route.ts. A successful sheet run is source ∈ {"all", "rev", "dsh", "dsh+hw"}: ```ts const SHEET_RUN_SOURCES = new Set(["all", "rev", "dsh", "dsh+hw"]) (run) => SHEET_RUN_SOURCES.has(run.source) && run.status === "success" && ... ``` - Use an explicit set rather than calling failure-streak's syncRunCoversSource(run, "rev") on its own. That helper falls through to `return true` for any other recorded value (e.g. "insights"), which would loosen the gate. - Update the comment: after the sheet lock (lib/branch/rev-sheet-lock.ts) the cron records dsh/dsh+hw, because it reads the same spreadsheet's DSH·KPI tabs and REV comes

### R-10 (important) CRM 매출시트 shows an amber 'not synced for over a day' warning on every day of the lock (no lock awareness; the frozenLabel plumbing is never used)

- 파일: `app/admin/crm/deals/rev-sheet/page.tsx`, `lib/crm/revenue-sheet-view.ts`, `lib/admin-crm-revenue-sheet.ts`, `lib/crm/sync-freshness.ts`
- 고칠 방향: Fix the stale line first. The button change is optional. 1. **Send the lock state with the workspace.** - lib/admin-crm-revenue-sheet-types.ts: add `revSheetLock?: RevSheetLockView | null` to AdminCrmRevenueSheetWorkspace. Import the type from lib/branch/rev-sheet-lock. - lib/admin-crm-revenue-sheet.ts, in the return of computeAdminCrmRevenueSheetWorkspace: add `revSheetLock: revSheetLockView(currentRevSheetLock())`. - The workspace is cached for 60 s (unstable_cache, :658-662). So the client should re-resolve `active` itself from `lockedAt` and the KST date of its `now`: `resolveRevSheetLock(lock.lockedAt, getBusinessDateParts(new Date(now)).date)`. A payload built just before midnight on 1

### R-11 (important) Ledger status rail shows a permanent '정합 이슈' (DQ-10 '재동기화 확인') from the lock day, because the frozen mirror is compared with a live parse at today's date

- 파일: `lib/branch/computations/data-quality.ts`, `app/api/admin/branch/data-quality/route.ts`, `lib/branch/parsers/rev.ts`
- 고칠 방향: Make DQ-10 independent of the date. Choose one of the following, in order of preference. **(A) Compare at read time.** - In app/api/admin/branch/data-quality/route.ts, read the mirror with `listBranchRevDealsFresh({ withRaw: true })`. The comparison needs `raw.pendingCells`, and the mirror is otherwise read without raw. - Pass `today` into `runDataQuality` (new optional `DqInputs.today`). - In lib/branch/computations/data-quality.ts, replace `sameColorAmounts` with a comparison over the union of the months in both sides' `monthly_payments`: - `monthly_payments[ym]` must be equal on both sides. - `splitMonthConfidence(d, ym, d.monthly_payments[ym] ?? 0, dealHasColorData(d), today)` from lib/b

### R-12 (minor) An open ledger tab never picks up the lock at midnight: lock state is read only from the drafts GET at mount

- 파일: `components/admin/branch/SalesLedgerWorkbench.tsx`, `components/admin/branch/ledger/sheet-write-view.ts`, `components/admin/branch/ledger/useLedgerDraftQueue.ts`
- 고칠 방향: Re-read the lock when the business day changes, and as a second guard derive it from businessToday on the client. 1. components/admin/branch/SalesLedgerWorkbench.tsx: add an effect keyed on businessToday that skips the first run (use a ref holding the previous value). When the day changes, call `void reloadDrafts({ quiet: true })`. This also covers the case where the env var appears in a deploy on lock day, when the client has no lockedAt yet. Optionally, also call `void reloadDrafts({ quiet: true })` in onRefresh's finally block, so the '동기화' button refreshes sheetWrite as onSnapshotReread already does. 2. components/admin/branch/ledger/sheet-write-view.ts: add a pure `effectiveSheetWriteSt

### R-13 (minor) scripts/run-branch-sync.ts bypasses the lock: it re-reads REV, replaces the mirror without font colours and records source 'all'

- 파일: `scripts/run-branch-sync.ts`
- 고칠 방향: **Preferred fix: make the script HW-only.** Its REV path is wrong even without the lock: it drops text colours, drops `monthly_confirmed`/`monthly_high_conf`, never recaptures the import and invalidates no caches. In `scripts/run-branch-sync.ts`: - Remove the REV block (lines 71-86) and the `parseRev`/`REV_RANGE` import. - Insert the run as `{ source: "hw", trigger: "manual", status: "running" }`. - Print one Korean line, e.g. "REV 는 앱 동기화(/api/admin/branch/sync)로만 읽는다 — 시트 고정 중에는 관리자 '12/1 스냅샷 다시 읽기'만". - Base `rows_affected` on the HW rows only. - Update `docs/active/branch-dashboard-development-log.md` §13 (line 242) to say the script syncs HW only. **If REV must 

### R-14 (blocker) A week-cell commit drops the confidence of the row's other sheet weeks, so applying a forecast week turns the month's 확정 into 예정 (screen tiles, server D1 totals and post-lock DSH 실적)

- 파일: `components/admin/branch/ledger/rev-matrix-logic.ts`, `components/admin/branch/SalesLedgerWorkbench.tsx`, `lib/branch/ledger-draft-metadata.ts`
- 고칠 방향: 1) components/admin/branch/ledger/rev-matrix-logic.ts - Move weekCellConfidences and its helper uniformConfidence here from ledger-sheet-logic.ts. ledger-sheet-logic already imports rev-matrix-logic, so importing the other way would be circular. Re-export both from ledger-sheet-logic.ts so H1's API stays the same. - Add an optional `today?: string` (KST YYYY-MM-DD) to WeekCellCommitInput. - In mergeWeekCellCommit, when the split is explicit, compute the sheet states from the row's own explicit weeks before the new week goes on top: `sheetStates = foldStates(weekCellConfidences(sheetRow, month, rowWeeks, ledgerMonthBucket(sheetRow, month, input.today)), weekCount)` - Use the fallback chain `p

### R-15 (blocker) Empty week cells of an applied ledger row's own month are editable: on a manual-new row the commit re-sends the entry's weeks as a new-row draft and double counts; on a correction row it makes a draft the server always refuses

- 파일: `components/admin/branch/ledger/rev-matrix-logic.ts`, `components/admin/branch/ledger/ledger-sheet-logic.ts`, `components/admin/branch/ledger/RevMatrix.tsx`, `components/admin/branch/SalesLedgerWorkbench.tsx`
- 고칠 방향: **1. Lock the whole month for 'ledger' (fixes both cases)** - components/admin/branch/ledger/rev-matrix-logic.ts: - Change `isWholeMonthLock` to `kind === "corrected" || kind === "refund" || kind === "ledger"`. - This automatically locks every week in RevMatrixWeekCells (`wholeMonthLocked`). - Keep the 'confirmed' kind value-only, to preserve the 2026-07-20 rule. - components/admin/branch/ledger/ledger-sheet-logic.ts, in `buildSheetWeekCells`: - Compute `const ledgerOwn = matrixCellLockKind(row, month, correctedMonths) === "ledger"`, or pass it in. - Make `lock` = 'locked' for every non-absent week when `ledgerOwn` is true, so `editable` is false. - Then `sheetEditableCells`, `sheetCellEdita

### R-16 (important) A month-level pending draft becomes the start value of every week cell in that month; a confidence key (E/H/C) or Ctrl+D on an empty week silently raises the month

- 파일: `components/admin/branch/SalesLedgerWorkbench.tsx`, `components/admin/branch/ledger/rev-matrix-logic.ts`
- 고칠 방향: 1. **New pure helper** in components/admin/branch/ledger/rev-matrix-logic.ts: `pendingWeekAmount(pending: MatrixPendingDraft, week: number): number | null`. - If pending.weekly exists, return `pending.weekly[week] ?? 0`. - Otherwise, if `pending.week === week`, return `pending.amount`. - Otherwise return null: the draft does not carry this week, either because it is month-level or because it is a single-week draft for another week. - Add `pendingWeekConfidence(pending, week)` with the same rule: the weeklyConfidence slot, else pending.confidence when pending.week === week, else null. - Leave lookupMatrixPending unchanged. It is still the right PATCH target, `existingId`, in buildCellDraftInp

### R-17 (important) F-05 not fully fixed: a lost POST plus a failed reload, then a re-edit of another week, makes the resend create a second draft for the same (deal, month)

- 파일: `components/admin/branch/ledger/useLedgerDraftQueue.ts`
- 고칠 방향: **File:** components/admin/branch/ledger/useLedgerDraftQueue.ts (D-queue package). This is a client-only fix; no server key or migration is needed. 1. **Add a month-level cell key.** Export `draftMonthCellKey(draft: CellKeySource): string | null`. It returns null when the draft is not cell-origin. Otherwise it returns `${kind}|deal:<sourceDealId>|<month>` (or `customer:<name>` for new-row), with no week part. Do not reuse ledgerCellKey with week null: that produces the `|month` key of month-cell drafts. 2. **Extend findPendingCellDraft.** New signature: `findPendingCellDraft(drafts, key, monthKey?: string | null)`. - Keep the exact-key match first. - If none matches and monthKey is given, re

### R-18 (important) F-06 regression: unsent local drafts are now resent from shared browser storage, so two open tabs each POST the same unsent rail draft

- 파일: `components/admin/branch/ledger/useLedgerDraftQueue.ts`
- 고칠 방향: Fix in `components/admin/branch/ledger/useLedgerDraftQueue.ts` (D-queue owns it). Keep resending storage drafts on mount, so the old silent-loss case stays fixed. Make each local id reach the server once across tabs. 1. **Add a "sent" marker in storage.** Use a second key, e.g. `classin:sales-ledger-drafts:sent:v1`, holding `{ [localId]: { serverId, at } }`. Prune entries older than about a day. - In `loadDrafts`, after `resendLocalDraft` succeeds, write `marker[local.id] = resent.id` before or together with the storage write. - Before resending, split the candidates (`mergeDraftsById(localDraftsRef.current, readLocalDrafts())`) into two groups. Drafts whose id alrea

### R-19 (important) After a real 409 on a cell PATCH, the next queued PATCH for the same draft is sent with the server's fresh updatedAt and silently overwrites the other edit

- 파일: `components/admin/branch/ledger/useLedgerDraftQueue.ts`, `components/admin/branch/ledger/ledger-cell-flight.ts`
- 고칠 방향: **1. Hook: components/admin/branch/ledger/useLedgerDraftQueue.ts, `updateDraft`.** After a real 409, refuse every PATCH for the same id that was queued before that 409. Do not resend them with the server's updatedAt. - Add `const conflictEpochRef = useRef(new Map<string, number>())`. - In `updateDraft`, before `runInChain(...)`, capture `const epochAtQueue = conflictEpochRef.current.get(id) ?? 0`. - First thing inside the task: ```ts if ((conflictEpochRef.current.get(id) ?? 0) !== epochAtQueue) { setRecordError(id, DRAFT_CONFLICT_MESSAGE) return { draft: null, conflict: true } } ``` - In the `response.status === 409 && data?.draft` branch, before returning, add `conf

### R-20 (important) Ledger tab left open across midnight: the screen's own month rolls forward, but the server data is never re-read, so the lock never switches on and quarter tiles show the previous quarter

- 파일: `components/admin/branch/SalesLedgerWorkbench.tsx`, `components/admin/branch/ledger/useLedgerDraftQueue.ts`, `components/admin/branch/ledger/LedgerTopBar.tsx`, `components/admin/branch/ledger/ledger-revenue-tiles.ts`
- 고칠 방향: **1. Re-read on a date change** (components/admin/branch/SalesLedgerWorkbench.tsx) - Add an effect keyed on businessToday that skips the first value (keep a ref of the previous date). When the date changes, call `void reloadDrafts({ quiet: true })`, which refreshes sheetWrite.lock. - When the business month or quarter also changed, call `clearBranchRequestCache(); setRefreshKey(v => v + 1)`, so the summary (revenue and dsh_ledger), pipeline and kpi are recomputed by the server for the new period. - Keep the decision in a small pure helper next to the other day helpers in components/admin/branch/ledger/ledger-business-day.ts. For example, `businessDayRollover(prev, next) -> { reloadDrafts: bo

### R-21 (important) KR Team dashboard (/admin/branch) still takes '이번 달' and the FY from the UTC month: on 12/1 from 00:00 to 08:59 KST it opens on November and offers no December

- 파일: `components/admin/branch/BranchDashboardClient.tsx`
- 고칠 방향: **File:** components/admin/branch/BranchDashboardClient.tsx 1. **Replace the "now" conversions.** Import businessYm and fiscalYearOfYm from "@/lib/branch/fiscal" (client-safe, no server-only), and shiftYm from "@/components/admin/branch/ledger/ledger-business-day" (or copy it). Then: - Lines 203-205, 288 and 296: replace `ymKeyUtc(new Date())` with `businessYm()`. - Line 428: compute the current month once, e.g. `const currentYm = businessYm()`, and use it in `buildMonthOptions`. 2. **Rewrite buildMonthOptions to take a KST 'YYYY-MM' string** instead of a Date: - `fy = fiscalYearOfYm(current)` - `previousKey = shiftYm(current, -1)`, using pure YYYY-MM arithmetic. This also fixes the '지난 달' l

### R-22 (important) CRM revenue dashboard: the month window and timestamp bucketing use the server-local clock (UTC on Vercel), so December is missing on the 1st before 09:00 KST and early-morning payments land in the previous month

- 파일: `lib/admin-crm-revenue.ts`
- 고칠 방향: **File: `lib/admin-crm-revenue.ts`. No other file needs to change.** 1. `getMonthKeys(months, now = new Date())`: take the end month from the KST business month, then step back with pure UTC arithmetic. Mirror `recentMonthKeys` in `lib/crm/revenue-performance.ts:49-57` (or export and reuse it): ```ts const [year, month] = businessYm(now).split("-").map(Number) for (let i = months - 1; i >= 0; i -= 1) { const d = new Date(Date.UTC(year, month - 1 - i, 1)) keys.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`) } ``` - Import `businessYm` from `@/lib/branch/fiscal`. - This covers both callers: `createEmptyDashboard` (l.676) and `assembleAdminCrmRevenueDashboard` (l.8

### R-23 (important) F-27 minimal is incomplete: an out-of-FY ?month= opens that FY's grid but loads data from another FY. The ledger-drafts ?fy= support exists but is never sent, and the pipeline ignores &fy=

- 파일: `components/admin/branch/ledger/useLedgerDraftQueue.ts`, `app/api/admin/branch/pipeline/route.ts`, `app/api/admin/branch/ledger-drafts/route.ts`, `components/admin/branch/SalesLedgerWorkbench.tsx`
- 고칠 방향: **1. Send the view fiscal year from the hook.** - File: components/admin/branch/ledger/useLedgerDraftQueue.ts. - Change the signature to `useLedgerDraftQueue(options?: { fiscalYear?: number })`. - Build the GET URL at l.607 as `/api/admin/branch/ledger-drafts?status=all&limit=50${fy ? `&fy=${fy}` : ""}`. This one function serves both the first load and reloadDrafts. - Reload when fiscalYear changes: add it to the load effect's deps and replace ledgerEntries and reversedDraftIds from the response. Keep the open drafts as they are, since they are not scoped by fiscal year. **2. Pass it from the workbench.** - File: components/admin/branch/SalesLedgerWorkbench.tsx. - Call `useLedgerDraftQueue({

### R-24 (minor) Parts of the ledger screen do not re-evaluate read-time confidence on the business-day tick (기관별/매니저별, week projection, DSH cards)

- 파일: `components/admin/branch/ledger/LedgerSimpleView.tsx`, `components/admin/branch/SalesLedgerWorkbench.tsx`, `components/admin/branch/ledger/DshProgressOverview.tsx`, `components/admin/branch/ledger/DshMonthlyPace.tsx`
- 고칠 방향: 1. components/admin/branch/ledger/LedgerSimpleView.tsx - Add `today?: string` (KST YYYY-MM-DD) to LedgerSimpleViewProps and pass it down to DealTable and ManagerTable. - l.241: `buildSimpleLedger(rows, columns, groupBy, today)` with deps `[rows, columns, groupBy, today]`. - l.383: `buildManagerRollup(rows, months, currentMonth, managerGoals, today)` and add `today` to the deps. - l.512: `buildSimpleLedger(shown, buildSimpleColumns(months, currentMonth), "none", today)` with deps `[shown, months, currentMonth, today]`. 2. components/admin/branch/SalesLedgerWorkbench.tsx - Add `today: businessToday` to ledgerSimpleProps (l.3403). This covers both the 건별 fold (view="none") and the 기관별/매니저별 view

### R-25 (minor) Confirmed-month lock ignores read-time promotion: a red week that becomes 확정 after the lock date stays unlocked and editable

- 파일: `components/admin/branch/ledger/rev-matrix-logic.ts`, `components/admin/branch/ledger/ledger-sheet-logic.ts`
- 고칠 방향: **1. Canon helper** in lib/branch/computations/rev-confirmed.ts (owner: C). Export a pure helper next to effectiveConfirmed: `revMonthHasStartedRed(d: RevConfidenceSource, ym: string, today?: string): boolean` - Return true when d.monthly_red?.[ym] is true. - Otherwise return true when monthAmount(d.monthly_confirmed, ym) != null and pendingCellsForMonth(d.raw, ym) has a cell with cell.start <= resolveRevReadDate(today).date. - Otherwise return false. **2. Lock rule** in components/admin/branch/ledger/rev-matrix-logic.ts (owner: H2). - Add an optional `today?: string` (KST 'YYYY-MM-DD') to matrixCellLockKind, isMatrixCellLocked, isMatrixCellEditable and isDraftFormTargetLocked. - Replace `if

### R-26 (minor) Insights pacing takes the quarter from UTC on the raw now while the month and FY are KST

- 파일: `lib/branch/insights/runner.ts`, `lib/branch/computations/pacing.ts`, `lib/branch/insights/input-builder.ts`
- 고칠 방향: Fix the quarter pickers, not runner.ts. The runner must keep the real `now`, because `readLedgerRevenueDeals`, `applyLedgerStatusToDsh` (lock state and read date), `buildBranchWeeklyCompassReport` and the 30-day windows in input-builder (l.369, 420, 444) use it. Change these four files: 1. **lib/branch/computations/pacing.ts:9:** replace `fiscalQuarter(now.getUTCMonth() + 1)` with `businessQuarter(now)` from `@/lib/branch/fiscal`. The KPI route and core-kpi already pass a KST-day-at-UTC-midnight date, and `businessQuarter` of that date returns the same quarter, so their results do not change. 2. **lib/branch/insights/input-builder.ts:** use `businessQuarter(now)` / `businessQuarter(a.now)` a

### R-27 (important) sales-counts reads the REV mirror without raw and without ledger entries, so confirmed-customer counts freeze at the 11/30 classification after the lock

- 파일: `app/api/admin/branch/sales-counts/route.ts`, `lib/branch/sales-counts.ts`
- 고칠 방향: 1. **`app/api/admin/branch/sales-counts/route.ts`:** replace `listBranchRevDeals()` with `readLedgerRevenueDeals({ fiscalYear: fyOf(now), now })` from `@/lib/branch/ledger-revenue`, and pass `.deals` to `countBranchCustomers`. Keep `readBoards` in the same `Promise.all`. - That reader takes the active import, or else the mirror read with `withRaw: true`, and adds the ledger overlay. - It throws when REV fails to load, which keeps today's 500 path. When the ledger fails to load, it falls back to sheet-only. - Leave the existing team and manager filter inside `countBranchCustomers`, or switch to `scopeLedgerRevenueDeals`. Either works because both use `branchManagerMatches`. - Ledger deals car

### R-28 (important) If the ledger can't be read, DSH 실적 for 12월+ quietly drops every ledger entry but is still labelled '장부 확정' (no banner). The KPI route has the same gap.

- 파일: `lib/branch/summary-payload.ts`, `lib/branch/ledger-revenue.ts`, `app/api/admin/branch/kpi/route.ts`, `lib/branch/dsh-ledger.ts`
- 고칠 방향: 1. lib/branch/dsh-ledger.ts: - Add `ledgerReadable?: boolean` to ApplyLedgerStatusToDshParams, and optionally `truncated?: boolean`. - After the `isRevSheetLockActive` check, if `params.ledgerReadable === false`, return `{ dsh: params.dsh, info: { lockedAt: lock.lockedAt, lockMonth: lock.lockMonth, ledgerMonths: [], error: DSH_LEDGER_STATUS_FAILED } }` and log console.error. Keep the same dsh reference and do not call the loader. - The existing client banner (dshLedgerErrorMessage) then fires, and isDshLedgerActive turns the 장부 labels off. - Optionally add `entriesTruncated?: boolean` to BranchDshLedgerInfo (lib/branch/computations/dsh-ledger-status.ts) when truncated is true, plus design-3'

### R-29 (minor) DSH 실적 and the 확정 tile use two different 'confirmed' formulas, so Team KR's month can differ from the tile for the same month and scope

- 파일: `lib/branch/computations/dsh-ledger-status.ts`, `lib/branch/computations/core-kpi.ts`, `lib/branch/computations/pipeline.ts`, `lib/branch/computations/revenue-core.ts`
- 고칠 방향: **Root fix (recommended): make the bucket never change 확정, so `bucket.confirmed` always equals the canon.** In lib/branch/computations/revenue-core.ts, `ledgerMonthBucket`, inside the `if (total > 0 && open < 0)` branch: fold the whole negative open into high (`high += open; open = 0`) instead of taking it from positive high and then `confirmed -= deficit`. - The total is unchanged. - There is still no negative 예정 in a positive month, so F-15 still holds. - If confirmed < 0 and high > 0, high stays ≥ 0, because h = total − c − e > |e|. - If high < 0, high just becomes more negative. That shape already exists today (high −10,000 in the probe). After this change: - The

### R-30 (minor) No route-level test runs the real D4 splice under the lock: both summary and kpi route tests mock applyLedgerStatusToDsh

- 파일: `tests/api/admin-branch-summary-ledger-revenue.test.ts`, `tests/api/branch-kpi-route-ledger.test.ts`
- 고칠 방향: **What to add:** a new file `tests/api/branch-dsh-ledger-routes.test.ts`, promoted from `/tmp/claude-0/-home-user-classinkr-web/1b53e187-7c44-5e23-b649-dc588a1c439c/scratchpad/prelock/review/dsh-skeptic1-routetest/route.probe.test.ts`. Do not mock `@/lib/branch/dsh-ledger`. **Mock only these:** - `admin-auth`, `next/cache` (`unstable_cache` as identity) and `google-sheets` - `read-dsh-kpi` (`readDshPreferDbWithSource` and `readDshPreferDb` returning `dshFixture()`) - `read-rev-deals` (returning `snapshotDeals()`) - `branch-sales-ledger-drafts` (`listBranchSalesLedgerEntries` → `decemberEntries()`, with reversed → []) - `branch-sales-ledger-sheet-writes`, `branch-sync`, `public-events`, `camp

### R-31 (blocker) The 12/1 snapshot re-read stores a red refund in a later week twice. 확정 then reads too low from that week to FY end, the 12/1 reconcile says 같음, and later runs blame '동기화 뒤 시트 변경'

- 파일: `lib/repositories/sales-ledger-rev-import.ts`, `lib/branch/computations/rev-confirmed.ts`, `lib/branch/reconcile/rev-ledger-reconcile.ts`, `tests/branch/reconcile/rev-ledger-reconcile.test.ts`
- 고칠 방향: 1. **lib/repositories/sales-ledger-rev-import.ts, revImportEntriesForDeal.** - For a coloured month that has raw.pendingCells (use readRevPendingCells(deal.raw)?.[month]), store the parser maps as they are, signed and unclamped, so mapRevLineToDeal rebuilds the mirror's maps exactly: - confirmed = toNumber(deal.monthly_confirmed?.[month] ?? 0), always emitted (an explicit 0 included) - high_confidence = deal.monthly_high_conf?.[month], emitted only when that key exists - expected = amount − confirmed − high, emitted when ≠ 0; it may be negative - The read-time canon then clamps and folds once, the same way it does on the mirror. - Keep the current splitMonthConfidence path for months without

