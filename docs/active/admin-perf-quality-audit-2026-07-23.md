# 어드민 속도·퀄리티 감사 (2026-07-23)

4개 파트 서브에이전트 병렬 정찰(admin-core / growth-crm / content-pub / hardware·branch·partners) + 런타임 실측 종합. 읽기 전용 감사 — 코드 미변경.

## 베이스라인 (전 클러스터 공통, 검증됨)
- **RLS 함정 0건**: 어드민 라우트(189개) 전부 `createSupabaseAdminClient` 사용. 서버 클라이언트→RLS 빈배열 버그 없음.
- **가드 정합**: `auth`/`auth/logout` 의도된 예외 외 전부 `verifyAdmin`/`requireVerifiedAdminContext`.
- **마이그레이션 정합**: 코드가 참조하는 컬럼/RPC 전부 backing 파일 존재. (예외: HW costing 컬럼은 파일 존재하나 prod 적용 상태 확인 필요 — `20260628_hardware_movements_costing.sql`.)

## 런타임 실측 (인증 dev 세션)
- 모든 어드민 페이지에서 `/api/admin/notifications?countOnly=1` **2회 중복 호출** (~300ms+165ms).
- `/api/admin/crm/customers/unified?limit=1` = **0.8~1.6s** (limit=1인데도; 전 소스 재집계 확인).
- `/admin/overview`는 RSC 위주로 클라이언트 페치 가벼움(양호).

## 핵심 시스템 인사이트
`adminCachedJson`는 **HTTP 헤더만**(`private, max-age=30, stale-while-revalidate=120`) 설정 — **서버 메모이제이션 없음**. 콜드미스·유저마다 무거운 집계 재계산. → 무거운 read 핸들러는 `unstable_cache`/모듈 캐시로 감싸야 계산이 공유됨.

---

## Wave 1 — 빠른 시스템·품질 (S / Low risk, 아키텍처 변경 없음)

### 1-A. GET 라우트 `adminCachedJson` 누락 (한 줄 교체 × ~12)
- `app/api/admin/settings/integrations/status/route.ts` (Overview·Ops·Settings 3중 소비)
- `app/api/admin/automation/rules`, `automation/logs`, `bugs`, `patch-notes` GET
- `app/api/admin/docs/route.ts`, `app/api/admin/docs/analytics/route.ts`
- `app/api/admin/crm/customers-neo/route.ts`
- `app/api/admin/hardware/crm-orders/route.ts`, 파트너 서브라우트 GET(`partners/[id]/{contacts,documents,checklists,issues,activity-logs}`)
- Fix: `return adminCachedJson(data)`. **S · Low**

### 1-B. 과다 페치 — 컬럼/스코프 좁히기
- `app/admin/campaigns/page.tsx:1234`, `app/admin/analytics/page.tsx:262` — count 용도인데 `/api/admin/leads`(`select *`) → `?scope=dashboard`. (LeadsBoard는 유지 — 검색이 utm_* 필요)
- `lib/admin-docs.ts:538` — 리스트가 `content_markdown` 전체 select하나 길이만 사용 → `char_length` 또는 옵션 스코프 엔드포인트
- `lib/repositories/public-events.ts:297` — `select("*")`(본문 포함) → blog식 `LIST_COLUMNS`
- Analytics subscribers 전행 → `count=1`/스코프. **S-M · Low**

### 1-C. 문서 재정렬 시 문서마다 임베딩 재생성 (1536-dim)
- `app/api/admin/docs/articles/_reindex.ts:9` — `docsReindexNeeded`가 status=published면 무조건 true → `order_index`만 바뀐 재정렬도 카테고리 전체 재인덱싱.
- Fix: reindex 관련 필드(본문/가시성/noindex/status 전이)가 실제 변경됐을 때만 true; 또는 배치 재정렬 엔드포인트. **S · Low**

