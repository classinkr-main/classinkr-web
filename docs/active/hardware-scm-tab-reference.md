# 하드웨어 SCM 탭 — 정체성 · UI · 기능 (reference)

기준 시점: 2026-06-29
대상: `/admin/hardware` → [components/admin/hardware/HardwareInventoryClient.tsx](../../components/admin/hardware/HardwareInventoryClient.tsx)
관련: [UX 계획·작업내역](./hardware-admin-ux-plan.md) · [hardware-ops 개념 문서](../hardware-ops/README.md) · [시트 해석](../hardware-ops/sheet-interpretation.md) · [DESIGN.md](../../DESIGN.md)

이 문서는 하드웨어 재고 화면을 **공급망(SCM) 운영 콘솔**로 보고, 그 정체성·UI·기능을 한곳에 고정한다. "지금 무엇이고, 어떻게 생겼고, 무엇을 하는가"의 단일 기준.

---

## 1. 정체성 (Identity)

- **한 줄 정의**: 클래스인 하드웨어(전자칠판/IFP·카메라·스탠드·부자재)의 **재고·입출고·예상 출고를 한 화면에서 추적하고 기록하는 운영 콘솔**.
- **주인공 엔티티**: 품목(`item`) · **물류 번호(lot)** · 입출고 기록(`movement`) · 예상 출고(`planned`).
- **진실의 원천**: `hardware_movements` **원장**. 재고는 따로 저장하지 않고 **원장에서 파생 계산**한다. 기록은 수정/취소(void)로 보정하되 원장 자체가 기준.
- **두 데이터 출처**:
  - `admin_manual` — 어드민에서 수기 입력(이 화면의 주 입력 경로)
  - `sheet_import` — Google 시트(`branch_hw_*` 미러) → 가져오기 RPC가 시트 이관분을 교체
- **무엇이 아닌가**: 단순 수량 입력표나 파트너 목록이 아니라, **물량 진실표 + 운영 워크플로**(입고→예약→확정→출고/취소).
- **사용 맥락**: 본사 운영자가 데스크톱/모바일(창고·현장)에서 빠르게 기록. 모바일 입력을 1급으로 본다.

---

## 2. UI 구조

### 2-1. 하위탭 (헤더 탭 스트립, 3개)

| 탭 | 정체성 | 구성 |
| --- | --- | --- |
| **홈** | 현황 + 예상 출고 워크플로 | 핵심 KPI 4 · **예상 출고 큐**(등록·부분/전체 확정) · 재고 위치 맵 · 현재 재고(lot 칩) · 알림 |
| **입출고** | 기록 진입 | 액션 런처(8 프리셋) + 최근 기록 6건 → 실제 입력은 슬라이드오버 |
| **내역** | 전체 원장 | 유형·제품 칩 필터 · lot/금액 표시 · 행별 수정·취소 |

### 2-2. 빠른 기록 시트 (슬라이드오버) — 핵심 입력 컴포넌트

- 우측 드로어(모바일 풀폭). **진입점 통일**: 재고 행·예상 큐·제품 칩·런처·우하단 FAB가 모두 같은 시트를 그 자리에서 prefill로 연다(탭 전환 없음).
- 접근성: `role="dialog" aria-modal`, Escape 닫기, body 스크롤 잠금, autofocus·포커스 트랩·복원, 백드롭 click.
- 구성: 액션 세그먼트 → 제품(칩/검색) → 수량 → 조건부(출고=도착·lot / 입고=lot·시트 상세) → `상세` 접기 → 미리보기 → 저장. 검증 에러는 시트 내부에 노출.
- 모드: 신규 기록 / **수정(editingId)** — 같은 시트가 헤더·버튼 라벨만 바꿔 재사용.

### 2-3. 보조 오버레이

- **CRM 오더 확인 모달**: 실제 출고 저장 시 CRM 실제 오더와 연동할지 확인(배송 예정 등록 시에는 뜨지 않음).
- **기록 취소 확인 모달**: 사유 입력 + 파괴적 액션 스타일.

### 2-4. 디자인 언어

