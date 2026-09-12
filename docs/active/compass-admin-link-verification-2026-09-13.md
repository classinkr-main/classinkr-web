# Admin ↔ Compass(mkt.classin.co.kr) 연결 — 실측 검증과 개정 기획 (2026-09-13)

기준 시점: 2026-09-13
선행 문서: [Admin ↔ Compass 연결 기획 2026-09-12](./compass-admin-link-plan-2026-09-12.md) (이하 "원안")
실측 기준 코드: Admin `origin/main` `d75ac028`(2026-09-10, "Hom v4 (#33)" 스쿼시), Compass `classinkr-main/crm` `main` `059f0097`(2026-09-11)
방법: 5개 영역(Admin 링크층 / Compass 저장소 / DB 브리지 / 문서·브랜치 / 내비 SSOT)을 병렬 실측. 아래 모든 판정은 파일·라인 근거를 가진다.

---

## 0. 결론

1. **링크 계층 구현 진척은 0이다.** 원안 §5 실행 순서 9개 항목 중 착수된 것이 없다. 원안 작성(09-12) 이후 양쪽 저장소 모두 이 주제로 커밋·PR·브랜치가 0건이다.
2. **데이터 층은 이미 끝났다.** 브리지 뷰 7장, 전화 정규화 SQL↔TS 바이트 일치 계약, 60초/10초 메모, 3.5초 캘린더 데드라인, 스키마 계약 프로브까지 완비다. 비어 있는 것은 **링크·세션 복귀·상태 표면** 세 가지뿐이다.
3. **원안의 계약 원천(§1.4)에 실측 오류가 있다.** 그대로 `links.ts`와 픽스처를 만들면 죽은 링크가 생긴다(§2).
4. **노력 재평가가 필요하다.** 원안이 M으로 잡은 §3.2(사이드바 external)가 실제로는 가장 비싼 항목이고, S로 잡은 §3.5는 전제가 틀렸다. 반대로 Compass proxy `next`는 수신 측이 이미 완비돼 **한 줄**이 맞다.
5. **분리(ADR-009)는 Phase 1 부분 완료에서 정지해 있다.** 원안이 §6에서 배제한 대로 링크 계층과 직교하므로 분리 진척을 기다릴 필요가 없다. 단 §3.F의 CORS 결함 하나가 두 트랙을 잇는다.

---

## 1. 진척 실측

### 1.1 원안 §5 실행 순서 — 9항목 전수

| # | 저장소 | 범위 | 판정 | 근거 | 노력(원안→재평가) |
|---|---|---|---|---|---|
| 1 | Admin | `links.ts` + 픽스처 + 테스트, 파이프라인밴드 3링크, `compassLeadUrl` 이관 | **미착수** | `lib/compass/`는 `bridge/calendar/home-band/normalize/overlay` 5개뿐. `tests/fixtures/` 디렉터리 자체가 없음 | S → **M** |
| 2 | Admin | proxy `next` + 로그인 복귀 + 오픈 리다이렉트 테스트 | **미착수** | `proxy.ts:174-178` `url.search = ""`, `app/admin/login/page.tsx:75,:123` `router.replace("/admin/overview")` 하드코딩 | S → S |
| 3 | Compass | proxy `next` 한 줄, `adminLinks.ts`, SideNav Admin 그룹 | **미착수** | `proxy.ts:62-65` `url.search=""`. `lib/adminLinks.ts` 없음(원격 13개 브랜치 전수 404). 저장소 `.ts/.tsx`에 `/admin` 문자열 0건 | S → S(+§2.4) |
| 4 | Admin | `AdminNavItem.external` + 사이드바·⌘K·프리셋·크로스링크 | **미착수** | `admin-nav.ts:37-54` 필드 8개에 `external` 없음. nav 계열 5개 파일에 "compass" 문자열 0건 | M → **L** |
| 5 | Admin | 운영 상태 패널 "Compass 브리지" | **미착수** | `lib/admin-integrations/` 전체 "compass" 0건. 현재 17항목 | S → S |
| 6 | Admin | `admin_leads_v` 마이그레이션 + GRANT | **미착수** | `git grep admin_leads_v origin/main` → 문서 2건뿐, 마이그레이션·코드 0건 | S → **M**(§3.C 선행조건) |
| 7 | Compass | 리드 상세 "Admin 리드" 칩 | **미착수** | `LeadDetailBody.tsx` 1,244줄에 외부 링크·admin 참조 0건 | M → M |
| 8 | Admin | 소재 카드·매출 배지·성과 스트립 링크, 담당자 alias | **미착수** | `CreativeCplCard.tsx`는 Compass 데이터만 읽고 href 0건. `MarketingPerfStrip.tsx` 내부 링크만 | S~M → S~M |
| 9 | Admin | 알림 교차 링크 | **미착수** | — | S → S |

