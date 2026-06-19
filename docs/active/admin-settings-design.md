# Admin Settings Design

기준 시점: 2026-03-19  
문서 목적: `Classin Home`의 관리자 페이지 내 `설정(Settings)` 영역에서 무엇을 어떤 방식으로 관리하게 할지 정의한다.  
적용 범위: 설계 문서. 구현 우선순위와 데이터 구조 제안 포함, 코드 반영 없음.

## 1. 왜 필요한가

현재 저장소는 공개 랜딩 페이지와 리드 수집 API 중심 구조다.

- 공개 페이지: `/`, `/product/*`, `/pricing`, `/blog`, `/events`, `/contact`
- 운영 핵심: CTA 클릭, 문의/데모 신청, 블로그/이벤트 노출, 분석 스크립트, 외부 웹훅 연동
- 현재 한계: 운영 설정이 코드와 환경변수에 흩어져 있어 비개발자가 조정하기 어렵다

따라서 `admin/settings`는 "콘텐츠를 쓰는 CMS"가 아니라, "운영 규칙과 연결 정보를 안전하게 관리하는 제어판"으로 설계하는 것이 맞다.

## 2. 설계 원칙

1. 자주 바뀌는 운영값만 관리자에서 바꾼다.
2. 코드/배포가 필요한 구조 변경은 설정 화면에 억지로 넣지 않는다.
3. 설정은 도메인별로 나눈다.
4. 민감 정보와 일반 설정을 분리한다.
5. 저장 전 검증, 저장 후 감사 로그, 필요 시 롤백이 가능해야 한다.

## 3. 화면 구조 제안

`/admin/settings`는 좌측 카테고리 네비게이션 + 우측 상세 패널 구조가 적합하다.

### 좌측 메뉴

1. 일반
2. 리드 수집
3. CTA / 폼
4. 콘텐츠 노출
5. 분석 / 전환
6. 외부 연동
7. 보안 / 운영
8. 알림
9. 변경 이력

### 우측 패널 공통 구조

- 상단: 설정 제목, 설명, 마지막 수정자/수정시각
- 본문: 카드 단위 설정 그룹
- 하단 고정 바: `취소`, `초안 되돌리기`, `저장`
- 보조 영역: `테스트 실행`, `현재 적용값 보기`, `최근 변경 비교`

## 4. 어떤 기능을 관리하게 할지

### 4-1. 일반

사이트 전반의 기본 운영 정보를 관리한다.

관리 항목:

- 사이트 이름
- 브라우저 기본 타이틀 템플릿
- 대표 문의 이메일
- 대표 전화번호
- 회사 주소
- 푸터 공통 문구
- 기본 CTA 라벨
- 운영 배너 활성화 여부
- 운영 배너 문구

관리 형태:

- 짧은 텍스트 입력
- 토글
- 멀티라인 텍스트
- 미리보기 박스

적합한 이유:

- 마케팅/운영팀이 문구와 연락처를 수시로 조정할 수 있다.
- 공통 CTA 문구를 페이지별로 일관성 있게 유지할 수 있다.

### 4-2. 리드 수집

문의/데모 신청이 어떤 규칙으로 검증되고 어디로 전달되는지 관리한다.

관리 항목:

- 리드 소스 허용 목록
  - 예: `demo_modal`, `contact_page`, `newsletter`
- 필수 입력 필드 규칙
  - 이름, 이메일, 전화번호, 기관명 등
- 중복 제출 방지 시간
  - 예: 같은 이메일 10분 내 중복 차단
- 기본 태그 규칙
  - 예: 소스별 `demo`, `contact`, `newsletter`
- 리드 라우팅 규칙
  - 예: `source=demo_modal`이면 영업 웹훅 + 채널톡 전달
- 테스트 제출 기능
- 웹훅 실패 시 재시도 정책

관리 형태:

- 드롭다운 + 멀티셀렉트
- 필수 여부 토글 테이블
- 규칙 기반 매핑 테이블
- "테스트 전송" 액션 버튼
- 상태 배지
  - 정상, 경고, 실패

적합한 이유:

- 현재 서비스의 핵심은 리드 유실 방지다.
- 운영자가 배포 없이 라우팅 정책을 바꿀 수 있어야 한다.

