# Admin ↔ Compass(mkt.classin.co.kr) 연결 기획 — 2026-09-12

기준 시점: 2026-09-12
대상: 이 저장소의 Admin OS(`classin.co.kr/admin`)와 마케팅팀 앱 Compass(`mkt.classin.co.kr`, 저장소 `classinkr-main/crm`). 화면 간 이동, 링크 공유, 세션 복귀, 연결 상태 노출.
코드 기준: 이 저장소 `origin/main` `d75ac028`(2026-09-10), Compass `main` 2026-09-11 커밋. 로컬 `home_v3`는 원격보다 175커밋 뒤라 Compass 브리지 코드가 없다. 이 문서의 파일 경로는 `origin/main` 기준이다.
전제 문서: [공용 Supabase DB 최적화·통폐합 분석](./supabase-shared-db-consolidation-analysis-2026-09-02.md) §4(A/B/C 판정, 통합 금지 15건), Compass↔Admin 기능 교차 적용·분할 판정(2026-09-02, `origin/home_v3-3`에만 존재하며 main 미병합), [ADR-009](../adr/ADR-009-site-admin-deployment-boundary.md), [어드민 탭 재구성 스펙](./admin-tab-restructure-2026-07-29.md), [마케팅/그로스/CRM 파트 가이드](./playbook/04-growth-crm.md).

---

## 0. 결론

1. 두 앱은 **데이터로는 이미 연결**돼 있다(브리지 뷰 7장, `lib/compass/bridge.ts`). **화면 이동은 한 방향**이다. Admin→Compass 링크 5곳, Compass→Admin 링크 0곳.
2. 세션은 형제 서브도메인 구조라 **상호 딥링크에 추가 인증이 필요 없다.** Compass 쿠키는 `.classin.co.kr` 공용, Admin 쿠키는 `classin.co.kr` host-only지만 `mkt.` → `classin.co.kr`은 same-site라 `SameSite=strict`도 실린다. 문제는 **미로그인·만료 시 두 앱 모두 목적지를 버린다**는 것 하나다.
3. 이 기획은 **링크 계층만** 다룬다. (1) 딥링크 계약 모듈, (2) 사이드바·⌘K 외부 항목, (3) 양쪽 로그인 `next` 복귀, (4) 역방향 링크와 그 근거 뷰, (5) 운영 상태 패널의 Compass 항목, (6) 공유 링크 규약.
4. 하지 않는 것은 선행 문서 결정을 그대로 따른다. 인증 통합, UI·디자인 시스템 통일, 테이블 병합, iframe 임베드.

## 1. 실측 — 현재 연결 상태

### 1.1 세션·도메인

| 항목 | Admin(이 저장소) | Compass |
|---|---|---|
| 정식 주소 | `https://classin.co.kr/admin` (200 확인) | `https://mkt.classin.co.kr` (`*.vercel.app` → 308) |
| 세션 쿠키 | `admin_session`, host-only, `SameSite=strict`, 7일, httpOnly (`app/api/admin/auth/route.ts`) | `crm_session`, `domain=.classin.co.kr`, 90일, HMAC 서명 이름 토큰 (`app/login/page.tsx`, `lib/auth.ts`) |
| 로그인 모델 | Supabase `admin_profiles` 개인 계정·역할 | 이름 선택 + 팀 공용 비밀번호(`TEAM_PASS`/`BD_PASS`) |
| 미인증 리다이렉트 | `proxy.ts`가 `url.search = ""` 후 `/admin/login`. 로그인 후 항상 `/admin/overview` | `proxy.ts`가 `url.search = ""` 후 `/login`. 로그인 폼은 `?next=`를 받지만 proxy가 붙여 주지 않는다 |
| `next` 안전 검사 | 없음 | `safeNext()`: `classin.co.kr`과 그 서브도메인 절대 주소만 허용(오픈 리다이렉트 감사 반영) |
| 형제 SSO 선례 | 없음 | `vault.classin.co.kr`(지식저장소)이 Compass 세션으로 통과. vault가 스스로 `/login?next=`를 붙인다. `/api/demos`는 세션 쿠키 + CORS로 vault에 열림 |