**완료 0 / 부분 0 / 미착수 9.** 원안이 "변경 없음"으로 분류한 캘린더 링크(`lib/compass/calendar.ts:85`, `components/admin/calendar/event-style.ts:148`)만 기존 동작으로 살아 있다.

### 1.2 이미 완료된 층 (참고 — 다시 하지 말 것)

| 항목 | 상태 | 근거 |
|---|---|---|
| 브리지 뷰 7장 + 권한 | 완료 | `20260828_compass_bridge_views.sql:18-141`. REVOKE anon·authenticated / GRANT service_role |
| 전화 정규화 SQL↔TS 일치 | 완료 | `lib/compass/normalize.ts:8` ≡ 뷰 SQL. `tests/compass/normalize.test.ts:34`가 계약 고정 |
| 브리지 무음 실패 금지 | 완료 | `bridge.ts:153-163` 모든 export가 throw 없이 `{rows,down,error}` 반환 |
| 캐시 전략 | 완료 | 정상 60초/down 10초, in-flight promise 공유, reject 미캐시. 캘린더 3.5초 하드 데드라인 |
| 스키마 계약 프로브 | 완료 | `lib/db/schema-contract.ts:265-320` 뷰 7장 기대 컬럼 명시 |
| 오버레이 대표 선정 규칙 | 완료 | `tests/compass/overlay.test.ts` — 최근성 → id. 새로고침마다 칩이 바뀌지 않음 |
| Compass `safeNext()` 수신 | 완료(Compass) | `app/login/page.tsx:73-92` WHATWG URL 파서. 2026-09 감사로 역슬래시 오픈 리다이렉트까지 방어 |
| `/leads/{id}` 정규 URL | 사실상 정본(Compass) | `lib/gcal.ts:228`, `app/api/demos/route.ts:77`이 이미 절대 URL로 발신 |

### 1.3 분리(ADR-009) 트랙

ADR-009는 `Status: accepted`(2026-08-28)이고, "분리"의 정의는 **저장소 분리가 아니라 한 저장소 안의 5단계 배포 경계 분리**다. 저장소·Supabase 정본 단일 유지, Admin UI와 `/api/admin` 동일 origin, Cron 단일 소유가 결정문이다.

| Phase | 상태 | 근거 |
|---|---|---|
| 1-a Admin 레이아웃 서버화 | **완료** | `app/admin/layout.tsx` 서버 컴포넌트 + `AdminShell` + `force-dynamic` |
| 1-b 루트 레이아웃 최소화 | 미완 | `app/layout.tsx`가 여전히 `AppChrome`·`JsonLd`·gtag 스크립트를 전 경로 상위에 보유 |
| 1-c 공개 route group | 미착수 | `app/(...)/` route group 0개 |
| 1-d `/admin` 일괄 noindex | 미완 | 레이아웃 선언 없음. 개별 페이지 5개만 `robots:{index:false}` |
| 2 import boundary / 3 workspaces / 4 Vercel 2프로젝트 / 5 Cron·Webhook 이전 | **조건부 보류** | 계획서가 "Phase 1 완료 후 실익이 부족하면 여기서 멈출 수 있다"고 스스로 브레이크를 걸어둠 |

