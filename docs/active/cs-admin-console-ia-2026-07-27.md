# CS 어드민 콘솔 IA 재구성

프로토타입 `AI CS 관리 시스템`(레이아웃 2안 중 1b 채택)을 기준으로 CS 어드민의 정보 구조를 재배치한다.
기능은 전량 보존하고, 중복 UI만 단일화하며, 신규 화면은 `본사 확인` 하나로 제한한다.

## 1. 결정 요약

| 항목 | 결정 |
|---|---|
| 레이아웃 | 1b — 모드 탭(외부/내부) + 그 아래 가로 서브메뉴 |
| 메뉴 수 | 외부 6 · 내부 4 |
| 축 구분 | 외부 = Classin Green, 내부 = 웜 뉴트럴 + 사내 전용 경고 바 (바이올렛 예외 토큰 도입하지 않음) |
| 아이콘 | 기존 nav 아이콘 승계, 신규는 `AI 품질 검수` 하나(`BadgeCheck`) |
| 셸 | 라우트 그룹 아님 — 공용 컴포넌트 `CsConsoleNav` |
| URL 키 | `tab` (저장소 표준 키) |
| 본문 폭 | 화면별 기존 폭을 그대로 두고 내비가 그 폭을 따라간다 (기본값만 1240px) |
| 신규 테이블 | 0 |
| 신규 API 라우트 | 0 |
| 전체화면 오버레이 | `/admin/cs-chatbot`의 `fixed inset-0` 해제 |

### 본문 폭을 1240px로 통일하지 않는 이유

내비의 기본 컨테이너는 `mx-auto max-w-[1240px] px-4/sm:px-6/lg:px-8`이지만,
`/admin/docs`와 `/admin/channel-talk`에는 그 화면 본문과 같은 폭을 `contentClassName`으로 넘긴다.
**내비의 폭 계약은 "1240px"이 아니라 "그 화면 본문과 좌우가 맞는다"이다.**

두 화면의 본문 폭은 콘솔 이전부터 있던 값이고 이번 재구성이 만든 것이 아니다 —
docs는 폭 제한 없음(2열 레이아웃 + 넓은 문서 테이블), channel-talk는 `max-w-5xl` 좌측 정렬.
내비만 1240으로 묶으면 그 두 화면에서 내비와 본문의 좌우 끝이 어긋난다.

실측(사이드바 240px 기준):

| 뷰포트 | 본문 가용 폭 | 1240 상한 |
|---|---|---|
| 1280 | 1040px | 걸리지 않음 |
| 1440 | 1200px | 걸리지 않음 |
| 1728 | 1488px | 걸림 |

1480 미만에서는 네 화면 모두 메뉴 항목이 같은 x(사이드바 끝 + `lg:px-8`)에서 시작해
**렌더 결과가 동일하다.** 컨테이너의 오른쪽 끝은 시각 표식이 없다(하단 보더·경고 바 배경은
바깥 풀블리드 div가 그린다). 1480 이상에서 화면 간 메뉴 시작 x가 달라지는 것은
각 화면 본문의 정렬 정책(중앙 vs 좌측) 차이가 그대로 드러난 것이고,
없애려면 본문 폭 정책 자체를 통일해야 한다 — 그건 콘솔 IA의 범위가 아니다.

docs를 1240으로 묶어도 문서 테이블의 가로 스크롤은 사라지지 않는다.
그 테이블은 2열 레이아웃 왼쪽 칼럼(1440에서 708px) 안에서 이미 가로 스크롤 중이고
(콘텐츠 폭 1240px), 본문을 좁히면 그 칼럼이 더 좁아져 악화된다.

## 2. 메뉴 구조

### 외부용 · Customer (6)

| 메뉴 | URL | 아이콘 | 실체 |
|---|---|---|---|
| 대시보드 | `/admin/chatbot` | Bot | **현재 CS 운영 대시보드**. 운영 지표 6카드 (품질 평가·알파 준비도는 이관됨) |
| 상담 Inbox | `/admin/channel-talk` | MessageSquare | 채널톡 상담 목록·유형 분포·응답 추이·FAQ 후보 |
| 미해결 큐 | `/admin/docs?tab=gaps` | Search | 보강 큐 — 문서 없는 질문 + 결과 없는 검색어 |
| AI 품질 검수 | `/admin/docs?tab=quality` | BadgeCheck **(신설)** | 품질 평가 + 알파 준비도 — 중복 2벌 통합 |
| 가이드 문서 | `/admin/docs?tab=documents` | BookOpen | 문서 CRUD (+ 화면 내부 보조 탭: 카테고리·리디렉트) |
| 추천 질문 | `/admin/docs?tab=recommended` | MessageSquareText | 추천 질문 발행·관리 |