Same-site 판정: `mkt.classin.co.kr`과 `classin.co.kr`은 eTLD+1이 같다. 브라우저는 이 둘 사이 이동을 same-site로 보므로 Admin의 Strict 쿠키도 Compass에서 온 링크 클릭에 실린다. 반대 방향은 Compass 쿠키가 도메인 공용이라 당연히 실린다.

### 1.2 Admin → Compass 링크 5곳

| # | 위치 | 파일 | 목적지 | 상태 |
|---|---|---|---|---|
| 1 | 리드 보드·목록 Compass 상태 칩 | `components/admin/compass/CompassLeadChip.tsx`, `lib/compass/normalize.ts` `compassLeadUrl` | `/leads?open={id}` | 동작. 전화 키 매칭 시만 표시, 새 탭 |
| 2 | CRM 홈 "마케팅 파이프라인(Compass)" 밴드 | `components/admin/crm/home/CompassPipelineBand.tsx` | `/leads?stage=demo`, `/leads?sort=next_action_at`, `/leads?stage=bd` | `stage` 둘은 유효. **`sort`는 Compass 리드 페이지가 받지 않는 키**라 전체 목록으로 떨어진다. 파일 주석 자체가 "최선 추정, 마케팅팀 확인 필요"라고 적었다 |
| 3 | 캘린더 `compass_demo` 이벤트 "원본 열기" | `components/admin/calendar/event-style.ts`, `lib/compass/calendar.ts` | 리드가 붙은 행은 Compass 상세, 아니면 구글 캘린더 | 동작. 목적지에 따라 라벨이 바뀐다 |
| 4 | 고객 360 Compass 콜·미팅 타임라인 | `lib/repositories/crm-customer-360.ts`, `lib/crm/compass-timeline.ts` | `compassLeadUrl(leadId)` | 동작 |
| 5 | 매출시트 Compass 대조 배지 | `lib/admin-crm-revenue-sheet.ts` `getCompassRevenueCompare()` | 없음(숫자만) | Compass `/revenue`로 가는 길이 없다 |

구조적 관찰:

- URL 생성이 `normalize.ts`(`compassLeadUrl`)와 `CompassPipelineBand.tsx` 상수 두 곳에 나뉘어 있다.
- 사이드바(`components/admin/admin-nav.ts`), ⌘K 팔레트, Overview에 Compass 진입점이 없다. `AdminNavItem`은 내부 `href`만 전제하고 `next/link`로 그린다.
- 운영 상태 패널(`lib/admin-integrations/status.ts`) 17항목에 Compass가 없다. `isCompassBridgeDown()` 소비처는 10개 파일인데 상태 표면은 각 화면의 "연결 끊김" 배지뿐이다.

### 1.3 Compass → Admin 링크 0곳

`components/SideNav.tsx` 항목: 대시보드(마케팅 성과 `/dashboard`, 매출 `/revenue`), 리드(콜 `/leads`, 고객관리 `/leads/care`, BD인계 `/leads/care?track=bd`), 광고 `/ads`, KPI(`/kpi`, `/kpi/contents`, `/kpi/projects`, `/kpi/targets`), 미션 `/tasks/board`, 방문 `/visits`, 지식저장소 `/knowledge`(→ `vault.classin.co.kr` 리다이렉트). Admin으로 가는 링크는 없고, 리드 상세(`components/LeadDetailBody.tsx`)에도 Admin 대응 리드 표시가 없다.

### 1.4 Compass 라우트·쿼리 실측 — 딥링크 계약의 원천