### 4-3. CTA / 폼

페이지별 CTA와 연결 동작을 관리한다.

관리 항목:

- 페이지별 CTA 활성화 여부
  - 홈, 제품 SW, 제품 HW, 가격, 블로그, 이벤트, 문의
- CTA 유형
  - 모달 열기, 페이지 이동, 파일 다운로드, 외부 링크, 영상 보기
- CTA 라벨 문구
- CTA 클릭 시 이벤트명
- 연결 대상
  - 예: `#demo-modal`, `/contact`, 다운로드 URL, YouTube URL
- 폼 노출 필드 세트
  - 짧은 문의형, 데모 신청형, 뉴스레터형
- 제출 완료 메시지 / 실패 메시지

관리 형태:

- 페이지별 아코디언
- 행 단위 편집 가능한 테이블
- 라디오 버튼
- URL 입력
- 프리셋 선택
- 우측 실시간 미리보기

적합한 이유:

- 현재 리포지토리에서 CTA는 페이지 성과를 좌우하는 핵심 요소다.
- 운영팀이 캠페인 상황에 따라 버튼 목적지를 바꾸기 쉽다.

### 4-4. 콘텐츠 노출

블로그, 이벤트, 메인 페이지 노출 정책을 설정한다.

관리 항목:

- 홈 노출 추천 섹션 on/off
  - 사례, FAQ, 비교표, 과학 기반 섹션 등
- 블로그 카테고리 노출 순서
- 블로그 추천 글 규칙
  - 수동 고정 또는 최신순
- 이벤트 상태 기준
  - 예정, 진행중, 종료
- 종료 이벤트 숨김 규칙
- 뉴스레터 박스 노출 여부
- 문의 유도 배너 위치

관리 형태:

- 토글
- 드래그 정렬 리스트
- 조건 선택 드롭다운
- 노출 시뮬레이션 프리뷰

적합한 이유:

- CMS 전체를 만들지 않아도, 노출 규칙만 제어해도 운영 효율이 크게 오른다.

### 4-5. 분석 / 전환

분석 스크립트와 전환 이벤트 설정을 운영에서 확인하고 제어한다.

관리 항목:

- 분석 도구 활성화 여부
  - GA, Meta Pixel, Kakao Pixel
- 이벤트 매핑
  - CTA 클릭, 문의 제출, 자료 다운로드, 영상 보기
- UTM 저장 여부
- 테스트 모드 활성화 여부
- 내부 트래픽 제외 규칙
- 이벤트 발화 조건
  - 예: 제출 성공 시만 `submit_demo_request` 발화
- 페이지별 전환 이벤트 연결

관리 형태:

- provider 카드
- 토글 + 입력 필드
- 이벤트 매핑 테이블
- 최근 테스트 로그 패널

적합한 이유:

- 지금 구조에서는 분석 값이 빠지면 운영자는 성과를 볼 수 없다.
- 코드 수정 없이 추적 실수를 줄일 수 있다.

### 4-6. 외부 연동

웹훅과 외부 서비스 연결 상태를 관리한다.

2026년 4월 15일 구현 반영:

- `/admin/settings`의 `외부 연동` 탭에 `페이지 폼 웹훅` 카드가 추가되었다.
- 운영자는 여기서 외부 랜딩페이지용 웹훅 URL과 상대 경로를 바로 복사할 수 있다.
- `fetch` 예시, 데모 신청 payload, 문의 payload를 UI에서 바로 복사할 수 있다.
- 이 카드는 홈페이지 방문 여부와 상관없이 외부 페이지 폼을 같은 CRM 리드 파이프라인으로 연결하는 운영 진입점 역할을 한다.

관리 항목:

- Google Sheet Webhook URL
- Generic Lead Webhook URL
- ChannelTalk Webhook URL
- Page Form Webhook URL
- Page Form Webhook fetch 예시 / payload 예시 복사
- 각 연동의 활성화 여부
- 비밀 키 또는 서명 헤더
- 타임아웃
- 실패 알림 여부
- 연결 테스트
- 최근 성공/실패 시각

관리 형태:

- 비밀값 입력 필드
  - 기본 마스킹
