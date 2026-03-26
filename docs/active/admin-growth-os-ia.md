# Admin Growth OS IA

기준 시점: 2026-03-20  
문서 목적: `Classin Home`의 관리자 페이지를 단순 CMS가 아니라 "콘텐츠 + 리드 + 캠페인 + 사이트 전환"을 통합 운영하는 `Growth OS`로 설계한다.  
적용 범위: 정보구조, 화면 구조, 운영 흐름, MVP 우선순위

## 1. 한 줄 정의

관리자 페이지는 "블로그 글 쓰는 곳"이 아니라,  
`사이트 운영 + 콘텐츠 운영 + 리드 관리 + 캠페인 성과 확인`을 한 흐름으로 묶는 운영 본부여야 한다.

## 2. 제품 관점 정의

### Public Web

- 브랜드 메시지 전달
- 제품 소개
- CTA 클릭 유도
- 문의/데모 신청 전환
- 블로그/이벤트 노출

### Admin App

- 관리자 인증과 권한 기반 접근
- 콘텐츠 작성/검수/발행
- 리드 상태 추적과 후속 액션
- CTA/배너/폼/노출 규칙 제어
- 캠페인 단위 성과 관찰
- 운영 이슈 탐지

즉, 공개 홈페이지와 관리자 앱은 구조적으로 분리하되,  
관리자 계정의 진입은 홈페이지 하단 또는 별도 `/admin/login` 링크를 통해 들어가게 설계하는 것이 적절하다.

## 3. 상위 1% 구조자의 관점에서 본 핵심 원칙

1. 관리자 앱은 페이지 편집기가 아니라 운영 시스템이어야 한다.
2. 화면 구조는 "기능"보다 "운영 흐름" 중심으로 나눠야 한다.
3. 리드와 콘텐츠는 분리하지 말고 캠페인 단위로 연결해야 한다.
4. 블로그, 이벤트, 배너, CTA는 결국 하나의 전환 퍼널 안에 있어야 한다.
5. 팀원이 보는 첫 화면은 "설정"이 아니라 "지금 무슨 일이 벌어지고 있는가"여야 한다.

## 4. 추천 제품 구조

```text
Public Website
  /
  /product/*
  /pricing
  /blog
  /blog/[slug]
  /events
  /contact

Admin App
  /admin/login
  /admin
  /admin/leads
  /admin/content
  /admin/posts
  /admin/events
  /admin/media
  /admin/campaigns
  /admin/site
  /admin/reports
  /admin/settings
  /admin/team
  /admin/audit-logs
```

## 5. 사이드바 IA 추천

### 1차 메뉴

1. Dashboard
2. Leads
3. Content
4. Campaigns
5. Site Control
6. Reports
7. Settings
8. Team

### 2차 메뉴

#### Dashboard

- Overview
- Alerts
- Weekly Summary

#### Leads

- All Leads
- Pipeline
- Inbox
- Follow-ups

#### Content

- Posts
- Events
- Media Library
- Draft Queue

#### Campaigns

- All Campaigns
- Active Campaigns
- Archived Campaigns

#### Site Control

- Home
- CTA
- Forms
- Banner / Notice
- Navigation / Footer

#### Reports

- Funnel
- Traffic
- CTA Performance
- Content Performance
- Campaign Performance

#### Settings

- Integrations
- Analytics
- Notifications
- Security
- System

#### Team

- Admin Users
- Roles & Permissions
- Audit Logs

## 6. 각 화면을 무엇 중심으로 써야 하나

### A. Dashboard

가장 중요한 화면이다.  
현대 마케팅 운영에서 대시보드는 "상태판" 역할을 해야 한다.

보여줘야 하는 것:

- 오늘 리드 수
- 이번 주 리드 수
- 신규 리드 중 미처리 수
- CTA 클릭 수와 전환율
- 가장 성과 좋은 페이지
- 가장 성과 좋은 캠페인
- 최근 발행 콘텐츠
- 웹훅 실패/폼 오류/추적 누락 알림

권장 구성:

```text
Top Row
  KPI Cards
  - New Leads Today
  - Unhandled Leads
  - CTA Conversion Rate
  - Top Campaign

Middle Row
  Left: Lead Pipeline Snapshot
  Center: Funnel Chart
  Right: Alerts / System Health

Bottom Row
  Left: Recent Content Activity
  Right: Upcoming Campaigns / Event Schedule
```

핵심 철학:

- 첫 화면은 "관리"보다 "상황 인지"가 먼저
- 운영자는 대시보드에서 오늘 해야 할 일을 바로 알아야 한다

### B. Leads

이 페이지는 "문의 목록"이 아니라 `운영형 CRM-lite`로 가는 게 맞다.

권장 상태:

- `new`
- `contacted`
- `qualified`
- `meeting-booked`
- `proposal-sent`
- `won`
- `lost`
- `spam`

권장 뷰:

1. 기본은 테이블
2. 보조로 칸반 보드

테이블 컬럼:

- 이름
- 기관/회사
- 연락처
- 유입 경로
- 소스 페이지
- CTA
- 캠페인
- 상태
- 담당자
- 최근 액션
- 생성일

상세 패널:

- 리드 기본 정보
- 제출 원문
- 메모
- 태그
- 액션 히스토리
- 후속 일정
- 상태 변경 로그

중요한 포인트:

- 리드는 반드시 `유입 -> 검토 -> 후속 -> 결과` 흐름이 보여야 한다
- 단순 저장만 하면 운영 가치가 반 이하로 떨어진다

### C. Content

Content는 글쓰기 도구가 아니라 "발행 파이프라인"이 돼야 한다.

#### Posts

상태:

- `draft`
- `in_review`
- `scheduled`
- `published`
- `archived`

목록 화면 필수 요소:

- 제목
- 카테고리
- 작성자
- 상태
- 발행 예정일
- 연결 캠페인
- 썸네일
- 최근 수정일

에디터 화면 필수 패널:

- 본문 편집
- SEO
- 썸네일
- 태그/카테고리
- 연결 캠페인
- CTA 블록
- 미리보기
- 검수 요청

#### Events

이벤트는 블로그와 달리 "기간/장소/상태/자산" 관리가 핵심이다.

목록 컬럼:

- 이벤트명
- 상태
- 기간
- 장소
- 대표 포스터
- 연결 CTA
- 연결 캠페인

상세 관리 항목:

- 설명
- 포스터 이미지
- 갤러리
- 신청 링크
- 운영 상태
- 노출 여부

#### Media Library

현대 운영에서 미디어 라이브러리는 필수다.

필수 기능:

- 업로드
- 폴더/컬렉션
- 검색
- 태그
- alt 텍스트
- 사용 위치 추적
- 미사용 자산 표시

폴더 예시:

- `blog/`
- `events/posters/`
- `events/gallery/`
- `campaigns/`
- `brand/`
- `site/shared/`

### D. Campaigns

이 페이지가 있으면 관리자 앱의 수준이 확 올라간다.

캠페인은 "SNS 게시물" 자체를 발행하는 툴이 아니라,  
`콘텐츠 + 랜딩 + CTA + 리드 + 성과`를 한 단위로 묶는 운영 객체다.

캠페인 필드:

- 이름
- 목적
- 시작일 / 종료일
- 소유자
- 상태
- 설명
- UTM 규칙
- 연결 콘텐츠
- 연결 랜딩 페이지
- 연결 CTA
- 연결 이벤트

상세 화면:

```text
Header
  Campaign Name / Status / Owner / Date Range

Sections
  1. Overview
  2. Linked Assets
     - posts
     - events
     - media
     - landing pages
  3. CTA Performance
  4. Lead Performance
  5. Notes / Decisions
```

핵심:

- 캠페인별로 성과를 묶지 않으면 콘텐츠와 리드가 따로 놀게 된다

### E. Site Control

이 영역은 홈페이지 제어판이다.

하위 구조:

- Home
- CTA
- Forms
- Banner / Notice
- Navigation / Footer

#### Home

- 섹션 노출 on/off
- 섹션 순서
- 추천 콘텐츠 슬롯
- 메인 메시지 교체

#### CTA

- 페이지별 CTA 문구
- CTA 타입
  - 모달
  - 내부 링크
  - 외부 링크
  - 파일 다운로드
- 이벤트명
- 연결 캠페인

#### Forms

- 폼 유형
- 필수 필드
- 완료 메시지
- 실패 메시지
- 개인정보 동의 문구

#### Banner / Notice

- 공지 배너 on/off
- 문구
- 링크
- 노출 기간

### F. Reports

대시보드가 오늘의 상태판이라면,  
Reports는 팀의 학습 도구다.

최소 보고서:

1. Funnel Report
   - 방문
   - CTA 클릭
   - 폼 시작
   - 제출
   - 유효 리드

2. Traffic Report
   - 소스/매체
   - 페이지별 방문
   - 캠페인별 방문

3. CTA Report
   - CTA별 클릭률
   - 페이지별 CTA 비교

4. Content Report
   - 블로그별 조회
   - 이벤트별 전환
   - 콘텐츠 기여 리드

5. Campaign Report
   - 캠페인별 방문/클릭/리드/전환율

### G. Settings

설정은 시스템 운영을 다루는 곳이고,  
대시보드/콘텐츠/리드와는 성격이 다르다.

하위 구조:

- Integrations
- Analytics
- Notifications
- Security
- System

Settings에 둬야 할 것:

- 웹훅 URL
- 분석 스크립트 ID
- 관리자 보안 정책
- 알림 수신자
- 시스템 토글

Settings에 두지 말아야 할 것:

- 리드 운영
- 캠페인 상태
- 블로그 발행
- 홈페이지 실시간 운영 데이터

