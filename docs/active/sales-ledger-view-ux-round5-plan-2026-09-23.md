# 매출 장부·매출시트 뷰별 사용성 디벨롭 — 입출력·데이터 싱크 (라운드 5)

상태: 사용성 평가 완료 · 기획 확정 · 이번 라운드 구현 완료(2026-09-23) — 항목별 상태·근거는 §5 표가 정본, 6라운드로 넘긴 것은 §5.1
범위: `/admin/branch/ledger`(매출 장부)의 4개 뷰(DSH·REV·보드·콕핏)와 모바일·우측 레일(상세·입력·체크 큐),
`/admin/crm/deals/rev-sheet`(매출시트), 두 화면이 함께 쓰는 REV 동기화
목표: 각 뷰가 이미 잘하는 일을 더 잘하게 만든다 — **값이 틀리지 않게(정합) → 넣고 꺼내기 쉽게(입출력) → 손이 덜 가게(마이크로 편의)** 순서.

정본 관계: 제품 정의는 [매출 장부 PRD](sales-ledger-productization-prd-2026-06-30.md), 직전 라운드는
[입력 속도·편의 기획(라운드 4)](sales-ledger-input-speed-plan-2026-09-20.md)이다. 라운드 4의 미완 항목(P1-4·P2-8·P2-9,
보드 카드 인라인 편집)은 이 문서 §5·§6으로 이어받고, P2-10(매출시트 → 장부 딥링크)은 이번 라운드 B3에 포함한다.
동기화 결과 계약·즉시 만료는 승인된 설계 [크론 정리와 동기화 즉시 반영 §7](../superpowers/specs/2026-09-14-vercel-pro-cron-freshness-design.md)을
장부 영역(REV 시트 동기화)만큼 구현한다. 화면·데이터 작업 규칙은 [Classin KR Team 스킬](../../.codex/skills/classin-kr-team/SKILL.md)을 따른다.

---

## 0. 범위 — "매출시트 탭"이 가리키는 두 화면

| 화면 | 경로 | 역할 | 이번 라운드에서 |
| --- | --- | --- | --- |
| 매출 장부 | `/admin/branch/ledger` | 수치 **입력·검수·마감** 작업면. 뷰 4개(DSH·REV·보드·콕핏) + 레일 | 정합 결함 수리, 출력 신설, 뷰별 입력 동선 |
| 매출시트 | `/admin/crm/deals/rev-sheet` | REV 매칭·검수 **읽기** 표면(CRM-1 결정) | 기준 시각·동기화 결과 표시, 장부 입력 딥링크, 필터 URL, CSV |
| REV 동기화 | `POST /api/admin/branch/sync` | 두 화면의 "동기화" 버튼이 같은 API를 부른다 | 결과 계약(완료·이미 실행 중·일부·실패) + 즉시 만료 |

두 화면의 역할 분리(매출시트 = 읽기, 입력은 장부)는 그대로 둔다. 매출시트에 금액 입력을 붙이지 않고, 입력이 필요한 행은 장부의 해당 행으로 **한 번에** 보낸다.

---

## 1. 평가 방법

- **코드 기반 휴리스틱 평가.** 운영 mutation(동기화·마감·임포트)을 브라우저에서 실행하지 않는다는 규칙 때문에 실측 대신
  코드 판독으로 했다. 영역 5개(REV·DSH·보드/콕핏·레일/큐/모바일·동기화/매출시트)를 병렬로 판독해 **76건**을 찾았고,
  심각도 높음과 데이터 정합 항목은 전부 코드로 다시 확인했다(§3의 "재검증" 열).
- **판단 기준 — UI UX Pro Max(v2.13.0).** 저장소에 없는 스킬이라 공개 사본을 받아 조회했다. 이번 평가에 적용한 규칙:

  | 규칙(스킬 ID) | 이 화면에서 본 것 |
  | --- | --- |
  | `export-option`(Charts & Data) — 데이터 중심 제품은 CSV 내보내기 | 붙여넣기(입력)만 있고 복사·내보내기(출력)가 전무 |
  | `deep-linking`·`state-preservation`(Navigation) — URL이 상태를 반영, 돌아오면 필터·위치 복원 | 페이지 번호 복원 실패, DSH 상태·매출시트 필터 URL 없음 |
  | `submit-feedback`·`loading-buttons`·`error-recovery`(Forms & Feedback) | 동기화 "이미 실행 중"을 완료로 표시 |
  | `toast-accessibility`·`toast-dismiss` — 포커스 뺏지 않기, aria-live polite, 3~5초 | 정보 토스트가 role=alert, 레일 아래로 깔림 |
  | `dragging-alternative`·`keyboard-nav`(Accessibility) | 보드 카드 이동은 드래그 대신 레일 입력으로 |
  | `focus-not-obscured` — 오버레이가 포커스된 컨트롤을 가리지 않기 | 레일·토스트가 매트릭스 우측 열을 덮음 |
  | `redundant-entry` — 이미 입력한 정보 재사용 | 레일 프리필(월 금액·확도)이 틀려 재입력 유발 |
  | `empty-states`·`Loading Indicators`(High) — 빈 상태와 오류·로딩 구분 | DSH·보드·콕핏에서 조회 실패가 "데이터 없음"으로 보임 |
  | `number-formatting`·`tooltip-on-interact` — 정확값 확인 | 셀·편집 바·붙여넣기 프리뷰가 전부 만 단위 반올림 |

  검색 결과가 주제와 맞지 않은 질의("export data table", "stale data sync status", Next.js URL 상태)는 스킬 규약대로
  "매치 없음"으로 두고, 위의 빠른 참조 규칙과 저장소 기존 규약(시트 신선도 판정 등)으로 대신했다. 색·타이포는 스킬의
  추천 팔레트가 아니라 [DESIGN.md](../../DESIGN.md)가 정본이다(새 색·토큰 없음).
