# Public Events 기능 설계

**날짜:** 2026-04-20  
**브랜치:** hook_v1  
**범위:** /events 탭 더미 제거 + admin 행사 등록/수정 + admin calendar 연동

---

## 1. 데이터 계층

### Supabase 테이블 `public_events`

```sql
CREATE TABLE public_events (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title            TEXT NOT NULL,
  description      TEXT,
  category         TEXT NOT NULL CHECK (category IN ('웨비나','오프라인 행사','프로모션','얼리버드','파트너십')),
  tag              TEXT,
  starts_at        TIMESTAMPTZ NOT NULL,
  ends_at          TIMESTAMPTZ,
  location         TEXT,
  cta_label        TEXT NOT NULL DEFAULT '자세히 보기',
  cta_href         TEXT,
  image_path       TEXT,
  highlight        BOOLEAN NOT NULL DEFAULT FALSE,
  status_override  TEXT CHECK (status_override IN ('진행 중','예정','마감')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

- `status_override NULL` → 날짜 기준 자동 계산
- `status_override` 설정 시 자동계산 무시
- `image_path`: Supabase Storage `event-images` 버킷 경로 (`{id}/{filename}`)

### Supabase Storage 버킷
- 버킷명: `event-images` (public read)
- Public URL: `{SUPABASE_URL}/storage/v1/object/public/event-images/{image_path}`

### Repository (`lib/repositories/public-events.ts`)
- `listPublicEvents()` — 공개 페이지용, status 계산 포함
- `getAllEventsForAdmin()` — admin 전체 컬럼
- `createEvent(data)` → UUID 반환
- `updateEvent(id, patch)`
- `deleteEvent(id)`
- `uploadEventImage(file, eventId)` → Storage 경로 반환

---

## 2. Status 계산 로직

```ts
// lib/repositories/public-events.ts (또는 shared util)
function computeStatus(event: PublicEventRow): "진행 중" | "예정" | "마감" {
  if (event.status_override) return event.status_override as EventStatus
  const now = new Date()
  if (now < new Date(event.starts_at)) return "예정"
  if (!event.ends_at || now <= new Date(event.ends_at)) return "진행 중"
  return "마감"
}
```

---

## 3. API Routes

### 공개
| Route | Method | 설명 |
|---|---|---|
| `/api/events` | GET | 공개 이벤트 목록 (status 포함) |

### Admin (`verifyAdmin()` 필수)
| Route | Method | 설명 |
|---|---|---|
| `/api/admin/events` | GET | 전체 목록 |
| `/api/admin/events` | POST | 생성 |
| `/api/admin/events/[id]` | PATCH | 수정 |
| `/api/admin/events/[id]` | DELETE | 삭제 |
| `/api/admin/events/upload` | POST | 이미지 업로드 → path 반환 |

---

## 4. Admin UI (`/admin/events`)

### 페이지 구조
- 테이블: 제목, 카테고리, 기간, status 뱃지, highlight, 수정/삭제 액션
- "행사 추가" 버튼 → 모달

### 모달 필드
| 필드 | 타입 |
|---|---|
| 제목 | text |
| 카테고리 | select (5개 고정) |
| 태그 | text |
| 시작일시 / 종료일시 | datetime-local |
| 장소 | text |
| CTA 텍스트 / URL | text |
| 포스터 이미지 | 파일 업로드 + 미리보기 |
| Highlight | toggle |
| 상태 override | select (자동 / 진행 중 / 예정 / 마감) |

### 사이드바
기존 admin 사이드바에 "행사 관리" 항목 추가 (`/admin/events`)

---

## 5. Admin Calendar 연동

- `loadAdminCalendar()` 또는 `GET /api/admin/calendar` 에서 `public_events` 데이터를 병합
- `public_events` → `CalendarEvent` 매핑:
  - `type: "launch"`
  - `source: "event"` (새 source 타입)
  - `readonly: true`
  - `title`, `starts_at → date`, `ends_at → endDate`
- 캘린더에서 행사 클릭 시 `/admin/events` 로 이동 (수정은 events 페이지에서)

---

## 6. 공개 `/events` 페이지 리팩터

### 파일 구조 변경
```
app/events/
  page.tsx          ← Server Component (data fetch)
  EventsClient.tsx  ← "use client" (필터/검색/렌더링)
```

### 변경 사항
- `"use client"` 제거 → Server Component
- 하드코딩 events 배열 전체 삭제
- `/api/events` fetch (cache: 'no-store')
- 필터/검색 로직은 `EventsClient.tsx`로 분리
- 이미지: `image_path` → Supabase Storage URL, 없으면 `/images/event-placeholder.png` fallback

---

## 7. 마이그레이션 파일

`supabase/migrations/20260420_public_events.sql`  
- `public_events` 테이블 생성
- RLS: anon은 SELECT만, authenticated admin은 ALL
- `updated_at` 자동 갱신 트리거

---

## 구현 순서

1. Supabase 마이그레이션 + Storage 버킷 설정
2. `lib/repositories/public-events.ts` 작성
3. API routes (공개 + admin)
4. Admin `/admin/events` 페이지 + 모달
5. Admin 사이드바에 메뉴 추가
6. Admin calendar 연동
7. 공개 `/events` 페이지 리팩터 (dummy 제거)
8. ESLint + build 통과 확인