- 연결 상태 카드
- 읽기 전용 운영 가이드 카드
  - URL 복사
  - 경로 복사
  - 요청 예시 복사
- "테스트 요청 보내기" 버튼
- 헬스체크 로그 표

적합한 이유:

- 운영자는 "저장했는지"보다 "실제로 도착하는지"를 알아야 한다.

### 4-7. 보안 / 운영

관리자 시스템 운영 규칙을 설정한다.

관리 항목:

- 세션 만료 시간
- 비밀번호 정책 강도
- 초대 링크 만료 시간
- 2차 인증 필수 여부
- 허용 이메일 도메인
- 유지보수 배너 표시 여부
- 읽기 전용 모드
- 위험 작업 확인 단계
  - 예: 퍼블리시/삭제 시 재확인

관리 형태:

- 숫자 입력
- 토글
- 태그 입력
- 위험 설정 별도 `Danger Zone`

적합한 이유:

- 관리자 페이지는 콘텐츠보다 계정 보호와 운영 안정성이 우선이다.

### 4-8. 알림

운영팀이 어떤 이벤트를 어떤 채널로 받을지 관리한다.

관리 항목:

- 신규 리드 알림 수신자
- 웹훅 실패 알림 수신자
- 블로그 발행 승인 요청 알림
- 이벤트 종료 알림
- 일일 요약 알림 사용 여부
- 알림 채널
  - 이메일, 슬랙 웹훅, 채널톡 내부 알림 등

관리 형태:

- 수신자 리스트
- 채널별 멀티셀렉트
- 임계값 입력
  - 예: 실패 3회 이상 시 알림

## 5. 어떤 형태로 관리하게 할지

설정은 내용에 따라 UI 패턴을 다르게 가져가는 편이 좋다.

### A. 단순 값 설정

대상:

- 사이트명
- 연락처
- 푸터 문구
- 세션 만료 시간

형태:

- 폼 입력
- 즉시 검증
- 저장 시 단건 업데이트

### B. 규칙형 설정

대상:

- 리드 라우팅
- CTA 동작
- 이벤트 매핑

형태:

- 조건-행동 구조 테이블
- 예시 문장 자동 생성
  - 예: "홈 데모 신청은 영업 웹훅과 채널톡으로 전송됩니다"

### C. 노출형 설정

대상:

- 홈 섹션 on/off
- 추천 글 고정
- 이벤트 배너 표시

형태:

- 토글 + 정렬 리스트
- 프리뷰 패널

### D. 민감 정보 설정

대상:

- 웹훅 URL
- API Secret
- 관리자 보안 정책

형태:

- 값 마스킹
- 마지막 수정자 표기
- 재입력 확인
- 권한 제한

### E. 위험 작업 설정

대상:

- 읽기 전용 모드
- 전역 비활성화
- 추적 중단

형태:

- 별도 섹션 분리
- 2단계 확인
- 감사 로그 강제 기록

## 6. 권한 제안

기존 관리자 역할 설계를 기준으로 아래처럼 나누는 것이 적합하다.

| 설정 도메인 | SUPER_ADMIN | ADMIN | EDITOR | VIEWER |
| --- | --- | --- | --- | --- |
| 일반 조회 | O | O | O | O |
| 일반 수정 | O | O | X | X |
| 리드 수집 수정 | O | O | X | X |
| CTA 수정 | O | O | O | X |
| 콘텐츠 노출 수정 | O | O | O | X |
| 분석 설정 수정 | O | O | X | X |
| 외부 연동 수정 | O | X | X | X |
| 보안 / 운영 수정 | O | X | X | X |
| 변경 이력 조회 | O | O | X | X |

원칙:

- `EDITOR`는 콘텐츠 노출과 CTA 문구 수준까지만 수정
- 웹훅, 보안, 계정 정책은 `SUPER_ADMIN` 또는 일부 `ADMIN`만 수정
- `VIEWER`는 읽기 전용

## 7. 저장 방식 제안

초기 구현은 "설정 도메인별 JSON 저장 + 리비전 기록"이 가장 현실적이다.

### 추천 테이블

#### `admin_settings`