- **기존 결정 준수.** 라운드 2 §4(매트릭스 형태 문법 NO-GO, 콕핏 전용 라우트 NO-GO), 라운드 4 §8.6·§9(2단 게이트 유지,
  새 저장 경로 금지, 그리드 모바일 이식 금지)와 충돌하는 제안은 채택하지 않았다.

---

## 2. 뷰별 장점·특징 — 무엇을 가장 잘하는 뷰인가

뷰마다 하는 일이 다르다. 모든 뷰에 같은 기능을 붙이면 뷰를 나눈 이유가 사라지므로, **그 뷰가 이미 잘하는 일을 더
잘하게** 만드는 것만 넣는다.

| 뷰 | 한 줄 역할 | 이미 잘하는 것 | 이번에 키우는 방향 | 넣지 않는 것 |
| --- | --- | --- | --- | --- |
| **DSH** | 목표 대비 "얼마나 왔나"를 읽는 보고 뷰 | 3중 계상 차단(`dedupeDshByKind`), 합산 달성률, 남은 목표→월평균 필요액, 팀→멤버 분해, 주간 비교 | 읽은 숫자를 **그대로 가져가기**(TSV 복사), 숫자에서 **원인 행으로 한 번에**(멤버·월 딥링크), 주간 비교의 정직한 로딩·실패 | 금액 입력 |
| **REV** | 시트와 같은 모양의 숫자 밀도 표 | 4방향 고정 12개월 매트릭스, 엑셀식 키보드(Enter/Tab/Ctrl+D/E·H·C), TSV 붙여넣기 프리뷰 | "시트처럼 치고 → 확인하고 → 꺼내는" 루프 닫기: 입력한 값이 셀에 보임, 원 단위 정확값, CSV·Ctrl+C, 검색→격자 진입 | 셀 형태 문법(점선), 그리드 모바일 이식 |
| **보드** | 주차 칸반 — 주차별 현금 흐름·미배정 리스크 검토 | 주차 6칸, 칼럼 합계·확도 스택바, 추정·DB 표식 | 카드에서 **바로 입력**(클릭 1회), 대기 초안이 카드에 보임 | 드래그 이동(키보드 대안·병합 기준 위험 — §7) |
| **콕핏** | 딜 한 건씩 순회하며 주차 단위로 갱신 | 좌 목록 + 우 주차 편집기, 확도 일괄, "전액을 Wn 주에" | **순회 속도**(저장 후 다음 딜), 월 일관성, 편집 상태 격리 | 전용 라우트 |
| **모바일** | 조회 + 금액 탭 입력 | 44px 금액 버튼 → 입력 직행, 바텀시트 | 금액 정확성(빈 달은 "—"), 오프리필 제거 | 매트릭스 그리드 |
| **레일·큐** | 맥락을 유지한 입력과 감사 추적 | 저장 전 잠금 검사, 표기 흔들림 경고, 자가 체크 배지, 일괄 적용 확인 | 대기 초안 **전량** 관리(50건 상한 제거), 올바른 프리필, 편집 대상 격리 | 2단 게이트 폐기 |
| **매출시트** | REV 매칭 상태 검수(읽기) | 확정·임박·예정·전환 대기 분해, 매칭 인박스 핸드오프 | 기준 시각, 동기화 결과의 정직한 표시, **장부 입력 딥링크**, 필터 URL, CSV | 금액 입력 |

---

## 3. 평가 결과 요약

### 3.1 뷰별 점검표

상=문제없음, 중=쓸 수 있으나 마찰, 하=결함 또는 기능 부재.

| 뷰 | 진입 | 입력 | 출력 | 피드백 | 상태 보존 | 정합 |
| --- | --- | --- | --- | --- | --- | --- |
| DSH | 상 | —(읽기) | 하 | 중(실패=빈 상태) | 하(URL 없음) | 중(주간 비교 잔존 결과) |
| REV | 중(검색→격자 경로 없음) | 중(입력값 안 보임) | 하 | 중(토스트 겹침) | 중(페이지 복원 실패) | 하(주차 연속 편집 유실·붙여넣기 범위) |
| 보드 | 중(상세 먼저) | 하(입력 2단계) | 중 | 하(대기 초안 안 보임) | 중 | 중 |
| 콕핏 | 상 | 중 | —(편집 전용) | 중 | 중 | 하(중복 판정 범위·편집 누수·월 불일치) |
| 모바일 | 상 | 중 | — | 중 | 중 | 하(빈 달 금액 오표시) |
| 레일·큐 | 중 | 중(대상 안 보임) | — | 중 | 하(큐 필터 초기화) | 하(50건 상한·프리필) |
| 매출시트 | 중 | —(읽기) | 하 | 하("이미 실행 중"을 완료로) | 하(URL 없음) | 중(배너 정의 불일치) |

### 3.2 재검증한 정합 결함 — 이번 라운드 최우선

