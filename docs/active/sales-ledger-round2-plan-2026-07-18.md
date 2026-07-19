# 매출 장부 2차 디벨롭 기획 — 시안(매출시트 웹앱 개선안) 이식 라운드 2

**상태(2026-07-19): 라운드 2(Track A/B/C) 전부 구현·커밋·검증 완료.** 이 문서는 그 근거와, §3 다음 작업
예정 목록(라운드 3 후보)의 기준점으로 유지한다.

2026-07-18. 1차(보드 렌즈 = Board-1b 이식) 후속. 근거 시안: 디자인 프로젝트 "매출시트 웹앱 개선안"
(`Ledger-1a` 원장 테이블 / `Board-1b` 주차 칸반(1차 완료) / `Cockpit-1c` 입력 콕핏 /
`Sales-Ledger-App` 설계 개요 캔버스). 관련 화면: [SalesLedgerWorkbench](../../components/admin/branch/SalesLedgerWorkbench.tsx) ·
[RevMatrix](../../components/admin/branch/ledger/RevMatrix.tsx) · [ForecastBoard](../../components/admin/branch/ledger/ForecastBoard.tsx) ·
[InputRailSection](../../components/admin/branch/ledger/InputRailSection.tsx).

## 0. 시안의 중심 원칙 (이번 라운드의 판단 기준)

- **"한 줄엔 본질만"**: 신원(이름)은 1열, 메타는 칩 2개+`+N` 압축, 전체는 한 클릭 뒤(행 확장/팝오버).
- **월 합 = 주차 자동합계(수정 불가)**: 합계는 파생값 — 주차↔월 불일치 버그 클래스를 UI에서 제거.
- **확정/예상은 색이 아니라 형태**(솔리드 채움 vs 점선 테두리) — 블루프린트 문법.
- **읽기 우선, 편집은 명시적 진입**(행 클릭=펼침, 연필=편집 — 이벤트 분리).

## 1. 이번 라운드 트랙 (구현)

### Track A — REV 1열 미니멀화 + 연결 2단계 공개 (운영자 지적 직결)
- 1열 상시 노출은 (셰브론)+고객명+서브라인(담당·팀·지역)만. ⓘ 계보는 우측 레일 행 상세로 이동,
  SW/HW 라벨·HW ↗ 링크는 1열에서 제거(상품 전용 칼럼·레일 하드웨어 ↗가 이미 있음).
- 미연결 "연결" 칩은 톤 다운 + **클릭 → 간단 팝오버(상태 설명) → "매칭 인박스에서 연결 ↗" 상세 진입**.
  기존 원클릭 직행(`/admin/crm/matching?name=…`)을 2단계 공개로 전환.

### Track B — 입력뷰: 주차 분해 그리드 (Ledger-1a 다이얼로그 · Cockpit-1c 그리드 이식)
- 빠른 작업 레일 입력 폼에 "주차 분해" 모드: `[W라벨 | ¥입력]` 5행 + **월 합 자동(읽기전용) + 확정/고확도/예정 분리 readout**.
- 저장은 기존 규약 재사용: `metadata.weekly`(5칸) + `amount=주차 합` (매트릭스 주차 병합 커밋과 동일 —
  [onCommitCell](../../components/admin/branch/SalesLedgerWorkbench.tsx) 규약). 행 선택 시 explicit 주차 프리필.
- 시안의 **주차별 확정/예상 개별 토글**은 초안 스키마가 확도를 초안 단위로만 기록해 이번 라운드 보류(§3).

### Track C — 렌즈별 연동 (교차 이동 + 딥링크 신뢰성)
- same-route 딥링크 결함 수리: **완료** — URL 복원이 `useSearchParams` 반응형·절대 계약으로 전환됨
  (워크벤치 내부 링크·뒤로가기에서도 lens/q/month가 실제 적용, 부재 파라미터는 기본값 리셋).
- 남은 범위 — 레일 행 상세에 교차 점프: 보드에서 열었으면 "REV 매트릭스에서 보기"(lens 전환+고객 검색),
  REV에서 열었으면 "보드에서 보기"(같은 월 카드 하이라이트 — selectedRowId 기존 배선 재사용).

## 2. 커밋 전략

트랙당 1커밋(롤백 단위), 각 커밋 전 게이트: `npx vitest run --dir tests/branch` + `npx eslint app components lib --max-warnings=0`,
라운드 종료 시 `npm run build` + 브라우저 실동작 확인.

## 3. 다음 작업 예정 목록 (라운드 3 후보, 가치 순)

- [x] **주차별 확정/예상 개별 기록** — P1, 규모 大 — **구현 완료 (2026-07-19)**
  설계는 §3.5(병렬 배열 `metadata.weeklyConfidence` — 튜플 확장 대신 하위호환 우선). 레일 주차별 3단
  확도 seg + 우세 확도 자동 기록, 적용 맵 exact 합, projection·보드 exact 버킷, 큐 확도 도트. 서버 무변경.
- [x] **분기/월 확도 스택 게이지를 REV 카드 헤더로 승격** — P2, 규모 小 — **구현 완료 (2026-07-19)**
  shared의 ConfidenceStackBar로 추출(보드 헤더와 SSOT 공유), REV 보조 분석 요약 라인 아래 상시 노출
  (선택월 스코프 — 기간 스코프인 상단 MetricTile과 중복 아님으로 판정).