### 내부용 · Internal (4)

| 메뉴 | URL | 아이콘 | 실체 |
|---|---|---|---|
| 내부 상담 | `/admin/cs-chatbot?tab=chat` | Headset | AI 초안 스레드 + 검토 드로어 |
| 대기열 | `/admin/cs-chatbot?tab=queue` | Inbox | 대기·진행·종료 대화 (아카이브 흡수, 상태 칩으로 분리) |
| 본사 확인 | `/admin/cs-chatbot?tab=hq` | Building | **신규** — 본사 회신 대기 건 |
| 운영 도구 | `/admin/cs-chatbot?tab=tools` | Wrench | 회귀 검수·운영 지표·AI 브리지·바로가기 |

### `AI 품질 검수` 아이콘 — `BadgeCheck`

10개 중 유일한 신설 값이라 나머지 9개처럼 승계할 원본이 없다. `BadgeCheck`(검증·인증 완료)로 확정한다.

`ShieldCheck`는 쓰지 않는다. 이 저장소에서 방패는 이미 **보안·동의·권한**을 뜻하고 그 용례가 6곳이다 —
설정 보안 패널, 연동 제어, 멤버 권한, 리드 `마케팅 동의`, CRM 커버리지 스트립,
그리고 이 콘솔 안쪽의 첨부 `담당자 확인 필요` 배지. 이 화면은 알파 준비도 점검과
골든셋 회귀 품질이라 보안 축이 아니다.

콘솔 안에서 이미 다른 뜻을 가진 후보도 뺐다 — `ClipboardCheck`는 운영 데스크의 `추천 질문 승인`
바로가기(형제 메뉴 `추천 질문`), `Gauge`는 대시보드의 `평균 신뢰도` 카드,
`Sparkles`는 `DOCS_TABS`의 `보강 큐`다. 형제 메뉴와 같은 글리프를 쓰면 6개를 나란히 놨을 때 읽히지 않는다.

값은 두 곳이 공유한다 — [CsConsoleNav](../../components/admin/cs/CsConsoleNav.tsx)와
[docs 화면의 `DOCS_TABS`](../../app/admin/docs/page.tsx). 바꿀 때 둘 다 바꾼다.

### 흡수 관계 (현재 사이드바 5항목 → 새 위치)

| 현재 | 새 위치 |
|---|---|
| 가이드 문서 | 외부 `가이드 문서` (사이드바에도 유지 — 콘텐츠 파트 공용) |
| 챗봇 운영 | 외부 `대시보드` |
| 문서 보강 큐 | 외부 `미해결 큐` |
| 내부 CS 챗봇 | 내부 축 전체 |
| 채널톡 상담 | 외부 `상담 Inbox` |

사이드바 CS 섹션은 5항목 → 3항목(`가이드 문서` · `CS 콘솔` · `내부 CS`)으로 줄인다.
나머지는 콘솔 가로 메뉴로 도달한다.

## 3. 왜 이 골격이 성립하는가

10개 메뉴가 실제로는 **4개 라우트**에 얹힌다. `/admin/chatbot`은 리다이렉트 스텁이 아니라
운영 지표를 직접 렌더하는 CS 운영 대시보드다.

- `/admin/chatbot` — 대시보드
- `/admin/channel-talk` — 상담 Inbox
- `/admin/docs` — 외부 4개 (`?tab=`)
- `/admin/cs-chatbot` — 내부 4개 (`?tab=`)

같은 라우트 안의 메뉴 이동은 pathname이 불변이라
[RouteTransition](../../components/transitions/RouteTransition.tsx)의 `key={pathname}` 리마운트를 타지 않는다.
라우트 세그먼트로 쪼갰다면 탭을 옮길 때마다 상태가 날아갔을 것이다.

