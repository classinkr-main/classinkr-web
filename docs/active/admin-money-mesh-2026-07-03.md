# 어드민 머니 클러스터 연결성·정합성 정비 — 2026-07-03

대상: `/admin/branch`(+`/ledger`) · `/admin/hardware` · `/admin/crm`(+deals) · `/admin/overview`.
배경: 매출 장부 워크벤치 머지 후, 세 표면이 겹치는 데이터를 서로 다른 파이프라인으로 읽으면서 상호 링크가 거의 없던 상태("세 개의 섬")를 5렌즈 병렬 감사로 진단하고 do-now 10건을 구현했다. 본 문서는 ①오늘 반영된 것 ②스키마/정의 결정이 필요해 보류한 것(design-first) ③백로그를 기록한다.

## 1. 반영 완료 (2026-07-03)

### 연결성
- **하드웨어 ↔ 매출 장부 양방향 딥링크.** 하드웨어 콘솔(거래이력 슬라이드오버 헤더, 출고 버킷 고객 행)에서 `/admin/branch/ledger?lens=rev&prod=hardware&q={고객}`으로; 장부 REV의 HW 분류 행/그룹에서 `/admin/hardware?customer={고객}`으로. 하드웨어 콘솔에 URL 상태(`?tab=home|entry|history`, `&customer=` — customer는 열린 거래이력 슬라이드오버를 의미, 기록 시 tab 항상 명시)가 신설됐다.
- **하드웨어 콘솔 CRM 링크 활성화.** CRM 후보 모달·상세 슬라이드오버의 죽은 텍스트가 실제 앵커로(딜 딥링크 `/admin/crm/deals/orders?deal=`), `extractCrmLink`는 저장된 구조화 `raw.crmLink`를 우선.
- **머니 메시 링크 교정.** Overview 진척(HW)→`/admin/hardware`, 매출 페이싱·파이프 커버리지→`/admin/branch/ledger`, ¥(CNY) 마커 추가; branch 대시보드(CoreKpiGrid·PipelineTable)→장부 REV 딥링크; CRM deals REV 대조 헤더·시트리스크 행→장부; 장부 브레드크럼→`/admin/branch`.
- **⌘K 이중 팔레트 해소.** CRM 라우트에서는 전역 런처 언마운트, CrmCommandPalette가 ⌘K와 사이드바 검색 버튼 이벤트(`admin:open-command-palette`)를 모두 소유. CRM 팔레트에 매출 장부·하드웨어 재고 인덱싱, Deals 서브탭에 오더·설치 추가.

### 동기화 트랩 해소 (운영상 최우선이었던 함정)
- 장부 '동기화'는 시트 미러만 갱신했고, DB-native 임포트가 활성이면 화면이 안 바뀌었다(재임포트 API에 UI 트리거 부재). 이제:
  - Source 바에 **REV 원천 세그먼트 + 'DB 재동기화' 버튼**(액티브 run id·캡처 시각·인라인 성공/실패 칩).
  - 동기화 성공 시 액티브 소스가 DB run이면 **재캡처 자동 체인**.
  - 액티브 소스 판별은 **서버 GET(`/api/admin/branch/ledger/db-import`)이 1차 근거**(localStorage는 폴백) — 시트 모드로 되돌린 배포를 조용히 DB-native로 재전환하지 않는다.
  - `captureRevDbImport`에 **checksum dedupe**(`rev-native:` sha256, succeeded 부분 유니크 인덱스) — 무변경 재동기화는 새 run을 만들지 않고 기존 run 반환(`deduped`). dedupe여도 액티브 run이 전환되면(`runChanged`) 클라이언트가 refetch.
- **주간 마감 스냅샷 cron 자동화**: `/api/cron/ledger-weekly-close` (금 14:30 UTC = 금 23:30 KST, vercel.json 등록, checksum 멱등). 수동 '지금 스냅샷' 버튼은 유지.