판단: **분리는 링크 기획의 선행 조건이 아니다.** `links.ts`의 `COMPASS_ORIGIN` 상수 1줄이 미래 서브도메인 이전을 흡수하도록 설계돼 있다. 단 §3.F가 유일한 교차점이다.

---

## 2. 원안 정정 — 계약 원천의 실측 오류

원안 §1.4 표는 `links.ts`의 타입과 픽스처의 원천이다. **구현 전에 아래를 반영해야 한다.**

### 2.1 `stage` 값 — 8개가 아니라 6개다

Compass `lib/stages.ts:2` `STAGE_ORDER = ["new","demo","quote","won","bd","lost"]`.
원안이 적은 **`contact`, `consult`는 실재하지 않는 키**이고 `buildLeadFilter`(`lib/leadFilter.ts:107-110`)가 통과시키지 않아 전체 목록으로 떨어진다. 라벨도 `quote = "미팅"`이지 견적이 아니다. 이 파일은 2026-08-31 이후 무변경이므로 원안 작성 시점에도 이미 6개였다.
가상 필터 5개(`missed/uncontacted/callback/account/call`)는 원안대로 유효하다.

### 2.2 `/ads`는 쿼리를 받는다 — 원안 "없음"은 오류

`app/(main)/ads/page.tsx:14-28,143-165` — `f`, `t` + 박스별 정렬 `sp`(프로덕트광고)·`ss`(설명회광고)·`se`(기타), 값 `recent|leads|spend|cpl`. 2026-09-07~08 커밋으로 추가됐다.
→ 원안 §3.3의 "소재 카드 → `ads()`" 링크는 **정렬·기간을 실어 보낼 수 있다.** `ads({ f, t, sp: "cpl" })`이 가능하다.

### 2.3 누락 라우트 3개 + `/revenue`의 `q` 의미

| 라우트 | 쿼리 | 비고 |
|---|---|---|
| `/leads/new` | `track` (`self`\|`direct`) | 원안 누락 |
| `/revenue/deals` | `f`, `t` | 원안 누락 |
| `/tasks` (미션 캘린더) | `m, d, v(w), u, q, ads, demo` | 원안 누락. `/tasks/board`는 `by, u, q` |
| `/revenue` | `q, m, f, t, s, p` | **`q`는 검색어가 아니라 분기 프리셋**(`Y|Q1~Q4`, `revenue/page.tsx:96-98`). 원안 §3.3의 `revenue({m})`은 안전하나 `q`를 검색어로 쓰면 오작동 |
| `/leads/care` `track` | `""\|mkt\|direct\|self\|bd\|closed` | 원안의 `bd`는 유효. 나머지 값도 계약에 포함할 것 |
| `/kpi` | `m`, `d`(형식 `사람\|지표`) | 원안 "확인 안 함" → 확정 |
| `/visits` | 없음(searchParams 미수신) | 확정 |

### 2.4 Compass SideNav 실제 구성 — 원안 §1.3과 다르다

실제 `components/SideNav.tsx` ITEMS는 **4그룹**(대시보드 2 / 리드 2+1 / 광고 / KPI 4)뿐이다. **미션·방문·지식저장소는 SideNav에 없다** — 미션은 모바일 헤더에만, 지식저장소·미션은 허브 카드(`app/page.tsx:23-59`)에만, `/visits`는 어떤 내비에도 없다.

**중요**: `/tasks*`는 `(main)` 그룹 **밖**의 별도 레이아웃(`app/tasks/layout.tsx`)이다. 원안 §3.6의 "SideNav 하단 Admin 그룹"을 넣어도 **미션 화면에서는 보이지 않는다.** 전 화면 커버를 원하면 모바일 헤더(`app/(main)/layout.tsx:65`)에도 같이 넣어야 한다.
반면 `isBdMember` 분기는 `SideNav.tsx:113-122`·`layout.tsx:13`·`proxy.ts:45`에 이미 있어 "BD 감춤" 배선은 그대로 재사용 가능하다.

