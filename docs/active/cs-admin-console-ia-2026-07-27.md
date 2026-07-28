# CS 어드민 콘솔 IA 재구성

프로토타입 `AI CS 관리 시스템`(레이아웃 2안 중 1b 채택)을 기준으로 CS 어드민의 정보 구조를 재배치한다.
기능은 전량 보존하고, 중복 UI만 단일화하며, 신규 화면은 `본사 확인` 하나로 제한한다.

## 1. 결정 요약

| 항목 | 결정 |
|---|---|
| 레이아웃 | 1b — 모드 탭(외부/내부) + 그 아래 가로 서브메뉴 |
| 메뉴 수 | 외부 6 · 내부 4 |
| 축 구분 | 외부 = Classin Green, 내부 = 웜 뉴트럴 + 사내 전용 경고 바 (바이올렛 예외 토큰 도입하지 않음) |
| 아이콘 | 기존 nav 아이콘 승계, 신규는 `본사 확인` 하나 |
| 셸 | 라우트 그룹 아님 — 공용 컴포넌트 `CsConsoleNav` |
| URL 키 | `tab` (저장소 표준 키) |
| 신규 테이블 | 0 |
| 신규 API 라우트 | 0 |
| 전체화면 오버레이 | `/admin/cs-chatbot`의 `fixed inset-0` 해제 |

## 2. 메뉴 구조

### 외부용 · Customer (6)

| 메뉴 | URL | 아이콘 | 실체 |
|---|---|---|---|
| 대시보드 | `/admin/chatbot` | Bot | 운영 지표 6카드 (품질 평가·알파 준비도는 이관됨) |
| 상담 Inbox | `/admin/channel-talk` | MessageSquare | 채널톡 상담 목록·유형 분포·응답 추이·FAQ 후보 |
| 미해결 큐 | `/admin/docs?tab=gaps` | Search | 보강 큐 — 문서 없는 질문 + 결과 없는 검색어 |
| AI 품질 검수 | `/admin/docs?tab=quality` | (신설) | 품질 평가 + 알파 준비도 — 중복 2벌 통합 |
| 가이드 문서 | `/admin/docs?tab=documents` | BookOpen | 문서 CRUD (+ 화면 내부 보조 탭: 카테고리·리디렉트) |
| 추천 질문 | `/admin/docs?tab=recommended` | MessageSquareText | 추천 질문 발행·관리 |

### 내부용 · Internal (4)

| 메뉴 | URL | 아이콘 | 실체 |
|---|---|---|---|
| 내부 상담 | `/admin/cs-chatbot?tab=chat` | Headset | AI 초안 스레드 + 검토 드로어 |
| 대기열 | `/admin/cs-chatbot?tab=queue` | Inbox | 대기·진행·종료 대화 (아카이브 흡수, 상태 칩으로 분리) |
| 본사 확인 | `/admin/cs-chatbot?tab=hq` | Building | **신규** — 본사 회신 대기 건 |
| 운영 도구 | `/admin/cs-chatbot?tab=tools` | Wrench | 회귀 검수·운영 지표·AI 브리지·바로가기 |

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

10개 메뉴가 실제로는 **3개 라우트**에 얹힌다.

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

## 5. URL 규약

### 모드는 URL에 넣지 않는다

현재 라우트로 결정된다 — `/admin/cs-chatbot`이면 내부, 나머지면 외부.
별도 `mode` 파라미터는 desync 위험만 늘린다.
모드 탭 클릭은 그 축의 첫 화면(`외부`→대시보드, `내부`→내부 상담)으로 이동한다.

### 키는 `tab`으로 통일

저장소에서 이미 8개 화면이 쓰는 표준 키다.
`view`·`lens`는 각각 다른 의미로 쓰이고 있어 재사용하지 않는다.

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

[CS 탭 외부/내부 이원화 계획](cs-tab-split-plan-2026-07-17.md)이 현행 nav 구조의 근거 문서이며 계약 1~4를 명문화한다.

| 계약 | 처리 |
|---|---|
| 계약 1 — 보강 큐 `source` 딥링크는 인바운드 전용, 칩 클릭은 URL에 역기록하지 않음 | **승계** |
| 나머지 계약 | 이번 재구성으로 대체되는 항목은 새 문서(본 문서)를 정본으로 한다 |

`/admin/docs?tab=gaps&source=chatbot|internal_cs|all` 딥링크와
`tests/admin/docs-gaps-source-preset.test.ts`는 그대로 유지한다.

## 12. 검증

```bash
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
- `InternalCsChatWorkspace.tsx`(3,075줄) 파일 분할