### 정합성·DB
- **고객 정규화 SSOT**: [lib/branch/account-key.ts](../../lib/branch/account-key.ts) `normalizedAccountKey` — rev-import·weekly-close·워크벤치의 3중 복사 제거. 하드웨어↔REV 대사(reconciliation)의 조인 키 규약이며 SQL 트윈 표현식을 주석에 명세.
- **REV 데이터셋 단일화**: [lib/branch/read-rev-deals.ts](../../lib/branch/read-rev-deals.ts) `readRevDealsPreferActive`(액티브 임포트 우선, 시트 미러 폴백)를 summary·heatmap이 공용. data-quality는 시트 QC 레인으로 명시(`lane:"sheet-qc"`, 캐시 키 분리 — `branch-dsh` 키 충돌 해소).
- **HW/SW 분류기 단일화**: summary의 사설 regex → `classifySalesLedgerProductCategory` 공용(장부 REV HW 필터와 동일 정의). ※무신호 행이 Software로 귀속되므로 주간 DealMix의 SW 합계가 다소 증가할 수 있음(의도된 정의 통일).
- **os-summary boards86 불변식 준수**: 실판매만 집계(배송예정·샘플/프로모션/A-S 제외), `plannedBoards86` 별도 반환 — Overview 타일이 "실판매 N · 배송예정 M"으로 표시.
- **1000행 캡 방지**: hardware_movements·branch_hw_* 전량조회를 **id 키셋 페이지네이션**으로(동시 insert에 의한 페이지 경계 밀림/중복 없음, `fetchAllSupabaseRows` 공용 헬퍼).
- **중복 읽기 제거**: `readRevDealsFromActiveImport`를 (runId, team) 키 `unstable_cache`로 — 워크벤치 1로드당 3회 전량 재읽기 제거. run 데이터는 succeeded 후 불변이라 캐시 안전.

## 2. Design-first — 결정 후 진행 (스케치 포함)

### 2.1 HW 출고 ↔ REV 매출 대사(reconciliation) — 본질 해법
오늘의 딥링크는 다리일 뿐, 진짜 연결은 스키마다. 다섯 렌즈 전부 이 방향으로 수렴했다.
- **결정 필요**: ①매칭 그레인(고객그룹×월×HW카테고리 후보 제안 vs 출고 건별 확정 링크) ②확정 링크 저장 위치(`hardware_movements.rev_record_key` 신설 vs 기존 `crm_source_links` 패턴 확장) ③통화 표기(HW 출고=USD, REV=CNY — 병기만, 환산·금액 동등 매칭 금지) ④인박스 UI 위치(장부 REV 서브패널 vs 하드웨어 탭 vs 양쪽이 한 API를 읽기).
- **스케치**: Phase A — SQL `normalize_account_key(text)`(account-key.ts 트윈) + `branch_rev_lines`/`hardware_movements`에 GENERATED account_key 컬럼+인덱스, `hardware_movements.rev_record_key`(nullable). Phase B — `v_hardware_rev_matches` 뷰(액티브 run의 HW 분류 라인 × 비무효 출고 판매를 account_key+월로 조인). Phase C — 미매칭 출고/미매칭 장부/배송예정 대기 3열 인박스(오늘 깐 URL 계약으로 양방향 딥링크).

### 2.2 수동 출고 매출 캡처
- **결정 필요**: 어드민이 입력한 출고 금액이 매출 원천이 되는가(REV가 SSOT인 현 구조에서 이중 계상 위험 — 2.1의 대사 모델이 어느 쪽을 권위로 볼지 먼저 정해야 함), 입력 통화(USD=시트 정합 vs CNY=REV 정합), 벌크 카트 라인별 금액·CRM 링크 허용 여부.
- **스케치**: 결정만 되면 저렴 — outbound 단건 폼에 inbound와 같은 amountUsd 블록, API·스키마는 이미 수용(`amount_usd` 컬럼 존재), CRM 후보 `candidate.amount` 프리필.

### 2.3 '확정 매출' 단일 정의
- 같은 REV 행 위에 확정 계산이 3벌: 장부 `confirmedMonthAmount` / `lib/admin-crm-revenue.ts` 색상 로직 / `lib/crm/revenue-performance.ts`. CRM 표면 숫자가 장부와 다르게 보일 수 있다.
- **결정 필요**: 어느 정의가 캐논인가(권장: 장부 `confirmedMonthAmount`). CRM 표면이 장부 수기 엔트리(`branch_sales_ledger_entries`)도 봐야 하는가.
- **스케치**: CRM 두 모듈을 `readRevDealsPreferActive` + `confirmedMonthAmount`로 전환. CRM 화면 숫자가 눈에 띄게 바뀌므로 운영자 캐논 결정 후 진행.