- [DESIGN.md](../../DESIGN.md) 팔레트 + **운영 상태 스케일**(green=주요 액션 단일, danger=출고·부족·취소, warning=예정·검토, success=입고·확정).
- 11px 미만 텍스트 없음, 경량 그림자, hairline 보더, 행 내 빠른 액션은 중립(hover에서 의도색).
- 재사용 부품: `AdminTabs` · `StatCard` · `viz/SectionCard·Panel·EmptyState`.

---

## 3. 기능 (Functions)

### 3-1. 입출고 프리셋 (8종)

| 프리셋 | 유형 | from → to | 비고 |
| --- | --- | --- | --- |
| 판매 출고 | outbound | 창고 → 고객 | 저장 시 CRM 오더 확인 |
| 배송 예정 | outbound(예정) | 창고 → 고객 | 가용에서 미리 차감(예약) |
| 샘플 대여 | outbound | 창고 → 샘플 | 판매 재고 제외 |
| 입고 | inbound | → 창고 | **시트 전체 필드** 입력(아래) |
| 반납 | return | 고객 → 창고 | 외부 회수 |
| 사무실 이동 | transfer | 창고 → 사무실 | 비가용 위치 |
| 수리 | repair | 창고 → 수리 | 예외 상태 |
| 실사 조정 | adjust | ± 창고 | 현재고 보정 |

### 3-2. 입고(시트 전체 필드)

품목·수량·날짜·물류No(lot) + **단가(USD)·금액(USD)·금액(CNY)·보관장소·수입자·시리얼**. `movement_type=inbound`일 때만 노출.

### 3-3. 예상 출고 워크플로 (핵심)

- **등록**: 배송 예정 movement 생성 → 가용에서 차감, 홈 큐에 표시.
- **확정**: 예정 → 실제 출고로 **전환(convert)**. 출고일 선택. **부분 수량 확정** 지원 — 출고 N대 생성 + 잔여(전체−N)는 예정 유지.

### 3-4. lot(물류 번호) 추적

- lot 키 = 수기 `lot_no`, 시트행은 `reference_no`(물류No) 폴백.
- lot 잔량 = 입고/반납(+) − 출고(예정 포함, −); 이동·수리는 lot 보존. 현재 재고 표에 lot 칩으로 노출.

### 3-5. 기록 수정·취소

- **수정(update)**: `admin_manual`·미전환·미취소 기록만. 내역·예상 큐 `수정`이 신규 생성이 아니라 같은 행을 갱신.
- **취소(void)**: 사유와 함께 무효화. 시트 출처 기록은 직접 취소 불가(가져오기가 관리).

### 3-6. 시트 가져오기 / 재고 계산 / 알림

- **가져오기**: Google 시트 강제 싱크 → 스냅샷 백업 → `hardware_movements`의 시트 이관분 교체.
- **재고 파생**: 원장에서 위치별 잔량·예상 가용(예정 차감)·30일 출고·주문 시점(리드타임 반영)을 계산.
- **알림**: 부족·주문 검토·배송 예정.

---

## 4. 데이터 모델 / API (요약)

테이블: `hardware_items` · `hardware_movements` · `hardware_import_runs` · `hardware_sheet_import_snapshots` · `branch_hw_inbound|outbound|stock`(시트 미러).

`hardware_movements` 주요 컬럼: `item_id, product_name, movement_type(inbound|outbound|return|transfer|repair|adjust), quantity, occurred_at, from_location, to_location, owner, status, reference_no, memo, serials[], lot_no, unit_price, amount_usd, amount_cny, storage_location, importer, source(admin_manual|sheet_import), import_run_id, raw, voided_*, converted_from/to_movement_id`.

RPC: `confirm_hardware_planned_movement(uuid,text,date,int)`(부분 확정) · `replace_hardware_sheet_import` · `restore_hardware_sheet_import_snapshot`.

API:
- `GET /api/admin/hardware` — 대시보드(items/stock/movements/recentOutbound/plannedMovements/alerts/totals/importRun)
- `POST /api/admin/hardware/movements` — 기록 생성
- `PATCH /api/admin/hardware/movements/[id]` — `{action: confirm-planned | void | update}`(confirm은 `confirmQty` 옵션)
- `POST /api/admin/hardware/import-sheet` — 싱크·백업 후 이관
- `GET /api/admin/hardware/crm-orders` — 출고 시 CRM 후보