| 화면 | 경로 | 받는 쿼리(`searchParams` 타입 기준) |
|---|---|---|
| 콜 목록 | `/leads` | `q`, `stage`, `owner`, `caller`, `src`, `cat`, `ad`, `f`, `t`(YYYY-MM-DD), `subject`, `region`, `label`, `page`, `open` |
| 리드 상세 | `/leads/{id}` | 전체 페이지. BD 계정은 자기 인계건(`bd_row` 또는 `stage='bd'`) 외 404 |
| 고객관리 | `/leads/care` | `q`, `lv`, `open`, `track`(`bd`), `ka`, `a`, `owner`, `trash` |
| 마케팅 성과 | `/dashboard` | `m`, `v`, `f`, `t` |
| 매출 | `/revenue` | `q`, `m`, `f`, `t`, `s`, `p` |
| 광고 | `/ads` | 없음 |
| KPI | `/kpi`, `/kpi/contents`, `/kpi/projects`, `/kpi/targets` | 확인 안 함 |
| 미션 | `/tasks/board` | 확인 안 함 |
| 데모 일정 API | `/api/demos?from&to` | 세션 쿠키 + CORS(vault용) |

`stage` 값: 실 단계 `new/contact/consult/demo/quote/bd/won/lost`(`lib/stages.ts`) + 가상 필터 `missed/uncontacted/callback/account/call`(`lib/leadFilter.ts` `stageOnlyCond`). 정렬을 바꾸는 쿼리는 없다. `callback` 탭만 `callback_at asc`로 정렬된다.

### 1.5 Admin 딥링크 목적지 — 역방향 계약의 원천

- 리드 보드 `/admin/crm?lead={id}` (`LeadsBoardClient.tsx`가 `searchParams.get("lead")`를 읽는다), `?focus=risk`
- 고객 360 `/admin/crm/customers/{key}`
- 캘린더 `/admin/calendar`, 캠페인 `/admin/campaigns`, 가이드 문서 `/admin/docs`
- 공개 공유 `/share/quote/{token}`, `/share/contract/{token}` (로그인 불필요, 토큰 기반)

## 2. 설계 원칙

1. **병기, 병합 아님.** `lib/compass/overlay.ts` 계약 그대로다. 링크는 "저쪽에서 열기"이고 상태를 복제하지 않는다.
2. **URL 생성은 앱마다 한 모듈.** 화면 컴포넌트에 `mkt.classin.co.kr` 문자열 리터럴을 두지 않는다.
3. **계약은 테스트로 고정.** `normalize.ts`가 브리지 SQL과 바이트 일치를 계약으로 잡은 방식과 같다. 라우트·쿼리 픽스처 JSON을 두 저장소에 같은 사본으로 두고 계약 테스트를 돌린다. Compass 라우트 rename은 브리지 뷰 컬럼 rename과 같은 사전 공유 대상이다.
4. **인증은 분리 유지, `next` 복귀만 추가.** 같은 사이트 경로만 허용한다(Compass `safeNext` 선례). `admin_session` 쿠키 도메인은 넓히지 않는다.
5. **무음 실패 금지.** 브리지가 죽어도 링크는 남고 칩·숫자만 "연결 끊김"으로 강등한다.
6. **새 탭 규약.** 레코드 딥링크와 앱 전환 항목 모두 새 탭(`target="_blank" rel="noopener noreferrer"`). 두 앱의 세션 모델·수명이 달라 같은 탭 전환은 뒤로가기가 로그인 화면으로 떨어질 수 있다.
7. **링크에 PII 없음.** `id`, `stage`, `owner`(이름 키), 월 키만 싣는다. 전화·이메일은 절대 싣지 않는다.

## 3. 연결 요소 기획

### 3.1 Admin — 딥링크 계약 모듈 `lib/compass/links.ts`

- `COMPASS_ORIGIN = "https://mkt.classin.co.kr"` 한 곳.
- 빌더: `leadDetail(id)` → `/leads/{id}`(공유·BD 모두 안전한 정규 URL), `leadInline(id)` → `/leads?open={id}`(기존 칩 호환), `leads(filter)`, `care({ track, owner, open })`, `dashboard({ m })`, `revenue({ m })`, `ads()`, `kpi(sub)`, `tasks()`.
- `filter` 타입은 §1.4 표의 키만 허용한다. 모르는 키는 컴파일 에러.
- `compassLeadUrl`은 이 모듈로 옮기고 `normalize.ts`는 re-export를 남겨 소비처를 깨지 않는다.
- `CompassPipelineBand.tsx` 3링크 교체:
  - 오늘 데모 → `leads({ stage: "demo", f: today, t: today })`
  - 다음 액션 임박 → `leads({ stage: "callback" })`. 정렬 쿼리가 Compass에 없으므로 가장 가까운 필터로 대체하고, Compass에 `sort=next_action` 옵트인 추가를 요청한다(§4).
  - BD인계 진행 → `care({ track: "bd" })`. BD 진행의 실제 작업면은 콜 목록이 아니라 고객관리 BD 트랙이다.
