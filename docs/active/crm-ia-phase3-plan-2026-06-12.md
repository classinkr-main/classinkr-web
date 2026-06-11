# CRM IA 재설계 — Phase 3 상세 기획 (2026-06-12)

> 상태: **기획 확정 / 구현 보류.** 같은 영역을 다른 작업 세션이 활발히 수정 중이라, 그쪽이 정리된 뒤 착수한다.
> 선행: Phase 1(nav 4탭) · Phase 2a(현황 액션 큐) · Phase 2b(정합성 → 연동 탭) 완료.

## 1. 배경 — 기획 전제 갱신

Phase 1~2 이후 다른 세션이 "고객" 영역을 재구축하면서 원래 Phase 3 가정이 바뀌었다.

- "고객" 탭은 이제 **Neo CRM 계정 중심** 뷰다: [NeoCrmCustomersClient](../../components/admin/crm/NeoCrmCustomersClient.tsx)(계정 + EEO 잔액 + 오더/수금 드릴다운), 데이터는 [lib/admin-crm-customers-neo.ts](../../lib/admin-crm-customers-neo.ts), API는 `app/api/admin/crm/customers-neo/*`. 현재 `/admin/crm/partners/customers`에서 렌더되고 nav에 연결돼 있다.
- **리드 관리 보드**(필터·검색·파이프라인·담당자·드로어)는 여전히 현황([app/admin/crm/page.tsx](../../app/admin/crm/page.tsx))에 통째로 남아 있다.
- Deals 영역(매출 `/revenue`, 오더·설치 `/partners/portal`, KPI `/partners`)은 3개 분리 보조탭 그대로.
- `/partners/` URL 잔재 그대로 → 이제 더 어색하다(고객이 `/partners/customers`).

→ 무게중심이 "병합"에서 **"역할 명확화 + URL 정리 + 현황 경량화"**로 이동.

## 2. 목표 IA

```
현황   /admin/crm                  액션 밴드 + NeoCrmTeamPanel 요약 + 돈흐름 요약 (리드 보드 제거)
고객   /admin/crm/customers        보조탭 [ 리드 | 계정 ]
        ├ 리드   /admin/crm/customers/leads      ← 현황에서 추출한 리드 관리 보드
        └ 계정   /admin/crm/customers/accounts   ← 현 NeoCrmCustomersClient
Deals  /admin/crm/deals            보조탭 [ 매출 | 오더·설치 | KPI ] (구조 유지, URL만 정리)
        ├ 매출      /admin/crm/deals
        ├ 오더·설치 /admin/crm/deals/orders
        └ KPI       /admin/crm/deals/kpi  (+ /deals/kpi/[id] 파트너 상세)
연동   /admin/crm/matching         유지(유지보수)
```

확정된 결정:
- 리드 보드 → **고객 탭 하위 "리드" 보조탭**으로 이동(독립 탭 아님).
- Deals → **현 보조탭 유지**(한 화면 병합 안 함). revenue 800+줄 + 병렬 세션 활발 수정 = 통합 충돌 과다.
- URL `/partners/` 정리 → **Phase 3에 포함**.

## 3. 작업 분해

### 3-1. URL `/partners/` 잔재 정리 (먼저 — 저로직·고기계적)
폴더 이동 + 구경로 redirect + 하드코딩 참조 일괄 수정.

| 구 경로 | 신 경로 | 비고 |
|---|---|---|
| `/admin/crm/revenue` | `/admin/crm/deals` | 매출 = Deals 랜딩 |
| `/admin/crm/partners/portal` | `/admin/crm/deals/orders` | 오더·설치 |
| `/admin/crm/partners` | `/admin/crm/deals/kpi` | KPI 운영 |
| `/admin/crm/partners/[id]` | `/admin/crm/deals/kpi/[id]` | 파트너 워크스페이스 상세 |
| `/admin/crm/partners/customers` | `/admin/crm/customers/accounts` | Neo 계정 |
| (현황 내 리드 보드) | `/admin/crm/customers/leads` | 3-2에서 신설 |
| `/admin/crm/matching` | 유지 | — |

redirect 전략: 구 경로에 얇은 `redirect()` 페이지를 남겨 북마크·외부 링크 보존. 기존 [app/admin/partners/page.tsx](../../app/admin/partners/page.tsx)·`[id]`의 `/admin/crm/partners*` redirect 타깃도 신경로로 갱신.