| 컬럼 | 타입 | 설명 |
| --- | --- | --- |
| `id` | uuid | PK |
| `domain` | string | `general`, `lead`, `cta`, `content`, `analytics`, `integration`, `security`, `notification` |
| `value_json` | json | 실제 설정 값 |
| `version` | int | 현재 버전 |
| `updated_by` | uuid | 수정자 |
| `updated_at` | datetime | 수정 시각 |

#### `admin_setting_revisions`

| 컬럼 | 타입 | 설명 |
| --- | --- | --- |
| `id` | uuid | PK |
| `setting_id` | uuid | `admin_settings.id` FK |
| `domain` | string | 설정 도메인 |
| `value_json` | json | 저장 당시 전체 값 |
| `change_summary` | string | 변경 요약 |
| `created_by` | uuid | 수정자 |
| `created_at` | datetime | 저장 시각 |

#### `admin_setting_secrets`

| 컬럼 | 타입 | 설명 |
| --- | --- | --- |
| `id` | uuid | PK |
| `key` | string | secret 식별자 |
| `encrypted_value` | text | 암호화된 값 |
| `updated_by` | uuid | 수정자 |
| `updated_at` | datetime | 수정 시각 |

이 구조의 장점:

- 도메인 단위로 읽고 저장하기 쉽다
- 폼 스키마를 점진적으로 늘릴 수 있다
- 변경 이력과 롤백이 간단하다

## 8. 저장 플로우 제안

1. 관리자 화면 진입
2. 도메인별 설정 로드
3. 클라이언트에서 1차 검증
4. 서버에서 2차 검증
5. 민감 설정은 별도 권한 체크
6. 저장 성공 시
   - `admin_settings` 갱신
   - `admin_setting_revisions` 기록
   - `audit_logs` 기록
7. 필요 시 헬스체크 또는 테스트 실행

## 9. MVP 우선순위

### P0

- 리드 수집 설정
- CTA / 폼 설정
- 외부 연동 설정
- 분석 활성화 여부 및 기본 이벤트 매핑

### P1

- 일반 설정
- 콘텐츠 노출 설정
- 알림 설정
- 변경 이력 보기

### P2

- 프리뷰 시뮬레이터
- 고급 규칙 엔진
- 승인 워크플로우
- 예약 적용

## 10. 추천 라우트 구조

단기적으로는 한 페이지 내부 탭 방식이 적합하다.

```text
/admin/settings
  ?tab=general
  ?tab=lead
  ?tab=cta
  ?tab=content
  ?tab=analytics
  ?tab=integrations
  ?tab=security
  ?tab=notifications
  ?tab=history
```

설정 규모가 커지면 아래처럼 하위 라우트로 분리한다.

```text
/admin/settings
/admin/settings/general
/admin/settings/lead
/admin/settings/cta
/admin/settings/content
/admin/settings/analytics
/admin/settings/integrations
/admin/settings/security
/admin/settings/notifications
/admin/settings/history
```

## 11. 이 프로젝트 기준 추천 범위

현재 `Classin Home`의 운영 특성을 보면, 처음부터 모든 설정을 만들기보다 아래 범위가 가장 효과적이다.

1. 리드 전달 규칙
2. CTA 목적지와 문구
3. 분석 스크립트 활성화와 이벤트명
4. 공통 문의 정보
5. 웹훅 연결 상태 확인

즉, 이 관리자 설정 페이지의 핵심은 "블로그 CMS"보다 "운영 제어판"에 더 가깝다.

## 12. 한 줄 결론

`admin/settings`는 "모든 것을 수정하는 만능 페이지"가 아니라, 운영자가 배포 없이 비즈니스 핵심 설정을 안전하게 바꾸는 도메인형 제어판으로 설계하는 것이 가장 적합하다.

## 13. 2026-06-19 보강: 연동 상태, API 키, 커넥터, 웹훅

기준 시점: 2026-06-19

문서 목적: 현재 구현된 `/admin/settings`와 실제 연동 코드를 기준으로, `외부 연동` 영역을 어떻게 확장할지 정의한다.

적용 범위: 기획 및 구현 가이드. 실제 API 키 값, 비밀번호 예시, 로컬 절대경로는 문서에 남기지 않는다.

### 13-1. 현재 코드 기준 상태

현재 `/admin/settings`는 이미 단일 페이지 내부 탭 방식으로 구현되어 있다.