URL이 그대로이므로 [AdminSidebar](../../components/admin/AdminSidebar.tsx)의 `NAV_WARMUP_REQUESTS`
프리페치 키와 기존 딥링크가 전부 살아남는다.

## 4. 셸 — 라우트 그룹을 쓰지 않는 이유

`app/admin/(cs)/layout.tsx` 라우트 그룹은 Next 관용이지만 채택하지 않는다.
`app/admin/docs/` 아래에 `new/`와 `[id]/edit/`이 있어, 그룹으로 묶으면
문서 편집기(전체화면 에디터)에도 콘솔 내비가 붙는다.

대신 `components/admin/cs/CsConsoleNav.tsx` 하나를 만들고 4개 페이지가 불러 쓴다.
디렉터리 이동이 없고, 편집기는 의도적으로 제외된다.

`CsConsoleNav`가 메뉴 정의의 단일 진실 원천이다. 항목별로 `roles`를 들고
권한 미달 항목은 렌더하지 않는다 — 채널톡만 `STAFF_ADMIN`이고 나머지는 `STAFF_EDITOR`다.

이 `roles` 필터는 콘솔 메뉴 가시성을 정리하는 UX 규칙이다. URL 직접 진입이나 데이터 접근을 막는
보안 경계로 간주하지 않으며, 실제 읽기·쓰기는 각 API의 관리자 가드와 필요한 기능 권한에서 강제한다.

## 5. URL 규약

### 모드는 URL에 넣지 않는다

현재 라우트로 결정된다 — `/admin/cs-chatbot`이면 내부, 나머지면 외부.
별도 `mode` 파라미터는 desync 위험만 늘린다.
모드 탭 클릭은 그 축의 첫 화면(`외부`→대시보드, `내부`→내부 상담)으로 이동한다.

### 2단 계약 — `tab`은 메뉴 층, `sub`는 화면 안쪽 층

`tab`은 저장소에서 이미 8개 화면이 쓰는 표준 키다.
`view`·`lens`는 각각 다른 의미로 쓰이고 있어 재사용하지 않는다.

화면 안쪽 하위탭은 `sub`를 쓴다. 두 층이 다른 키를 쓰므로 서로 덮지 않는다.

| 화면 | `sub` 값 | 기본값 |
|---|---|---|
| 미해결 큐 | `queue` · `patterns` | `queue` |
| 상담 Inbox | `conversations` · `trends` · `faq` | `conversations` |
| 운영 도구 | `regression` · `metrics` · `bridge` | `regression` |

기본값이면 파라미터를 URL에서 지운다.
하위탭바는 공용 [AdminTabs](../../components/admin/AdminTabs.tsx)를 `variant="subtle"`로 재사용한다 — 새 컴포넌트를 만들지 않는다.

**예외 하나** — `가이드 문서` 그룹의 보조 탭(`문서`·`카테고리`·`리디렉트`·`성과`)은 `sub`가 아니라 `tab`에 산다.
`?tab=categories`·`?tab=redirects` 북마크가 이미 거기 걸려 있어서, 일관성을 위해 옮기면 그 북마크가 깨진다.
`성과`도 같은 층에 `tab=analytics`로 붙인다.

**`sub`는 `tab`의 합성 읽기를 쓰지 않는다.** `tab`은 콘솔 내비 `<Link>`가 값을 실어 나르므로
라우터 값이 먼저 맞아 `searchParams.get("tab") ?? tabParam` 합성이 필요하지만,
`sub`는 쓰기 창구가 `AdminTabs` 하나(=`useUrlState`의 `replaceState`)뿐이라 `window.location`이 먼저 맞는다.
합성을 얹으면 하위탭을 누를 때마다 라우터가 따라오는 동안 직전 탭이 다시 그려진다.

대신 반대 방향의 구멍을 막는다 — `?sub=trends` 상태에서 콘솔 내비(`sub` 없는 href)를 누르면
`<Link>`의 `pushState`가 `popstate`를 쏘지 않아 `useUrlState`가 주소 변경을 못 본다.
`searchParams`를 읽기가 아니라 **"라우터가 주소를 커밋했다"는 신호로만** 써서 기본 탭으로 되돌린다.

### 가이드 문서 그룹 매핑