## 7. 진짜 중요한 운영 흐름

상위 구조는 아래 흐름으로 연결돼야 한다.

```text
Campaign
  -> Landing / Blog / Event
  -> CTA
  -> Form Submit
  -> Lead Pipeline
  -> Follow-up
  -> Outcome
  -> Report
```

이 흐름이 보이면 관리자 앱이 살아 있는 것이고,  
이 흐름이 끊기면 단순 CMS로 전락한다.

## 8. 화면별 와이어프레임 제안

### `/admin`

```text
[Top Bar]
  Search | Date Filter | Workspace Switch | Admin Menu

[Sidebar]
  Dashboard
  Leads
  Content
  Campaigns
  Site Control
  Reports
  Settings
  Team

[Main]
  KPI Row
  Funnel + Pipeline
  Alerts + Recent Activities
  Campaign Snapshot + Content Snapshot
```

### `/admin/leads`

```text
[Header]
  Leads | Filter | Owner | Status | Source | Export

[Body]
  Left: Lead Table or Kanban
  Right Drawer: Lead Detail
    - profile
    - submission
    - notes
    - activity
    - next action
```

### `/admin/posts`

```text
[Header]
  Posts | Search | Status Filter | Category Filter | New Post

[Body]
  Table View
    title | status | author | campaign | publishedAt | updatedAt
```

### `/admin/posts/new`

```text
[Main Editor]
  title
  excerpt
  content blocks

[Right Panel]
  thumbnail
  category
  tags
  campaign
  seo
  publish controls
```

### `/admin/events`

```text
[Header]
  Events | Calendar Toggle | Status Filter | New Event

[Body]
  Event Table / Calendar
  Event Detail Drawer
```

### `/admin/media`

```text
[Header]
  Upload | Search | Filters | Collection

[Body]
  Asset Grid
  Asset Preview Panel
    - alt text
    - tags
    - dimensions
    - used in
```

### `/admin/campaigns`

```text
[Header]
  Campaigns | Active / Archived | New Campaign

[Body]
  Campaign List
  Campaign Overview
    - linked assets
    - cta performance
    - lead performance
    - notes
```

### `/admin/site`

```text
[Tabs]
  Home | CTA | Forms | Banner | Navigation

[Main]
  left: editable settings
  right: live preview / structure preview
```

### `/admin/reports`

```text
[Tabs]
  Funnel | Traffic | CTA | Content | Campaign

[Main]
  filters
  charts
  comparison cards
  export
```

## 9. 역할별 추천 접근 범위

| 역할 | Dashboard | Leads | Content | Campaigns | Site | Reports | Settings | Team |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `SUPER_ADMIN` | O | O | O | O | O | O | O | O |
| `ADMIN` | O | O | O | O | O | O | 일부 | 일부 |
| `EDITOR` | O | 일부 | O | 일부 | CTA/콘텐츠 일부 | O | X | X |
| `VIEWER` | O | 조회 | 조회 | 조회 | 조회 | 조회 | X | X |

권장 원칙:

- `EDITOR`는 글과 이벤트는 다루되, 시스템 설정은 건드리지 못하게 한다
- `ADMIN`은 캠페인과 사이트 운영을 함께 다루게 한다
- `SUPER_ADMIN`만 보안과 팀 권한을 바꾼다

## 10. 이 프로젝트에서 바로 만들 MVP

### MVP 1

- `/admin`
- `/admin/leads`
- `/admin/posts`
- `/admin/events`
- `/admin/media`
- `/admin/site`

이 단계에서 해결되는 것:

- 콘텐츠 운영 시작 가능
- 리드 추적 가능
- 홈페이지 CTA/폼/배너 제어 가능

### MVP 2

- `/admin/campaigns`
- `/admin/reports`
- `/admin/settings`

이 단계에서 해결되는 것:

- 캠페인 운영 단위 확립
- 성과 비교와 학습 구조 형성
- 운영 설정 분리

### MVP 3

- 승인 워크플로우
- 예약 발행
- 알림 자동화
- 고급 감사 로그
- 팀별 대시보드

## 11. 절대 피해야 할 구조

1. 관리자 첫 화면이 곧바로 Settings인 구조
2. 블로그 CMS와 리드 관리가 분리된 구조
3. 이미지 업로드가 각 페이지에 흩어진 구조
4. 캠페인 개념 없이 콘텐츠만 쌓이는 구조
5. 리드가 단순 스프레드시트 대체 수준에서 끝나는 구조

## 12. 추천 결론

이 프로젝트의 관리자 페이지는 아래처럼 보는 것이 가장 맞다.

- CMS 30%
- CRM-lite 25%
- Site Control 20%
- Campaign Ops 15%
- Reports & Settings 10%

즉, 이름은 관리자 페이지지만 실체는  
`Classin Home Growth OS`에 가깝게 설계하는 것이 가장 강하다.