- `tests/compass/links.test.ts` + `tests/fixtures/compass-routes.json`.

### 3.2 Admin — 사이드바·⌘K 외부 항목

- `AdminNavItem`에 `external?: true` 필드 추가. `href`는 `links.ts`에서 가져온다.
- 항목: `{ href: leads(), label: "Compass", section: "marketing", category: "growth", roles: [...ALL_STAFF, "BRANCH"], external: true, keywords: "compass mkt 마케팅팀 콜 리드 광고 kpi 미션 데모" }`. 아이콘은 lucide `Compass`.
- `AdminSidebar.tsx`: `external`이면 `<a target="_blank" rel="noopener noreferrer">`로 그리고 `ExternalLink` 표식을 붙인다. `matchNavActive` 대상에서 제외하고, prefetch·warm(`NAV_WARMUP_REQUESTS`)도 건너뛴다.
- `admin-nav-access.ts` 프리셋: `marketing`, `lead`, `super`의 `primary`에 추가. 나머지 프리셋은 자동으로 "기타"로 접힌다. `MOON_ONLY_HREFS`·`RESTRICTED_HREFS`에 넣지 않는다. 2026-07-29 회의의 "상시 5개 안팎" 원칙 때문에 마케팅 프리셋 상시 노출은 §5 확인 항목이다.
- ⌘K 팔레트: "Compass" 그룹 자식 커맨드 5개(콜 목록, 고객관리, 광고, KPI, 미션). `go(href)`가 `external`이면 `window.open`.
- `MarketingCrossLinks.tsx`는 nav 파생이라 캠페인 허브에 자동 노출된다. 라벨 중복이 생기면 `excludeHrefs`로 조절한다.
- `tests/admin/sidebar-*.test.ts`가 cs 섹션 선언 순서를 고정한다. marketing 섹션 추가는 영향이 없어야 하지만 실행해 확인한다.

### 3.3 Admin — 레코드 단위 링크 보강

| 위치 | 현재 | 추가 |
|---|---|---|
| 캠페인 성과 소재 카드 `components/admin/campaigns/perf/CreativeCplCard.tsx` | 소재 성과만 | `leads({ ad: ad_id })` "이 소재 유입 리드", `ads()` "Compass 광고" |
| 매출시트 Compass 대조 배지 `lib/admin-crm-revenue-sheet.ts` 소비 화면 | 차액 숫자만 | `revenue({ m: "YYYY-MM" })` |
| Overview·Analytics 마케팅 성과 스트립 `components/admin/overview/MarketingPerfStrip.tsx` | 내부 링크만 | `dashboard({ m })` |
| 캘린더 `compass_demo` | 목적지별 라벨 | 변경 없음 |
| 리드 카드 칩 | `/leads?open=` | 클릭은 유지, "링크 복사"는 `leadDetail(id)` 정규 URL |

### 3.4 Admin — 로그인 `next` 복귀

- `proxy.ts` `redirectToAdminLogin`: `url.search = ""` 대신 `?next={pathname+search}`를 붙인다. 허용 조건은 `/admin`으로 시작하고 `//`로 시작하지 않는 경로만. 절대 URL은 받지 않는다.
- `app/admin/login/page.tsx`: 두 곳의 `router.replace("/admin/overview")`를 `safeNext ?? "/admin/overview"`로 바꾼다.
- BRANCH 역할의 경로 제한(`getAllowedAdminPageRoles`)은 복귀 후 proxy가 다시 판정하므로 로그인 페이지에서 추가 검사가 필요 없다.
- 테스트: proxy·로그인 테스트에 `next` 유지·오픈 리다이렉트 차단 케이스.