### 1-D. 셸: 알림 카운트 중복 호출 제거
- `/api/admin/notifications?countOnly=1`가 페이지당 2회 → 1회로 dedupe. **S · Low**

### 1-E. 품질 — 에러/로딩/a11y
- 401/에러 무음: `app/admin/blog/page.tsx:261-299`(토글/복제 4핸들러 401 미처리), `components/admin/marketing/MarketingHub.tsx:367`(`catch{}`→빈목록), `app/admin/campaigns/page.tsx:1300` → 공용 핸들러/에러표시
- 로딩 vs 실패 구분: `app/admin/traffic/page.tsx:257` — 초기 페치 중 실패 카피 표시 → `loading` 플래그+스켈레톤
- a11y: `app/admin/settings/page.tsx:248`(ToggleRow `role="switch" aria-checked`), traffic/analytics 레인지(`aria-pressed`), `app/admin/docs/page.tsx:1036`(인라인 입력 `aria-label`)
- 데드코드: `lib/repositories/hardware-inventory.ts:318` `listHardwareMovements`(호출자 0) 제거
- `loading.tsx` 부재 6개 라우트(hardware/quotes/partners/receipts/contracts/software-quote-codes) — `app/admin/branch/loading.tsx` 템플릿. **S · Low**

---

## Wave 2 — 컴포넌트 리렌더/타이핑 랙 (M / Low-Med, 자기완결적, 즉효 UX)

### 2-A. LeadsBoardClient 렌더마다 보드 전체 재계산
- `components/admin/crm/leads/LeadsBoardClient.tsx:1228-1379` — 20개 filter/reduce/sort를 memo 없이 렌더 바디에서(37 useState). 검색 한 글자·토스트·드로어마다 전부 재실행. (2026-07-23 추가된 유입 패싯 카운트 루프도 여기 얹힘.)
- Fix: 파생 블록 `useMemo([leads, filter, sourceGroup, sourceDetailFilter, channelSource, leadMagnetFilter, deferredSearch])` + `useDeferredValue(searchQuery)` + `now` 안정화(인터벌 틱). 행 리스트를 memo 자식으로 분리. **M · Low**

### 2-B. HardwareInventoryClient 리렌더 스톰
- `components/admin/hardware/HardwareInventoryClient.tsx`(4895줄, 82 useState, 6 useCallback) — 9개 섹션 전부 `React.memo` 없음 → 폼 입력·페이징마다 전 트리 리렌더.
- Fix: 9개 섹션 `React.memo` + 전달 핸들러 `useCallback`. **M · Low**

### 2-C. Partner 상세+셸 memo 0
- `components/admin/partners/PartnerWorkspaceDetailClient.tsx`(1945줄, 32 useState, useMemo/useCallback 0) → `PartnerWorkspaceShell.tsx`(1693줄, 미memo, 렌더 내 14 filter/3 sort/23 map).
- Fix: 상세의 파생 리스트 `useMemo`, Shell `React.memo`. **M · Low**

### 2-D. 리치 에디터 키 입력마다 폼 전체 직렬화
- `components/admin/BlogPostEditor.tsx:662`(+`cloneSnapshot:313`) — 키마다 ~4× JSON.stringify/딥클론(본문 포함). `components/admin/docs/DocsArticleEditor.tsx:1259`(+`:451`) — 키마다 2× `JSON.stringify(form)`.
- `RichMarkdownEditor.tsx:489` onChange 디바운스 없음 → 부모(2982/3244줄) 전체 리렌더.
- Fix: dirty/undo를 리비전 카운터+얕은 diff로; onChange 150-250ms 디바운스; 미리보기 파생은 `previewOpen` 게이팅(`DocsArticleEditor.tsx:1135`); readtime/filteredPosts/seo `useMemo`(`BlogPostEditor.tsx:540,541,630`). **M · Med**

---

## Wave 3 — 서버 메모이제이션 + 코드 스플릿 (M-L / Med)