- 화면: [app/admin/settings/page.tsx](../../app/admin/settings/page.tsx)
- 관리자 전역 네비게이션: [components/admin/AdminSidebar.tsx](../../components/admin/AdminSidebar.tsx)
- Settings API: [app/api/admin/settings/route.ts](../../app/api/admin/settings/route.ts)
- Webhook 테스트 API: [app/api/admin/settings/test-webhook/route.ts](../../app/api/admin/settings/test-webhook/route.ts)
- 설정 저장소: [lib/repositories/settings.ts](../../lib/repositories/settings.ts)
- 설정 타입: [lib/db.ts](../../lib/db.ts)

현재 탭은 `일반`, `리드·폼`, `CTA`, `외부 연동`, `알림`, `변경 이력`이다. `외부 연동` 탭에는 이미 아래 기능이 있다.

- 페이지 폼 웹훅 URL 복사: `/api/webhook/page`
- fetch 예시와 payload 예시 복사
- Google Sheet, 범용 리드, 채널톡, WeCom, 카카오 알림톡, 이메일 Webhook URL 입력
- URL 테스트 버튼

중요한 현재 동작:

- `GET /api/admin/settings`는 웹훅 URL 원문을 빈 문자열로 마스킹한다.
- `PATCH /api/admin/settings`는 웹훅 값을 검증한 뒤 저장한다.
- 빈 문자열 PATCH는 기존 값을 유지하므로, 삭제/초기화는 별도 액션이 필요하다.

### 13-2. 설계 결론

`외부 연동`은 하나의 긴 입력 폼이 아니라 아래 4개 하위 탭으로 나누는 것이 맞다.

1. `연동 상태`
2. `API 키`
3. `커넥터 기능`
4. `웹훅 링크`

핵심 원칙은 "secret 관리 화면"이 아니라 "서버가 판정한 연결 상태 + write-only 교체 입력"이다.

- 클라이언트에는 API 키, 토큰, 웹훅 전체 URL 원문을 내려주지 않는다.
- 화면은 `configured`, `source`, `lastCheckedAt`, `lastSuccessAt`, `lastErrorSummary`만 표시한다.
- 입력은 replace-only로 동작한다. 저장 후 input은 비워지고 "설정됨" 상태만 남긴다.
- DB 저장이 필요한 secret은 `site_settings` 평문 컬럼에 섞지 않고 별도 암호화 저장소를 쓴다.
- env에 있는 secret은 Settings에서 원문 편집하지 않고 상태 확인과 테스트만 제공한다.

### 13-3. 하위 탭 상세

#### 연동 상태

목적: 운영자가 "무엇이 연결되어 있고, 무엇이 막혀 있는지"를 한 화면에서 본다.

표시 항목:

- Supabase DB/Auth/Storage
- Page Form Webhook
- Lead Outbound Webhooks
- Notification Webhooks
- Channel Talk
- Email Provider
- Google Service Account
- Branch Sheet Sync
- Gemini / Google AI
- Meta Marketing / Lead Ads
- Client Analytics Pixels
- Toss Payments
- FX Rate
- Xiaoshouyi / Neo CRM
- CRM Writeback
- Partner Portal APIs

상태 모델:

```ts
type IntegrationStatus = {
  key: string
  label: string
  category: "core" | "lead" | "notification" | "marketing" | "crm" | "billing" | "portal" | "ops"
  configured: boolean
  source: "env" | "db" | "mixed" | "not_configured"
  health: "ok" | "warning" | "error" | "unknown"
  lastCheckedAt?: string
  lastSuccessAt?: string
  lastErrorSummary?: string
  requiredKeys: string[]
  docsHref?: string
  adminHref?: string
}
```

UI 상태:

- `ok`: 연결됨
- `warning`: 일부 기능 제한
- `error`: 최근 테스트 실패 또는 API 오류
- `not_configured`: 필수 env/secret 없음
- `unknown`: 아직 테스트하지 않음

#### API 키

목적: API 키 원문을 보여주지 않고, 설정 여부와 교체 흐름만 제공한다.

우선 표시 대상:

- `GEMINI_API_KEY`
- `CHANNEL_TALK_ACCESS`, `CHANNEL_TALK_ACCESS_SECRET`
- `META_ACCESS_TOKEN`, `META_PAGE_ACCESS_TOKEN`, `META_CAPI_ACCESS_TOKEN`
- `META_APP_SECRET`
- `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY`
- `RESEND_API_KEY`
- `TOSS_SECRET_KEY`
- `PAGE_WEBHOOK_SECRET`
- `CRON_SECRET`

화면 정책:

- env 기반 secret은 `env에서 설정됨`으로만 표시한다.
- DB override가 필요한 secret만 `교체` 버튼을 제공한다.
- 저장 성공 후 입력값을 즉시 지우고 `configured=true` 상태만 다시 로드한다.
- 삭제는 `DELETE` 액션으로만 제공한다. 빈 문자열 저장으로 삭제하지 않는다.
- secret 변경은 `SUPER_ADMIN`만 허용하는 것을 기본값으로 한다.

금지:

- API 키 원문 재표시
- 부분 마스킹된 secret 표시
- secret 포함 URL을 링크로 열기
- secret 원문을 audit log, notification payload, console log, sessionStorage/localStorage에 저장

#### 커넥터 기능

목적: "키가 있다"가 아니라 "어떤 기능을 쓸 수 있는지"를 기능 단위로 보여준다.

카드 예시:

| 커넥터 | 기능 | 연결 기준 | 바로가기 |
| --- | --- | --- | --- |
| Channel Talk | 상담 동기화, 인바운드 알림, CRM 리드 매칭 | Open API key + inbound webhook auth | `/admin/channel-talk` |
| Meta | Instagram/캠페인 조회, Lead Ads webhook | access token + app secret + verify token | `/admin/blog`, `/admin/campaigns` |
| Gemini | 블로그 AI, 마케팅 AI, 챗봇/문서 보강, 지점 인사이트 | `GEMINI_API_KEY` | `/admin/docs`, `/admin/branch` |
| Google | Sheets, Calendar, Gmail/Service Account | service account + 대상 ID | `/admin/calendar`, `/admin/branch` |
| Neo CRM | 외부 CRM sync, writeback queue | base URL + auth credential | `/admin/crm` |
| Toss | SW checkout 결제 승인 | widget key + secret key | `/admin/software-quote-codes` |
| Notifications | WeCom, Kakao, Email fallback | channel webhook 설정 | `/admin/settings` |

각 커넥터 카드 구성:

- 상태 배지
- 필요한 설정 키 목록
- 현재 활성 기능
- 최근 테스트 결과
- 최근 성공/실패 시각
- 관련 관리자 화면 링크
- 테스트 버튼

#### 웹훅 링크

목적: 들어오는 웹훅과 나가는 웹훅을 구분하고, 안전하게 복사/테스트한다.

Inbound:

- `/api/webhook/page`
- `/api/webhook/channel-talk`
- `/api/meta/webhook`

Outbound:

- Google Sheet Webhook
- Generic Lead Webhook
- Channel Talk Webhook
- WeCom ops / CS / critical
- Kakao Alimtalk Webhook
- Email Webhook

표시 정책:

- inbound URL은 secret query/token 없이 base path를 우선 보여준다.
- 토큰이 필요한 URL은 전체 URL을 만들지 않고 "토큰 설정됨" 상태만 보여준다.
- outbound URL은 저장 후 원문을 비운다.
- 테스트 요청은 서버에서만 수행하고, 실패 메시지는 민감 문자열을 제거한다.

### 13-4. 필요한 API 계약

신규 API는 기존 `/api/admin/settings`와 분리한다. 일반 설정 PATCH에 secret 교체를 섞지 않는다.

```text
GET    /api/admin/settings/integrations/status
POST   /api/admin/settings/integrations/:key/test
PATCH  /api/admin/settings/integrations/:key/secret
DELETE /api/admin/settings/integrations/:key/secret
GET    /api/admin/settings/integrations/audit
```

권한:

- status 조회: `SUPER_ADMIN`, `ADMIN`
- test 실행: `SUPER_ADMIN`, `ADMIN`
- secret 교체/삭제: `SUPER_ADMIN`
- audit 조회: `SUPER_ADMIN`, `ADMIN`