| ID | 결함 | 근거(코드) | 영향 |
| --- | --- | --- | --- |
| Q-1 | 초안 목록이 **최근 50건**만 로드·보관(`status=all&limit=50`, 상태 갱신마다 `slice(0, 50)`) | `useLedgerDraftQueue.ts` `loadDrafts`·`createDraft`·`persistDraftsBatch` | 큰 붙여넣기(최대 600칸) 뒤 50건 밖 대기 초안이 큐·일괄 적용·셀 대기 표시에서 사라지고, 그 셀을 다시 고치면 PATCH 대신 새 초안 → **이중 계상 위험** |
| K-1 | 레일·콕핏 저장의 이중 계상 판정이 **REV 현재 페이지·펼친 행**만 본다 | `saveDraft` → `railDedupTarget(pendingByCell…)`, `pendingByCell`은 `visibleDealRows` 파생 | 콕핏·보드에서 다른 페이지·접힌 품목의 딜을 다시 저장하면 같은 딜·월에 초안이 쌓임 |
| R-W | 주차 칸을 **연속 편집하면 앞 편집이 사라진다** | `buildCellDraftInput` 주차 병합 기준이 대기 초안이 아니라 행 표시값(`rowWeeklySplit(row)`) | W1=150 입력 후 W2 입력 시 W1이 시트 원값으로 되돌아간 채 같은 초안에 PATCH |
| R-1 | 붙여넣기 이름 매칭이 **현재 페이지의 펼친 행**만 대상 | `buildMatrixPastePlan(…, visibleDealRows, …)` by-name 분기 | 다른 페이지 고객이 "시트에 없는 고객"으로 분류 → 새 행 초안(중복 고객 행) |
| K-2 | **초안 편집 상태가 다른 딜로 샌다** | `buildDraftInput`이 편집 중 초안보다 선택 행(`selectedRow`)을 우선, `loadDealDetail`이 편집 상태를 안 지움 | 큐에서 초안 X를 편집하다 딜 B를 누르고 저장하면 X가 딜 B로 재지정돼 덮어써짐 |
| Q-2 | 빈 달 입력 시 금액이 **기간 합계(`row.revenue`)로 프리필** | `loadDealDetail`의 `amount: row.revenue`, 상세 응답 폴백 `?? row.revenue`, 모바일 카드 `monthAmount \|\| row.revenue` | 사용자가 모르고 저장하면 틀린 금액 초안 |
| Q-4·K-3 | 시트 행 확도 프리필이 항상 "예정", 콕핏은 저장된 **주차별 확도**를 월 확도로 덮어씀 | `loadDealDetail`의 `draftConfidenceFromMetadata(undefined)`, `onSelectCockpitDeal`의 `defaultDraftWeeklyConfidence(tone)` | 금액만 고쳐 저장해도 확도가 강등 |
| R-4 | URL `p`(페이지) 복원이 마운트 직후 1로 덮어써짐 | 복원 effect 뒤 페이지 리셋 effect가 무조건 실행 | 3페이지 검수 중 새로고침·공유 링크가 항상 1페이지 |
| S-1 | 동기화 **잠금 응답(`skipped`, HTTP 200)을 성공처럼** 처리 | 장부 `onRefresh`는 무표시, 매출시트는 "완료했습니다" 문구 | 다른 동기화가 도는 중인데 끝난 줄 앎 |
| S-2 | 동기화 직후 첫 조회가 **옛 값**일 수 있음 | 동기화 라우트의 `revalidateTag(tag, "max")`(stale-while-revalidate) | 동기화 버튼을 다시 누르게 됨(설계 §1.3과 동일 진단) |
| D-6 | 주간 비교가 실패하면 **이전 쌍의 결과가 남는다** | `loadWeeklyCloseDiff` 실패 경로가 `wcDiff`를 그대로 둠 | 다른 기준의 증감을 지금 비교로 오독 |

### 3.3 발견 전체 목록

심각도: 상·중·하. "라운드" 열: **5** = 이번 라운드, **6** = 다음 라운드 후보, **—** = 채택 안 함.

**동기화·매출시트 (S)**

| ID | 심각도 | 현상 | 제안 | 라운드 |
| --- | --- | --- | --- | --- |
| S-1 | 상 | 잠금 응답을 성공처럼 표시 | 결과 계약 `outcome` + `describeSyncOutcome`로 "이미 동기화 중(N분 전 시작)" 안내 | 5 |
| S-2 | 상 | 동기화 직후 첫 조회가 옛 값 | `revalidateTag(tag, { expire: 0 })` 묶음 만료(`lib/server/sync-cache-tags.ts`) | 5 |
| S-3 | 중 | REV 범위 상한 경고가 두 화면 모두에서 버려짐 | 응답 `warnings`를 경고 톤으로 표시 | 5 |
| S-4 | 중 | 재캡처 실패 경고가 누른 세션에만 남음 | 장부 "REV 원천" 칸에 `isImportStale` 배지 | 6(§5.1 — 오탐 위험으로 이관) |
| S-5 | 중 | 비관리자에게 "동기화"가 사실상 재조회뿐, 매출시트는 403 노출 | 장부 라벨 "다시 불러오기", 매출시트 동기화·매칭 버튼은 관리자에게만 | 5 |
| S-6 | 중 | 매출시트에 화면 기준 시각·신선도 없음 | 제목 아래 "시트 동기화 N분 전 기준", 26시간 초과 경고 | 5 |
| S-7 | 중 | "이중 진실" 배너가 정정(대체값)까지 전 기간 합산 — 장부의 "장부 가감"과 정의가 다름 | "신규 N건·정정 M건"으로 나누고 금액은 신규만, 장부 링크에 `origin=draft` | 5 |
| S-8 | 중 | 두 화면의 "확정" 금액 기준 차이가 안 적혀 있음 | 매출시트 타일 설명에 "시트 전 월(FY)·미러 기준" 명시 | 5 |
| S-9 | 중 | 매출시트 행 → 장부 링크 없음(P2-10), 필터 URL·CSV 없음 | B3 | 5 |
| S-10 | 중 | REV만 돈 수동 동기화도 source `all`로 기록 → HW 연속 실패 일수가 리셋될 수 있음 | 런 기록에 실제로 돈 소스 저장 | 6 |
| S-11 | 하 | "매일 17:38(KST)" 하드코딩(실제 `0 8 * * *` = 17:00) | 스케줄 상수 한 곳 + vercel.json 대조 테스트 | 5 |
| S-12 | 하 | 안내 문구 "새로고침" vs 버튼 이름 "동기화" | 문구 통일 | 5 |
| S-13 | 하 | 탭 복귀·장시간 방치 시 재조회 없음 | 탭 복귀 시 30분 경과면 요약만 재조회 | 6 |
| S-14 | 하 | 진행 경과·쿨다운 없음 | 경과 초 표시 | 6 |
| S-15 | 하 | "시트수정" 비교가 HW 시트 편집·실패 시도까지 섞음 | 대시보드 시트·마지막 성공 기준 비교 | 6 |
| S-16 | 하 | 요청 실패 후 옛 캐시 대체를 표시 안 함 | "갱신 실패 — N분 전 데이터" 문구 재사용 | 6 |

**REV (R)**