### 2.4 HW 재고 정의 단일화
- 재고 정의 2벌: `hardware_movements` 원장(수동·무효·조정 포함) vs `branch_hw_*` 스테이징 regex 계산(`/api/admin/branch/hw`). branch 위젯 숫자가 하드웨어 콘솔과 다를 수 있다.
- **결정 필요**: 원장을 재고 SSOT로 확정하고 스테이징은 임포트 버퍼로 강등할지(branch 대시보드 숫자 변동 수반), 위젯이 슬림 totals 엔드포인트를 새로 받을지.

### 2.5 배송예정/물량번호없음의 스키마 타입화
- '예정' regex가 JS와 4+개 SQL 함수에 중복, no-lot 행은 암묵적(lot 잔량 과대 계상 여지).
- **결정 필요**: `is_planned` GENERATED boolean vs 라이프사이클 enum + lot-missing 플래그. 부분 유니크 인덱스·FIFO confirm RPC 재작성 수반.
- 선행 가능한 스톱갭(S): "lot 미지정 출고 N대" 경고 UI.

### 2.6 서버측 집계 이전
- `getHardwareDashboardUncached` 풀스캔 JS 집계(120초 캐시 뒤)와 REV 월×확도 피벗의 RPC/뷰 이전. 델타 규칙이 SQL에 이미 1벌 존재(`confirm_hardware_planned_movement_v2`) — SQL을 SSOT로 정하면 JS/SQL 3중 구현이 사라진다. (임시 완화인 readRevDeals 캐시는 오늘 반영됨.)

## 3. 백로그 (요약)

- 워크벤치(6,999줄)·하드웨어 클라이언트(6,336줄) 렌즈/탭별 모듈 분리 + `next/dynamic`.
- DSH/KPI DB-native 임포트 in-app 업로드 경로(현재 CLI 전용) + run 목록/활성화 UI.
- 하드웨어 임포트 안전 UX: dryRun diff 프리뷰 모달, 스냅샷 목록+가드된 restore UI, additive-merge 모드 고지. merge-digest 블라인드스팟(amount_cny·storage_location·importer 누락) 보강.
- `sales_ledger_import_runs` 보존 정책(비활성 run 프루닝 RPC) — checksum dedupe와 페어.
- `CrmVariancePanel` '준비중' 데드엔드 — 실측 연동 또는 제거.
- Overview 주의 신호 큐에 REV 동기화/DB 임포트 신선도·주간마감 누락·배송예정 확인 대기 추가. `/admin/ops`에 branch 시트싱크·hardware 임포트 상태 카드.
- CRM 홈 KPI 보드 축소(장부 KPI 탭으로 위임) + `CRM_BRANCH_KPI_MONTH` 모듈 스코프 월 고정 버그. `/admin/crm/deals/kpi` 라벨 교정(실체는 파트너 워크스페이스).
- CRM revenue 요약 2중 계산(admin-crm-overview vs admin-crm-revenue) 공용화.
- 딜→출고 역배지(reference_no `deal:{id}` 조회). `/admin/marketing` nav SSOT 위반 정리. 배치 이동 N+1 (RPC화). 주간마감 diff GROUP BY 1쿼리화. insights runner의 `branch-dsh` 캐시 키 충돌 잔존(`lib/branch/insights/runner.ts`) + `/api/admin/branch/kpi`의 자체 readRevDeals 사본.
- `branch_hw_sales_monthly` 데드 테이블(쓰기만 있고 읽기 0) — 제거 또는 소비 카드 신설.

## 4. 참고

- REV 탭 상세 감사: [rev-tab-audit-2026-07-03.md](rev-tab-audit-2026-07-03.md) (P0 완료, P1~P3 백로그는 위와 병합 관리)
- 운영 캐논: [classin-operating-canon-2026-07-02.md](classin-operating-canon-2026-07-02.md)
