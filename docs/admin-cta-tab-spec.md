# Admin CTA Tab Spec

기준 시점: 2026-03-21  
문서 목적: 관리자 앱의 `CTA` 탭에서 CTA별 링크, 폼, 다운로드, 모달 연결을 관리할 수 있도록 상세 구조를 정의한다.

## 1. CTA 탭의 역할

CTA 탭은 단순 문구 수정 페이지가 아니다.  
`어떤 CTA가 어디에 노출되고, 클릭 시 어떤 링크나 폼으로 이어지고, 어떤 이벤트로 추적되는지`를 한 화면에서 관리하는 제어판이다.

## 2. 핵심 요구사항

각 CTA마다 아래를 관리할 수 있어야 한다.

- CTA 라벨
- CTA 설명
- 활성화 여부
- 액션 타입
- 링크 대상 또는 폼 프리셋
- 모달 사용 여부
- 다운로드 파일
- 추적 이벤트명
- 연결 캠페인
- 성공 후 동작

즉, 사용자 요청대로 `CTA별 링크나 폼 설정`이 가능해야 한다.

## 3. 추천 화면 구조

경로:

- `/admin/site?tab=cta`
또는
- `/admin/settings?tab=cta`

권장 UI:

```text
Header
  CTA Control | Search | Page Filter | Status Filter | New CTA

Left
  CTA List Table
    - cta_id
    - page
    - slot
    - label
    - action_type
    - target_summary
    - enabled

Right
  CTA Detail Form
    - 기본 정보
    - 액션 설정
    - 폼 설정
    - 추적 설정
    - 노출 설정
    - 미리보기
```

## 4. CTA 데이터 모델

### `cta_configs`

| 컬럼 | 타입 | 설명 |
| --- | --- | --- |
| `id` | uuid | PK |
| `cta_id` | string unique | 시스템용 CTA 키 |
| `page_key` | string | `home`, `blog`, `events` 등 |
| `slot_key` | string | `hero_primary`, `footer_secondary` 등 |
| `label` | string | 버튼 라벨 |
| `description` | string nullable | 내부 설명 |
| `action_type` | enum | `link`, `form`, `download`, `modal`, `video` |
| `target_url` | string nullable | 내부/외부 링크 |
| `form_preset_key` | string nullable | 폼 프리셋 |
| `download_asset_id` | uuid nullable | 다운로드 파일 |
| `video_url` | string nullable | 영상 링크 |
| `modal_key` | string nullable | 모달 식별자 |
| `tracking_event` | string | 추적 이벤트명 |
| `campaign_id` | uuid nullable | 연결 캠페인 |
| `enabled` | boolean | 활성화 여부 |
| `sort_order` | int | 동일 영역 내 순서 |
| `created_at` | datetime | 생성 시각 |
| `updated_at` | datetime | 수정 시각 |

### `form_presets`

| 컬럼 | 타입 | 설명 |
| --- | --- | --- |
| `id` | uuid | PK |
| `preset_key` | string unique | 시스템용 키 |
| `name` | string | 프리셋 이름 |
| `description` | string nullable | 설명 |
| `fields_json` | json | 필드 정의 |
| `lead_source` | string | 제출 source |
| `success_message` | string | 성공 문구 |
| `error_message` | string | 실패 문구 |
| `created_at` | datetime | 생성 시각 |
| `updated_at` | datetime | 수정 시각 |

## 5. 액션 타입별 입력 규칙

### A. `link`

필수:

- `target_url`

선택:

- 새 탭 여부
- UTM 자동 부착 여부

### B. `form`

필수:

- `form_preset_key`

선택:

- 모달 표시 여부
- 제출 후 리다이렉트 URL

### C. `download`

필수:

- `download_asset_id`

선택:

- 제출 후 다운로드 여부
- 제출 없이 즉시 다운로드 여부

### D. `modal`

필수:

- `modal_key`

선택:

- 모달 내부 CTA 프리셋

### E. `video`

필수:

- `video_url`

선택:

- 내부 플레이어 / 외부 링크 여부

## 6. 폼 설정 상세

CTA가 `form` 타입일 때 우측 패널에 아래 영역이 열려야 한다.

### Form Preset

- 프리셋 선택
- 새 프리셋 생성
- 복제

### Fields

- 이름
- 이메일
- 연락처
- 기관명
- 역할
- 학생 수 / 규모
- 메시지
- 개인정보 동의

필드별 속성:

- 필수 여부
- placeholder
- 라벨
- 도움말

### Submission

- lead source
- webhook routing
- success message
- error message
- auto redirect

## 7. 추천 뷰 방식

### 목록 뷰

빠르게 운영하려면 CTA 목록이 먼저 보여야 한다.

필터:

- 페이지
- 액션 타입
- 활성화 여부
- 캠페인

### 상세 뷰

선택한 CTA 하나를 바로 수정할 수 있어야 한다.

권장 섹션:

1. Basic
2. Action
3. Form
4. Tracking
5. Visibility
6. Preview

## 8. 예시

### 예시 1. 홈 Hero 메인 CTA

- `cta_id`: `home_hero_primary`
- `label`: `도입 문의하기`
- `action_type`: `form`
- `form_preset_key`: `demo_request`
- `tracking_event`: `click_cta`
- `enabled`: `true`

### 예시 2. 블로그 사이드 CTA

- `cta_id`: `blog_sidebar_download`
- `label`: `소개서 받기`
- `action_type`: `download`
- `download_asset_id`: `brochure_pdf_asset`
- `tracking_event`: `download_materials`
- `enabled`: `true`

### 예시 3. 이벤트 카드 CTA

- `cta_id`: `events_card_apply`
- `label`: `신청하기`
- `action_type`: `link`
- `target_url`: `/contact?source=event`
- `tracking_event`: `click_cta`

## 9. V1에서 꼭 필요한 기능

- CTA 목록 조회
- CTA 생성 / 수정
- CTA별 링크/폼/다운로드/모달 설정
- CTA 활성화 on/off
- 추적 이벤트명 설정
- 페이지/위치별 필터

## 10. V2에서 붙이면 좋은 기능

- CTA 성과 지표 직접 표시
- A/B Variant
- 예약 시작 / 종료
- CTA 히스토리 비교
- 페이지 미리보기 오버레이

## 11. 결론

CTA 탭은 "버튼 문구 수정" 수준에서 끝나면 안 된다.  
`CTA = 전환 객체`로 보고, 링크와 폼을 CTA 단위로 제어할 수 있게 만드는 것이 맞다.