| ID | 심각도 | 현상 | 제안 | 라운드 |
| --- | --- | --- | --- | --- |
| R-W | 상 | 주차 연속 편집 시 앞 편집 유실(§3.2) | 병합 기준을 같은 달 대기 초안의 주차 배열로 | 5 |
| R-1 | 상 | 붙여넣기 이름 매칭 범위가 현재 페이지(§3.2) | 전체 행 기준 매칭, 화면 밖 고객은 "페이지·필터 밖(건너뜀)"으로 분리 | 5 |
| R-2 | 상 | 방금 입력한 값이 셀에 안 보임(초안 금액은 title에만) | 대기 초안이 있으면 셀에 초안 금액 표시(확도색·밑줄 유지), title "장부 → 초안" | 5 (결정 E1) |
| R-3 | 중 | 선택 상태 Tab 미처리, 편집 가능 셀 전부 탭 정지 | 로빙 tabIndex + 선택 상태 Tab 좌우 | 6 |
| R-4 | 중 | 페이지 복원 실패(§3.2) | 복원 기준 시그니처와 비교해 실제 변경 시에만 1페이지 | 5 |
| R-5 | 중 | 새로고침·팀/기간 전환 시 매트릭스가 로딩 패널로 통째 교체(스크롤 소실) | 직전 데이터 유지 + "갱신 중" 표시 | 5 |
| R-6 | 중 | 다품목 고객은 그룹·품목 두 번 펼쳐야 편집 | "품목까지 펼치기" | 6 |
| R-7 | 중 | 검색 후 격자로 들어가는 키보드 경로 없음 | 검색창 Enter/↓ → 첫 결과 행의 선택 월 셀 | 5 |
| R-8 | 중 | 정확 금액 확인 불가(전부 만 단위 반올림) | 셀 title·편집 바에 원 단위 정수 | 5 |
| R-9 | 중 | 실행 취소 토스트 누적·정보 토스트가 role=alert | 정보는 role=status, 오류만 alert | 5 |
| R-10 | 중 | 출력 경로 없음 | B1(CSV·Ctrl+C) | 5 |
| R-11 | 하 | 페이지 넘겨도 스크롤·선택 잔존, 월만 바꿔도 1페이지 | 페이지 변경 시 선택 해제·스크롤 맨 위 | 6 |
| R-12 | 하 | 값 있는 셀을 비우고 Enter → 0 전송 → 서버 400 | 클라이언트 선차단 + 감액 경로 안내 | 5 |
| R-13 | 하 | 1칸 붙여넣기도 모달 프리뷰 | 편집 상태로 들어가 값만 채움 | 5 |
| R-14 | 하 | 잠긴 셀은 Enter에 무반응 | Enter → 레일 입력(정정)으로 | 5 |
| R-15 | 하 | 그룹행 이름 title 없음, 모바일 페이저·상품군 버튼 44px 미달 | title·`min-h-11 md:min-h-*` | 6 |
| R-16 | 하 | 주차 칸 앵커 붙여넣기가 여전히 막혀 있음(라운드 4 P1-5의 하위 항목, 문서는 "완료") | 주차 병합 기준(R-W) 수리 뒤 주차 앵커 허용 | 6 |

**DSH (D)**

| ID | 심각도 | 현상 | 제안 | 라운드 |
| --- | --- | --- | --- | --- |
| D-1 | 상 | 복사·내보내기 전무 | B2(카드별 TSV 복사) | 5 |
| D-2 | 상 | DSH 보기 상태가 URL에 없음 | `dv`(수치 그리드 보기) 등 URL 보존 | 6 |
| D-3 | 중 | 주간 비교 월은 기간 M일 때만 바꿀 수 있음 | 주간 비교 카드 안 월 선택 | 5 |
| D-4 | 중 | 스냅샷 라벨에 요일·자동/수동 없음 | "9/19(금) 23:30 · 자동" | 6 |
| D-5 | 중 | "지금 스냅샷"이 VIEWER에게도 켜짐(POST는 403) | 권한 게이트 + 사유 title | 6 |
| D-6 | 중 | 비교 실패 시 이전 결과 잔존(§3.2) | 요청 시작 시 결과 비움, 실패 시 오류만 | 5 |
| D-7 | 중 | 조회 실패가 "데이터 없음"으로 보임 | 카드에 오류 문구 분리 | 6 |
| D-8 | 중 | DSH는 전사 고정인데 팀·기간 토글 때 카드가 깜빡임 | D1(직전 데이터 유지)과 함께 | 5 |
| D-9 | 중 | REV 링크가 팀만 넘김, 멤버·월 링크 없음 | 멤버 행 `mgr=`, 월 헤더 `period=M&month=` | 5 |
| D-10 | 하 | "단위: 천"에 ¥ 없음 등 표기 불일치 | "(단위: ¥천)" | 5 |
| D-11 | 하 | `formatDshThousands(-400)` → 빨간 "-0" | `-0` 제거 | 5 |
| D-12 | 하 | 진행 중 월·분기를 경과율 없이 70% 기준으로 빨강 | "경과 N%" 텍스트 | 6 |
| D-13 | 하 | 주간 비교 select 포커스 링 없음, "今" 표기 | focus-visible 링, "당월" | 5 |

**보드·콕핏 (B·K)**

