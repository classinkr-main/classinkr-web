# 캠페인 행사 탭 — 갤러리 뷰 + 상세 모달 설계

- 상태: **Draft — 구현 미착수** (브레인스토밍 산출물, 코드 변경 없음)
- 대상 화면: `/admin/campaigns?tab=events` ("행사별 퍼널 상세" 섹션)
- 작성 배경: 지금은 행사 하나당 세로로 긴 풀디테일 카드(`EventFunnelCard`)가 쌓여 있어 한 화면에 1~2건만 보임. 갤러리 형태로 컴팩트하게 훑어보고, 클릭 시 상세 + 홈페이지 행사 링크 + 관련 글 링크를 함께 보고 싶다는 요청에서 출발.
- 관련 파트: 마케팅/그로스/CRM (`growth-crm`)

## 1. 현재 상태 요약

- `app/admin/campaigns/page.tsx`의 `events` 탭은 `sortedEvents.map(...)` → `EventFunnelCard` 풀디테일 카드를 `space-y-3`로 세로 나열.
- 각 카드는 헤더(상태·카테고리·태그·제목·기간·위치) + 상세 정보 블록(설명 미리보기·CTA·공개상태·리드집계·성사고객·고객메모·성과업데이트·내부메모/회고/공유포인트) + 경제지표 4칸 + 목표 진행률 + 퍼널 6단계 + 서브지표 3칸 + 귀속 힌트까지 한 카드에 전부 노출.
- 정렬(날짜/리드/딜/ROI), 기간 필터(활성/30일/90일/전체), CSV 내보내기는 이미 존재. 텍스트 검색·상태/카테고리 필터는 없음.
- `PublicEvent`에는 `imageUrl`(Storage 공개 URL)이 이미 있고 현재 등록된 행사 3건 모두 이미지 보유(읽기전용 프로브로 확인, 2026-07-20).
- `EventMetrics`는 Supabase가 아니라 `data/event-metrics.json` 파일 저장소(`lib/repositories/event-metrics.ts`) — 마이그레이션 없이 필드 추가 가능.
- "관련 글" 관계는 현재 어떤 테이블에도 없음 — 이번에 새로 설계.

## 2. 결정 사항

### 2.1 뷰 전환 — 리스트 유지 + 갤러리 토글 추가
- 기본값은 지금의 리스트 뷰(변경 없음). 상단에 `리스트 | 갤러리` 세그먼트 버튼을 추가해 갤러리는 옵션으로 전환.
- 선택 상태는 URL 쿼리 `?view=gallery`로 유지(`?tab=events`와 동일하게 `useUrlState` 재사용) — 새로고침·링크 공유 시에도 유지.
- 리스트 뷰의 기존 카드 밀도·정보량은 그대로 둔다(사용자 지시: "지금 것 유지").

### 2.2 갤러리 카드 — 미니멀 커버 (브라우저 시안 A안 선택)
- 카드 앞면: 커버 이미지(`imageUrl`) + 상태 배지 + 제목 + 날짜/카테고리만. 지표(리드·ROI 등)는 카드 앞면에 노출하지 않고 클릭해야 보임 — 가장 컴팩트한 안.
- 이미지가 없는 행사(`imageUrl: null`) 대비: 카테고리별 톤의 그라디언트 플레이스홀더 커버 필요(지금 3건은 전부 이미지 보유하지만 스키마상 null 허용).
- 그리드: `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4` (기존 KPI 타일 그리드 반응형 패턴과 동일한 브레이크포인트 체계 사용).

