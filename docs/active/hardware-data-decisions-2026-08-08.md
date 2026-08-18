# 하드웨어 재고 — 데이터 판단 대기 체크리스트 (2026-08-08)

상태: 실행 대기 판단 목록 (UI/코드 변경 없이 운영 판단이 필요한 항목)
범위: `/admin/hardware`, 하드웨어 구글시트, 하드웨어 원장

2026-08-08 C1(FPL) 동기화 작업 중 발견된 판단 요소들이다. 각 항목은 결정권자가 정하면
코드 또는 시트에서 즉시 실행할 수 있게 현재 상태와 선택지를 함께 적는다. 결정된 항목은
체크 후 실행 커밋/시트 수정 링크를 남기고, 전부 끝나면 이 문서를 `docs/archive/`로 옮긴다.

- [ ] **출고 시트 311행 날짜 오타** — '3.출고 현황' 311행(라임라잇수학 · STD1 1대 · 배송 예정)의
      날짜가 `2026.8.00`(일=00). 현재 파서가 "일자 미정"(null)으로 강등해 들여오는 중.
      → 시트에서 실제 예정일로 수정하면 다음 동기화 때 자동 반영.
- [ ] **원장 컬럼 드랍 마이그레이션 적용** — 운영 DB의 `replace_hardware_sheet_import` RPC가
      구버전이라 `unit_price` · `amount_usd` · `amount_cny` · `storage_location`(보관처 원문,
      예: "인천 더조은")을 버린다. 읽기 경로는 raw 복구로 버티는 중.
      → `supabase/migrations/20260630_hardware_sheet_import_inbound_costing.sql` 운영 적용 여부 결정.
- [ ] **보관처 "클래스인" 정규화** — C1의 S1 카메라 1대가 보관처 "클래스인"(본사 보관 추정)으로
      별도 위치에 남아 있음. 창고/사무실 중 어디로 칠지 결정하면
      `normalizeLocationName`(lib/repositories/hardware-inventory.ts)에 규칙 1줄 추가.
- [ ] **C-시리즈 lot FIFO 순서** — `lotFifoRank`가 H-넘버만 랭킹해 C-lot은 H 뒤 알파벳 순.
      현재(H가 C1보다 오래됨)는 시간순과 일치. C2 이후 혼합 재고가 생기면 C-넘버 랭킹 추가 여부 결정.
- [ ] **스탠드(STD1) 가용 −3** — 예정 22 > 창고 19. 재고 확보 또는 예정 물량 조정 판단.
      → 2026-08-18 확인: −3은 STD1(promoted) −16이 카드에 합산돼 생긴 표시 문제였고, 카드
      promoted 분리 후 STD1 실재고는 창고 35 · 가용 17로 건강. 잔여 판단은 아래 promoted 항목만.
- [ ] **promoted 라인 음수 재고** — STD1(promoted) 현재고 −16 등. 재고현황 시트 기준 보정이
      음수 그대로면 원장 유형(promoted 판정) 또는 시트 수치 정리 필요.
      → 2026-08-18: 카드에서 `판촉 −16 · 점검` 데인저 칩으로 분리 표시(합산 오염 제거). 원장
      정리 판단 자체는 계속 대기.
- [ ] **신규 제품군 카테고리 매핑** — 재고현황에 A1(80대) · B1 · D2 · OPS · POE · 카메라 브라켓 ·
      전원 케이블(1m/3m) 등이 잡히는데, 홈 카테고리 카드(86/75/카메라/스탠드)와
      "총 입고(86·75·T1)" 집계에는 빠져 있음. 카드에 담을 축(예: 액세서리 묶음) 결정 필요.
      → 2026-08-18: 예시안(액세서리 묶음)을 기본값으로 이행 — 홈 카드 아래 "액세서리 · 기타"
      스트립(창고 총량·종수·품목 칩)과 입고 헤더 "전 품목 N대" 병기 라이브. 축을 바꾸려면
      `hardwareCardGroup`(components/admin/hardware/inventory/shared.tsx) 한 곳만 수정.

관련 코드 기준: 위치 정규화·FIFO는 `lib/repositories/hardware-inventory.ts`,
lot 라벨·랭킹은 `components/admin/hardware/inventory/shared.tsx`, 카테고리 카드 구성은
`components/admin/hardware/HardwareInventoryClient.tsx`의 `categoryCards` useMemo.