---

## 5. movement 생애주기

```
생성(admin_manual | sheet_import)
  → [배송 예정] ──확정(convert)──▶ 실제 출고
        │                         · 전체: 예정 void + converted_to
        │                         · 부분: 예정 quantity 감소(잔여 유지)
        └─ void(취소) / update(수정, admin_manual·미전환만)
```

---

## 6. 마이그레이션 (라이브 적용 완료)

`20260626_*_ledger` · `20260626_*_workflow_guards` · `20260627_*_snapshots` · `20260628_*_lot` · `20260628_*_costing` · `20260629_*_partial_confirm` · `20260630_*_sheet_import_merge`(추가형 머지 RPC·라이브 적용, 플래그 off). 적용은 Supabase Management API query 엔드포인트로 수행(운영 메모 별도).

---

## 7. 추가형(누적) 시트 인제스트 — 설계 · cutover 런북

목표: 시트를 매번 통째 교체(delete+insert)하지 않고 동기화가 **누적**되도록. 대시보드는 이미 DB(`hardware_movements`) 기준이라 변경 대상은 인제스트뿐. (멀티에이전트 워크플로 + 적대적 검증으로 설계 확정 — 검증 4종 모두 초기안을 breaks 처리.)

핵심 설계:
- 시트엔 안정적 행 키가 없음(물류No 공란/임시·lot 다행, 비정규 날짜) → 콘텐츠 키 UPSERT는 **서로 다른 출고를 묵음 병합(과소집계)** 위험.
- 해법: **fingerprint(정체성)+digest(콘텐츠)**. `source_key = hash(제품·날짜·물류No·그룹 내 안정 ordinal)` — 같은 그룹은 ordinal로 항상 유일(구성상 충돌 불가). `source_digest`=콘텐츠 해시(편집 감지). 재고현황 보정은 제품당 1행(product-only 키).
- `merge_hardware_sheet_import` 4-pass: 신규 INSERT / 시트-tombstone 부활 / 변경분 in-place UPDATE / 사라진 행 soft-tombstone. **부재 >40% 시 fail-closed** 중단. converted·human_locked·타-사유 void 행은 불가침. admin_manual 무관.
- 부분 확정 잔여행은 `confirm`이 `human_locked_at` 스탬프 → 머지가 덮어쓰지 않음.
- 플래그 `HARDWARE_SHEET_ADDITIVE_MERGE`(기본 off). 롤백 = off (구 `replace`/`restore` RPC 그대로).

cutover 런북(코드 배포 후, 순서 중요):
1. 코드 배포(플래그 off). 마이그레이션 20260630은 이미 라이브.
2. **백필**: 가져오기 1회(아직 replace 경로) → 기존 행이 fingerprint `source_key`로 재기록. 충돌 시 unique index가 loud-fail(구성상 충돌 없음, 안전망).
3. `HARDWARE_SHEET_ADDITIVE_MERGE=1`.
4. 가져오기 재실행 → merge 경로. 카운트 `{inserted,updated,tombstoned,revived}` 확인(첫 머지는 digest 백필로 updated 큼=정상).
5. 패리티 확인: 직전 replace 결과와 첫 merge 결과의 `warehouseStock/availableStock/plannedOut/lotBalances` 동일.
- 문제 시 즉시 플래그 off → 다음 가져오기가 replace로 자가 치유.

최적화(누적이 천장을 제거 → fast-follow): `listAllHardwareMovements` 투영/기간 플로어 또는 `HARDWARE_INVENTORY_CACHE_TAG` 캐시 연결, 스냅샷 retention RPC.

## 8. 보류 / 다음

- **cutover 실행**(위 런북 2~5: 배포→백필→플래그 on→패리티). 현재 플래그 off로 동작 무변.
- 읽기 경로 최적화(투영/캐시), 스냅샷 retention.
- 제품 사진 칩 승격, 출고 매출(revenue) 필드, 잔여 디자인 정규화(전 입력 2px 포커스 링·타입/라디우스 통일·헤더 단일화).