하드코딩 참조: 구 경로 3종이 **약 40곳/20파일**에 박혀 있다(nav·revenue·page·lib·sync-chain·mcp-context·README 등). 폴더 이동 시 전부 신경로로 치환. 대표:
- [components/admin/crm/CrmSubnav.tsx](../../components/admin/crm/CrmSubnav.tsx) — 탭/보조탭 href + `resolveSection`/`resolveDealsSub`
- [lib/admin-crm-overview.ts](../../lib/admin-crm-overview.ts) `getCustomerLogHref` — 로그 딥링크
- [lib/admin-crm-revenue.ts](../../lib/admin-crm-revenue.ts) — deal/portal 링크
- [lib/external-crm/sync-chain.ts](../../lib/external-crm/sync-chain.ts) — sync 알림 routeUrl
- [components/admin/crm/CrmDataCheckPanel.tsx](../../components/admin/crm/CrmDataCheckPanel.tsx)·[matching/MatchingInboxClient.tsx](../../components/admin/crm/matching/MatchingInboxClient.tsx) — "매출 상세" 링크
- [components/portal/home/PortalHome.tsx](../../components/portal/home/PortalHome.tsx)·[components/admin/partners/*](../../components/admin/partners) — workspace 링크

### 3-2. 고객 탭 [리드 | 계정] 보조탭 + 리드 보드 추출 (중량·고충돌)
- 현황 `page.tsx`(1522줄)에서 **리드 관리 보드 전체**(필터 카드·검색·파이프라인·담당자·리드 드로어·컨택 로그·전환 액션)를 `components/admin/crm/leads/LeadsBoardClient.tsx`(가칭)로 추출.
- 신 라우트 `/admin/crm/customers/leads`가 이 컴포넌트를 렌더.
- `/admin/crm/customers/accounts`는 현 NeoCrmCustomersClient.
- 고객 탭 보조탭 nav(리드/계정)는 `CrmSubnav`에 Deals 보조탭과 같은 패턴으로 추가.
- ⚠️ `page.tsx`는 병렬 세션 hot file — **최고 충돌 위험**. 추출은 그쪽이 멈춘 뒤.

### 3-3. 현황 다이어트
- 리드 보드 추출 후 현황 = 액션 밴드 + NeoCrmTeamPanel + 돈흐름 요약만 → 진짜 "아침 지휘대".
- Phase 2 잔여: [page.tsx](../../app/admin/crm/page.tsx) `CrmOperationsDashboard`의 "고객 후속 KPI" 타일(미응답/오늘/오버듀/수납리스크)이 액션 밴드와 중복 → 정리(수납 리스크 신호는 보존).
- 액션 밴드의 리드 딥링크(미응답/오버듀/전환)는 `/admin/crm/customers/leads?filter=...`로 갱신.

## 4. 실행 순서 & 충돌 회피

병렬 세션이 `page.tsx`·`revenue/page.tsx`·`NeoCrmCustomersClient`·`NeoCrmTeamPanel`을 동시 수정·커밋 중. 3-1/3-2/3-3 전부 이 파일을 건드림 → 같은 브랜치 동시 진행 시 덮어쓰기 확정.

권장 순서(병렬 세션 정리 후):
1. **3-1 URL 정리** 먼저 — 저로직·고기계적, 체계감 즉효. 폴더 이동 + redirect + 참조 치환을 한 커밋으로.
2. **3-2 리드 추출** — page.tsx 대수술. 추출 직전 디스크 재확인 필수.
3. **3-3 현황 다이어트 + 중복 정리** — 추출 후 자연 정리.

착수 전 체크:
- 병렬 세션의 customers-neo/owner-name/통화 작업이 커밋 완료·안정됐는지 확인.
- 매 편집 전 해당 파일 디스크 재확인(stale 컨텍스트 금지).
- 파일별 소커밋, Phase 단위 롤백 지점 유지.

## 5. 검증 기준
- `npx eslint app components lib --max-warnings=0`
- `npm run build`
- 구 URL redirect 동작(매출/오더·설치/KPI/계정), nav 활성 탭 해석, 액션 밴드 딥링크 점프 스모크 체크.

## 6. 미해결 / 추후 결정
- `/admin/crm/matching` URL을 `/admin/crm/sync`로 마저 정리할지(연동 라벨과 일치) — 선택.
- 리드↔Neo 계정 전환 동선(`convert-v2`) UI를 리드 보조탭에서 어떻게 노출할지.
- Deals 보조탭 라벨 영/한 최종(현재 매출/오더·설치/KPI).

관련: [project_crm_ia_redesign 메모리], [korean-crm-admin-integration-plan-2026-06-10.md](korean-crm-admin-integration-plan-2026-06-10.md)
