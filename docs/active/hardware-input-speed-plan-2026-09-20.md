# 하드웨어 탭 입력 가속 기획 — 더 빠르고 편한 기록

기준 시점: 2026-09-20
대상: `/admin/hardware` — [HardwareInventoryClient.tsx](../../components/admin/hardware/HardwareInventoryClient.tsx) · [components/admin/hardware/inventory](../../components/admin/hardware/inventory) · [app/api/admin/hardware](../../app/api/admin/hardware) · [lib/repositories/hardware-inventory.ts](../../lib/repositories/hardware-inventory.ts)
정본 연결: [하드웨어 SCM 탭 reference](./hardware-scm-tab-reference.md)(현재 상태·기능 정본) · [UX 계획·작업 내역](./hardware-admin-ux-plan.md)(방향성 지침) · [AGENTS.md](../../AGENTS.md) · [DESIGN.md](../../DESIGN.md)

이 문서는 화면 구조를 다시 그리는 기획이 아니다. **기록 한 건에 드는 시간**을 줄이는 기획이고, 줄이는 순서를 `대기 → 타건 → 입력 자체`로 고정한다.
아래의 현재 동작 서술은 모두 이 시점 코드에서 확인했고(줄 번호도 이 시점 기준이다), 운영 데이터 수치는 정본 문서(2026-09-15 실측) 인용이라 착수 전에 다시 확인한다.

---

## 0. 한 줄 목표

자주 하는 기록 5가지를 **"열고 → 고르고 → 저장"** 세 동작 안에서 끝낸다. 저장을 누른 뒤 다음 건을 치기까지 기다리지 않는다.

---

## 1. 선행 결정 — 속도보다 먼저 정해야 하는 것

정본 문서 §0 기준 원장 385행은 **전부 시트 이관분이고 어드민 수기 기록(`admin_manual`)은 0건**이다. 즉 지금 이 화면의 입력 경로는 사실상 아무도 쓰지 않는다.
이유는 속도가 아니라 규칙이다 — 어드민에서 확정한 뒤 교체 가져오기를 하면 같은 물량이 두 번 잡히는 문제(reference §8-6)가 열려 있어, 운영 우회가 "가져오기를 먼저 하고 남은 예정만 확정"으로 남아 있다.

**그래서 이 기획의 P0에는 코드가 아니라 결정이 하나 들어간다.** 어느 기록을 어드민이 정본으로 받을지 정하지 않으면, 입력을 아무리 빠르게 만들어도 쓰이지 않는다.

| 결정 | 선택지 | 이 기획에 주는 영향 |
| --- | --- | --- |
| 어드민 수기 입력의 범위 | (a) 입고만 먼저 어드민 정본 (b) 입고 + 샘플/사무실 유닛 (c) 출고까지 전부 | 범위 밖 경로는 P1~P2 투자 순위를 뒤로 미룬다 |
| 이중 계상 정책(reference §8-6) | (a) "가져오기 때는 시트가 이긴다"(교체 RPC에서 전환된 `admin_manual` 확정 void) (b) 현행 운영 우회 유지 | (b)로 남기면 출고 입력 가속(P2-1 CRM 제안 큐)은 착수하지 않는다 |
| 고객사 표기 정본 | (a) 원장 문자열 유지 + 링크만 추가 (b) 계정 마스터 이름으로 정규화 | P1-1 콤보박스의 저장 형식이 갈린다 |

권장: **(a) 입고 먼저 · 이중 계상은 "시트가 이긴다" 확정 · 고객사는 원장 문자열 유지 + 링크 추가.** 셋 다 되돌리기 비용이 가장 작고, 아래 P0~P1은 어느 선택지에서도 헛되지 않는다.

---

## 2. 지금 입력 경로 (코드 기준)

