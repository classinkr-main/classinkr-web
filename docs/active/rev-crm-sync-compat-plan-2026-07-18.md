# 매출시트 자체 평가 + CRM 싱크 시각화 + 탭 호환성 디벨롭 기획 (2026-07-18)

실측 기반. 프로브: `tmp/db-probe-rev-crm-sync.mjs`, `tmp/db-probe-rev-crm-sync2.mjs` (읽기 전용, 2026-07-18 프로덕션). 시각 요소 시안: [rev-crm-sync-visual-2026-07-18.html](mockups/rev-crm-sync-visual-2026-07-18.html).

## 1. 매출시트 자체 평가

### 시트 품질 (sheet-qc 레인, 규칙 9개 · 2026-07-18 실행)

| ID | 심각도 | 내용 | 비고 |
|----|--------|------|------|
| DQ-10 | **error** | 색 셀 추출 실패 의심 (formatRuns 비어 있음) — 미지원교육·의문을열다·양영학원 등 5+ | "빨간 글자=확정" 입력 관례 판독이 흔들림 → 확도 오분류 위험. 시트 쪽 서식 복구 필요 |
| DQ-2 | warn | firstPayment 있는데 월별 납부 0인 딜 29건 | 입금-월배분 미기입. 월별 페이싱 과소계상 |
| DQ-9 | warn | HW 입출고 제품명 카탈로그 불일치 (S1·STD1·T1 등 8종) | HW 대조 정확도 저하 |
| DQ-13 | warn | KPI 멤버 중 DSH 팀 매핑 누락 (Chanwoo) | 멤버별 KPI 롤업 구멍 |

구조 판정: 파싱은 건강(활성 434행, CF1000 확장으로 절단 0). 단 **v2 시트의 `contract_target`은 전 행 null**(v2의 [12]열이 "Sum"이라 파서가 의도적으로 배제 — Sum 오염 방지가 목적이라 정상 동작). 금액의 유일 축은 `monthly_payments` 합(CNY). **플레이스홀더 49행에 매출 ¥1,839,869(활성 매출의 ~19%)**가 실려 있어, 플레이스홀더를 숨기는 어떤 화면이든 이 금액이 사라진다는 주석이 필요.

### CRM 싱크 실태 — 결론: 사실상 미연결 (0.9~1.3%)

| 축 | 값 |
|----|-----|
| 매칭 대상 행 (활성 434 − 플레이스홀더 49) | 385행 |
| confirmed 링크 | **5행 (1.3%)** — 전부 자동확정, 계정으론 2/234 (갈무리국어학원·메티우스수학) |
| 검토 대기(candidate, 유효) | 13행 |
| 링크 없음 | 367행 · **¥7,495,820 (미연결 매출 98.5%)** |
| 매출 커버리지 | ¥76,585 / ¥7,610,544 = **1.0%** |
| 위생 | 후보 149건 중 **136건(91%)이 고아**(full-replace로 시트 행 키 이동) · 스테일 98건 |

- **금액 정합 대조는 현재 불가능** — 불일치 0건이 아니라 "대조 가능한 쌍 0건". confirmed 5건 전부 target=customer(금액 필드 없음), deal 타깃 링크 0건.
- **통화 3원 체제**: 시트=CNY / 내부 deals=KRW / Xiaoshouyi amount=단위 비정규(2,655~2억 혼재). 자동 환산 대조 금지, 표기엔 통화 필수.
- **역방향(CRM에만 있는 딜) 감지는 추정만 가능**: opportunity(금액>0) 755건 중 시트 이름 히트 194건 — 명명 체계가 달라 상한 추정치. 확정 판정은 양쪽이 같은 내부 고객으로 confirmed된 뒤에만 성립.
- 현황 홈의 행 기준 커버리지(`getCrmSourceLinkCoverage`)는 분모가 링크 행이라 **오도 지표** — 시각 요소는 시트에서 출발하는 `getRevAccountCoverage` 축을 쓴다.

## 2. CRM 싱크 시각 요소 (시안 확정 대기)

**A안** 장부·개요 상단 "CRM 싱크" 스트립(정합 체크 형제, 클릭 펼침: 게이지 3종 + 미연결 상위 + 위생 + 매칭 인박스 딥링크) + **B안** KR Team 원천 바 컴팩트 칩(호버 요약, 클릭 → A안). 상태 3단계: 낮음(<10%, 테라코타)/부분(10~60%, 앰버)/건강(≥60%, 그린) — 파랑은 확도 전용이라 미사용.