### 3.5 Admin — 운영 상태 패널 "Compass 브리지" 항목

- `lib/admin-integrations/status.ts`에 `key: "compass_bridge"`, `label: "Compass 브리지"`, `category: "crm"`.
- `configured`: Supabase 서버 env 존재. `health`: `isCompassBridgeDown()`이면 `error`. 아니면 `compass_revenue_v`·`compass_ads_v`·`compass_cal_events_v`의 `synced_at` 최댓값이 24시간 이내면 `ok`, 넘으면 `warning`.
- 추가 경고: 당월 `compass_revenue_v` 행 수가 0이면 `warning`. DB 통폐합 분석 §0-2가 실증한 "0행 또는 2배" 매출 미러 결함을 화면으로 올린다.
- `requiredKeys`: 브리지 뷰 7장 이름. `adminHref: "/admin/crm"`, `description`에 Compass 주소.
- `lib/db/schema-contract.ts`가 이미 뷰 존재를 프로브하므로 그 결과를 재사용한다.

### 3.6 Compass — Admin 링크 (Compass 저장소 PR)

- `proxy.ts`: 미인증 페이지 리다이렉트에 `?next={pathname+search}`를 붙인다. `app/login/page.tsx`의 `safeNext`가 이미 검사한다. 한 줄 변경.
- `components/SideNav.tsx` 하단 "Admin" 외부 그룹: 리드 보드 `/admin/crm`, 캘린더 `/admin/calendar`, 캠페인 `/admin/campaigns`, 가이드 문서 `/admin/docs`. `/knowledge`→vault 리다이렉트와 같은 결의 외부 진입점이다. BD 계정(`isBdMember`)에는 감춘다. Admin 계정이 없는 팀원은 Admin 로그인 화면을 만나므로, 항목 라벨 옆에 "Admin 계정 필요"를 작게 붙인다.
- `lib/adminLinks.ts` 한 모듈. Admin 쪽 `links.ts`와 대칭이며 같은 픽스처를 쓴다.
- 리드 상세(`components/LeadDetailBody.tsx`)에 "Admin 리드" 칩. 근거는 이 저장소가 만드는 역방향 뷰 `public.admin_leads_v`(§3.7). Compass는 `normPhone(phone)`을 `phone_key`와 조인해 있으면 `adminLinks.lead(id)`를 그린다. Admin 칩과 같은 톤 규약(아웃라인·무채색, 남의 원장 참조값).

### 3.7 이 저장소 — 역방향 뷰 `public.admin_leads_v`

- DB 통폐합 분석 §4.2 #1의 "역방향 뷰 `admin_leads_v` 추가(P2)"와 같은 항목이다. 마이그레이션 소유는 이 저장소.
- 컬럼: `id`, `phone_key`(브리지 뷰와 같은 정규식), `status`, `assigned_to`, `created_at`, `last_inflow_at`, `source`. 이름·전화 원문·메모는 싣지 않는다.
- 권한: `anon`, `authenticated` REVOKE. Compass의 `pg` 접속 롤에만 SELECT. 롤 이름은 §5 확인 항목.
- Compass가 `public` 스키마를 읽는 첫 사례가 된다. 쓰기는 여전히 0건이어야 한다.

### 3.8 공유 링크 규약

- "링크 복사" 버튼의 정규 URL: Compass 리드 `https://mkt.classin.co.kr/leads/{id}`(`?open=` 아님), Admin 리드 `https://classin.co.kr/admin/crm?lead={id}`, 고객 360 `https://classin.co.kr/admin/crm/customers/{key}`.
- 알림의 교차 링크: Admin `lead-response-alerts`·주간 다이제스트에 Compass 매칭 리드가 있으면 Compass 링크를 병기한다. Compass가 2026-09-11 신설한 신규 리드 알림톡은 고객에게 가는 메시지라 제외한다.
- 카카오·슬랙에서 열 때 미로그인이면 §3.4·§3.6의 `next`로 복귀한다.
- 공개 공유(`/share/quote`, `/share/contract`)는 토큰 기반이라 변경 없음. Compass BD가 견적을 공유할 일은 Admin 공유 링크를 붙이는 것으로 끝낸다. Compass에 공개 라우트를 만들지 않는다.