| 경로 | 화면 | 담당 | 현재 상태 |
| --- | --- | --- | --- |
| 입고 1물량 | 한 화면 입고표 | [InboundSheet.tsx](../../components/admin/hardware/inventory/InboundSheet.tsx) | 칩 선택(물량번호·입고일·수입자·보관처) + 품목 표. 검색 picker, 엑셀 붙여넣기, 직전 lot 구성 불러오기, Enter 행 이동, Cmd/Ctrl+Enter 저장까지 이미 있다 |
| 출고·샘플·예외 | 빠른 기록 시트 | [QuickRecordSheet.tsx](../../components/admin/hardware/inventory/QuickRecordSheet.tsx) | 단건/작업건(바구니) 2모드, 키트 프리셋, 견적 라인 붙여넣기, 직전 기록 복제, 연속 기록 토글 |
| 예상 출고 등록·확정 | 홈 예상 출고 큐 | [PlannedOutboundPanel.tsx](../../components/admin/hardware/inventory/PlannedOutboundPanel.tsx) | 행별 확정일 + 선택 일괄 확정(공통 확정일, 하단 고정 바) |
| 사무실·샘플 유닛 | 재고 풀 · 유닛 시트 | [OfficeSamplePoolSection.tsx](../../components/admin/hardware/inventory/OfficeSamplePoolSection.tsx) · [SampleUnitSheet.tsx](../../components/admin/hardware/inventory/SampleUnitSheet.tsx) | 행 펼침 → 유닛 다중 선택 → 일괄 상태 변경 |

**이미 잘 된 부분은 건드리지 않는다.** 칩·프리셋·바구니·일괄 확정은 그대로 두고, 아래 병목만 뗀다.

### 판매 출고 1건의 실제 단계 (현재)

1. FAB "기록" → 시트 열림(판매 출고·수량 1·오늘·출발 창고 기본값) — `HardwareInventoryClient.tsx:2569`
2. 품목: 주요 4종(86"·75" IFP·STD1·T1)은 칩 1회, 그 밖은 **전 품목 `<select>`를 훑는다** — `QuickRecordSheet.tsx:742`
3. 수량: 칩(1·2·5·10) 또는 스테퍼
4. **도착(고객사): 자유 텍스트로 매번 학원명을 친다** — `QuickRecordSheet.tsx:1080`
5. 저장 → CRM 후보 조회 대기 → 후보·경고가 있으면 확인 모달 → 저장 → **대시보드 전량 재조회를 기다린 뒤에야 다음 건** — `HardwareInventoryClient.tsx:3054`

즉 클릭 수보다 **① 고객사 타이핑 ② 저장 후 대기**가 체감 시간을 지배한다.

---

## 3. 병목 7가지 (근거와 처방)

| # | 병목 | 근거 (2026-09-20 기준) | 영향 | 처방 |
| --- | --- | --- | --- | --- |
| B1 | 저장할 때마다 대시보드 전량 재계산을 **기다린다** | `HardwareInventoryClient.tsx:3054`(`await refresh()`), 쓰기마다 `revalidateTag(…,"max")`(`hardware-inventory.ts:993`) → 다음 GET이 원장 전량 + 재고·알림을 새로 계산(`app/api/admin/hardware/route.ts:46`) | 연속 기록 모드에서도 건마다 대기. 행별 예정 확정(`:2411`)도 같다 | P0-1 · P0-3 |
| B2 | 배치 저장이 **줄 수만큼 왕복**한다 | `app/api/admin/hardware/movements/route.ts:94`가 줄마다 `createHardwareMovementRows` 호출 → 줄마다 품목 해결 + CRM 중복 검사 + (실제 출고면) 품목 전체 원장 스캔(`hardware-inventory.ts:853`) + INSERT + 캐시 무효화. 정작 배치 경로(`hardware-inventory.ts:963`)는 쓰이지 않는다 | 입고표 20줄이면 INSERT 20회·캐시 무효화 20회, 출고 바구니는 줄마다 원장 스캔 | P0-2 |
| B3 | 고객사가 **자유 텍스트**다 | `QuickRecordSheet.tsx:1080`·`1442`(datalist), 프리셋의 `to`는 의도적으로 빈 값(`shared.tsx:243`), 후보는 원장 문자열에서만 만든다(`HardwareInventoryClient.tsx:1828`) | 매번 전체 타이핑(IME). 표기가 흔들리면 고객 집계·360 링크가 쪼개진다. 모바일에선 datalist 제안이 사실상 안 뜬다 | P1-1 |
| B4 | CRM 후보가 **고객사를 안 본다** | `app/api/admin/hardware/crm-orders/route.ts:18`은 `productName`·`quantity`만 받고, 신뢰도도 품목·수량만 본다(`hardware-crm-orders.ts:confidenceFromMatch`) | 같은 품목·수량의 다른 딜이 섞여 후보 고르기가 사람 판단으로 남고, 확인 모달이 한 단계 더 든다 | P1-2 |
| B5 | 빠른 기록에만 **품목 검색이 없다** | `QuickRecordSheet.tsx:742`는 전 품목 `<select>`. 입고표는 검색 picker가 있다(`InboundSheet.tsx:1216`) | 주요 4종 밖(OPS·케이블·브라켓 등) 출고가 느리다 | P1-3 |
| B6 | 작성 중 입력이 **새로고침·이탈에 사라진다** | localStorage 키가 담당자·연속기록 2개뿐(`HardwareInventoryClient.tsx:250`) | 창고·현장에서 탭이 폐기되면 입고표 한 물량을 처음부터 다시 친다 | P3-1 · P3-2 |
| B7 | 전역 단축키가 없다 | 문서 레벨 키 처리는 Escape 하나(`HardwareInventoryClient.tsx:767`). Enter 행 이동·Cmd/Ctrl+Enter 저장은 입고표에만 있다(`inbound-sheet-model.ts:929`) | 데스크톱 연속 입력이 마우스에 묶인다 | P1-5 |

