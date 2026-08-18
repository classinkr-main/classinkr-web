# 하드웨어 어드민 UX — 탭 계획 · 작업 내역 · 방향성 지침

기준 시점: 2026-06-29
대상 화면: `/admin/hardware` ([components/admin/hardware/HardwareInventoryClient.tsx](../../components/admin/hardware/HardwareInventoryClient.tsx))
관련 개념 문서: [docs/hardware-ops/README.md](../hardware-ops/README.md) · [sheet-interpretation](../hardware-ops/sheet-interpretation.md) · [hub 통합 계획](./hardware-admin-hub-integration-plan.md)

이 문서는 하드웨어 재고 화면의 하위탭 구조, 진행된 작업, 앞으로의 방향성 지침을 한곳에 고정한다.

---

## 1. 탭 계획 (정보 구조)

단일 스크롤 → **3개 하위탭**으로 재구성. 헤더 탭 스트립 + 탭별 콘텐츠.

| 탭 | 역할 | 구성 |
| --- | --- | --- |
| **홈** | 현황 + 예상 출고 워크플로 | KPI 4 · **예상 출고 큐**(등록·1탭 확정) · 재고 위치 맵 · 현재 재고(lot 칩) · 알림 |
| **입출고** | 기록 진입 | **런처**(액션 그리드 + 최근 기록). 실제 입력은 빠른 기록 시트(슬라이드오버) |
| **내역** | 전체 원장 | 유형·제품 칩 필터 · lot/금액 표시 · 기록 취소(void) |

### 확정된 설계 결정

- **재고 기준**: 물류 번호(lot: H1~H8 등)별 `입고 − 출고`. lot 키는 수기 `lot_no`, 시트 행은 `reference_no`(물류No) 폴백.
- **예상 출고 확정**: 배송 예정 → 실제 출고로 **전환(convert)**. 출고일 직접 입력(기본 오늘). 백엔드 `confirm-planned` RPC 사용.
- **빠른 선택**: 제품은 텍스트 칩(사진 미사용 — 추후 썸네일 승격 여지).
- **빠른 기록 시트(완료)**: **슬라이드오버**(우측 드로어, 모바일 풀폭). 입출고 탭은 **런처로 교체**, 실제 입력은 시트에서.

---

## 2. 작업 내역 (완료)

### 2-1. 하위탭 재구성
- 홈/입출고/내역 3탭 + 헤더 탭 스트립. 기존 섹션(위치맵·현재재고·나간기록·알림·원장)을 탭별로 재배치.

### 2-2. 출고 확정일 · 기록 취소
- 홈 예상 출고 큐 각 행에 출고일 입력 + `출고 확정`(전환).
- 내역 탭 수기 기록 `취소`(void) + 취소선·`취소됨` 배지. 시트 출처 행은 `· 시트`(취소 불가, import 관리).

### 2-3. lot(물류번호) 추적 — Step 1
- 마이그레이션 [20260628_hardware_movements_lot.sql](../../supabase/migrations/20260628_hardware_movements_lot.sql): `lot_no` 컬럼 + `(item_id, lot_no)` 인덱스 + `confirm_hardware_planned_movement` 재생성(전환 시 lot 승계).
- 레포 [hardware-inventory.ts](../../lib/repositories/hardware-inventory.ts): movement·입력·재고에 lot 반영, **lot별 재고 집계**(`lotBalances`). 입력 폼 `물류 번호(lot)` 필드 + 기존 lot datalist, 내역·현재재고에 lot 표시.
- import/restore RPC는 미변경 — 시트 행은 `reference_no` 폴백으로 즉시 반영.

### 2-4. 입고 시트 전체 필드 — Step 2
- 마이그레이션 [20260628_hardware_movements_costing.sql](../../supabase/migrations/20260628_hardware_movements_costing.sql): `unit_price`, `amount_usd`, `amount_cny`, `storage_location`, `importer` 컬럼.
- 입고 폼 `입고 상세(시트 필드)` 그룹(단가·금액 USD/CNY·보관장소·수입자·시리얼) — `movement_type=inbound`일 때만 노출.
- API 검증 `readOptionalNonNegativeNumber` 추가. 내역에 금액(USD) 표시.