구현 기준:

- 모든 route는 [lib/admin-auth.ts](../../lib/admin-auth.ts)의 `verifyAdmin()` 또는 `requireVerifiedAdminContext()`를 사용한다.
- secret 교체/삭제는 `requireVerifiedAdminContext(req, ["SUPER_ADMIN"])` 기준을 우선 검토한다.
- data access는 `lib/repositories/` 아래에 둔다.
- 웹훅 target 검증은 [lib/server/post-json.ts](../../lib/server/post-json.ts)의 `validateWebhookTarget()`로 통일한다.

응답 예시:

```json
{
  "items": [
    {
      "key": "channel_talk",
      "label": "Channel Talk",
      "configured": true,
      "source": "env",
      "health": "ok",
      "requiredKeys": ["CHANNEL_TALK_ACCESS", "CHANNEL_TALK_ACCESS_SECRET"],
      "lastCheckedAt": "2026-06-19T00:00:00.000Z",
      "lastSuccessAt": "2026-06-19T00:00:00.000Z"
    }
  ]
}
```

### 13-5. 저장 구조 제안

기존 `site_settings`는 일반 운영 설정과 webhook URL fallback에 유지한다. 새 고위험 secret은 별도 저장소로 분리한다.

#### `admin_integration_status_events`

연동 테스트 결과와 헬스체크 결과를 저장한다.

| 컬럼 | 타입 | 설명 |
| --- | --- | --- |
| `id` | uuid | PK |
| `integration_key` | text | 커넥터 키 |
| `event_type` | text | `test`, `health_check`, `delivery_failure` |
| `status` | text | `ok`, `warning`, `error` |
| `summary` | text | 민감값 없는 요약 |
| `http_status` | int | 외부 응답 코드 |
| `latency_ms` | int | 응답 시간 |
| `created_by` | uuid | 실행자 |
| `created_at` | timestamptz | 생성 시각 |

#### `admin_setting_secrets`

DB override가 꼭 필요한 secret만 저장한다. Supabase Vault나 KMS를 사용할 수 있으면 이 테이블보다 우선한다.

| 컬럼 | 타입 | 설명 |
| --- | --- | --- |
| `id` | uuid | PK |
| `key` | text | secret 식별자 |
| `encrypted_value` | text | 암호화된 값 |
| `source` | text | `db` |
| `updated_by` | uuid | 수정자 |
| `updated_at` | timestamptz | 수정 시각 |
| `rotated_at` | timestamptz | 최근 교체 시각 |

보안 규칙:

- RLS enable
- service role 외 직접 읽기 금지
- API 응답에는 `encrypted_value` 포함 금지
- audit에는 `key`, `source`, `changed=true`만 기록

### 13-6. 현재 코드에서 바로 재사용할 상태 신호

| 영역 | 코드 | 재사용 가능한 신호 |
| --- | --- | --- |
| Settings redaction | [lib/repositories/settings.ts](../../lib/repositories/settings.ts) | public response에서 민감 URL 제거 |
| Webhook target validation | [lib/server/post-json.ts](../../lib/server/post-json.ts) | HTTPS, credential, private network 차단 |
| Channel Talk sync | [app/api/admin/channel-talk/sync/route.ts](../../app/api/admin/channel-talk/sync/route.ts) | `configured`, `ok`, `lastSyncedAt`, warning |
| Meta status | [app/api/admin/meta/status/route.ts](../../app/api/admin/meta/status/route.ts) | account check, configured error |
| CRM readiness | [app/api/admin/crm/readiness/route.ts](../../app/api/admin/crm/readiness/route.ts) | CRM 운영 readiness |
| External CRM sync | [app/api/admin/crm/external-sync/route.ts](../../app/api/admin/crm/external-sync/route.ts) | preflight, sync result |
| Docs AI readiness | [app/api/admin/docs/alpha-readiness/route.ts](../../app/api/admin/docs/alpha-readiness/route.ts) | Supabase/Gemini/doc chunks 상태 |
| Notification delivery | [lib/notifications/emit-event.ts](../../lib/notifications/emit-event.ts) | 채널별 전송 실패와 fallback |
| Audit log | [lib/auth/audit.ts](../../lib/auth/audit.ts) | 관리자 행위 감사 기록 |