`카테고리`·`리디렉트`를 콘솔 메뉴에 올리면 외부가 8개가 되어 1b 한계를 넘는다.
`가이드 문서` 화면 **안쪽** 보조 탭으로 남기고, 콘솔의 active 조건만 그룹으로 잡는다.

```
가이드 문서 active ⟺ tab ∈ { documents, categories, redirects }
```

기존 `?tab=categories` 북마크가 그대로 살고 URL 마이그레이션이 0이다.

### `conversation` 딥링크 승계

`?conversation=<uuid>`는 그대로 둔다. `tab`이 명시되지 않은 채 `conversation`만 오면
`tab=chat`으로 강제한다 (현행 동작 유지).

### active 판정 공용화

[AdminSidebar](../../components/admin/AdminSidebar.tsx)의 `isNavActive`
(쿼리 부분집합 매칭 + 형제 양보)를 `components/admin/nav-active.ts`로 추출해
사이드바와 콘솔 내비가 같은 판정을 쓴다. 두 벌로 갈리면 반드시 어긋난다.

## 6. 본사 확인 화면

### 신규 엔티티를 만들지 않는다

티켓 테이블·API를 신설하지 않고, 이미 있는 것만으로 세운다.

- **상태 저장** — `internal_cs_conversations.tags[]`
- **어휘** — [내부 CS 콘텐츠 병합 기준 §5](internal-cs-content-arrangement-2026-07-15.md)에 이미 정의된
  `intent:hq_confirmation`, `evidence:hq_pending`, `evidence:confirmed`
- **본문 생성** — 기존 `buildHqTemplate()`의 6항목 고정 포맷
  (`Case / Impact / Question·Reproduction / Korea checks / Evidence / Request to HQ`)
- **쓰기 경로** — `PATCH /api/admin/cs-chat/conversations/[id]` `action:"update"` + `tags`
  (이미 구현됨. [cleanInternalCsTags](../../lib/repositories/internal-cs-chat.ts)로 정제)

신규 API 라우트 0건. 신규 테이블 0건.

### 화면

목록은 `tags @> {evidence:hq_pending}` 인 대화다. 행마다 제목·상태·담당·대기 경과를 보이고,
펼치면 `buildHqTemplate()` 결과가 그대로 뜨며 복사 버튼이 붙는다.
회신이 오면 `evidence:confirmed`로 바꿔 목록에서 빠진다.

**대기 경과는 근사다.** `evidence:hq_pending` 부착 시각을 저장하는 칼럼이 없어 `updated_at`을 쓴다.
`updated_at`은 [트리거](../../supabase/migrations/20260715_internal_cs_chat.sql)로 모든 수정에 다시 찍히므로,
담당자·상태·제목을 바꾸면 경과가 0부터 재계산된다. 화면에 이 한계를 명시한다.
정확한 경과가 필요해지면 그때 `hq_pending_at` 칼럼을 추가한다 — 지금은 넣지 않는다.

**태그 어휘 검증**: `cleanInternalCsTags` → `cleanStringList`는 화이트리스트가 없고
trim·중복 제거·20개 상한만 건다. 세 태그 모두 통과한다. 상한이 유일한 실패 지점이므로,
PATCH 응답의 `tags`를 되짚어 대기 태그가 실제로 저장됐는지 확인한 뒤에만 성공 처리한다.

### 축을 넘는 동선

프로토타입의 `미해결 Queue → 본사 소통 매칭으로 보내기`에 대응한다.

```
대기열 / 내부 상담 화면
  → [본사 확인 요청] 버튼
  → PATCH tags += evidence:hq_pending
  → /admin/cs-chatbot?tab=hq&conversation=<id> 로 이동
```

티켓 엔티티 없이 태그 전이만으로 같은 동작을 만든다.

### 마이그레이션 — 불필요

`internal_cs_conversations.tags` GIN 인덱스는 **이미 존재한다**
([20260715_internal_cs_chat.sql](../../supabase/migrations/20260715_internal_cs_chat.sql) `internal_cs_conversations_tags_idx`).
게다가 현재 구현은 클라이언트 필터라 `tags` 조건이 SQL로 내려가지도 않는다.
새 인덱스를 만들면 중복 부채다. **마이그레이션 0건.**

## 6-1. 크롬 누수 — 위계가 무너지던 지점