### 2-5. 마이그레이션 적용
- 두 `20260628_*` 마이그레이션을 라이브 DB에 적용·검증(컬럼 6개 + 인덱스 + confirm RPC lot 승계 확인). 적용 방식은 운영 메모리에 별도 기록.

### 2-6. 빠른 기록 시트(슬라이드오버) + 진입점 통일
- 입력 폼을 **우측 슬라이드오버 드로어**(`sheetOpen`)로 이동 — 백드롭/X로 닫고, 저장 성공 시 자동 닫힘.
- **진입점 통일**: 재고 행(출고·예정·입고) · 홈 예상 출고 큐(수정·등록) · **우하단 FAB(기록)** 가 전부 같은 시트를 그 자리에서 엶(탭 전환 없음).
- **입출고 탭 = 런처**: 액션 그리드(8 프리셋 → 시트) + 최근 기록 6건(전체 내역 링크).

### 2-7. 신뢰 회복·운영 루프 디벨롭 (2026-08-18)
- **이관 신선도 스트립**: `ImportFreshnessStrip` 신설 — 홈 최상단에 `importRun`(경과일·행수·실패 에러) 상시 노출. ≤7일 중립, 8~21일 앰버, 초과·실패 데인저. (이관 데이터가 48일 묵어도 화면 경고가 없던 사고의 재발 방지.)
- **카테고리 카드 정직화**: 분류를 `hardwareCardGroup`(shared) 단일 기준으로 통일 — 브라켓이 카메라 대수로 계상되던 서술 매칭 제거, promoted 라인은 헤드라인과 분리해 `판촉 N` 칩(음수 = `점검` 데인저)으로 표시. STD1 35 + 판촉 −16 = 19로 보이던 가짜 경보 해소. 4축 밖 품목(A1·OPS·POE·케이블·브라켓·비주력 보드)은 "액세서리 · 기타" 스트립으로 전량 가시화 — 카드 합 + 판촉 + 기타 = 전체 재고로 대사됨.
- **입고 집계 병기**: `총 입고 (86·75·T1)` 아래 `전 품목 N대` 병기 — 집계 밖 재고 소멸 방지.
- **예상 출고 방치 신호**: 딜 행 `N일 경과` 배지(14일 앰버, 30일 데인저) + 패널 헤더 `30일+ 미확정 N딜` 요약.
- **알림 노이즈 컷**: 미가동 품목(창고 0·예정 0·30일 출고 0, `isDormantStockRow`) 부족 알림을 `muted`로 강등 — 분리 캡(실신호 12 + muted 12) 후 섹션 하단 접힌 그룹으로. 음수 재고는 0 일치 판정이라 실신호 유지.
- **샘플 에이징 밴드**: 대여중 90일+/1년+/2년+ 카운트 칩 + 필터(선택 시 상태 필터 대여중 고정).
- 죽은 표면 정리: `HardwareInventoryClient` 재수출 배럴 제거(소비자 없음 확인), `isPromotedProduct`/`isCoreIfpProduct`는 shared로 이동.

### 검증
- 게이트: `npx eslint app components lib --max-warnings=0` + `npx tsc --noEmit` + 하드웨어 vitest. (build는 live Supabase 필요라 오프라인 게이트는 lint+tsc+test.)

---

## 3. 방향성 지침