| ID | 심각도 | 현상 | 제안 | 라운드 |
| --- | --- | --- | --- | --- |
| B-1 | 중 | 카드 클릭 → 상세만, 입력은 한 번 더 | `openQuickInputForRow`로 입력 직행 | 5 |
| B-2 | 중 | 입력 직행해도 주차 모드 행은 자동 포커스 없음 | 주차 그리드 첫 칸 포커스 | 6 |
| B-3 | 중 | "월합계만" 카드의 주차 배정이 4단계 | 주차 모드로 열기 | 6 |
| B-4 | 상 | 보드·콕핏은 REV 필터가 적용된 행인데 필터 표시·해제 UI가 없음 | 필터 적용 요약 줄 + "필터 초기화" | 5 |
| B-5 | 중 | 로딩·오류가 "행 없음"으로 보임 | REV의 로딩/재시도 문구 공용 | 5 |
| B-6 | 중 | 대기 초안이 카드·목록에 안 보임 | 확도색 대기 점(매트릭스 §8.3 C와 같은 문법) | 5 |
| B-7 | 하 | 칼럼별 확도 분해 없음 | `ConfidenceStackBar` 재사용 | 6 |
| B-8 | 하 | 포커스·선택이 같은 링, 월 탭 방향키 없음 | 로빙 탭 재사용 | 6 |
| K-1 | 상 | 이중 계상 판정 범위(§3.2) | 선택 행 기준으로 판정 | 5 |
| K-2 | 상 | 편집 상태 누수(§3.2) | 편집 초안의 딜 우선 + 딜 전환 시 편집 해제 | 5 |
| K-3 | 중 | 주차별 확도 덮어씀(§3.2) | 저장된 주차별 확도가 없을 때만 월 확도로 시드 | 5 |
| K-4 | 중 | 목록 월과 편집기 월이 따로 놂 → 다른 달 주차값 저장 가능 | 월이 바뀌면 선택 딜을 그 월 기준으로 다시 불러옴 | 5 |
| K-5 | 중 | 저장 안 한 변경 보호 없음 | 확인창 | 6 |
| K-6 | 중 | 목록 Tab 정지 과다, 저장 후 다음 딜 없음 | "저장 후 다음 ↓" | 5 |
| K-7 | 하 | "새 딜" 이름이 두 동작에 쓰임 | 편집기 버튼 "별도 신규로 저장" | 6 |
| K-8 | 하 | 딜을 바꿔도 이전 저장 메시지 잔존 | 딜별 `key` | 5 |
| K-9 | 하 | 행마다 pill 2개 등 라벨 과다(DESIGN 어드민 단순화 위반) | 선·글자색으로 | 6 |

**레일·큐·모바일 (Q)**

| ID | 심각도 | 현상 | 제안 | 라운드 |
| --- | --- | --- | --- | --- |
| Q-1 | 상 | 초안 50건 상한(§3.2) | 열린 초안(draft·checked)은 별도 조회로 전량(최대 600) + 최근 이력 50 | 5 |
| Q-2 | 상 | 빈 달 금액 오프리필(§3.2) | `rowMonthAmount(row, 폼 월)`, 모바일 0원은 "—" | 5 |
| Q-3 | 상 | 입력 탭에 대상 행이 안 보임 | 폼 상단 "대상: 고객·시트 N행·월 ×" | 5 |
| Q-4 | 중 | 시트 행 확도 프리필 "예정" 고정(§3.2) | 시트 색 기준 확도 시드를 공용화 | 5 |
| Q-5 | 중 | 저장 후 폼 전체 리셋, 연속 입력 없음 | 신규 저장 후 고객·담당·팀 유지하는 "연속 입력" | 6 |
| Q-6 | 중 | 빈 폼을 열자마자 빨간 오류 | 제출 시도·blur 이후에만 | 6 |
| Q-7 | 중 | 큐에서 편집→저장하면 빈 입력 폼에 남음 | 저장 성공 시 큐로 복귀 | 5 |
| Q-8 | 중 | 자가 체크 초안 편집 불가 사유 안내 없음 | 비활성 사유 title | 5 |
| Q-9 | 중 | 큐 카드에 입력자·시각 없음, "내 것" 필터 없음 | 입력자·시각 표시 | 5(표시만) |
| Q-10 | 중 | 일괄 처리 실패 항목 특정 불가 | 실패 id별 오류 배지 | 6 |
| Q-11 | 하 | 단건 적용 확인 문구가 되돌리기와 모순 | "적용 뒤 취소는 되돌리기(상쇄)로" | 5 |
| Q-12 | 중 | 레일 Esc 없음, 닫을 때 포커스 유실 | Esc로 닫기 | 6 |
| Q-13 | 중 | 바텀시트 스크롤 전파·고정 버튼 없음, 터치 타깃 미달 | `overscroll-contain`, sticky 저장 줄 | 6 |
| Q-14 | 중 | 토스트가 레일 아래로 깔림, 오류 토스트도 7초 후 사라짐 | 토스트 z-index를 레일 위로, 오류는 수동 닫기 | 5 |
| Q-15 | 하 | 붙여넣기 성공 토스트에 "큐 열기" 없음 등 | 토스트 액션 "큐 열기" | 5 |

---

## 4. 설계 메모 — 이번 라운드 핵심 항목

### 4.1 동기화 결과 계약과 즉시 만료 (S-1·S-2·S-3·S-5)

승인된 설계 §7.1~7.3을 **REV 시트 동기화 한 경로**에만 적용한다(NEO·채널톡·Meta 등 다른 동기화 버튼은 그 설계의 나머지 범위로 남긴다).

- 서버: `lib/server/sync-cache-tags.ts`의 `branchRev`·`branchHw` 묶음을 `revalidateTag(tag, { expire: 0 })`로 만료한다.
  데이터를 쓴 소스의 묶음만, 건너뜀(잠김)이면 만료하지 않는다. 응답에 `outcome`(`done`·`running`·`partial`·`failed`)과
  잠금을 잡은 실행의 `startedAt`을 더한다. 기존 필드·HTTP 상태 코드는 그대로.
- 클라이언트: 순수 모듈 `lib/admin/sync-outcome.ts`의 `describeSyncOutcome(result)` → `{ tone, message }`. 장부와 매출시트가
  같은 함수로 알린다. **완료가 아니면 "완료" 문구를 띄우지 않는다.**
- 권한: 동기화 POST는 ADMIN·SUPER_ADMIN만 통과한다. 장부는 이미 비관리자에게 재조회만 하므로 버튼 라벨을 "다시 불러오기"로
  정직하게 바꾸고, 매출시트는 같은 판정(`canRunAdminOperationsFromSession`)으로 동기화·매칭 버튼을 숨긴다.

### 4.2 대기 초안 전량 관리 (Q-1)