`app/admin/docs/page.tsx`의 공통 크롬 138줄(제목 `문서 센터 관리` · 액션 4버튼 · KPI 4카드)이
`activeTab` 조건 **바깥**에 있었다. 그래서 콘솔에서 `미해결 큐`·`AI 품질 검수`·`추천 질문`을 눌러도
화면 상단에 문서 CRUD 크롬이 먼저 떴다. 셋 다 그 화면의 일과 무관하다.

증거: `gaps`·`quality`는 **props 없이 마운트된다** — 페이지가 페치한 `content`·`analytics`를
아예 쓰지 않는데 그 KPI가 위에 붙어 있었다.

스코프를 두 단계로 나눠 고친다.

| 스코프 | 대상 탭 | 무엇을 받나 |
|---|---|---|
| `isGuideGroupTab` | documents · categories · redirects · analytics | 크롬 전체 + 보조 탭바 + 재색인·문서 저장 알림 |
| `usesDocsPageData` | 위 + recommended | 로드 에러 · 데이터 경고 배너 |
| (없음) | gaps · quality | 자기 제목만 |

`recommended`가 배너를 받는 이유는 `content.articles`를 쓰기 때문이다 —
로드가 실패하면 그 화면의 문서 선택기가 조용히 빈다.
`gaps`·`quality`를 뺀 이유는 정보 손실이 없어서다. `gaps`는 자체 에러 배너를,
`quality`는 알파 준비도의 `Supabase 운영 연결`·`챗봇 DB 스키마` 체크를 이미 갖고 있고 그쪽이 더 정확하다.

## 6-2. 하위탭 배치와 근거

메뉴 수는 그대로 두고 화면 **안쪽**만 접는다. 가른 기준은 섹션 간 결합도다.

| 화면 | 하위탭 | 근거 |
|---|---|---|
| 미해결 큐 | `보강 큐` / `질문 패턴` | 패턴 분석은 결합이 0 — `회귀 후보` 토글이 자기 로컬 상태만 갱신하고 큐로 흐르지 않는다. 반대로 `문서 없는 질문`·`결과 없는 검색어`·`AI 초안`은 초안 슬롯 하나를 공유하는 강한 결합이라 한 탭에 묶는다 |
| 상담 Inbox | `상담 대화` / `유형·추이` / `학습 후보` | 독립적인 일이 3개(동기화·FAQ 승격·CRM 리드 등록). 스탯 4셀은 목록 파생 요약이라 탭 바깥 상시 |
| 운영 도구 | `회귀 검수` / `지표` / `연동` | 5개 일 중 회귀 검수만 일감이고 나머지는 관측·설정·내비. 일감이 첫 자리 |
| 가이드 문서 | `문서` / `카테고리` / `리디렉트` / `성과` | `검색 상위`·`조회 상위`·`피드백`이 완전히 고립된 읽기 위젯 — 어떤 액션도 문서 목록에 반영되지 않는다 |
| AI 품질 검수 | 없음 | 세로 2화면에 섹션 2개. 하위탭이 과하다 |
| 추천 질문 | 없음 | 순수 CRUD 한 덩어리 |

`?tab=gaps&source=chatbot` 딥링크는 별도 분기 없이 `보강 큐`에 착지한다 —
딥링크가 `sub`를 싣지 않으니 `useUrlState`가 기본값을 돌려주는 것뿐이다.
강제 분기를 넣으면 사용자가 손으로 만든 `&sub=patterns`와 싸운다.

### 레거시 `?tab=archive` 착지 칩

옛 `아카이브` 탭은 대기열의 `종료 · 보관` 칩으로 흡수됐다.
착지 칩을 `typeof window` 분기로 읽으면 `/admin/cs-chatbot`이 정적 프리렌더(`○`)라
SSR 경로에서 무조건 `전체`가 나온다. 라우터가 준 `tab` 값을 쓰는
순수 함수 `resolveInitialQueueFilter`로 고정하고 테스트로 못 박는다.

## 7. 중복 단일화

`AI 품질 평가`와 `챗봇 알파 준비도`가 두 곳에 사실상 동일하게 존재하며 같은 엔드포인트를 호출한다.

