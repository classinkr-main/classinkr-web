# Phase 3 / Step 1 — URL `/partners/` 정리 실행 체크리스트 (2026-06-12)

> [crm-ia-phase3-plan-2026-06-12.md](crm-ia-phase3-plan-2026-06-12.md)의 step 1을 **즉시 실행 가능한 정밀 작업 목록**으로 분해.
> 현재 디스크 기준으로 모든 참조를 수집했다. 착수 시 줄번호는 재확인할 것(파일이 계속 바뀜).

## 0. 착수 게이트 (필수)

다음 3개 파일은 **다른 세션이 미커밋 편집 중**이다. working tree가 깨끗해질 때까지 **이 파일들은 건드리지 말 것**:
- `app/admin/crm/page.tsx`
- `lib/admin-crm-overview.ts`
- `lib/admin-crm-neo.ts`

`git status`가 clean이고 위 파일이 커밋된 것을 확인한 뒤 시작한다.

## 1. URL 매핑 (치환 규칙)

치환은 **긴 경로 먼저** 적용(짧은 `partners` 오매칭 방지). 순서 고정:

| # | old | new |
|---|-----|-----|
| 1 | `/admin/crm/partners/portal` | `/admin/crm/deals/orders` |
| 2 | `/admin/crm/partners/customers` | `/admin/crm/customers/accounts` |
| 3 | `/admin/crm/partners/${id}` · `/[id]` | `/admin/crm/deals/kpi/${id}` · `/[id]` |
| 4 | `/admin/crm/partners` (나머지 bare) | `/admin/crm/deals/kpi` |
| 5 | `/admin/crm/revenue` | `/admin/crm/deals` |
| — | `/admin/crm/matching` | **유지**(연동). `/sync` 정리는 선택, 보류 |

**API 경로 `/api/admin/crm/*`는 절대 바꾸지 말 것** — 페이지 라우트 이동과 무관.

## 2. 폴더 이동 (page 파일)

```
git mv app/admin/crm/revenue            app/admin/crm/deals
git mv app/admin/crm/partners/portal    app/admin/crm/deals/orders
git mv app/admin/crm/partners/customers app/admin/crm/customers/accounts
git mv app/admin/crm/partners/[id]      app/admin/crm/deals/kpi/[id]
git mv app/admin/crm/partners/page.tsx  app/admin/crm/deals/kpi/page.tsx
```
- `app/admin/crm/customers/leads`(리드 보드)는 step 2에서 신설.
- 이동 후 `app/admin/crm/partners/`는 비게 됨 → 3번 redirect 스텁만 남긴다.

## 3. 구경로 redirect 스텁 (북마크·외부 링크 보존)

각 old 경로에 얇은 redirect 페이지 생성:
- `app/admin/crm/revenue/page.tsx` → `redirect("/admin/crm/deals")`
- `app/admin/crm/partners/portal/page.tsx` → `redirect("/admin/crm/deals/orders")`
- `app/admin/crm/partners/customers/page.tsx` → `redirect("/admin/crm/customers/accounts")`
- `app/admin/crm/partners/page.tsx` → `redirect("/admin/crm/deals/kpi")`
- `app/admin/crm/partners/[id]/page.tsx` → `redirect(\`/admin/crm/deals/kpi/${id}\`)` (params await)

기존 외부 redirect 진입점 타깃도 갱신:
- `app/admin/partners/page.tsx:4` → `/admin/crm/deals/kpi`
- `app/admin/partners/[id]/page.tsx:25` → `/admin/crm/deals/kpi/${id}`

## 4. 참조 치환 — 파일별 (functional, 반드시)