- API: `GET /api/admin/branch/ledger-drafts?status=all&limit=50&open=600` — `open`이 있으면 열린 초안(draft·checked)을
  별도 조회(최대 1,000)해 최근 이력과 id로 합친다. 붙여넣기 상한(600칸)과 같은 값을 기본으로 쓴다.
- 클라이언트: 상태 갱신마다 하던 `slice(0, 50)`을 "열린 초안은 전부 + 닫힌 초안(적용·취소)은 최근 50"으로 바꾼다(순수 함수 `capLedgerDrafts`).
  로컬 폴백 저장(localStorage)의 50건 상한은 그대로 둔다.

### 4.3 이중 계상 판정 범위와 편집 격리 (K-1·K-2·R-W·R-1)

- 레일·콕핏 저장(`saveDraft`)은 화면에 보이는 행이 아니라 **선택 행 자체**로 대기 초안 맵을 만든다(`buildMatrixPendingByCell(drafts, [selectedRow])`).
  편집 저장(`saveEditedDraft`)의 대응 행 탐색도 보이는 행이 아니라 전체 행(`rows`)에서 찾는다.
- 편집 중 초안이 있으면 `buildDraftInput`은 그 초안의 딜·시트 행·원본 스냅샷을 우선한다. 다른 딜을 고르면(`loadDealDetail`) 편집 상태를 해제한다.
- 주차 병합(`buildCellDraftInput`)의 기준을 "같은 달에 이미 대기 중인 초안의 주차 배열 → 없으면 행 표시값" 순으로 바꾼다(순수 함수 `mergeWeeklyCellEdit`).
- 붙여넣기 이름 매칭은 전체 행으로 존재를 판정한다. 화면 밖 고객은 셀을 만들지 않고 "페이지·필터 밖 N명 — 필터를 풀고 다시 붙여넣으세요"로 분리해,
  새 행 체크리스트에 올라오지 않게 한다(화면에 없는 행을 몰래 고치지도, 중복 행을 만들지도 않는다).

### 4.4 출력 — 복사·내보내기 (B1·B2·B3)

- **REV CSV**: 현재 필터·정렬이 반영된 **전체** 행(페이지 무관) × FY 12개월, 원 단위 정수, 행마다 확정·고확도·예정 분해 열. UTF-8 BOM(엑셀 한글 호환),
  파일명 `매출장부_REV_{FY}_{내려받은 날짜}.csv`. 미적용 초안은 넣지 않는다(장부 기준 값만 — 파일 머리 설명 줄에 명시).
- **REV Ctrl+C**: 선택 셀(월·주차)의 원 단위 정수를 클립보드로. 범위 복사는 P2-8(Shift+방향키 범위 선택)과 함께.
- **DSH TSV 복사**: 수치 그리드(현재 보기)·팀 그리드·월별 페이스 카드마다 "복사" 버튼. 첫 줄에 카드 이름·단위(¥ 원값)·기준 시각,
  이후 탭 구분 표. 스프레드시트·메신저에 그대로 붙는다.
- **매출시트**: 행마다 "장부에서 입력 ↗"(`/admin/branch/ledger?lens=rev&period=M&month={당월}&q={고객명}`, 임시명 행은 시트 행 번호),
  검색·상태·팀 필터 URL 보존, 현재 필터 결과 CSV.
- 모두 **읽기 전용 내려받기**다. 시트 역방향 쓰기(결정 D5)와 무관하다.

### 4.5 뷰별 입력 동선 (C)

- REV: 대기 초안 금액을 셀에 표시(R-2, 결정 E1), 셀 title·편집 바에 원 단위(R-8), 검색창 Enter/↓ → 격자(R-7),
  0 커밋 선차단(R-12), 1칸 붙여넣기 = 편집 채움(R-13), 잠긴 셀 Enter → 레일 정정 입력(R-14).
- 보드: 카드 클릭 = 입력 직행(B-1), 대기 초안 점(B-6), 로딩·오류 문구(B-5).
- 보드·콕핏 공통: REV 필터가 걸려 있으면 "필터 N개 적용 중 · 초기화" 줄(B-4).
- 콕핏: 월 변경 시 선택 딜 재로드(K-4), "저장 후 다음 ↓"(K-6), 딜별 편집기 초기화(K-8).
- 레일: 대상 칩(Q-3), 큐 편집 저장 후 큐 복귀(Q-7), 자가 체크 초안 편집 불가 사유(Q-8), 카드 입력자·시각(Q-9).
- DSH: 멤버 행 → REV `mgr=`, 월 헤더 → `period=M&month=`(D-9), 주간 비교 카드 안 월 선택(D-3).

### 4.6 마이크로 편의 (D)

- 갱신 중 직전 데이터 유지(R-5·D-8): 첫 로드에만 로딩 패널, 이후 재조회는 데이터를 유지하고 "갱신 중"만 표시.
- 토스트(R-9·Q-14·Q-15): 정보 = `role=status`, 오류 = `role=alert` + 수동 닫기, 레일 위 z-index, 붙여넣기 성공에 "큐 열기".
- 표기(S-11·S-12·D-10·D-11·D-13): 자동 동기화 시각을 스케줄 상수에서 계산, 문구 "동기화" 통일, "(단위: ¥천)", `-0` 제거, 포커스 링, "당월".

---

## 5. 이번 라운드 실행 표 (상태 정본)

커밋은 트랙·항목 단위(롤백 단위). 항목마다 가장 가까운 테스트를 먼저 돌리고, 라운드 끝에 기본 게이트를 돌렸다(§8).