| 블록 | 현재 위치 A | 현재 위치 B | 공통 API |
|---|---|---|---|
| 품질 평가 | `ExternalChatbotOpsDashboard` | `DocsGapsPanel` | `POST /api/admin/chatbot/eval` |
| 알파 준비도 | `ExternalChatbotOpsDashboard` | `AlphaReadinessPanel` (docs) | `GET /api/admin/docs/alpha-readiness` |

두 블록을 `/admin/docs?tab=quality` 한 곳으로 모으고 `ExternalChatbotOpsDashboard`에서는 제거한다.
`/admin/chatbot`은 운영 지표만 남는 순수 대시보드가 된다.
기능은 전부 살아 있고 진입점만 단일화된다.

## 8. 색과 경고 바

[DESIGN.md](../../DESIGN.md)는 Classin Green `#084734`을 유일한 포화 컬러로 규정한다.
예외 토큰 선례는 확도 파랑 `#1E5DA8`과 MKT 올리브 `#7B8B36` 둘뿐이다.

프로토타입의 내부용 바이올렛 `#5A4A8F`은 **채택하지 않는다.**

- 외부 축 = Classin Green 액센트
- 내부 축 = 웜 뉴트럴 액센트 + 상단 사내 전용 경고 바

경고 바 문안은 프로토타입을 승계한다:

> 사내 전용 영역 — 예외 조항·단가·본사 담당자 정보는 고객에게 그대로 안내하지 마세요

색보다 경고 바가 축을 훨씬 강하게 알린다. 세 번째 예외 토큰을 만들지 않아도 된다.

## 9. 전체화면 오버레이 해제

`/admin/cs-chatbot`은 현재 `fixed inset-0 z-[80]`로 뷰포트 전체를 덮어 사이드바를 가린다.
어드민 전체에서 이 패턴을 쓰는 화면은 여기 하나뿐이고, 복귀 링크가 `/admin/overview`로만 나가
CS 형제 화면으로 돌아갈 수 없다.

1b의 전제가 "모드 탭으로 두 축을 오간다"인데, 내부로 갈 때만 셸이 사라졌다 나타나면 그 전환이 깨진다.
오버레이가 주던 몰입은 콘솔 내비가 대신한다.

**폭 영향** — 1440 뷰포트 기준 1616px → 1136px (사이드바 접으면 1312px).
현재 내부 화면은 실제로 3열이 아니다. 대화 목록은 헤더 드롭다운(`ConversationSwitcher`)으로 접혀 있고,
검토 패널(438px)은 열이 아니라 오버레이다. 1136px로 성립한다.

### 검토 드로어의 기준과 범위

오버레이 시절 드로어는 루트(`fixed inset-0`)에 `top-16`(자체 헤더 높이)으로 걸려 있었다.
그 헤더가 사라졌으므로 상수 대신 **탭 패널이 차지하는 영역**을 기준 요소(`relative`)로 삼고
드로어는 그 안에서 `absolute inset-y-0 right-0`을 유지한다.

드로어는 **대화 탭에만 붙인다.** 내용(확인 3종·최종 답변·검토 메모)이 "지금 열려 있는 그 대화"의
검토라, 목록(대기열·본사 확인)이나 운영 지표 위에 떠 있으면 가리키는 대상이 화면에 없다.
게다가 폭 양보(`xl:pr-[438px]`)는 대화 패널에만 걸려 있어 다른 탭에서는 본문 오른쪽을 그냥 덮었고
(대기열 표의 담당자·업데이트 칼럼이 가려졌다), `xl` 미만에서는 스크림까지 얹혀 목록을 통째로 가렸다.

`reviewOpen` · `finalDraft` · `reviewNote`는 워크스페이스 상태라 탭을 다녀와도 그대로 복원된다 —
입력 유실이 없다는 것이 이 범위 제한의 전제다.

## 10. 단계

### P0 · 기반

- `components/admin/nav-active.ts` 추출 — `splitNavHref` / `queryMatches` / `isNavActive`
- `AdminSidebar`가 추출본을 쓰도록 전환 (동작 변화 없음)
- `components/admin/cs/CsConsoleNav.tsx` 신설 — 메뉴 SSOT + 권한 필터
- 사이드바 CS 섹션 5 → 3항목
- `NAV_WARMUP_REQUESTS` 키 정리 (`/admin/cs-chatbot` 추가)
- `tests/admin/sidebar-docs-gaps.test.ts` · `tests/admin/command-palette.test.ts` 갱신