---

## 4. 목표 지표

계측은 기존 감사 관례와 같게 **운영자 1인 · 시나리오별 5회 반복 수동 측정**(클릭 수 · 키 입력 수 · 대기 구간 수)으로 한다. 착수 전 1회, P0 후 1회, P1 후 1회.

| 시나리오 | 현재(코드 기준 추정) | 목표 |
| --- | --- | --- |
| S1 판매 출고 1건(재고 행에서 시작) | 클릭 4~5 + 고객사 타이핑 + 대기 2회 | 클릭 ≤3 · **타이핑 0**(고객사는 선택) · 대기 1회 |
| S2 입고 1물량 6줄 | 칩 4 + 수량 6칸 + 저장 1 + 서버 왕복 6+ | 저장 **1왕복** · 저장~완료 2초 이내 |
| S3 예상 출고 등록 1건 | 시트 열고 품목·수량·고객사·예정 선택 | CRM 제안 행에서 **1클릭**(P2-1 채택 시) |
| S4 예정 확정 10건 | 공통 확정일 1 + 선택 + 확정 1 (이미 좋음) | 유지 · 확정 후 재검증 1회로 축소 |
| S5 샘플 대여 1건 | 고객사 타이핑 + 유닛 칩 선택 | 고객사 선택 + 유닛 칩 유지 |

---

## 5. 실행 계획

### P0 — 대기 없애기 (계약 변경 없음, 가장 먼저)

**P0-1. 저장 후 낙관 반영 + 백그라운드 재검증**
- 문제: B1. `createMovementFromDraft`가 `await refresh()`로 대시보드 전량을 기다린 뒤에야 다음 입력을 받는다.
- 바꿀 것: POST 응답의 movement를 `data.movements`에 즉시 끼워 넣고 노티스를 띄운 뒤, `refresh()`는 **await 하지 않는다**(입고표가 이미 쓰는 `void refresh()` 방식과 통일 — `HardwareInventoryClient.tsx:3607`). 버튼 잠금은 그 요청 동안만.
- **재고·가용·알림 같은 파생 숫자는 낙관 반영하지 않는다.** 서버 계산이 정본이고, 화면에서 흉내 내면 "가용"이 틀린다. 원장 줄 추가와 성공 문구까지만 즉시, 숫자는 재검증 도착 시 교체한다.
- 파일: `HardwareInventoryClient.tsx`(`createMovementFromDraft`·`submitEdit`·`confirmPlannedMovement`)
- 검증: `tests/admin/hardware-*` 기존 세트 + 저장 직후 시트가 다음 입력을 받는지 수동 확인.