| 트랙 | 항목 | 상태 | 근거 파일 | 검증 |
| --- | --- | --- | --- | --- |
| A 정합 | S-1·S-2·S-3·S-5 동기화 결과 계약·즉시 만료, S-11·S-12 스케줄 표기·문구 | 완료 | `app/api/admin/branch/sync/route.ts`, `app/api/cron/sync-branch/route.ts`, `lib/server/sync-cache-tags.ts`, `lib/branch/sync/cache-bundles.ts`, `lib/admin/sync-outcome.ts`, `lib/branch/sync/schedule.ts`, `SyncOutcomeNotice.tsx` | `tests/api/branch-sync-partial-failure-cache.test.ts`, `tests/branch/sync-outcome.test.ts`, `tests/branch/sync-schedule.test.ts`(vercel.json 대조), `tests/branch/sync/run-all-rev-recapture.test.ts` |
| A 정합 | Q-1 대기 초안 전량 | 완료 | `app/api/admin/branch/ledger-drafts/route.ts`(`open`), `lib/repositories/branch-sales-ledger-drafts.ts`, `ledger/draft-list.ts`, `useLedgerDraftQueue.ts` | `tests/branch/ledger-draft-integrity.test.ts`, `tests/api/branch-ledger-drafts-route.test.ts` |
| A 정합 | K-1·K-2·R-W·R-1 이중 계상·편집 격리·주차 병합·붙여넣기 범위 | 완료 | 워크벤치, `rev-matrix-logic.ts`(`mergeWeeklyCellEdit`, `buildMatrixPastePlan`) | `tests/branch/ledger-draft-integrity.test.ts`, `tests/branch/weekly-confidence.test.ts` |
| A 정합 | Q-2·Q-4·K-3 프리필 | 완료 | 워크벤치(`loadDealDetail`), `shared.tsx`(`rowMonthConfidenceTone`), `RevMobileList.tsx` | `tests/branch/ledger-draft-integrity.test.ts` |
| A 정합 | R-4 페이지 복원, D-6 주간 비교 잔존, D-3 비교 월 선택 | 완료 | 워크벤치, `workbench-shared.tsx`(`revPageResetSignature`), `WeeklyCloseSection.tsx` | `tests/branch/ledger-draft-integrity.test.ts` |
| A 정합 | S-6·S-7·S-8 신선도·배너 정의 | 완료 | 매출시트 `app/admin/crm/deals/rev-sheet/page.tsx`, `lib/admin-crm-revenue-sheet.ts` | `tests/branch/crm-revenue-sheet-manual-ledger-gap.test.ts`, `tests/crm/revenue-sheet-view.test.ts` |
| A 정합 | S-4 재캡처 실패 배지 | 6라운드 이관 | — | §5.1 |
| B 출력 | B1 REV CSV·선택 셀 Ctrl+C(R-10) | 완료 | `ledger/ledger-export.ts`, `lib/export/delimited.ts`, `lib/export/browser-download.ts`, 워크벤치 | `tests/branch/ledger-output.test.ts`, `tests/lib/export-delimited.test.ts` |
| B 출력 | B2 DSH 표 복사(TSV)(D-1) | 완료 | `ledger/dsh-export.ts`, `ledger/CopyTableButton.tsx`, DSH 카드 3종 | `tests/branch/dsh-export.test.ts` |
| B 출력 | B3 매출시트 딥링크·URL·CSV(S-9, 라운드 4 P2-10) | 완료 | `lib/crm/revenue-sheet-view.ts`, 매출시트 | `tests/crm/revenue-sheet-view.test.ts`, `tests/admin/rev-sheet-mobile-contract.test.ts` |
| C 동선 | REV R-2·R-8·R-12(표시·정확 금액·0 입력 차단) | 완료 | `RevMatrix.tsx`, `RevMatrixEditBar.tsx`, `rev-matrix-logic.ts`, `lib/branch/ledger-format.ts` | `tests/branch/ledger-output.test.ts`, `tests/branch/rev-matrix-edit-bar.test.ts` |
| C 동선 | REV R-7·R-13·R-14(검색→첫 칸, 한 칸 붙여넣기, 잠긴 칸 Enter) | 완료 | `rev-matrix-logic.ts`, `RevMatrix.tsx`, `WeeklyAmountGrid.tsx`, 워크벤치 | `tests/branch/rev-keyboard-flow.test.ts` |
| C 동선 | 보드·콕핏 B-1·B-4·B-5·B-6 | 완료 | `ForecastBoard.tsx`, `CockpitDealList.tsx`, `workbench-shared.tsx`(`RevLoadErrorPanel`), 워크벤치 | `tests/branch/board-cockpit-flow.test.tsx`(SSR 렌더) |
| C 동선 | 콕핏 K-4·K-6·K-8 | 완료 | `CockpitEditor.tsx`, `CockpitDealList.tsx`, 워크벤치 | `tests/branch/cockpit-editor-flow.test.tsx`(SSR 렌더) |
| C 동선 | 레일·큐 Q-3·Q-7·Q-8·Q-9·Q-11 | 완료 | `InputRailSection.tsx`, `DraftQueue.tsx`, `ledger/draft-card-meta.ts`, 워크벤치 | `tests/branch/rail-queue-flow.test.tsx`(SSR 렌더) |
| C 동선 | DSH D-9 멤버·월 → REV | 완료 | `DshTeamGrid.tsx`, `DshMonthlyPace.tsx` | `tests/branch/dsh-export.test.ts` |
| D 편의 | R-5·D-8 갱신 중 직전 값 유지 | 완료 | `client-api.ts`(`keepPreviousData`), 워크벤치(`RefreshingBadge`) | `tests/branch/refresh-and-toast.test.tsx` |
| D 편의 | R-9·Q-14·Q-15 토스트 | 완료 | 워크벤치 | `tests/branch/refresh-and-toast.test.tsx`, `tests/branch/ledger-undo-toast.test.ts` |
| D 편의 | D-10·D-11·D-13 표기 | 완료 | DSH 카드 3종, `dsh-derive.ts`, `WeeklyCloseSection.tsx` | `tests/branch/dsh-export.test.ts` |

### 5.1 라운드 중 판단을 바꾼 것 · 6라운드로 넘기는 것

- **S-4(재캡처 실패 배지) → 6라운드.** 임포트의 `asOf`는 런 시작 시각이고, 체크섬이 같으면 새 런을 만들지 않고 옛 런을 유지한다.
  그래서 `isImportStale`을 그대로 쓰면 **내용이 안 바뀐 정상 동기화 뒤에도** "오래됨"이 뜬다. 런 기록에 "마지막 확인 시각"을 따로
  남기는 것(S-10과 같은 계열)을 먼저 해야 한다.