### 13-7. 크론 / 운영 스케줄 표시

Settings 안에 `운영 스케줄` 요약을 추가하면 좋다. 단, cron 자체를 이 화면에서 직접 수정하지는 않는다.

표시 항목:

- cron path
- schedule
- 인증 방식: `x-vercel-cron`, `CRON_SECRET`, 또는 둘 다
- 마지막 실행 상태
- 최근 실패 요약
- Hobby 플랜 안전성 경고

현재 repo 운영 규칙상 Vercel 플랜은 명시 확인 전까지 Hobby 기준으로 본다. sub-daily 실행이 필요하면 `vercel.json`에 직접 추가하지 않고 외부 스케줄러, 큐, 또는 Vercel Pro 전환을 먼저 확정해야 한다.

현재 `vercel.json`에는 같은 route가 여러 번 등록된 항목이 있다.

- `/api/cron/sync-branch`: 하루 3회
- `/api/cron/sync-external-crm`: 하루 4회

이 문서는 설정 탭 기획이므로 `vercel.json`을 수정하지 않는다. 다만 Settings의 운영 스케줄 탭에서는 위 상태를 `Hobby 기준 확인 필요`로 표시해야 한다.

### 13-8. 구현 순서

#### P0: 읽기 전용 상태 대시보드

1. `GET /api/admin/settings/integrations/status` 추가
2. `app/admin/settings/page.tsx`의 `외부 연동` 탭을 하위 탭 구조로 분리
3. `연동 상태` 카드 목록 추가
4. 기존 웹훅 입력/테스트 UI는 `웹훅 링크` 하위 탭으로 이동
5. `?tab=integrations&section=status` URL 상태 지원

검증:

```bash
npx eslint app components lib --max-warnings=0
npm run build
```

#### P1: 테스트와 최근 결과 저장

1. `POST /api/admin/settings/integrations/:key/test` 추가
2. `admin_integration_status_events` migration 추가
3. 최근 성공/실패 시각 표시
4. `notification_delivery_logs`, CRM sync 결과, branch sync 결과를 status API에 요약
5. `app/api/admin/settings/test-webhook/route.ts`의 중복 target 검증을 공통 유틸로 정리

검증:

```bash
npx eslint app components lib --max-warnings=0
npm run build
```

#### P2: write-only secret 교체

1. secret 저장소 설계 확정: Supabase Vault/KMS 우선, 없으면 `admin_setting_secrets`
2. `PATCH /api/admin/settings/integrations/:key/secret` 추가
3. `DELETE /api/admin/settings/integrations/:key/secret` 추가
4. `SUPER_ADMIN` 권한 제한
5. 저장 성공 후 input 즉시 초기화
6. secret rotation audit 추가

검증:

```bash
npx eslint app components lib --max-warnings=0
npm run build
```

### 13-9. 수용 기준

- Settings 화면에서 secret 원문이 렌더링되지 않는다.
- API 응답에 API key, token, webhook 전체 URL 원문이 포함되지 않는다.
- 저장 후 입력한 secret 값이 React state, sessionStorage, localStorage에 남지 않는다.
- env 기반 secret은 `env에서 설정됨`으로만 표시한다.
- DB override secret은 `설정됨`, `교체`, `삭제` 액션만 제공한다.
- `연동 상태`는 최소 `configured`, `source`, `health`, `lastCheckedAt`을 표시한다.
- 웹훅 URL 테스트는 private network, localhost, credential 포함 URL을 차단한다.
- secret 교체/삭제는 감사 로그에 남기되 값은 기록하지 않는다.
- `?tab=integrations&section=webhooks` 같은 deep link로 특정 하위 탭을 열 수 있다.
- `npm run check:vercel-crons`와 `npm run build`가 cron 안전성 문제를 명확히 드러낸다.

### 13-10. 한 줄 결론

어드민 설정의 연동 영역은 "키를 보여주고 수정하는 페이지"가 아니라, "민감값은 숨긴 채 연결 가능 여부, 기능 활성도, 웹훅 링크, 운영 스케줄 리스크를 확인하고 필요한 경우 write-only로 교체하는 통합 제어판"으로 가야 한다.