- [x] ~~**매트릭스 셀 확도 표현을 형태 문법으로 보강**~~ — **검토 결과 NO-GO** (2026-07-19, §4 근거)
- [x] **"내 딜" 스코프 프리셋** — P3, 규모 小 — **구현 완료 (2026-07-19)**
  담당자 MultiSelect에 개요와 같은 저장 키 공유 핀 배선. 복원은 pristine 진입(파라미터 전무) 최초
  1회만 — 딥링크에는 절대 계약 우선(핀이 검색 결과를 가리지 않음).
- [x] ~~**Cockpit-1c 마스터-디테일 입력 콕핏 재평가**~~ — **재평가 완료: 채택 안 함** (2026-07-19, §4 근거)
- [x] ~~**Customers 탭**~~ — **대체 완료로 종결** (2026-07-19)
  시안에 포부만 존재(프로토타입 없음)했고, 그 실질 요구(고객 축 보기 + CRM 상세 진입)는
  [기존 고객 그룹핑·레일 그룹 요약] + [연결 고객 → CRM 진입로(coverage linkedTargets, 레일 CRM ↗)]로
  충족된다. 별도 탭은 CRM 고객 화면과 중복이라 만들지 않는다 — 이로써 시안 이식 사이클 전 항목 종결.

## 3.5 라운드 3 — P1 스키마 설계 확정 (2026-07-19)

전 구간(초안 API → 저장소 → 적용 엔트리) metadata가 passthrough임을 실측 확인 — **서버 무변경**.

- **스키마**: `metadata.weeklyConfidence: (expected|high-confidence|confirmed | null)[5]` — `metadata.weekly`(금액 5칸)와
  병렬, 금액 0/빈 주차는 null. 필드 부재(기존 초안)는 현행 폴백(초안 단위 `metadata.confidence`) — 완전 하위호환.
  `[금액,'c'|'e']` 튜플 대신 병렬 배열을 택한 이유: mergedWeeklyFromMetadata 등 기존 금액 소비자를 전부 무변경으로 보존.
- **쓰기**: 레일 주차 분해 그리드에 주차별 3단 확도 seg(캐논 어휘 유지 — 시안의 c/e 2단 대신). weeklyMode에서
  기존 확도 블록은 "전체 일괄 적용"으로 동작. `metadata.confidence`에는 우세 확도(금액 합 최대 버킷, 동률은 낮은
  확도)를 자동 기록 — 큐 배지·매트릭스 pending 등 기존 소비자 의미 보존. 단일 금액 경로는 `weeklyConfidence: null`
  명시(재편집 잔존 제거, weekly:null 규약과 동일). 매트릭스 주차 셀 병합 커밋은 편집 주차만 새 확도, 나머지는
  기존 weeklyConfidence 보존(없으면 null).
- **읽기**: appliedDraftConfidenceMaps — weeklyConfidence 있으면 monthlyConfirmed/HighConf를 주차 합 exact로,
  red는 전액 확정(¥1 오차)일 때만. buildRevWeekProjection·보드 카드 — 해당 행은 비례 배분 대신 주차별 exact 버킷.
  큐 카드 주차 표기에 확도 도트.

## 4. 비이식 결정 기록

- Industry DS의 블루프린트 코너 장식·전용 폰트는 이식하지 않는다 — 어드민은 [DESIGN.md](../../DESIGN.md) 팔레트/토큰이 정본.
- 시안의 "저장=토스트만(라이브 패치)" 모델(Cockpit-1c)은 채택하지 않는다 — 장부는 초안 큐(검수 → 적용) 규약이 정본.
- **매트릭스 셀 점선(형태) 문법 NO-GO** (2026-07-19 검토): 매트릭스 셀은 이미 글자색(확도 3색 SSOT)+굵기
  (확정/고확도 bold)+잠금 아이콘의 3중 인코딩으로 비색상 채널까지 확보돼 있다. 점선 문법은 카드/큰 셀
  스케일(보드 카드·입력 그리드 — 라운드 1~2에서 이미 적용)에서 작동하는 언어이고, 12개월×수백 행 64px
  셀에 1px dashed를 깔면 표 격자선과 간섭해 순수 노이즈가 된다. 매트릭스는 시트 원본과의 시각 동형성이
  우선인 "숫자 검수 밀도 표" 장르 — 형태 문법 확장 안 함.
- **Cockpit-1c 마스터-디테일 콕핏 채택 안 함** (2026-07-19 재평가): 콕핏의 가치(좌 딜 순회+우 주차 즉시
  입력)는 매트릭스 1열(검색·필터 완비)+빠른 작업 레일(주차 분해 그리드+주차별 확도)로 기능 동등이 됐다.
  전용 라우트는 URL/필터/큐 상태 이원화 비용과 어드민 화면 중복(전수 감사의 화면 축소 방향 역행)만 남는다.
  대량 입력 순회는 매트릭스 인라인 편집 단축키(Enter/Tab/Ctrl+D/Ctrl+V)가 이미 담당.