### 2.5 `isCompassBridgeDown()` 소비처 — 10곳이 아니라 0곳

정의는 `lib/compass/bridge.ts:585`, **프로덕션 호출자 0건**이다(테스트 1건뿐). 원안 §1.2의 "소비처 10개 파일"은 `@/lib/compass/bridge`를 **import 하는 파일 수**를 센 것으로 보인다. 화면의 "연결 끊김"은 각 조회 함수가 돌려주는 `down` 플래그에서 온다(`use-compass-overlay.ts:59-68`).
→ §3.5 운영 상태 패널이 이 함수의 **첫 실사용처**가 된다. 15초/10초 TTL이 이미 준비돼 있어 구현은 여전히 S지만, "이미 10곳이 쓰니 상태만 올리면 된다"는 전제는 성립하지 않는다.

### 2.6 그 밖의 실측 보정

- `tests/fixtures/` 디렉터리가 **존재하지 않는다.** §3.1의 픽스처는 새 관례를 만드는 일이다.
- **Compass 저장소에는 테스트도 CI 워크플로도 없다**(`package.json`에 test 스크립트 없음). 원안 §4의 "픽스처 갱신을 PR 체크에 넣는다"를 걸 자리가 없다. → 계약 테스트는 **Admin 단독**으로 돌리고, Compass 쪽은 문서 규약 + 라우트 rename 사전 공유로 대체해야 한다.
- `CompassLeadChip.tsx:54`가 `rel="noreferrer"` — 원안 §2.6이 못박은 `rel="noopener noreferrer"`와 불일치.
- `mkt.classin.co.kr` 리터럴 19건 중 **URL 생성 지점은 2곳**(`normalize.ts:14`, `CompassPipelineBand.tsx:11`), 비교 1곳(`event-style.ts:148`), **테스트 기대값 8곳**. `compassLeadUrl` 소비처 6곳은 re-export를 남기면 전부 무변경 통과.
- `CompassPipelineBand.tsx:13`의 `?sort=next_action_at`은 실재하지 않는 키 — 원안이 지적한 대로 현재 전체 목록으로 낙하 중이다(살아 있는 버그).

---

## 3. 추가 기획 — 실측에서 새로 드러난 항목

### 3.A 매출 대조 배지의 무음 실패 가드 【신규·최우선·단독 가능】

`compass_revenue_v`는 `synced_at`을 이미 노출하는데(`20260828…:120-123`) `getCompassRevenueCompare()`(`lib/admin-crm-revenue-sheet.ts:140-160`)는 **읽지 않는다.** Compass는 `crm.revenue_deals`를 무트랜잭션 delete→insert로 전량 교체하고 GitHub Actions 2개가 같은 분에 호출한다(DB 분석 R1·R2).

결과: 교체 창에 걸리면 0행 → `diff = 우리 매출 전액`, 이중 실행이면 2배 → 반대 부호 diff가 **정상 숫자처럼** 화면에 올라간다. `tests/compass/rev-sheet-compass-compare.test.ts`에 0행·2배 케이스가 없다.

기획:
- `getCompassRevenueCompare()`가 `synced_at` 최댓값을 함께 읽어 **24시간 초과면 `stale`**, 당월 행수 0이면 **`empty`**로 표시하고 diff 숫자를 강등한다(`down`과 같은 톤).
- 직전 조회 행수 대비 급변(±80% 이상)은 `suspect`로 배지에 표식. 근본 수리는 Compass 소유이므로 우리 쪽은 **관측만** 한다.
- 테스트: 0행 / 2배 / stale 3케이스 추가.

노력 S. 우리 저장소 단독으로 가능하고, 링크 계층 전체에서 **실제 오판 가능성이 가장 높은 지점**이다.

### 3.B `compass_leads_v.phone_key` 정의 프로브 【신규】