### P1 · 외부 축

- 4개 페이지에 `CsConsoleNav` 부착
- `DOCS_TABS`에 `quality` 추가
- 품질 평가·알파 준비도를 `tab=quality`로 이관
- `ExternalChatbotOpsDashboard`에서 중복 2블록 제거
- docs의 `AdminTabs`를 `가이드 문서` 그룹 내부 3탭(문서·카테고리·리디렉트)으로 축소

### P2 · 내부 축

- 4탭을 `useState` → `useUrlState("tab")`
  (새로고침 시 항상 `대화`로 튕기는 현행 버그 동반 수정)
- `아카이브`를 `대기열`의 상태 칩으로 흡수
- `fixed inset-0` 오버레이 해제
- 콘솔 내비 부착

### P3 · 본사 확인

- `tab=hq` 화면
- `본사 확인 요청` 액션 + 태그 전이
- 대기열·내부 상담에서 딥링크
- 마이그레이션 없음 (GIN 인덱스 기존재)

## 11. 선행 계약 처리

[CS 탭 외부/내부 이원화 계획](../archive/cs-tab-split-plan-2026-07-17.md)이 현행 nav 구조의 역사적 근거이며 계약 1~4를 명문화한다.

| 계약 | 처리 |
|---|---|
| 계약 1 — 보강 큐 `source` 딥링크는 인바운드 전용, 칩 클릭은 URL에 역기록하지 않음 | **승계** |
| 나머지 계약 | 이번 재구성으로 대체되는 항목은 새 문서(본 문서)를 정본으로 한다 |

`/admin/docs?tab=gaps&source=chatbot|internal_cs|all` 딥링크와
`tests/admin/docs-gaps-source-preset.test.ts`는 그대로 유지한다.

## 12. 검증

```bash
npm run typecheck
npx eslint app components lib --max-warnings=0
npm run build
```

추가로 nav 관련 테스트가 통과해야 한다.

```bash
npx vitest run tests/admin/sidebar-docs-gaps.test.ts tests/admin/command-palette.test.ts tests/admin/docs-gaps-source-preset.test.ts
```

## 13. 범위 밖

- 본사 티켓 엔티티(요청·회신·SLA·담당자 이력 추적) — 운영 규칙 결정이 선행되어야 한다
- 채널톡 실시간 응대(답장 전송) — 현재는 동기화된 기록 열람이다
- 모바일 하단 탭바에 CS 항목 추가
- 본문 폭 정책 통일(§1) — 1480 이상에서 화면 간 메뉴 시작 x가 달라지는 것을 없애려면
  docs·channel-talk 본문 폭부터 바꿔야 한다. 콘솔 IA가 아니라 각 화면의 결정이다.
- ~~`InternalCsChatWorkspace.tsx`(3,075줄) 파일 분할~~ — 후속으로 완료(3,515 → 1,426줄,
  콘솔 화면 경계 기준으로 `panels/` · `components/` 분할)

## 14. 어드민 탭 재구성과의 정합

[어드민 탭 재구성 스펙](admin-tab-restructure-2026-07-29.md)이 사이드바를 프리셋 기반
`(role, preset, overrides) → placement` 모델로 바꾼다. 그 §5.2가 `CS 콘솔`(`/admin/chatbot`)을
최고 관리자 전용(super 외 기본 차단)으로, `가이드 문서`(`/admin/docs`)를 `OPEN`(전 프리셋 접근) +
`staff` 프리셋 상시로 분류한다. 사이드바 프리셋과 콘솔 내부 메뉴 필터는 현재 완전히 같은 축이
아니므로 아래 경계를 명시한다.

### 14.1 현재 맞춰진 것

| # | 무엇 | 어디 |
|---|---|---|
| A | 가시성 판정을 함수 하나로 모음 — 렌더가 `item.roles`를 직접 읽지 않는다 | [`isCsConsoleItemVisible`](../../components/admin/cs/CsConsoleNav.tsx) |
| B | ⌘K 자식 커맨드 2개(`상담 Inbox`·`미해결 큐`)의 숙주를 `/admin/chatbot` → `/admin/docs`로 이관 | [`PALETTE_CHILD_COMMANDS`](../../components/admin/AdminCommandPalette.tsx) |