**P0-2. 배치 저장 1왕복**
- 문제: B2.
- 바꿀 것: `movements/route.ts`의 배치 경로가 줄별 결과 계약(201/207/422, `lineResults`)을 **그대로 유지한 채** 저장소의 배치 경로를 쓴다. 2패스로 나눈다 — ① 줄별 검증·품목 해결·중복 검사(실패 줄은 여기서 격리) ② 통과한 줄만 모아 로트 잔량 **1회 스냅샷 후 메모리 차감**으로 배정하고 INSERT 1회, `revalidateTag` 1회.
- 로트 배정 규칙은 `resolveHardwareLotBalances` 하나를 계속 쓴다(규칙을 두 번 구현하지 않는다 — reference §3-4).
- 파일: `app/api/admin/hardware/movements/route.ts`, `lib/repositories/hardware-inventory.ts`
- 검증: `tests/api/admin-hardware-movements.test.ts` 확장 — 부분 실패 줄 격리, 같은 CRM 오더 중복, **배치 내 연속 출고의 로트 배정이 줄 단위 저장과 동일**한지.

**P0-3. 확정 후 재검증 1회로**
- 행별 확정도 그룹 확정처럼 묶어서 마지막에 한 번만 재검증한다(`HardwareInventoryClient.tsx:2411` ↔ `:2455`).

### P1 — 타건 없애기

**P1-1. 고객사 콤보박스 (공용 부품)**
- 문제: B3. 목표는 "고객사를 치지 않고 고른다".
- 1차 소스: 이미 있는 `GET /api/admin/hardware?scope=customer-links`(캐시되는 경량 투영 — `hardware-inventory.ts:477`). 최근 출고 고객이 위로 오게 정렬.
- 새 고객은 **언제나 자유 입력으로 저장된다**(현장을 막지 않는다). 목록에 없으면 "새 고객사로 기록" 행을 그대로 쓴다.
- 저장 형식: 표시명은 지금처럼 `toLocation`에, 선택했을 때만 `raw.customerLink`에 accountKey를 남긴다 — 원장 문자열 계약(`customerLabel`)을 건드리지 않는다.
- 모바일은 풀스크린 선택 패널(datalist 금지).
- ⚠️ CRM의 `source-links/targets`는 요청마다 2000행×3을 읽어(`crm-source-links.ts:1576`) 인라인 검색에 쓸 수 없다. 계정 정본 검색이 필요하면 **가벼운 전용 엔드포인트를 따로** 만든다.
- 파일: `components/admin/hardware/inventory/`에 `CustomerPicker` 신설 + `QuickRecordSheet`(도착·샘플 대여 고객사 2곳) 배선.

**P1-2. CRM 후보에 고객사 넘기기**
- `crm-orders`에 `customer` 파라미터를 더하고 신뢰도 계산에 고객명 일치를 가중한다. 품목·수량·고객사가 모두 맞으면 후보가 하나로 좁혀져 확인 모달이 한 번에 끝난다(모달 자체는 유지 — 자동 링크·무음 저장은 하지 않는다).
- 파일: `app/api/admin/hardware/crm-orders/route.ts`, `lib/repositories/hardware-crm-orders.ts`, `HardwareInventoryClient.tsx:2871`

**P1-3. 품목 검색 picker 공용화**
- 입고표의 검색 picker(`InboundSheet.tsx:1201`)를 `ProductPicker`로 승격해 빠른 기록 시트의 `<select>`를 교체한다. 주요 4종 칩은 그대로 위에 둔다.

**P1-4. 기억값 확장**
- 프리셋별 마지막 값(담당자·출발지·보관처·수입자)을 버전 키가 붙은 localStorage에 기억한다. **건 단위 값(lot·참조번호·수량)은 절대 상속하지 않는다** — 이미 코드가 지키는 규칙이다(`HardwareInventoryClient.tsx:3035`).

**P1-5. 키보드**
- 목록에서 `i` = 입고표, `o` = 출고 시트(입력 포커스·모달·IME 조합 중에는 무시). 시트에서 Cmd/Ctrl+Enter 저장 — 입고표와 같은 규약(`inbound-sheet-model.ts:929`)을 재사용한다.

### P2 — 입력 자체를 줄이기 (§1 결정이 (a)·(c)일 때)

**P2-1. CRM 딜 → 예상 출고 제안 큐**
- 대부분의 출고는 이미 CRM/견적에 있다. 그러면 "입력"이 아니라 "확인"이어야 한다.
- `listHardwareCrmOrderCandidates`가 이미 읽는 딜·견적 라인 중 **원장에 대응 예정/출고가 없는 것**을 홈 예상 출고 큐 위에 "CRM에 있는데 원장에 없는 건 N"으로 띄우고, 행마다 `[예정 등록]` 1클릭. 고객사·수량·참조번호·crmLink가 그대로 들어간다.
- 중복은 서버가 이미 막는다(`ensureNoDuplicateCrmMovement`).