`20260902_compass_leads_v_phone_key_column.sql:20-67`은 `crm.leads.phone_key` 생성 컬럼이 **있을 때만** 뷰를 교체하고, 없으면 NOTICE만 남기고 정규식 뷰를 유지한다. `schema-contract`는 컬럼 **존재**만 보므로 어느 쪽이든 통과한다.
→ 지금 `.in("phone_key", keys)` 배치가 매번 `crm.leads` 풀스캔인지 아무도 모른다. 60초 메모는 완화일 뿐이다.

기획: 스키마 계약에 **뷰 정의식 프로브**(`pg_get_viewdef` 또는 `EXPLAIN` 1회)를 추가해 "정규식 뷰로 남아 있음"을 경고로 올린다. 운영 상태 패널 Compass 항목(§3.5)의 하위 신호로 붙이면 화면이 늘지 않는다. 노력 S.

### 3.C `admin_leads_v` 선행 조건 — 지금 만들면 상대에게 풀스캔을 물려준다 【정정】

`public.leads`에는 `phone_key` 컬럼도 정규화식 인덱스도 없다(`20260902_leads_dedupe_and_admin_hot_path_indexes.sql:48-54`는 `phone` 원문 부분 인덱스만). 원안 §3.7대로 뷰 안에서 정규식을 돌리면 Compass가 §3.B와 똑같은 문제를 그대로 받는다.

기획(원안 §3.7 대체):
1. `public.leads.phone_key` **생성 컬럼** 추가 + 인덱스 (브리지 뷰와 동일 정규식, `normalize.ts`와 바이트 일치 계약 유지).
2. 그 위에 `admin_leads_v` 생성. 컬럼은 원안대로 `id, phone_key, status, assigned_to, created_at, last_inflow_at, source` — 이름·전화 원문·메모 제외.
3. `anon`·`authenticated` REVOKE, Compass 접속 롤에만 SELECT(롤 이름은 열린 질문).
4. `schema-contract.ts`에 프로브 동반 추가.

노력 S → **M**. 순서상 §3.5(상태 표면)보다 뒤에 둔다 — 역방향 계약을 열기 전에 단일 상태 표면이 먼저 있어야 한다.

### 3.D Admin 내비 external 항목 — 실제 비용과 3개 안 【재기획】

`href`는 단순 링크가 아니라 **7군데의 조인 키**다: 프리셋 primary 배열, `MOON_ONLY_HREFS`, `RESTRICTED_HREFS`, `navOverrides` JSONB 키, `NAV_WARMUP_REQUESTS` 키, route family parentHref, ⌘K 커맨드 키. 절대 URL을 넣으면 타입은 통과하지만 `<Link>` 5곳·`router.prefetch`·`router.push`·`matchNavActive`·`resolveAdminNavParentHref`가 **조용히** 오작동한다.

실측 비용:
- 수정 파일: `admin-nav.ts`(필드), `AdminSidebar.tsx`(**렌더 5곳** — 데스크톱 상시/기타, 모바일 드로어 상시/기타, 모바일 하단바 + prefetch·warmup 가드), `AdminCommandPalette.tsx`(`go()`가 `router.push` 단일 경로), `admin-nav-access.ts`(프리셋 배치).
- **반드시 깨지는 테스트 3건**: `nav-access.test.ts:204`("super 8 primary / 9 folded" — 총 17 고정이라 어떤 항목 추가든 실패), `:83`(범주 연속 블록 `["home","customer","growth","system"]` 정확 일치), `:224`(super primaryGroups 고정).
- **순서 의존 함정**: `AdminCommandPalette.tsx:107-119`가 `ADMIN_NAV`를 그대로 flatMap하므로, `external` 필드만 추가하고 `go()`(`:171` `router.push`)를 안 고치면 **⌘K에서 외부 URL이 Next 라우터로 push되어 404**가 난다.