### 3-A. 무거운 집계 서버 캐시
- `app/api/admin/os-summary/route.ts:48` — 5개 무거운 repo 호출로 숫자 5개; 서버 메모 없음 → `unstable_cache(60s)` + `getAllPosts()`를 published-count 쿼리로
- `lib/repositories/crm-unified-customers.ts:286` — 필터/검색/페이지마다 전 소스 재집계 → pre-filter rows 60s 모듈 캐시(NEO `lib/admin-crm-customers-neo.ts:132` 패턴)
- `app/admin/traffic/page.tsx:160` — `client_events` 동일 윈도우 3중 스캔(visitor-stats/homepage-flow/event-counts) → 단일 집계 엔드포인트/RPC. **M-L · Med**

### 3-B. 무거운 클라이언트 컴포넌트 코드 스플릿
- `HardwareInventoryClient.tsx` 9개 섹션 `dynamic()`(비기본탭) — `SalesLedgerWorkbench.tsx:79` 패턴 검증됨
- `app/admin/dev/page.tsx:10` `DataQualityPanel` 정적 임포트→`next/dynamic`, 탭 패널 lazy
- 에디터 `dynamic()` 임포트
- `SalesLedgerWorkbench.tsx:939` RevMatrix 기본 100→25-50 또는 가상화. **M-L · Med**

### 3-C. 공용 페치 인프라 정리
- 파트너 클라이언트 자체 `adminFetch`/`getToken`(admin_password만, 401 리다이렉트·캐시무효화 우회) → 공용 `@/lib/admin-client` (`PartnerWorkspaceDetailClient.tsx:65`, `PartnerWorkspacePageClient.tsx:104`)
- Dev 페이지 raw fetch 15개 → `adminFetchJsonCached` (`app/admin/dev/page.tsx:87`)
- Hardware 클라 `cache:no-cache`(`:832`) → `adminFetchJsonCached`
- leads 페치 4중복(스코프·TTL 상이) → `useLeads({scope})` 훅. **S-M · Low**

---

## Wave 4 — 아키텍처 (L / Med, 별도 결정)

### 4-A. 클라이언트 팬아웃 대시보드 → RSC 프리페치/집계 엔드포인트
- Overview 콜드로드 = ~13 병렬 페치 + CRM 집계 3중 중복(os-summary/branch-summary/action-kpis) (`app/admin/overview/page.tsx:228`)
- CRM/deals/campaigns `"use client"` fetch-after-mount(`app/admin/crm/page.tsx:1272` 등) → 첫 화면 데이터 서버 프리페치, 클라 페치는 refresh/filter용 유지. **L · Med**

---

## 실행 노트
- 검증 게이트: `npx eslint app components lib --max-warnings=0` + `npm run build`.
- 수정 팬아웃은 클러스터별 파일 분리(코어/CRM/컨텐츠/HW·파트너) — 병렬 편집 충돌 없음.
- 디자인 취향: 아웃라인/에디토리얼, 그린 액센트만, 파스텔 채움 지양(로딩/에러/a11y 추가 시 준수).

---

## 적용 결과 (Wave 1+2, 2026-07-23) — 서브에이전트 4팀 병렬

**게이트: `eslint app components lib` clean + `npm run build` 성공.** 변경 ~40개 파일.
**라이브 검증: LeadsBoard(최고 리스크) — 유입 칩 합 40 정확·검색 40→1행·콘솔 에러 0.**