### 3-1. 데이터/백엔드 원칙
- **기존 계약 재사용**: 입력은 `POST /api/admin/hardware/movements`, 확정은 `PATCH .../movements/[id] {action:"confirm-planned"}`, 취소는 `{action:"void"}`. 새 엔드포인트를 늘리지 않는다.
- **시트 import/restore RPC 불변**: 시트 원본 단가/금액은 `branch_hw_inbound`/`raw`에 유지. 통합 원장(`hardware_movements`)은 **수기 입력분만** 신규 컬럼을 채운다.
- **lot 해석**: 수기 = `lot_no`, 시트 = `reference_no`(물류No) 폴백. lot 잔량 = 입고/반납(+) − 출고(예정 포함, −); 이동·수리는 lot 보존.
- **마이그레이션 선적용**: 컬럼 insert가 추가된 변경은 **마이그레이션을 코드보다 먼저** 적용(안 그러면 입출고 저장이 깨짐).

### 3-2. 편리한 사용자 경로 원칙
- **시트 하나로 통일**: 모든 기록은 단일 `QuickMoveSheet`로. 재고 행·큐 행·제품 칩·FAB 등 어디서 눌러도 prefill된 같은 시트가 그 자리에서 열린다(탭 전환 없음).
- **최소 + 점진 공개**: 기본은 제품·수량·날짜만. 출고=도착·lot, 입고=lot·시트 상세, 그 외(담당자·참조·메모)는 `상세` 접기.
- **예상 출고 = 큐 + 1탭 확정**: 등록도 시트로, 확정은 행에서 한 번에(날짜 기본 오늘).

### 3-3. UI 규칙
- 색상은 [DESIGN.md](../../DESIGN.md) 팔레트. 보더 `1px solid rgba(0,0,0,0.08)`. 모바일 우선.
- 상태색: 입고=초록 계열, 출고=레드(#B43E3E), 예정=앰버(#A8741A), 확정=그린(#084734).

### 3-4. 자체 평가 반영 (2026-06-29, 서브에이전트 UX·경로·디자인 3종)

반영 완료:
- **접근성**: 빠른 기록 시트·CRM·취소 모달을 `role="dialog" aria-modal`로, Escape 닫기 + body 스크롤 잠금 + 시트 포커스(autofocus·trap·복원). 백드롭 `onMouseDown`→`onClick`(작성 중 폼 유실 방지).
- **취소(void)**: `window.prompt` → 인앱 확인 모달(사유 입력, 파괴적 스타일).
- **드로어 내 검증 에러**: `<main>` 뒤가 아니라 시트 안에 노출.
- **CRM 모달 타이밍**: 배송 예정(`예정/예약/대기`) 등록 시에는 CRM 모달을 띄우지 않음.
- **FAB**: 항상 새 입력(판매 출고)로 초기화해 열림(stale 상태 제거).
- **디자인**: `DESIGN.md`에 [운영 상태 스케일(Status scale)] 정식 추가(red/amber/green 비준 + 위계 규칙). 행 내 빠른 액션 중립화(녹색 채움 = 단일 주요 액션). 11px 미만 텍스트 제거(접근성 floor), `#F0EFEC`→`#F6F5F4`, 드로어/FAB/모달 그림자 경량화, 시트 모바일 풀폭(`w-full sm:max-w-md`), 진입점 일관화(위치맵 헤더 칩도 시트 열림).

백엔드 P0 반영 완료(2차):
- **실제 입출고 수정**: `PATCH .../movements/[id] {action:"update"}` + `updateHardwareMovement`(admin_manual·미전환·미취소만). 내역·예상큐 `수정`이 신규 생성 대신 같은 행을 갱신.
- **부분 수량 확정**: `confirm_hardware_planned_movement`를 `confirm_qty`(4-arg)로 교체 — 부분 확정 시 출고 N대 생성 + 잔여(전체−N)는 예정 유지. (마이그레이션 [20260629](../../supabase/migrations/20260629_hardware_partial_confirm.sql), 라이브 적용 완료)

기타 보류:
- **Step 3**: import RPC 정렬 — 시트 입고의 단가/금액/lot을 통합 원장에도 채워 리포팅 노출.
- 잔여 디자인 정규화(전 입력 2px 포커스 링, 타입/라디우스 완전 통일, 헤더 컴포넌트 3종 → `SectionHeader` 단일화), 제품 사진 칩 승격, 출고 매출(revenue) 필드.