### 2.3 검색 + 필터 — 리스트/갤러리 공용 툴바
- 텍스트 검색(제목 대상), 상태 필터(전체/진행 중/예정/마감), 카테고리 필터(전체/`EVENT_CATEGORIES` 5종) — 기존 정렬·기간 버튼이 있는 툴바 행에 추가.
- 전부 클라이언트 사이드 즉시 필터(행사 수가 적어 서버 왕복 불필요). 상태/카테고리는 세그먼트 pill(기존 정렬 컨트롤과 동일한 스타일)로 단일 선택.
- 필터링은 이미 정렬된 `sortedEvents` 위에 적용: `visibleEvents = sortedEvents.filter(matchesSearch && matchesStatus && matchesCategory)`. 리스트 뷰·갤러리 뷰 모두 이 배열을 사용.
- 필터로 인해 결과가 0건일 때: "필터에 맞는 행사가 없습니다" + 필터 초기화 버튼(기존 빈 상태 스타일 재사용, 문구만 분기).

### 2.4 상세 모달 — 중앙 오버레이 (브라우저 시안 A안 선택)
- 갤러리 카드를 클릭하면 중앙 모달이 열림. 셸은 지금의 "성과 입력" 드로어(`MetricsEditor`)와 동일한 패턴(모바일 바텀시트 / 데스크톱 중앙 모달, backdrop 클릭 또는 X로 닫기).
- 모달 구성:
  1. 헤더 — 상태 배지·카테고리·태그·제목·기간·위치 (지금 카드 헤더와 동일)
  2. 상세 내역 — 지금 리스트 카드가 보여주는 모든 것(설명·CTA·dl 블록·메모/회고/공유포인트·경제지표 4칸·목표 진행률·퍼널 6단계·서브지표 3칸·귀속 힌트)
  3. **홈페이지 행사 링크** — 기존 `publicHref`(`/events/[slug]`)를 모달 상단에 더 눈에 띄는 버튼("홈페이지에서 보기 ↗")으로 승격. 리스트 카드에서도 이미 노출 중이므로 로직 재사용.
  4. **연관 글 링크** (신규, §2.5) — 라벨+URL 리스트를 링크 칩/리스트로 표시. 비어 있으면 섹션 자체를 숨김.
  5. 푸터 — "성과 입력" 버튼(클릭 시 상세 모달을 닫고 기존 `MetricsEditor` 오픈 — 지금의 `onEdit` 흐름 그대로 이어감, 모달 중첩 없음).
- 리스트 뷰는 클릭-확장 개념이 없으므로 이 모달은 갤러리 전용 진입점. 단, 아래 2.5처럼 연관 글 데이터 자체는 리스트 카드에도 최소 노출.

### 2.5 연관 글 데이터 모델 — 행사 성과 편집 화면에서 수동 입력
- `EventMetrics`(`lib/types/event-metrics.ts`)에 필드 추가:
  ```ts
  export interface RelatedLink {
    label: string
    url: string
  }
  // EventMetrics에 추가
  relatedLinks: RelatedLink[]
  ```
  `DEFAULT_EVENT_METRICS.relatedLinks = []`. Supabase 마이그레이션 불필요(JSON 파일 저장소).
- 입력 UI: `MetricsEditor`(현재 "성과 입력" 드로어)에 새 섹션 "관련 자료" 추가, 기존 `adSpendEntries` 추가/삭제 UI 패턴을 그대로 재사용(라벨 input + URL input + 삭제 버튼 + "링크 추가" 버튼).
- API 반영: `app/api/admin/event-metrics/[id]/route.ts`의 PATCH 핸들러는 필드를 명시적으로 화이트리스트 처리하는 구조이므로, `sanitizeAdSpend`와 동일한 패턴으로 `sanitizeRelatedLinks` 추가 필요
  - 각 항목: `label` 비어있지 않은 문자열(trim), `url`은 `http://` 또는 `https://`로 시작하는 절대 URL만 허용(그 외 항목은 드롭)
  - 최대 개수 제한(예: 10개) — 방어적 기본값, 강제 요구사항은 아님
- **리스트 뷰 반영**(확정): 기존 카드의 dl 블록(고객/성과 업데이트 줄과 같은 자리)에 "관련 자료 N개" 한 줄 추가 노출(항목이 있을 때만 조건부 렌더링, 지금 `dealCustomersPreview` 처리 방식과 동일).