### 적용됨(DONE)
- **캐시헤더 `adminCachedJson`**: integrations/status, automation/rules·logs, bugs, patch-notes, docs·docs/analytics, customers-neo, hardware/crm-orders, partners/[id]/{contacts,documents,checklists,issues,activity-logs} — GET success return만(에러/POST 유지).
- **과다페치**: analytics leads→`scope=dashboard`; public-events 리스트 `LIST_COLUMNS`(본문 제외).
- **문서 재정렬 임베딩 게이팅**: `docsReindexNeeded(…, contentAffectingChange)` — order_index-only 재정렬은 재인덱싱 스킵, 그 외 published 변경은 재인덱싱(과인덱싱 쪽, 안전). 다른 호출자 default=true로 동일.
- **셸 알림**: 패널 열닫 시 재구독되던 진짜 중복 페치 제거.
- **LeadsBoard memo**: 파생 블록 전체 `useMemo` + `useDeferredValue(search)` + `now` 60s 틱 상태. 유입 칩 패싯·collapse deps 보존, SLA 24/48h 드리프트 부수 수정.
- **HardwareInventory**: toggleSection 안정화 + 4/9 섹션 `React.memo`(CategoryCards·InboundLots·OutboundPeriod·AlertsOutbound).
- **품질**: blog 401 처리(runPostAction), MarketingHub·campaigns 에러표시, traffic 로딩/에러 구분, a11y(ToggleRow role=switch, 레인지 aria-pressed, docs 인라인 aria-label), 데드코드 `listHardwareMovements` 제거, `loading.tsx` 6개.

### 스킵됨(정당 — 이유)
- **analytics subscribers 스코프**: count 용도 아님(구독자별 추세·소스 롤업에 전 행 필요). `?count=1`은 빈 배열 → 패널 0. → 새 스코프 엔드포인트 필요.
- **campaigns leads 스코프**: `campaigns/page.tsx:1355`이 `${lead.source} ${lead.notes}`로 이벤트→리드 귀속 해시 생성. `notes`는 dashboard 스코프에 없음 → 귀속 왜곡. → notes 포함 campaigns 전용 스코프 엔드포인트 필요.
- **docs char_length**: PostgREST가 select 인라인 불가 + contentLength가 AI "본문 보강" 플래그(`admin-docs.ts:351`) 좌우 → 생성컬럼(스키마) 필요.
- **에디터 디바운스/직렬화 재작성**: Cmd+S가 포커스 상태 발동 → trailing 디바운스면 마지막 <200ms 타이핑 저장 누락. save 경로 flush() 배선 필요.
- **HardwareInventory 나머지 5섹션 memo**: 불안정 핸들러(prepareQuickEntry·renderMovementRow 등)로 memo 무효화.
- **Partner memo**: DetailClient엔 파생 리스트 0(전제 오류); Shell은 ~20 인라인 콜백 prop으로 memo 무효화.

### 후속(Wave 2.5 / 3 — 별도 리뷰드 변경)
1. `content_length int generated always as (char_length(btrim(content_markdown))) stored` 마이그(platform-data) → docs 리스트 본문 제거 완성.
2. campaigns 전용 스코프 엔드포인트(notes 포함) → analytics/campaigns leads 페이로드 축소.
3. analytics subscribers 스코프 엔드포인트.
4. 에디터 onChange 디바운스 + save/Cmd+S에 `flush()` 배선(양 에디터), 그 후 dirty/undo를 리비전 카운터+얕은 diff로.
5. HardwareInventory `openSheet` 안정화(useCallback) → 3섹션 추가 해금; 나머지 핸들러 안정화.
6. PartnerWorkspaceShell 파생 블록을 `workspace` prop 키로 memo(콜백 23개 안 건드리고 재계산 차단).
7. bugs/patch-notes 30s 캐시 × dev페이지 raw fetch → dev페이지를 `adminFetchJsonCached`로 이관(Wave 3-C)하면 생성직후 ≤30s staleness 해소.
8. Wave 3 미착수: os-summary/unified/traffic 서버 메모(unstable_cache), 4.9K 컴포넌트 코드스플릿, 파트너/dev 공용 페치 이관, RSC 프리페치(Wave 4).

### 실측 정정
- "알림 countOnly=1 페이지당 2회"는 **React StrictMode 개발모드 이중호출**이 주원인(프로덕션 마운트 1회). 코드상 진짜 중복(패널 열닫 재구독)만 제거함.