- **잠긴 칸의 "정정 초안" 안내를 바로잡음(R-14 진행 중 발견).** 셀 title은 "수정은 우측 패널에서 정정 초안으로"를 약속했지만,
  레일은 잠긴 달의 수정 초안 저장을 막는다(`LOCK_WARNING_TEXT`). 이번 라운드는 약속을 실제 경로로 고쳤다 — 시트 확정은 원본
  시트에서 고친 뒤 동기화, 장부 반영은 체크 큐 되돌리기(상쇄) 뒤 다시 입력. **R-17(6라운드 후보):** 잠긴 달을 장부에서 바로
  정정하는 경로(확인 한 번 + 정정 사유)가 필요한지 운영에 확인한다.
- **K-10(6라운드 후보):** 대기 초안이 걸린 딜을 레일·콕핏에서 열면 편집기는 장부 값으로 시작한다(매트릭스 셀은 R-2로 초안 값을
  보인다). 저장은 기존 초안을 갱신하므로 이중 계상은 없지만, "친 값이 보인다"가 편집기에서는 아직 아니다.
- **1칸 붙여넣기는 주차 칸에서도 된다(R-13).** 여러 칸 주차 앵커 붙여넣기(R-16)는 그대로 6라운드.
- **이월 목록(변경 없음):** S-10·S-13~S-16, R-3·R-6·R-11·R-15·R-16, D-2·D-4·D-5·D-7·D-12, B-2·B-3·B-7·B-8, K-5·K-7·K-9,
  Q-5·Q-6·Q-10·Q-12·Q-13, 결정 E2·E4·D5.

---

## 6. 결정 포인트

| # | 결정 | 선택지 | 이번 라운드 기본값 |
| --- | --- | --- | --- |
| E1 | 대기 초안 금액을 셀에 표시할지(R-2) | (a) 초안 금액 표시 + 확도색·밑줄 (b) 지금처럼 장부 값 + title | **(a)** — "친 값이 보인다"가 스프레드시트의 기본 기대이고, 대기 표시(점·밑줄·확도색)가 적용 전임을 알린다. 합계 행은 적용분 기준 그대로. 되돌리기 쉬운 표시 변경 |
| E2 | 보드 카드에서 E/H/C로 확도를 바꿀 때 자가 체크(D1(a))를 적용할지 | 적용 / 레일 3단 유지 | **보류(6라운드)** — 이번에는 카드 → 입력 직행까지만 |
| E3 | CSV 금액 단위 | 원 단위 정수 / 화면과 같은 만 단위 | **원 단위 정수** — 엑셀 재계산이 목적. 화면 축약은 표시 전용 |
| E4 | 동기화 쿨다운(5분 내 재확인) | 도입 / 안 함 | **안 함(6라운드 재검토)** — 서버 10분 잠금과 `running` 안내로 충분한지 먼저 본다 |
| D5 | 시트 역방향 export(라운드 4에서 이월) | 필요 / 불필요 | **그대로 확인 필요** — 이번 CSV는 사람이 내려받는 파일이고 시트 쓰기가 아니다 |

---

## 7. 하지 않는 것

- **매출시트에 금액 입력** — CRM-1 역할 분리 유지. 입력은 딥링크로 장부에 보낸다.
- **보드 드래그 이동** — 드래그에는 키보드 대안이 필수이고(`dragging-alternative`), 주차 이동을 셀 커밋 두 번으로 만들면 병합 기준
  문제(§3.2 R-W와 같은 계열)로 금액이 중복될 수 있다. 주차 이동은 레일의 주차 분해 입력이 맡는다.
- **새 저장 경로** — 모든 입력은 초안 계약 하나(단건·배치 API)로만 들어간다. 대기 초안 전량 조회는 읽기 확장이다.
- **2단 게이트 폐기, 매트릭스 형태 문법, 콕핏 전용 라우트, 그리드 모바일 이식** — 라운드 2·4 결정 유지.
- **새 색·토큰** — 전부 DESIGN.md와 `CONFIDENCE_TOKENS` 안에서.
- **다른 동기화 버튼(NEO·채널톡·Meta·인스타그램·캘린더)의 결과 계약** — 승인 설계 §7의 나머지 범위로 남긴다.

---

## 8. 검증

```bash
npx vitest run --dir tests/branch
npx vitest run tests/api/branch-sync-partial-failure-cache.test.ts tests/api/branch-ledger-drafts-route.test.ts
npm run typecheck
npx eslint app components lib --max-warnings=0
npm run build
```

추가하는 테스트(항목 옆 "검증" 열에 채운다):

- 동기화: 잠김이면 `outcome: "running"` + 만료 없음, 성공이면 `revalidateTag(…, { expire: 0 })`, `describeSyncOutcome` 다섯 결과 문구.
- 대기 초안: `open` 파라미터가 열린 초안을 따로 조회해 합치는지, `capLedgerDrafts`가 열린 초안을 자르지 않는지.
- 주차 병합: W1→W2 연속 편집이 W1 값을 보존하는지(`mergeWeeklyCellEdit`).
- 붙여넣기: 화면 밖 고객이 미매칭(새 행 후보)으로 분류되지 않는지.
- 내보내기: CSV 이스케이프(쉼표·따옴표·줄바꿈)·BOM·원 단위, DSH TSV 머리줄.
- 딥링크: 매출시트 → 장부 URL 조립(임시명 행은 행 번호), DSH 멤버·월 링크.

기존 회귀 보호(건드리면 반드시 재실행): `ledger-cell-dedup`, `ledger-cell-relock`, `ledger-draft-optimistic-lock`,
`ledger-week-cell-lock`, `draft-bulk-plan`, `rail-lock-precheck`, `matrix-confidence-shortcuts`, `matrix-paste-name-match`,
`ledger-undo-toast`, `ledger-entry-paths`.

운영 mutation(동기화·마감·대량 임포트)은 승인된 계정·환경 없이 브라우저에서 실행하지 않는다.
