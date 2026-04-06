# Admin Implementation Inputs

기준 시점: 2026-03-21  
문서 목적: 관리자 앱 구현을 시작하기 전에 반드시 확정해야 하는 입력값과 운영 규칙을 정리한다.

## 1. 바로 필요한 것

아래 8가지만 정리되면 `IA -> DB schema -> UI skeleton -> CRUD` 순서로 바로 구현에 들어갈 수 있다.

1. CTA 목록표
2. 폼 종류별 필드표
3. 리드 상태 정의
4. 관리자 역할 정의
5. 블로그 카테고리 목록
6. 이벤트 유형 / 상태 목록
7. 기본 운영 연락처 정보
8. Supabase 프로젝트 준비 여부

## 2. 항목별 상세

### A. 관리자 운영 범위

- 관리자 앱 경로
  - 지금은 `/admin`
  - 추후 `admin.classin.kr` 분리 여부
- 최초 역할 구성
  - `SUPER_ADMIN`
  - `ADMIN`
  - `EDITOR`
  - `VIEWER`
- 역할별 가능한 작업
  - 누가 리드 상태를 바꾸는지
  - 누가 글을 발행하는지
  - 누가 시스템 설정을 수정하는지

### B. CTA 인벤토리

CTA마다 아래 값이 필요하다.

- CTA ID
  - 예: `home_hero_primary`, `home_final_demo`, `blog_sidebar_download`
- 페이지
  - 예: `home`, `product_sw`, `product_hw`, `pricing`, `blog`, `events`, `contact`
- 위치
  - 예: `hero_primary`, `hero_secondary`, `final_cta_left`, `blog_sidebar`
- 라벨
- CTA 목적
  - 문의, 데모 신청, 자료 다운로드, 이벤트 신청, 영상 보기, 외부 링크
- 액션 타입
  - `link`, `form`, `download`, `modal`, `video`
- 연결 대상
  - URL, 파일, 모달 키, 영상 링크
- 추적 이벤트명
- 기본 활성화 여부

### C. 폼 프리셋

CTA가 폼을 열 수 있으려면 폼 프리셋이 먼저 정의돼야 한다.

권장 프리셋:

- `demo_request`
- `contact_request`
- `download_request`
- `event_apply`
- `newsletter_signup`

프리셋별로 정해야 할 값:

- 폼 이름
- 설명
- 필수 필드
- 선택 필드
- 개인정보 동의 문구
- 제출 성공 메시지
- 제출 실패 메시지
- 리드 소스값
- 후속 라우팅 규칙

### D. 리드 운영 규칙

- 리드 상태값
  - `new`, `contacted`, `qualified`, `meeting-booked`, `won`, `lost`, `spam`
- 담당자 지정 방식
- 후속 SLA
  - 예: 신규 리드 24시간 내 확인
- 외부 전송 채널
  - Google Sheet
  - ChannelTalk
  - Generic Webhook

### E. 콘텐츠 운영 규칙

- 블로그 카테고리 목록
- 이벤트 유형 목록
- 이벤트 상태 목록
- 썸네일 필수 여부
- 미디어 폴더 규칙
- 캠페인 네이밍 규칙

### F. 분석 규칙

- 핵심 이벤트명
- UTM 규칙
- 어떤 CTA를 전환 CTA로 볼지
- 어떤 제출을 유효 리드로 볼지

## 3. 내가 받으면 바로 설계 가능한 표

### CTA 목록표

| cta_id | page | slot | label | action_type | target | form_preset | tracking_event | enabled |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| home_hero_primary | home | hero_primary | 도입 문의하기 | form | - | demo_request | click_cta | true |
| home_hero_secondary | home | hero_secondary | 소개서 받기 | download | /files/brochure.pdf | - | download_materials | true |

### 폼 프리셋표

| preset_key | name | required_fields | optional_fields | lead_source | success_message |
| --- | --- | --- | --- | --- | --- |
| demo_request | 데모 신청 | name,email,org,phone | message,size | demo_modal | 상담 요청이 접수되었습니다. |
| download_request | 자료 다운로드 | name,email,org | phone | materials | 자료 요청이 접수되었습니다. |

### 리드 상태표

| status | label | description |
| --- | --- | --- |
| new | 신규 | 아직 확인 전 |
| contacted | 연락 완료 | 1차 연락 완료 |
| qualified | 유효 리드 | 후속 상담 가치 있음 |
| meeting-booked | 미팅 예정 | 미팅 일정 확정 |
| won | 전환 완료 | 계약 또는 도입 성공 |
| lost | 종료 | 전환 실패 |

## 4. 우선 결정만 하면 되는 것

구현 초기에 아래 두 가지는 아주 단순하게 두는 것이 좋다.

- 역할
  - 4개 고정 역할로 시작
- 폼 프리셋
  - 3~5개만 먼저 정의

초기부터 모든 예외를 커버하려고 하면 관리자 구조가 지나치게 복잡해진다.
