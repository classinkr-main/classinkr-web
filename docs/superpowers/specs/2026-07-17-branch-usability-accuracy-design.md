# 브랜치 대시보드 사용성 디벨롭 — 정확성 유지 3종

- 날짜: 2026-07-17
- 상태: 설계 확정(사용자 1·2·3 선택), 목업 검토 중
- 원칙: **집계·계산 로직은 일절 건드리지 않는다.** 전부 표시 레이어 — 숫자를 의심하고 추적하는 비용을 줄이는 방향.

## 항목 1 — 단위 표기 통일 + 원값 호버

**현상:** 같은 숫자가 KR Team에선 `¥8.3만`(cny() 억/만 축약), 장부 그리드에선 `단위: 천`, 시트에선 `¥83,418`로 3가지 표기. 통화 ¥은 CNY(본사 보고 통화)로 의도된 것 — `lib/branch/money-format.ts` cny() 참조.

**결정:**
- 각 표면의 스케일은 유지한다 (대시보드=억/만 축약, 검수 그리드=천 밀도). 통일하는 것은 **규칙의 명시**와 **원값 접근성**.
- 모든 축약 금액에 **호버 시 원값 전체 자릿수** 노출: `lib/branch/money-format.ts`에 `cnyExact(n)`(= `¥83,418` 로케일 콤마) 추가, 공용 `<MoneyValue value={n}/>` 컴포넌트(축약 표기 + `title`/스타일드 툴팁으로 원값) 신설 후 KR Team sections 9개 파일의 `¥${cny(n)}` 호출부를 교체.
- 장부 그리드·매트릭스 셀은 네이티브 `title` 속성으로 원값(반올림 전) 노출 — formatThousands가 반올림하므로 원값과 다를 수 있음을 title이 보정.
- 단위 라벨: KR Team 헤더 필터 줄에 `통화 ¥ (본사 보고 기준)` 캡션 1회 명시.

## 항목 2 — 셀 계보(lineage) 툴팁

**현상:** 숫자가 이상할 때 시트 어느 행인지, 어느 원천(임포트/미러)인지 추적하려면 코드를 읽어야 한다.

**결정:**
- **REV 계열(행 단위 계보 가능):** 장부 매트릭스 행 헤더와 KR Team 파이프라인 테이블 행에 `title` 툴팁 — `시트 '2. REV' {sheet_row}행 · 원천 {장부 임포트 M.D HH:mm | 시트 미러}`. sheet_row는 이미 저장돼 있고 원천은 summary `data_sources.rev` 재사용.
- **DSH 그리드(행 단위 좌표 없음):** 파서가 breakdown에 시트 행번호를 방출하지 않으므로 이번 스코프에선 셀 좌표 대신 **카드 헤더 레벨** 계보(원천 kind·asOf — `data_sources.dsh`)만. 파서에 sheet_row 방출 추가는 미러 스키마 변경이 필요해 제외(YAGNI).
- 신규 API·스키마 변경 없음.

## 항목 3 — 정합성 배지 승격

**현상:** 데이터품질 체크(주차·월 합계 불일치, DSH/KPI 구조 검증 등)가 AI 탭 안 패널에 숨어 있고, 절단 경고(warnings)는 동기화 HTTP 응답에만 있어 UI에 안 보인다.

**결정:**
- `lib/branch/computations/data-quality.ts`에 **REV 범위 절단 임박 규칙** 추가(파싱 행 수가 범위 상한 마진 이내 → warning) — data-quality 라우트는 시트 QC 레인이라 이미 REV 그리드를 직접 읽으므로 입력 확보 가능.
- 신규 `<IntegrityStrip/>` 컴포넌트: `/api/admin/branch/data-quality` 소비, `정합 OK`(그린 액센트) / `이슈 N건 — error X · warning Y`(앰버, error 있으면 테라코타 톤) 한 줄. 클릭 시 상세 목록 팝오버(규칙 ID·메시지).
- 장착: KR Team 개요 SyncStatusBar 아래 1곳 + 장부 헤더 Source 스트립 옆 1곳.
- 롤 주의: data-quality 라우트가 BRANCH 롤을 허용하는지 확인, 아니면 배지는 STAFF_ADMIN에게만 렌더(403 무음 처리 금지 — 렌더 자체를 생략).

## 구현 분할

- **Agent U (표시층: 항목 1+2)**: money-format, MoneyValue, sections/* 교체, DshNumericGrid title, SalesLedgerWorkbench 매트릭스 행 title, PipelineTable 행 title. — SalesLedgerWorkbench 소유.
- **Agent I (정합성: 항목 3)**: data-quality 규칙+테스트, IntegrityStrip 신설, BranchDashboardClient 장착. — SalesLedgerWorkbench 수정 금지(장부 쪽 장착은 오케스트레이터가 마지막에 1줄).
- 게이트: eslint 0 / vitest / build + 브라우저 확인.