| 안 | 내용 | 노력 | 장단 |
|---|---|---|---|
| **A** 원안 그대로 | `AdminNavItem.external` + 렌더 5곳 분기 | **L** | 진짜 "탭". nav SSOT에 외부 개념이 영구 편입 |
| **B** 내비 밖 진입점 | ⌘K 전용 커맨드(내비 파생 아닌 별도 상수) + 기존 CRM 홈 밴드 강화 + 캠페인 허브 카드 | **S** | nav SSOT 무변경, 테스트 0건 깨짐. 사이드바에는 안 보임 |
| **C** 내부 브리지 라우트 | `/admin/mkt` → `redirect(COMPASS_ORIGIN)` | S~M | 기존 배관 전부 재사용. 단 **새 탭 규약(D14) 위반** — 같은 탭으로 떠난다. warmup 제외 필수 |

**권고: B → (정원 판정 후) A.** 마케팅 프리셋이 이미 정원 5개라(§3.E) 지금 A를 하면 원칙 위반을 코드로 굳힌다. B는 그 판정을 기다리지 않고 오늘 실익을 낸다.

### 3.E `MOON_ONLY_HREFS` 모순 선행 해소 【신규】

`MOON_ONLY_HREFS`는 역할이 아니라 **특정 인물 기준** 목록이고, 거기에 `/admin/campaigns/manage`와 `/admin/campaigns/projects`가 들어 있다. 결과: **마케팅 프리셋 사용자가 마케팅 핵심 2화면에 도달하지 못한다.** Compass(마케팅팀 앱) 탭을 같은 배선으로 올리면 정작 마케팅팀이 못 보는 동일 함정에 빠진다.

또한 탭 재구성 스펙 §12.1이 기록한 "super 상시 6"과 코드(8개)가 어긋나 있다(§13이 개수 갱신 없이 Overview만 추가). 스펙 §11-2의 "자료 퍼널 marketing 상시 승격"도 미이행 상태라 **같은 자리를 Compass와 자료 퍼널이 다툰다.**

기획: Compass 탭 배치 판정 전에 (1) `MOON_ONLY_HREFS`를 역할/프리셋 기반으로 재정의할지 결정, (2) 탭 재구성 스펙 §12.1 수치를 코드 실측(8개)에 맞춰 개정, (3) 마케팅 프리셋 정원 재판정(자료 퍼널 vs Compass). 노력 S(코드) + 회의 1건.

### 3.F `/api/demos` CORS가 apex 도메인을 배제한다 【신규·분리 트랙과의 교차점】

Compass `app/api/demos/route.ts:90`과 `proxy.ts:57`의 허용 정규식이 `/^https:\/\/[a-z0-9-]+\.classin\.co\.kr$/` — **서브도메인 라벨을 강제**한다. Admin이 `classin.co.kr/admin`(apex)에 있는 한 이 API를 브라우저에서 credentialed로 부를 수 없다. `OPTIONS` 핸들러도 없다.

의미: 지금은 링크 계층만 하므로 문제되지 않는다. 그러나 **ADR-009 Phase 4로 Admin을 서브도메인으로 옮기면 정규식 수정 없이 자동 통과**한다. 반대로 apex 상태에서 Compass API를 직접 부를 계획이 생기면 Compass 쪽 정규식 수정이 선행돼야 한다.
기획: 이 사실을 ADR-009 Phase 4 체크리스트에 **이득 항목**으로 기재하고, 링크 계층에서는 건드리지 않는다.

### 3.G 문서 위생 3건 【신규】

