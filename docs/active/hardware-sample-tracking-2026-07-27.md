# 하드웨어 샘플 개체 트래킹 설계 (2026-07-27)

## 배경 / 문제

- 샘플 이동은 원장([hardware_movements](../../supabase/migrations/20260626_hardware_inventory_ledger.sql))에 남지만 도착지가 고정값 `"샘플"`이라 **어느 고객(학원)에 갔는지 구조화되지 않는다.** 실제 행방은 memo 자유텍스트에만 존재(실측: 전체 365건 중 샘플 관련 24건, 시리얼 보유 5건뿐).
- 메모는 이동 1건당 1개 고정 — 대여 후 "회수 예정", "파손 확인" 같은 **후속 메모를 붙일 자리가 없다.**
- 화면은 위치 잔량 집계뿐(남은 샘플/나간 샘플) — "누가·언제부터·몇 대"에 답하지 못한다.

## 결정 (사용자 확정)

**개체(유닛) 단위 경로 트래킹** — 샘플 규모가 작아(수십 대) 1대=1행 관리가 가능. 대여 워크플로우(고객·수량)는 유닛 위에 얹는다(B-C 연계). 실물 시리얼이 데이터에 없으므로 **내부 관리번호를 자동 채번**하고 `serial_no`는 실사 때 채우는 선택 필드로 둔다.

## 데이터 모델

마이그레이션: `supabase/migrations/20260727_hardware_sample_tracking.sql`

### hardware_sample_units — 샘플 1대 = 1행

| 컬럼 | 내용 |
|---|---|
| `asset_code` | 내부 관리번호, unique — `S-{제품코드}-{순번}` 자동 채번 |
| `serial_no` | 실물 시리얼(선택, 실사 시 기입) |
| `item_id`, `product_name` | hardware_items 참조(soft — on delete set null) + 표시명 |
| `status` | `office`(사무실 보관) / `loaned`(대여중) / `repair` / `converted`(판매 전환) / `retired` |
| `current_customer`, `current_owner` | 현재 보유 고객·담당 |
| `loaned_at`, `expected_return_at` | 대여일 / 회수 예정일(선택) |

### hardware_sample_events — 경로 + 메모 단일 타임라인

| 컬럼 | 내용 |
|---|---|
| `unit_id` | units FK (cascade) |
| `event_type` | `assign`(배정/등록) / `loan` / `return` / `repair` / `convert` / `adjust`(정정) / `memo` / `retire` |
| `occurred_at`, `customer`, `from_location`, `to_location`, `memo` | 경로·내용 |
| `movement_ref` | 원장 movement id **soft 참조**(text, FK 아님) — 시트 가져오기가 원장을 교체하므로 유닛 이력은 독립 보존 |
| `created_by` | 기록자 |

RLS는 기존 hardware 테이블과 동일 규약: RLS enable + anon/authenticated revoke + service_role grant (어드민 API는 admin 클라이언트 사용).

## 원장 연계

- 원장은 계속 **수량의 진실**. 유닛은 그 위의 생애 레이어 — 기존 집계(위치 맵·기간 집계)에 영향 없음.
- 입출고 시트 연동:
  - **샘플 배정**(창고→사무실): 저장 시 수량만큼 유닛 자동 발급 + `assign` 이벤트
  - **샘플 대여**: 고객명 입력(신규 필드) + 사무실 보유 유닛에서 수량만큼 선택 → movement + `loan` 이벤트, 유닛 `loaned` 전환. 수량≠선택 유닛 수면 저장 차단
  - **샘플 반환**: 대여중 유닛 선택 → `return` 이벤트, `office` 복귀
  - **판매 전환**: 대여중 유닛에 `convert` — 원장의 판매 출고와 soft 링크
- 시트 임포트로 들어온 샘플 이동은 유닛 자동 매칭 불가 → 트래커의 정합 배지로 노출하고 수동 정정(`adjust`).
- movement 무효화(void) 시 유닛 이벤트 자동 롤백은 하지 않는다 — 트래커에서 `adjust`로 정정(원장과 트래커의 책임 분리).

## UI

- 홈 탭 위치 맵 아래 **샘플 트래커** 섹션: 유닛 리스트(관리번호 · 제품 · 상태 배지 · 현재 고객 · 경과일 · 최근 메모 1줄) + 상태 필터 칩 + 위치 맵 잔량과 유닛 집계 불일치 시 "정합 확인" 배지.
- 유닛 클릭 → 슬라이드오버: 경로 타임라인(배정→대여(고객)→메모→반환→…, 메모가 경로 사이에 인터리브) + 하단 메모 입력 + 상태 액션(대여/반환/전환/정정). 기존 슬라이드오버 패턴([CustomerHistorySheet](../../components/admin/hardware/inventory/CustomerHistorySheet.tsx)) 재사용.

## 백필 / 초기 등록

- 위치 맵 잔량(사무실 보관 + 나간 샘플) 대비 미등록 수량을 계산해 **원클릭 초기 등록**: 제품별 유닛 발급, 나간 샘플은 `loaned`+고객 "미상"으로 생성 → 이후 어드민에서 고객 정정. 과거 자유텍스트 24건을 억지로 이식하지 않고 여기서부터 정밀 트래킹 시작.

## API / 코드 배치

- `app/api/admin/hardware/samples/route.ts` — GET(유닛+이벤트), POST(`register`/`event`/`memo`), `verifyAdmin` + admin 클라이언트
- `lib/repositories/hardware-samples.ts` — 데이터 접근 집약
- `components/admin/hardware/inventory/SampleTrackerSection.tsx`, `SampleUnitSheet.tsx`

## 스코프 아웃

회수기한 초과 알림/푸시, QR 라벨, 시리얼 스캔, movement void 자동 롤백. (회수예정일 필드 + 경과일 표시까지만.)

## 검증

`npx eslint app components lib --max-warnings=0` + `npm run build` + dev 실화면 스모크(등록→대여→메모→반환 왕복).