**P2-2. 확정일 기본값을 일정에서**
- 예정 확정의 기본 확정일을 오늘이 아니라 연결된 설치·배송 일정에서 끌어온다(있을 때만, 없으면 오늘 유지).

**P2-3. 입고표 자동 초안**
- 시트 미러(`branch_hw_inbound`)에 원장에 없는 새 물량번호가 보이면, 입고표를 그 lot 구성으로 미리 채워 연다. 저장은 사람이 누른다.

### P3 — 현장·모바일

- **P3-1. 드래프트 자동 저장·복구**: 입고표와 바구니를 스키마 버전 + 만료(24h)로 localStorage에 저장하고, 다시 열 때 "작성 중이던 입고표 {lot} N줄을 이어서 작성할까요?" 배너. storage 불가 환경은 조용히 비활성(기존 `writeLocalString` 관례).
- **P3-2. 저장 실패 큐**: 네트워크 실패 시 입력을 지우지 않고 "다시 보내기" 한 번. **자동 재전송은 하지 않는다** — 원장 중복 위험이 사람 확인보다 크다.
- **P3-3. 시리얼 스캔**: `BarcodeDetector`를 지원하는 브라우저에서만 카메라 스캔 버튼 노출. 시리얼 개수 = 수량 검증은 그대로(`inbound-sheet-model.ts:781`).
- **P3-4. 한 손 조작**: 입고표 하단 저장 바 유지 + 행 이동 버튼(모바일은 Enter 행 이동이 잘 안 잡힌다).

---

## 6. 계약 원칙 · 비범위

원칙(기존 방향성 지침 §3-1 유지):
- 입력은 `POST /api/admin/hardware/movements`, 확정은 `PATCH …/movements/[id]`, 취소는 `{action:"void"}`. **새 쓰기 엔드포인트를 늘리지 않는다.**
- 로트 규칙은 `resolveHardwareLotBalances` 하나만 쓴다.
- 서버 권한 게이트(`requireVerifiedAdminContext` · `hardware.finalize`)는 그대로. 화면은 비활성 표시만 한다.
- 색·보더·상태색은 `DESIGN.md` 팔레트와 운영 상태 스케일 안에서.

비범위: 시트 인제스트 방식 변경(reference §7 cutover), 금액·복원 마이그레이션 적용(§6-2), 원장 스키마 변경, 권한 모델 변경, 오프라인 자동 재전송, 화면 IA 재설계.

---

## 7. 위험과 완화

| 위험 | 완화 |
| --- | --- |
| 낙관 반영이 재고·가용을 앞당겨 보여준다 | 원장 줄만 낙관 반영하고 파생 숫자는 재검증 뒤 교체(P0-1에 명시) |
| 배치 경로 전환이 줄별 오류 문구를 뭉갠다 | 2패스로 실패 줄을 먼저 격리하고, 기존 `lineResults` 계약을 테스트로 고정 |
| 고객사 콤보박스가 새 고객 입력을 막는다 | 자유 입력 상시 허용 — 목록은 제안일 뿐 |
| 단축키가 입력 중 오발사 | 입력 포커스·모달·IME 조합 가드(입고표 규약 재사용) |
| 드래프트 복구가 오래된 값을 되살린다 | 스키마 버전 + 24h 만료 + 복구 배너에서 사람이 선택 |

---

## 8. 검증

```bash
npm run typecheck
npx eslint app components lib --max-warnings=0
npm run build
```

추가로 하드웨어 세트: `npx vitest run tests/admin/hardware-* tests/api/admin-hardware-* tests/repositories/hardware-*`
P0-2는 배치 저장 계약 테스트가 초록이어야 병합한다.

---

## 9. 운영자 결정이 필요한 것

1. §1 표의 세 결정(어드민 입력 범위 · 이중 계상 정책 · 고객사 표기 정본).
2. 단축키 키맵(`i` 입고 / `o` 출고)이 손에 맞는지.
3. S1~S5 중 지금 가장 자주 하는 기록 순서 — P1 착수 순서를 그 순서로 맞춘다.