1. **고아 문서 복구**: `compass-admin-feature-exchange-2026-09-02.md`는 `origin/home_v3-3`의 단일 커밋에만 존재한다(hom_v4는 `c31def5f`에서 분기해 이 커밋을 포함하지 않음). 원안 §3.2·§4가 이 문서를 참조하므로 main에 올리지 않으면 끊긴 참조다. `git show c7b65ae3:docs/active/compass-admin-feature-exchange-2026-09-02.md`로 꺼내 새 커밋으로 올리면 충돌 0.
2. **라우팅 공백**: `docs/active/playbook/04-growth-crm.md`와 `docs/active/admin-guidance-map.md` 모두 **Compass 언급 0건**이다. 원안이 전자를 "전제 문서"로 인용하는 것은 근거 없는 참조다. 지침 맵에 Compass·브리지 행이 없으면 main만 읽는 에이전트가 이 주제의 정본을 찾지 못한다. → 두 문서에 Compass 섹션/행 추가.
3. **원안 자체가 미커밋**이다(어느 브랜치에도 없는 untracked 파일). 이 문서와 함께 커밋해야 한다.

### 3.H 실행 브랜치 결정 【신규·차단성】

| ref | tip | 이 주제 내용 |
|---|---|---|
| `origin/main` | `d75ac028` (09-10) | Compass 코드 전부 보유. "Hom v4 (#33)" **스쿼시 1커밋** |
| `origin/hom_v4` | `fc341753` (09-10) | main과 **트리 완전 동일**(파일 diff 0) |
| `origin/home_v4.2` | `a69d1240` (09-10) | main + 성능 3라운드 문서 24파일. 이 주제 무관 |
| `origin/home_v3-3` | `c7b65ae3` (09-02) | = `origin/home_v3` + feature-exchange 문서 1커밋 |
| **로컬 `home_v3`** | `91de055d` (08-16) | **Compass 코드 없음.** `origin/home_v3` 대비 ahead 4 / behind 175 |

로컬 `home_v3`는 `e30e9bee`(08-08)에서 갈라져 08-16 이후 정지했고, Compass 브리지는 08-28에 들어왔다. 게다가 main이 스쿼시라 `git merge-base --is-ancestor`가 어떤 기능 브랜치 커밋에도 YES를 반환하지 않는다 — **병합 여부를 커밋 기준으로 판정하면 오판한다. 트리(내용) 기준으로 봐야 한다.**

기획: 이 작업은 **`origin/main`에서 분기한 새 브랜치**에서 한다. 로컬 `home_v3`의 미푸시 4커밋(CRM 점수 체계, 히트맵, 동의, gtag — 43파일)은 별건으로 main 위에 올리거나 폐기할지 먼저 판정한다. 두 계보를 이 기획 작업 중에 섞지 않는다.

---

## 4. 개정 실행 순서

원안 §5를 아래로 대체한다. S0~S2는 서로 독립이라 병렬 가능하다.

| # | 저장소 | 범위 | 출처 | 노력 | 선행 |
|---|---|---|---|---|---|
| **S0** | Admin | 매출 대조 무음 실패 가드(`synced_at` staleness·0행·급변) + 테스트 3케이스 | §3.A | S | 없음 |
| **S1** | Compass | proxy `next` 한 줄 (`url.search=""` → `searchParams.set("next", pathname+search)`) | 원안 §3.6 | S | 없음(수신 측 완비) |
| **S2** | Admin | proxy `next` + 로그인 복귀 + 오픈 리다이렉트 테스트 | 원안 §3.4 | S | 없음 |
| **S3** | Admin | `lib/compass/links.ts` + `tests/fixtures/compass-routes.json` + 계약 테스트. **§2.1~2.3 정정 반영.** `CompassPipelineBand` 3링크 교체, `compassLeadUrl` 이관(re-export 유지), `rel` 정정 | 원안 §3.1 + §2 | M | 마케팅팀 계약 동의 |
| **S4** | Admin | 운영 상태 패널 "Compass 브리지" 항목 (+ §3.B 뷰 정의 프로브를 하위 신호로) | 원안 §3.5 + §3.B | S | S3 |
| **S5** | Admin | ⌘K 전용 Compass 커맨드 + CRM 홈 밴드 강화 + 캠페인 허브 카드 (§3.D **B안**) | §3.D | S | S3 |
| **S6** | Admin | 소재 카드 `ads({f,t,sp})`·매출 배지 `revenue({m})`·성과 스트립 `dashboard({m})`·리드칩 "링크 복사" | 원안 §3.3 | S~M | S3 |
| **S7** | 문서 | feature-exchange 고아 문서 main 반영, playbook·지침 맵에 Compass 행 추가, 원안+본 문서 커밋 | §3.G | S | 없음 |
| **S8** | 조직 | `MOON_ONLY_HREFS` 재정의 + 탭 스펙 §12.1 수치 개정 + 마케팅 프리셋 정원 판정 | §3.E | S+회의 | 없음 |
| **S9** | Admin | `public.leads.phone_key` 생성 컬럼·인덱스 → `admin_leads_v` + GRANT + 프로브 | §3.C | M | S4, 롤 이름 확인 |
| **S10** | Compass | `adminLinks.ts` + SideNav Admin 그룹(+**모바일 헤더**, BD 감춤) | 원안 §3.6 + §2.4 | S~M | S9 |
| **S11** | Compass | 리드 상세 "Admin 리드" 칩 | 원안 §3.6 | M | S9, S10 |
| **S12** | Admin | 사이드바 `external` 정식 탭 (§3.D **A안**) | §3.D | L | **S8 판정** |
| **S13** | Admin | 알림 교차 링크, 담당자 alias 등록 | 원안 §3.8·§3.9 | S | S3 |