**B의 근거.** 자식 커맨드는 부모 nav 항목에서 파생된다. `상담 Inbox`와 `미해결 큐`는
모든 프리셋에 열린 `/admin/docs`를 숙주로 사용해 CS 운영 대시보드의 가시성에 종속되지 않는다.
두 항목의 `section`이 같아(`cs`) 그룹 라벨(`고객 지원`)도 유지된다.

### 14.2 콘솔 메뉴 가시성의 현재 경계

콘솔의 `대시보드`는 `/admin/chatbot`을 가리키며 `STAFF_EDITOR + BRANCH` 역할 필터를 사용한다.
반면 사이드바와 `app/admin/layout.tsx`의 업무 표면 가드는 `nav_preset`·`nav_overrides`를 적용한다.
따라서 비-super 사용자에게 콘솔 메뉴가 보이더라도 직접 진입 시 업무 표면 가드에서 막힐 수 있다.
이는 현재 알려진 UX 정합성 갭이다.

역할 배열을 `["SUPER_ADMIN"]`으로 고정하는 것은 해법이 아니다. 사람별 오버라이드로
`/admin/chatbot`을 연 사용자를 다시 막기 때문이다. 통합할 때는 `isCsConsoleItemVisible`이
역할·프리셋·오버라이드를 함께 받아 `resolveNavPlacement` 결과를 사용해야 한다.

이 가시성은 보안 경계가 아니다. 실제 데이터·동작 권한은 각 API의 관리자 가드와 필요한
`capabilities` 검사에서 강제한다.

### 14.3 정합성 갭을 닫을 지점

[`isCsConsoleItemVisible`](../../components/admin/cs/CsConsoleNav.tsx)은 현재 role만 받는다.
이 함수와 `CsConsoleNavProps`에 `preset`·`overrides`를 전달하고, href의 쿼리를 제거한 뒤
`resolveNavPlacement`를 호출하는 것이 정합성 갭을 닫는 변경 지점이다.

```ts
import { resolveNavPlacement } from "../admin-nav-access"

// href의 쿼리를 떼야 한다 — placement 키는 nav href(`/admin/docs`)이고
// 콘솔 href는 탭 딥링크(`/admin/docs?tab=gaps`)라 문자열이 다르다.
resolveNavPlacement(item.href.split("?")[0], { role, preset, overrides }) !== "deny"
```

현재 `role`은 prop이 없으면 `sessionStorage("admin_role")`에서 읽는다. `admin_nav_preset`과
`admin_nav_overrides`도 같은 세션 소스에 있으므로, 서버 페이지별 prop 배선을 늘리지 않고 같은 방식으로
읽을 수 있다. 이 변경 전까지는 §14.2의 UX 갭을 현재 동작으로 간주한다.

### 14.4 외부 축 도달성

`대시보드`가 비-super에게서 빠져도 콘솔의 나머지 외부 축은 도달 가능하다.

- `CsConsoleNav`는 4개 화면이 직접 불러 쓴다(§4) — `/admin/chatbot`, `/admin/channel-talk`,
  [`/admin/docs`](../../app/admin/docs/page.tsx), `/admin/cs-chatbot`.
- `/admin/docs`는 `OPEN` + `staff` 프리셋 상시라 **모든 프리셋에서 상시 노출**이고,
  그 화면이 콘솔 내비를 렌더하므로 거기서 형제 메뉴 전부로 이동할 수 있다.
- `app/admin/layout.tsx`의 업무 표면 가드는 `ADMIN_NAV` href 중 최장 일치를 골라 `deny`면 막는다.
  `/admin/docs`는 `OPEN`이라 걸리지 않는다. `/admin/channel-talk`은 §2 재구성으로
  `ADMIN_NAV`에서 빠져 있어 일치 대상이 없고, 따라서 가드가 `false`로 통과시킨다.
- `/admin/cs-chatbot`(내부 축 전체)은 `OPEN`이고 `cs` 프리셋의 상시다.

비-super에게 `/admin/chatbot`이 차단되더라도 그 화면에 남은 것은
운영 지표 6카드뿐이고, 품질 평가·알파 준비도는 이미 `?tab=quality`로 옮겨져 `OPEN` 쪽에 있다.
기능 손실이 아니라 지표 대시보드 1개의 접근 축소다.