데이터 계약 (새 API 불필요 — `GET /api/admin/crm/coverage`의 `revAccounts` 축 확장):

```json
{
  "asOf": "branch_rev_deals.synced_at max",
  "rows": {"matchable": 385, "linked": 5, "review": 13, "unlinked": 367},
  "accounts": {"total": 234, "linked": 2, "partial": 0, "review": 12, "unlinked": 220},
  "revenueCny": {"total": 7610544, "linked": 76585, "coveragePct": 1.0, "placeholder": 1839869},
  "health": "low | partial | healthy",
  "topUnlinked": [{"name": "윤유경플러스", "team": "BD", "manager": "Junhyuk", "revenueCny": 802603}],
  "hygiene": {"orphanCandidates": 136, "staleLinks": 98}
}
```

- 기반: `lib/repositories/rev-account-coverage.ts` (+행 축·placeholder 금액·orphan 계산 소폭 추가), `app/api/admin/crm/coverage/route.ts`
- 1차 범위 제외(정직성): 금액 불일치 목록(쌍 0건), CNY↔KRW 환산, 유지보수 결과(autoConfirmed 등 — 저장 안 되고 sync 응답으로만 흐름)

## 3. 탭 호환성 감사 결과 (요약)

- **KR Team ↔ 장부 축은 건강**: 발신 링크 12종 전수 확인, 웨이브7 MultiSelect 전환과 단일값 크로스링크는 "첫 값 규약"으로 양방향 안전. 죽은 규약(`?lens=kpi`)은 발신 0 + 스텁만 잔존.
- **장부 ↔ CRM 축이 구조적 단절**: 미연결 행 → 매칭 인박스 딥링크는 있으나, **연결 확정된 고객일수록 CRM으로 갈 방법이 없음**. 고객 360 → 그 고객의 시트 매출 경로 없음. 고객 360 활동 로그에 장부 이벤트(초안 적용·주간마감) 유입 없음 (`crm_customer_events` writer가 행사 캡처뿐).
- 소소한 갭: 컨텍스트(team/period/month) 미동봉 발신 링크 4곳, KR Team의 month 범위 밖 수신 시 무음 폴백, 장부 전용 검색 토큰(q=시트행)이 파이프라인으로 라운드트립하면 0건.

## 4. 디벨롭 로드맵 (제안)

| 순위 | 항목 | 난이도 | 내용 |
|------|------|--------|------|
| **P0-1** | 싱크 시각 요소 (§2 A+B안) | M | coverage 확장 + 장부 스트립 + KR Team 칩 |
| **P0-2** | G1 연결 고객 → CRM 진입로 | S~M | 장부 행 레일·매트릭스에 "CRM에서 보기 ↗" (`/admin/crm/customers/unified?q=`, M안: 360 직행) |
| **P0-3** | G5+G6 저비용 링크 정리 | S | 컨텍스트 미동봉 4곳에 team/period/month 동봉 + rev-sheet↔장부 상호링크 |
| **P1-1** | G2 고객 360 돈 탭 시트 REV 블록 | M~L | confirmed-only 철칙, 시트 매출 요약 + "장부에서 검수 ↗" |
| **P1-2** | G4+G8 링크 위생 | S | month 범위 밖 클램프+고지, pipelineHref q 위생 |
| **P2-1** | G3 장부 이벤트 → 고객 활동 로그 | M | sourceType `ledger` 신설 — 노이즈 설계(마감마다 쌓임 방지) 선행 필요 |
| **P2-2** | G7 KR Team mgr 다중값 수용 | M | parseMultiFilterParam 재사용, URL 규약 통일 |
| **운영** | 매칭 부채 해소 캠페인 | — | 후보 재생성(고아 136 정리) → 미연결 상위(윤유경플러스 ¥802K 등)부터 수동 확정. 도구는 이미 있음(/admin/crm/matching) — 부족한 건 가시성(=P0-1) |

리스크: 커버리지가 실제로 낮은 상태라 시각 요소 도입 직후 "빨간 스트립"이 상시 노출됨 — 의도된 동작(운영 행동 유도)이지만, 원치 않으면 매칭 캠페인과 동시 착수 권장.