---

## 5. 열린 질문 (갱신)

원안 §5의 6건 중 1건은 **해소**됐다.

| # | 질문 | 상태 |
|---|---|---|
| 1 | 마케팅팀이 Compass 라우트·쿼리를 계약으로 삼는 데 동의하는가 | **열림**. S3 차단 |
| 2 | Compass `?sort=next_action` 추가 여부 | **열림**. 현재 `sort` 계열 쿼리 0개(`?sort=priority`도 없음). 없으면 `stage=callback` 대체가 영구안 |
| 3 | Compass `pg` 접속 롤 이름 + `public` SELECT 가능 여부 | **열림**. S9 차단 |
| 4 | 마케팅 프리셋에 Compass를 상시로 둘지 | **열림 + 확대**. 정원이 정확히 5개이고 자료 퍼널 승격(스펙 §11-2)과 자리를 다툼 → §3.E/S8 |
| 5 | Admin 계정 없는 Compass 사용자 범위 | **열림**. S10·S11 실익 판정 |
| 6 | feature-exchange 문서 main 병합 | **해소(실측)**: 미병합 확정, `origin/home_v3-3` 고아. 복구 비용 0 → S7 |
| **7** | `crm.activities.deleted_at` 실재 여부 | **신규·잠재 결함**. 없으면 `compass_activities_v`가 이미 깨져 있다(DB 분석 §10) |
| **8** | 로컬 `home_v3` 미푸시 4커밋 처분 | **신규·차단성**. §3.H |
| **9** | Compass에 테스트·CI를 신설할지 | **신규**. 없으면 픽스처 PR 체크 불가 → 계약 테스트는 Admin 단독 |

---

## 6. 하지 않을 것

원안 §6을 그대로 승계한다(인증 통합·쿠키 도메인 확대 금지, Supabase Auth 강제 이관 금지, 테이블 병합 15건 금지, iframe 임베드 금지, UI 통일 금지, 교차 쓰기 금지, Compass 공개 라우트 신설 금지, 링크에 PII 금지, Admin 서브도메인 이전은 별도 트랙). 추가로:

- **Compass의 매출 전량 교체(R1·R2) 결함을 우리 쪽에서 고치지 않는다.** §3.A는 관측·강등까지다. 수리는 Compass 소유다.
- **`/api/demos` CORS 정규식을 apex 허용으로 넓히지 않는다.** ADR-009 Phase 4로 자연 해소되는 사안이다(§3.F).
- **§3.D A안(external 탭)을 정원 판정 전에 하지 않는다.** 원칙 위반을 코드로 굳히는 일이다.