## 3. 컴포넌트 아키텍처

`EventFunnelCard`(현재 파일)를 아래처럼 쪼갠다 — 리스트 카드와 상세 모달이 같은 상세 콘텐츠를 재사용하도록 해서 두 뷰가 항상 같은 정보를 보여주고 중복 코드가 생기지 않게 한다.

- `EventCardHeader` — 상태 배지·카테고리·태그·제목·기간·위치. 리스트 카드 헤더 / 갤러리 상세 모달 헤더 공용.
- `EventDetailContent` — 설명·CTA·dl 블록·메모류·경제지표·목표진행률·퍼널·서브지표·귀속힌트·홈페이지 링크·연관 글. 리스트 카드 본문 / 상세 모달 본문 공용.
- `EventFunnelCard` (기존, 내부만 리팩터) — `EventCardHeader` + `EventDetailContent`를 그대로 이어붙여 지금과 동일한 시각적 결과물 유지. "성과 입력" 버튼 자리도 그대로.
- `EventGalleryCard` (신규) — 커버 이미지 + 상태 배지 + 제목 + 날짜/카테고리만. `onClick`으로 상세 모달 오픈.
- `EventDetailModal` (신규) — `EventCardHeader` + `EventDetailContent`를 모달 셸(`MetricsEditor`와 동일한 오버레이 패턴)로 감싸고, 하단에 "성과 입력" 버튼.
- 신규 컴포넌트는 `components/admin/campaigns/`에 위치(공용 컴포넌트 배치 규칙 준수).

## 4. 상태 관리 (page.tsx)

```ts
// useUrlState는 string 전용 훅(제네릭 아님, lib/use-url-state.ts) — 값을 좁혀서 사용
const [viewParam, setViewParam] = useUrlState("view", "list")
const view: "list" | "gallery" = viewParam === "gallery" ? "gallery" : "list"
const [search, setSearch] = useState("")
const [statusFilter, setStatusFilter] = useState<EventStatus | "all">("all")
const [categoryFilter, setCategoryFilter] = useState<EventCategory | "all">("all")
const [viewingEvent, setViewingEvent] = useState<PublicEvent | null>(null) // 상세 모달, 기존 editing(MetricsEditor)과 별도 상태
```

- `viewingEvent`와 기존 `editing`은 동시에 하나만 열림 — "성과 입력" 클릭 시 `setViewingEvent(null); setEditing(event)` 순서로 핸드오프.
- `visibleEvents`는 `sortedEvents`에 검색/상태/카테고리 필터를 적용한 파생값(`useMemo`).

## 5. 엣지 케이스 / 반응형

- 이미지 없는 행사: 카테고리 톤 그라디언트 플레이스홀더 커버.
- 제목 과길이: 기존과 동일하게 ellipsis 처리.
- 모바일: 그리드 1~2열로 축소, 툴바는 기존 `flex-wrap` 패턴으로 자연스럽게 줄바꿈, 모달은 `MetricsEditor`처럼 바텀시트로 전환.
- 필터 결과 0건과 "행사 자체가 0건"은 문구를 분기(전자는 필터 초기화 유도, 후자는 지금 문구 유지).

## 6. 범위 밖 (이번 설계에서 다루지 않음)

- 태그/키워드 기반 관련 글 자동 매칭(향후 검토 — 추가 인프라 필요, 오탐 가능성 있어 이번엔 수동 입력으로 결정).
- 갤러리 카드 순서의 드래그 정렬 등 별도 요청 없었던 기능.
- `public_events` 테이블 자체의 스키마 변경(관련 글은 `event-metrics.json` 쪽에 추가하므로 Supabase 마이그레이션 불필요).

## 7. 결정 경위 메모

- 카드 밀도(§2.2)와 상세 인터랙션(§2.4)은 브라우저 목업 3종 중 각각 A안을 선택해 확정.
- 열려있는 질문 없음 — 구현 착수 시점은 별도 지시 대기(이번 요청은 설계만, 적용 보류).