### 4a. 지금 안전 (clean 파일)
- `components/admin/crm/CrmSubnav.tsx` — **구조 재작성**(아래 §6). hrefs 22/29/59/60/61 + `resolveSection` 67/70-72 + `resolveDealsSub` 81-83.
- `components/admin/crm/CrmDataCheckPanel.tsx:86` revenue→deals
- `components/admin/crm/matching/MatchingInboxClient.tsx:436` revenue→deals  *(183은 API, 유지)*
- `components/admin/partners/PartnerWorkspaceShell.tsx:635` partners→deals/kpi
- `components/admin/partners/PartnerWorkspacePageClient.tsx` 140/612/723/741/749 partners/${id}→deals/kpi/${id}
- `components/portal/home/PortalHome.tsx:185` partners→deals/kpi
- `lib/admin-crm-revenue.ts` 1281/1343 partners/portal→deals/orders
- `lib/external-crm/sync-chain.ts:34` revenue→deals  *(55 matching 유지)*
- `app/admin/partners/page.tsx:4`, `app/admin/partners/[id]/page.tsx:25` (redirect 타깃, §3)

### 4b. HOT — 다른 세션이 활발히 수정 중. 충돌 주의, 편집 직전 재확인
- `components/admin/crm/NeoCrmTeamPanel.tsx:375` partners/portal→deals/orders
- `app/admin/crm/revenue/page.tsx:775` partners/customers→customers/accounts  *(816 matching 유지, 341 API 유지)* — 이 파일은 deals/로 이동됨

### 4c. DIRTY — 미커밋 편집 중. **clean 후에만**
- `lib/admin-crm-overview.ts` 397/398/399 `getCustomerLogHref`: partners/portal→deals/orders, partners/customers→customers/accounts
- `app/admin/crm/page.tsx` 451/1554 revenue→deals, 589/1568 partners/customers→customers/accounts, 1561 partners/portal→deals/orders

### 4d. 변경 금지 (API 경로 / 에러 로그 문자열)
- `app/admin/crm/revenue/page.tsx:341` `/api/admin/crm/revenue`
- `components/admin/crm/matching/MatchingInboxClient.tsx:183` `/api/admin/crm/matching`
- `app/api/admin/crm/{matching,revenue}/route.ts` 로그 문자열
- `lib/admin-crm-mcp-context.ts:184` `/api/admin/crm/revenue`

### 4e. 문서 (선택 — 정확성용, 기능 무관)
- `README.md:15`, `scripts/seed-test-partner.mjs:128`, `docs/active/korean-crm-*.md`, `docs/active/crm-sheet-revenue-sync-plan.md` 다수. 일괄 갱신 or 보류.

## 5. 검증
- `npx eslint app components lib --max-warnings=0`
- `npm run build`
- 스모크: 구 URL 5종 redirect 동작, nav 활성탭 해석(현황/고객[리드|계정]/Deals[매출|오더·설치|KPI]/연동), 액션 밴드·로그 딥링크 점프.

## 6. CrmSubnav 재구조 (참고 — 단순 치환 아님)

primary 탭은 그대로 4개. 변경점:
- **고객** href: `/admin/crm/partners/customers` → `/admin/crm/customers` (랜딩=계정) + **고객 보조탭 신설** `[리드 /customers/leads | 계정 /customers/accounts]` (Deals 보조탭과 동일 패턴).
- **Deals** href: `/admin/crm/revenue` → `/admin/crm/deals`. 보조탭: 매출 `/admin/crm/deals` · 오더·설치 `/admin/crm/deals/orders` · KPI `/admin/crm/deals/kpi`.
- `resolveSection`: customers 섹션 = `/admin/crm/customers*`; deals 섹션 = `/admin/crm/deals*`; 연동 = `/admin/crm/matching*`.
- `resolveDealsSub` + 신규 `resolveCustomersSub` 추가.
- 리드 보조탭 콘텐츠(`/customers/leads`)는 step 2(page.tsx에서 리드 보드 추출)가 선행되어야 실체가 생김 → **step 1에서는 nav 항목만 만들고, 리드 화면 신설은 step 2.**

순서 권장: 4a(clean) + 폴더이동 + redirect 먼저 → build 통과 확인 → clean 신호 후 4b/4c → step 2(리드 추출).