### 3.9 담당자 매핑 — "내 건" 링크

- Compass `owner=` 값은 한글 이름이다(`lib/members.ts` `MEMBERS`: 김정무, 정규성, 진소망, 신희성, 황찬우, 문준혁. BD: 이왕찬, 박한).
- Admin `admin_profiles.crm_owner_aliases`(`supabase/migrations/20260626_admin_profiles_crm_assignments.sql`)에 Compass 이름을 alias로 등록하면 "내 Compass 콜 목록" = `leads({ owner: alias })`가 된다.
- DB 통폐합 분석 §4.3의 `team_directory_v` 이전에는 alias 컬럼만으로 충분하다. Compass 하드코딩 명부를 이 링크 때문에 건드리지 않는다.

## 4. 서로 최적화 — 링크 관점

| 항목 | Admin이 할 것 | Compass가 할 것 |
|---|---|---|
| URL 계약 | `links.ts` + 픽스처 + 계약 테스트 | `adminLinks.ts` + 같은 픽스처. 라우트 변경 시 픽스처 갱신을 PR 체크에 넣는다 |
| 세션 복귀 | proxy `next` + 로그인 복귀 | proxy `next` 한 줄 |
| 놀고 있는 자산 | `compass_adsets_v` 소비 화면 1개(기능 교차 판정 §2 #4)에 `ads()` 링크 | `admin_leads_v` 소비(리드 상세 칩) |
| 상태 노출 | 운영 상태 패널 항목 | 없음. Compass 대시보드에 Admin 상태를 띄울 이유가 없다 |
| 정렬 쿼리 | `callback` 필터로 대체 | `?sort=next_action` 옵트인. 기능 교차 판정 §1 #4의 `?sort=priority`와 같은 자리에 넣으면 한 번에 끝난다 |
| 리드 정규 URL | 칩 클릭은 `?open=`, 복사는 `/leads/{id}` | `/leads/{id}`를 공유 정규 URL로 문서화 |

## 5. 실행 순서

| # | 저장소 | 범위 | 출처 | 노력 |
|---|---|---|---|---|
| 1 | Admin | `links.ts` + 픽스처 + 테스트, `CompassPipelineBand` 3링크 교체, `compassLeadUrl` 이관 | §3.1 | S |
| 2 | Admin | proxy `next` + 로그인 복귀 + 오픈 리다이렉트 테스트 | §3.4 | S |
| 3 | Compass | proxy `next` 한 줄, `adminLinks.ts`, SideNav Admin 그룹(BD 감춤) | §3.6 | S |
| 4 | Admin | `AdminNavItem.external` + 사이드바·⌘K·프리셋·크로스링크 | §3.2 | M |
| 5 | Admin | 운영 상태 패널 "Compass 브리지" | §3.5 | S |
| 6 | Admin | `admin_leads_v` 마이그레이션 + GRANT | §3.7 | S |
| 7 | Compass | 리드 상세 "Admin 리드" 칩 | §3.6 | M |
| 8 | Admin | 소재 카드·매출 배지·성과 스트립 링크, 담당자 alias 등록 | §3.3, §3.9 | S~M |
| 9 | Admin | 알림 교차 링크 | §3.8 | S |

코드 밖에서 먼저 확인할 것:

- 마케팅팀에 Compass 라우트·쿼리를 계약으로 삼는 데 동의를 받는다. rename 사전 공유는 브리지 뷰 컬럼과 같은 규칙이다.
- Compass에 `sort=next_action` 추가 여부. 없으면 §3.1의 `callback` 대체가 영구안이 된다.
- Compass `pg` 접속 롤 이름과 `public` 스키마 SELECT 가능 여부(`admin_leads_v` GRANT 대상).
- 마케팅 프리셋 사용자에게 Compass를 상시로 둘지, 기타로 접을지(2026-07-29 회의 "5개 안팎").
- Admin 계정이 없는 Compass 사용자 범위. 없으면 Compass→Admin 링크는 그 사람에게 로그인 벽이다.
- 문서 병합: `compass-admin-feature-exchange-2026-09-02.md`가 `origin/home_v3-3`에만 있다. main에 반영해야 이 문서의 참조가 유효하다.

## 6. 하지 않을 것

- 인증 통합. `admin_session` 쿠키 도메인을 `.classin.co.kr`로 넓히지 않는다(Strict host-only 유지). Compass의 Supabase Auth 이관도 선행 결정대로 하지 않는다.
- Compass 화면의 Admin iframe 임베드. 쿠키 정책과 디자인 시스템이 다르고, 임베드는 두 앱의 세션 오류를 서로에게 전파한다.
- Admin 서브도메인 이전. ADR-009의 별도 트랙이며 이 기획은 현재 `classin.co.kr/admin` 경로를 전제한다. 이전 시 픽스처의 origin 한 줄만 바뀌도록 `links`·`adminLinks`에 origin을 상수로 둔다.
- Compass에 공개(비로그인) 라우트 신설.
- 링크·픽스처에 전화·이름 등 PII.

## 7. 참고할 부분

Admin(이 저장소, `origin/main`):

- 브리지 계약: `lib/compass/normalize.ts`, `lib/compass/overlay.ts`, `lib/compass/bridge.ts`, `supabase/migrations/20260828_compass_bridge_views.sql`, `20260902_compass_leads_v_phone_key_column.sql`
- 기존 링크 표면: `components/admin/compass/CompassLeadChip.tsx`, `components/admin/crm/home/CompassPipelineBand.tsx`, `components/admin/calendar/event-style.ts`, `lib/crm/compass-timeline.ts`, `lib/repositories/crm-customer-360.ts`
- 내비 SSOT: `components/admin/admin-nav.ts`, `components/admin/admin-nav-access.ts`, `components/admin/nav-active.ts`, `components/admin/AdminSidebar.tsx`, `components/admin/AdminCommandPalette.tsx`, `components/admin/MarketingCrossLinks.tsx`
- 인증·복귀: `proxy.ts`, `app/admin/login/page.tsx`, `app/api/admin/auth/route.ts`, `lib/admin-auth.ts`
- 상태 패널: `lib/admin-integrations/status.ts`, `lib/admin-integrations/types.ts`, `lib/db/schema-contract.ts`
- 딥링크 목적지: `components/admin/crm/leads/LeadsBoardClient.tsx`(`?lead=`), `app/admin/crm/customers/[key]/page.tsx`
- 담당자: `supabase/migrations/20260626_admin_profiles_crm_assignments.sql`

Compass(`classinkr-main/crm`, `main`):

- 세션·복귀: `proxy.ts`, `app/login/page.tsx`(`safeNext`, 쿠키 도메인), `lib/auth.ts`, `lib/session.ts`, `lib/members.ts`
- 내비·셸: `components/SideNav.tsx`, `app/(main)/layout.tsx`, `app/(main)/knowledge/page.tsx`(vault 리다이렉트 선례)
- 라우트 계약: `app/(main)/leads/page.tsx`(`searchParams`), `app/(main)/leads/[id]/page.tsx`(BD 404 규칙), `lib/leadFilter.ts`, `app/(main)/leads/care/page.tsx`, `app/(main)/dashboard/page.tsx`, `app/(main)/revenue/page.tsx`
- 교차 도메인 선례: `app/api/demos/route.ts`(세션 쿠키 + CORS)
- 정규화: `lib/format.ts` `normPhone`(Compass CLAUDE.md가 정본으로 지정)

문서:

- [공용 Supabase DB 최적화·통폐합 분석](./supabase-shared-db-consolidation-analysis-2026-09-02.md)
- Compass↔Admin 기능 교차 적용·분할 판정 2026-09-02 (`origin/home_v3-3`)
- [ADR-009](../adr/ADR-009-site-admin-deployment-boundary.md), [홈페이지·Admin 실행 경계 분리 계획](./site-admin-separation-plan-2026-08-28.md)
- [어드민 탭 재구성 스펙](./admin-tab-restructure-2026-07-29.md), [Admin 작업 지침 맵](./admin-guidance-map.md)
