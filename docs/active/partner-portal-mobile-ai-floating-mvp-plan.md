# Partner Portal Mobile Web AI Floating MVP Plan

기준 시점: 2026-04-07

## 1. 문서 목적

이 문서는 파트너 포털에 모바일 웹 MVP를 추가할 때 필요한 상세 기획과 구현 계획을 정리한다.

이번 MVP의 범위는 아래 세 가지를 한 번에 묶는다.

- 모바일 웹에서 빠르게 여는 플로팅 실행 UI
- 텍스트/음성 입력 기반 AI 빠른 생성 및 수정 제안
- 캘린더 화면 안에서도 같은 플로팅 UI로 일정 추가 및 조정

이 문서는 다음 세션에서 바로 구현을 시작할 수 있도록 제품 범위, UX 상태, API 구조, 데이터 제약, QA 항목까지 포함한다.

## 2. 왜 모바일 웹 MVP로 가는가

현재 코드베이스는 네이티브 앱보다 모바일 웹 MVP에 더 적합하다.

- 모바일 전용 진입점이 이미 존재한다: `components/ui/MobileFloatingCTA.tsx`
- 파트너 홈에는 빠른 생성 버튼과 다이얼로그 제어점이 이미 있다: `components/partner-portal/home/PartnerPortalHome.tsx`
- 캘린더는 모바일에서도 단일 컬럼으로 내려오며 읽기 흐름이 유지된다: `app/partner/(portal)/calendar/page.tsx`
- 음성은 브라우저 직접 인식보다 `녹음 -> 서버 STT -> AI 판단 -> 사용자 확인 -> 실행` 구조가 더 안정적이다

반대로 아직 없는 것들도 분명하다.

- PWA 설치/앱 셸/서비스 워커 없음
- 모바일 전용 바텀시트 시스템 없음
- 음성 입력 상태 관리 없음
- AI의 구조화 액션 판단 API 없음
- 캘린더 수정/재배치용 API 없음

따라서 MVP의 목표는 "앱처럼 보이도록"이 아니라 "모바일에서 빠른 조작이 가능하도록"이다.

## 3. 현재 코드 기준 핵심 전제

### 3-1. 모바일/플로팅 진입점

- 공개 랜딩용 모바일 CTA가 존재한다: `components/ui/MobileFloatingCTA.tsx`
- 공개용 플로팅 챗봇 UI가 존재하지만 모바일 작업 UI로 쓰기엔 크기와 상호작용이 맞지 않는다: `components/ui/FloatingChatbot.tsx`
- 파트너 홈 상단 sticky 영역에 빠른 생성 액션이 이미 묶여 있다: `components/partner-portal/home/PartnerPortalHome.tsx`
- 파트너 캘린더는 필터, 월간 뷰, 선택 날짜 사이드 패널, 목록 뷰가 이미 있다: `app/partner/(portal)/calendar/page.tsx`

### 3-2. 현재 가능한 비즈니스 액션

- 거래 생성: `app/api/partner/deals/route.ts`
- 고객 생성: `app/api/partner/customers/route.ts`
- 고객 수정: `app/api/partner/customers/[customerId]/route.ts`
- 미팅 일정 생성: `app/api/partner/calendar/route.ts`
- 설치 일정 생성: `app/api/partner/installations/route.ts`
- 거래 생성/수정의 더 풍부한 경로: `app/api/portal/deals/route.ts`, `app/api/portal/deals/[dealId]/route.ts`

### 3-3. 현재 없는 것

- 자유 입력을 구조화 액션으로 바꾸는 AI plan API
- AI preview/execute 분리
- 음성 업로드 및 STT 처리 라우트
- 캘린더 이벤트 수정, 설치 일정 수정, 일정 취소 API
- AI 액션 전용 감사 로그
- 중복 실행 방지용 idempotency key 체계

## 4. MVP 한 줄 정의

파트너 사용자가 모바일에서 플로팅 실행기를 열고, 텍스트 또는 음성으로 요청하면, AI가 "무엇을 생성하거나 무엇을 수정할지" 계획을 제안하고, 사용자가 확인하면 즉시 거래/고객/일정/설치 작업을 반영하는 모바일 웹 워크플로.

## 5. 목표 사용자와 핵심 상황

### 5-1. 주요 사용자

- 외근 중인 파트너 대표
- 고객 상담 직후 바로 거래 메모와 일정 추가가 필요한 실무자
- 설치 일정을 이동하거나 미팅을 추가해야 하는 운영 담당자

### 5-2. 대표 사용 상황

- 상담 직후 휴대폰으로 "강남 메가스터디 보광 캠퍼스 견적 1400만 추가" 입력
- 이동 중 음성으로 "내일 오후 2시 리더스 분당 추가 계약 미팅 잡아줘"
- 캘린더 화면에서 "이 설치 일정 하루 미뤄" 조작
- 거래건을 찾지 않고 "김원장 연락처 수정해" 형태로 바로 요청

## 6. 제품 원칙

### 6-1. AI는 계획만 먼저 제안한다

AI가 바로 write를 호출하지 않는다.

- 1단계: plan
- 2단계: preview
- 3단계: execute

### 6-2. 모바일에서는 입력보다 확인이 더 중요하다

입력은 짧고 거칠어도 된다. 대신 preview가 명확해야 한다.

- 어떤 대상을 찾았는지
- 무엇을 바꾸려는지
- 확신이 낮은지
- 누락 필드가 무엇인지

### 6-3. 음성은 보조 입력이지 단독 실행 수단이 아니다

음성으로 입력하더라도 최종 실행 전에는 항상 확인 화면을 거친다.

### 6-4. 캘린더는 독립 화면이 아니라 실행 컨텍스트다

캘린더 안에서도 동일한 플로팅 실행기를 열 수 있어야 한다. 다만 캘린더에서는 일정 관련 intent를 더 강하게 우선한다.

## 7. MVP 범위

### 7-1. 포함

- 모바일 플로팅 실행기
- 텍스트 입력
- 음성 녹음 업로드
- 서버 STT
- AI plan/preview/execute
- 거래 생성
- 거래 수정
- 고객 연락처 정보 수정
- 미팅 일정 생성
- 설치 일정 생성
- 캘린더 화면에서 일정 추가/수정 제안

### 7-2. MVP에서 제외

- 삭제
- 다중 액션 연쇄 실행
- 자동 발송/자동 서명 등 후속 문서 액션
- 오프라인 지원
- 푸시 알림
- PWA 설치 기능
- 완전 자동 실행
- 관리자 화면 공통 적용

## 8. 화면별 진입점 설계

### 8-1. 파트너 홈

기준 파일: `components/partner-portal/home/PartnerPortalHome.tsx`

현 상태:

- sticky 상단 바에 `고객 추가`, `거래 추가`, `일정 추가` 버튼이 있음

MVP 변경:

- 기존 3버튼 옆 또는 앞에 `AI 빠른 실행` 버튼 추가
- 모바일에서는 개별 버튼 3개를 그대로 노출하지 않고 `플로팅 실행기` 1개로 수렴
- 데스크톱에서는 기존 버튼 유지, `AI 빠른 실행`만 보조로 추가

추천 구조:

- 모바일: 우하단 FAB
- 탭하면 바텀시트 오픈
- 빠른 선택칩:
  - 거래 추가
  - 일정 추가
  - 고객 수정
  - 음성 입력

### 8-2. 파트너 워크스페이스

기준 파일: `app/partner/(portal)/workspace/page.tsx`

현 상태:

- 읽기 중심 정보량이 많고 화면이 길다
- 탭 기반이며 모바일에서 작업 시작점이 분산되어 있다

MVP 변경:

- 우하단 FAB를 고정 노출
- 현재 선택된 탭이나 카드 컨텍스트를 실행기 초기 상태에 반영
- 거래 상세 카드에서 `현재 선택 거래로 실행기 열기` 지원

### 8-3. 파트너 캘린더

기준 파일: `app/partner/(portal)/calendar/page.tsx`

현 상태:

- 월간 달력
- 필터 칩
- 선택 날짜 상세 패널
- 전체 일정 리스트
- 새 일정 생성 버튼은 없음

MVP 변경:

- 우하단 FAB 추가
- 날짜 셀 선택 상태에서 실행기를 열면 `selectedDate`를 기본 컨텍스트로 전달
- 일정 카드 우측 상단 또는 하단에 `빠른 조정` 액션 추가
- 캘린더 화면에서는 아래 intent를 상단 추천으로 고정
  - 미팅 추가
  - 설치 추가
  - 일정 시간 변경
  - 일정 메모 수정
  - 일정 취소 요청

## 9. 플로팅 실행기 UX 상세

## 9-1. 컴포넌트 개념

가칭: `MobileActionLauncher`

구성:

- FAB 버튼
- 바텀시트 컨테이너
- 텍스트 입력 탭
- 음성 입력 탭
- 최근 실행 기록
- 추천 액션칩
- preview 카드
- 실행 결과 토스트/인라인 결과

## 9-2. 상태 모델

### S0. collapsed

- FAB만 보이는 상태
- 홈/워크스페이스/캘린더에서 공통

### S1. expanded_idle

- 바텀시트 열림
- 입력 필드, 추천 액션, 최근 명령 노출
- 컨텍스트 배지 표시
  - 화면: 홈 / 워크스페이스 / 캘린더
  - 날짜: 2026-04-12
  - 대상 거래: 있으면 표시

### S2. recording

- 음성 녹음 중
- 큰 마이크 버튼
- 경과 시간
- 취소 / 종료 버튼
- 30초 내외 soft limit

### S3. transcribing

- 업로드 및 STT 진행
- 문구: "음성을 텍스트로 변환 중"

### S4. planning

- AI가 intent와 필드를 분류 중
- 문구: "어떤 작업인지 분석 중"

### S5. preview

- 가장 중요한 상태
- 표시 항목:
  - 작업 유형
  - 대상 엔터티
  - 바뀌는 필드
  - 누락 필드
  - 신뢰도
  - 캘린더 반영 여부
- CTA:
  - 수정 후 실행
  - 바로 실행
  - 취소

### S6. requires_disambiguation

- 대상 후보가 여러 개일 때
- 예:
  - "강남 메가"와 매칭되는 고객 3건
  - 동일 제목의 거래 2건

UI:

- 후보 리스트
- 핵심 구분값
  - 고객명
  - 캠퍼스명
  - 현재 단계
  - 최근 수정일

### S7. requires_missing_fields

- create에 필요한 값이 누락된 상태
- 예:
  - 일정 생성인데 종료 시간이 없음
  - 거래 생성인데 고객이 특정되지 않음

UI:

- 필요한 필드만 짧게 다시 받음
- 모바일에서 한 번에 다 묻지 않고 1~2개씩 묻기

### S8. executing

- 실제 write 호출 중
- 중복 실행 방지를 위해 CTA 비활성화

### S9. success

- 결과 카드 표시
- 생성/수정된 대상 링크 제공
- 캘린더에서 실행한 경우 달력 데이터 갱신

### S10. failure

- 실패 원인 구분
  - 인증 만료
  - 대상 없음
  - 필드 불일치
  - 네트워크 실패
  - 서버 write 실패

## 10. 지원 intent 설계

MVP에서 지원하는 intent는 아래로 제한한다.

### 10-1. create_deal

설명:

- 거래 생성

필수:

- customer_id
- title

선택:

- expected_amount
- notes
- starts_at

실행 기반:

- `app/api/partner/deals/route.ts`
- 장기적으로는 `app/api/portal/deals/route.ts` 기반 통합 권장

### 10-2. update_deal

설명:

- 기존 거래 수정

MVP allowlist:

- title
- expected_amount
- notes
- current_stage
- starts_at

실행 기반:

- `app/api/portal/deals/[dealId]/route.ts`
- 저장소: `lib/partner-portal/repositories/deals.ts`

주의:

- 파트너용 `/api/partner/deals`에는 수정 경로가 없으므로 그대로 쓰지 않는다

### 10-3. create_meeting

설명:

- 미팅 일정 생성

필수:

- deal_id
- starts_at
- ends_at

선택:

- title
- timezone
- location
- description

실행 기반:

- `app/api/partner/calendar/route.ts`

### 10-4. create_installation

설명:

- 설치 일정 생성

필수:

- deal_id
- scheduled_start_at
- scheduled_end_at

선택:

- title
- timezone
- location
- assigned_team
- notes

실행 기반:

- `app/api/partner/installations/route.ts`

### 10-5. update_customer

설명:

- 고객 연락처 또는 기본 정보 수정

MVP allowlist:

- name
- contact_name
- email
- phone
- address
- business_number
- campus_name
- region_label
- notes

실행 기반:

- `app/api/partner/customers/[customerId]/route.ts`

### 10-6. update_calendar_event

설명:

- 미팅/설치 일정 시간, 제목, 메모 조정

현 상태:

- 코드베이스에 수정 API 없음

MVP 대응:

- 신규 API 필요

### 10-7. cancel_calendar_event

설명:

- 일정 취소 또는 상태 변경

현 상태:

- 미팅/설치 취소 API 없음

MVP 대응:

- 신규 API 필요
- 완전 삭제보다 `status = cancelled` 우선

## 11. 추천 액션 스키마

AI가 반환하는 1차 plan 스키마는 JSON 고정 구조로 설계한다.

```json
{
  "request_id": "uuid",
  "channel": "text",
  "raw_input": "강남 메가스터디 보광 캠퍼스 견적 1400만 추가",
  "context": {
    "screen": "calendar",
    "selected_date": "2026-04-12",
    "selected_deal_id": null,
    "timezone": "Asia/Seoul"
  },
  "intent": "create_deal",
  "confidence": 0.87,
  "target_entity_type": "customer",
  "target_candidates": [
    {
      "id": "customer-1",
      "label": "강남 메가스터디 / 보광 캠퍼스",
      "score": 0.93
    }
  ],
  "proposed_fields": {
    "customer_id": "customer-1",
    "title": "보광 캠퍼스 견적 추가",
    "expected_amount": 14000000,
    "notes": null
  },
  "missing_fields": [],
  "calendar_effect": {
    "type": "none"
  },
  "requires_confirmation": true,
  "warnings": []
}
```

## 12. API 세트 제안

MVP는 `plan`, `preview`, `execute`를 분리한다.

### 12-1. `POST /api/partner/ai-actions/transcribe`

목적:

- 음성 파일 업로드 후 텍스트 변환

입력:

- multipart audio
- locale
- screen context

출력:

- transcript
- duration_ms
- provider

### 12-2. `POST /api/partner/ai-actions/plan`

목적:

- 자유 입력을 intent와 필드 제안으로 구조화

입력:

- raw_input
- channel: text | voice
- transcript optional
- screen context
- selected ids optional

출력:

- action plan JSON

특징:

- write 없음
- 모델 호출만 수행
- 파일 기반 current API와 달리 plain text 응답 금지

### 12-3. `POST /api/partner/ai-actions/preview`

목적:

- 후보 엔터티를 해소하고 실제 write payload를 확정

입력:

- request_id
- chosen target ids
- patched fields

출력:

- 실행 요약
- 최종 payload
- diff
- confirmation_token

### 12-4. `POST /api/partner/ai-actions/execute`

목적:

- 확인된 작업만 실제 실행

입력:

- request_id
- confirmation_token
- idempotency_key
- final payload

출력:

- result_type
- entity ids
- success message
- refresh hints

### 12-5. supporting reads

아래 supporting read를 AI layer가 내부적으로 사용한다.

- 거래 목록: `listDealListItems` in `lib/partner-portal/repositories/deals.ts`
- 거래 상세: `getDealDetailForPartnerAccount` in `lib/partner-portal/repositories/deals.ts`
- 고객 목록: 현재 `app/api/partner/customers/route.ts` 또는 저장소 직접 사용
- 캘린더 목록: `GET /api/partner/calendar`

### 12-6. 신규 캘린더 write API

MVP에서 캘린더 조정을 하려면 아래 API가 추가로 필요하다.

- `PATCH /api/partner/calendar/[eventId]`
  - title
  - starts_at
  - ends_at
  - timezone
  - location
  - description
  - status

- `PATCH /api/partner/installations/[installationId]`
  - scheduled_start_at
  - scheduled_end_at
  - timezone
  - location
  - assigned_team
  - notes
  - status

## 13. 엔터티 해석 전략

### 13-1. 1차 후보군은 규칙 기반으로 줄인다

LLM이 모든 레코드를 직접 읽지 않는다.

- 화면 컨텍스트 기반 우선순위
  - 캘린더 화면이면 일정 관련 거래 우선
  - 선택 날짜가 있으면 해당 날짜 주변 이벤트 우선
  - 선택 거래가 있으면 해당 거래 우선
- 문자열 매칭
  - 고객명
  - 캠퍼스명
  - 거래 제목
  - 최근 활동 요약
- 최근 수정 순/최근 열람 순 가중치

### 13-2. 2차 판단은 LLM이 한다

후보 3~10개 정도로 줄인 뒤 LLM이 가장 적절한 대상을 선택하거나 "ambiguity"를 반환한다.

### 13-3. ambiguity는 실패가 아니라 정상 상태다

다음 경우에는 강제로 사용자 선택으로 보낸다.

- 동일 고객명이 2건 이상
- 거래 제목이 유사하지만 금액/단계가 다름
- 일정 후보가 여러 건
- confidence가 threshold 미만

## 14. 확인, 중복 방지, 감사 로그 요구사항

### 14-1. confirmation 필수

아래 intent는 항상 confirmation을 거친다.

- create_deal
- update_deal
- create_meeting
- create_installation
- update_customer
- update_calendar_event
- cancel_calendar_event

### 14-2. idempotency 필수

실행 시 모든 write에는 `idempotency_key`를 붙인다.

권장 포맷:

- `partnerUserId + request_id + normalized_intent_hash`

저장 방식:

- 신규 테이블 `ai_action_executions`
- unique index on `idempotency_key`

### 14-3. 감사 로그는 기존 activity log와 별도 레이어를 둔다

기존 `activity_logs`는 비즈니스 변경 로그로 유지한다.

추가로 필요한 테이블:

- `ai_action_requests`
  - request_id
  - user_id
  - raw_input
  - transcript
  - channel
  - screen
  - status
  - created_at

- `ai_action_plans`
  - request_id
  - model
  - prompt_version
  - intent
  - confidence
  - plan_json
  - warnings

- `ai_action_executions`
  - request_id
  - confirmation_token_hash
  - idempotency_key
  - final_payload_json
  - execution_status
  - result_json

### 14-4. 비즈니스 로그 연결

실행 성공 시 아래 두 로그가 모두 남아야 한다.

- AI action log
- 기존 `activity_logs`

## 15. 캘린더 화면 구체안

### 15-1. 캘린더에서 추가 가능한 명령

MVP command set:

- "내일 오후 2시 리더스 분당 미팅 추가"
- "보광 캠퍼스 설치 일정 4월 20일 오전 9시로 잡아줘"
- "이 일정 한 시간 뒤로 미뤄"
- "이 일정 메모에 사다리차 필요 추가"
- "이 일정 취소 처리해"

### 15-2. 캘린더에서의 컨텍스트 규칙

캘린더에서 실행기를 열면 아래를 기본 컨텍스트로 전달한다.

- selected_date
- active_filter
- currently_selected_event_id
- screen = calendar

### 15-3. 캘린더 UI 세부 패턴

#### A. 날짜 셀에서 실행기 열기

- 날짜 셀 탭
- 선택 상태 유지
- FAB 열기
- 추천 액션 최상단에 `이 날짜에 일정 추가`

#### B. 선택 날짜 상세 패널에서 빠른 조정

- 이벤트 카드마다 `빠른 조정` 버튼
- 누르면 실행기가 해당 event context로 열림
- 추천 액션:
  - 시간 변경
  - 메모 수정
  - 설치팀 수정
  - 취소

#### C. 리스트 카드에서 직접 편집 진입

- 이벤트 카드의 더보기 메뉴 대신 실행기를 호출
- AI가 아닌 수동 편집으로도 이동 가능해야 함

### 15-4. 캘린더에 필요한 신규 상태 처리

- execute 성공 시 `router.refresh()`만으로 끝내지 않고 로컬 상태 재검증
- 날짜 셀, 상세 패널, 리스트가 동시에 갱신되어야 함
- 일정 수정 시 기존 선택 날짜가 바뀌면 선택 상태 이동 필요

## 16. 기술 구조 제안

### 16-1. 프론트엔드 구성

신규 구성 요소:

- `components/partner-portal/mobile/MobileActionLauncher.tsx`
- `components/partner-portal/mobile/ActionBottomSheet.tsx`
- `components/partner-portal/mobile/VoiceRecorder.tsx`
- `components/partner-portal/mobile/ActionPreviewCard.tsx`
- `components/partner-portal/mobile/DisambiguationList.tsx`
- `components/partner-portal/mobile/MissingFieldForm.tsx`

페이지별 연결:

- 홈: `components/partner-portal/home/PartnerPortalHome.tsx`
- 워크스페이스: `app/partner/(portal)/workspace/page.tsx`
- 캘린더: `app/partner/(portal)/calendar/page.tsx`

### 16-2. 백엔드 구성

신규 route:

- `app/api/partner/ai-actions/transcribe/route.ts`
- `app/api/partner/ai-actions/plan/route.ts`
- `app/api/partner/ai-actions/preview/route.ts`
- `app/api/partner/ai-actions/execute/route.ts`
- `app/api/partner/calendar/[eventId]/route.ts`
- `app/api/partner/installations/[installationId]/route.ts`

신규 service:

- `lib/partner-portal/ai/action-plan.ts`
- `lib/partner-portal/ai/entity-resolution.ts`
- `lib/partner-portal/ai/action-preview.ts`
- `lib/partner-portal/ai/action-execute.ts`
- `lib/partner-portal/ai/action-audit.ts`

### 16-3. 모델 사용 방식

현재 Gemini 기반 코드는 text generation 위주다.

- `app/api/admin/blog/ai/route.ts`
- `app/api/admin/marketing/ai/route.ts`
- `lib/automation-engine.ts`

MVP에서는 이를 그대로 복사하지 않고 아래 원칙으로 재사용한다.

- 모델 공급자는 Gemini 유지 가능
- 응답 형식은 구조화 JSON 고정
- prompt에 직접 write 지시 금지
- write는 server action layer에서만 수행

## 17. 단계별 구현 순서

### Phase 0. 기반 정리

- 모바일에서 포털 상단 내비/버튼 밀집 문제 정리
- FAB가 기존 플로팅 UI와 충돌하지 않도록 route별 노출 규칙 정리
- 공통 바텀시트 컴포넌트 추가

완료 기준:

- 홈/워크스페이스/캘린더에서 동일한 FAB 노출
- 모바일 viewport에서 가림/충돌 없음

### Phase 1. 수동 플로팅 실행기

- AI 없이 플로팅 실행기 추가
- 기존 거래/고객/일정 다이얼로그를 실행기에서 열 수 있게 연결
- 캘린더에서 selected date context 연결

완료 기준:

- 기존 기능을 플로팅 진입점으로 재사용 가능

### Phase 2. 음성 입력과 STT

- 녹음 UI
- 파일 업로드
- transcript 결과 미리보기

완료 기준:

- 모바일 iOS Safari, Chrome Android에서 녹음 성공
- 변환 텍스트가 preview로 노출

### Phase 3. AI plan/preview

- plan API 추가
- candidate resolution
- preview 카드 구현

완료 기준:

- create_deal, create_meeting, update_customer 3개 intent가 preview까지 동작

### Phase 4. execute와 감사 로그

- execute API
- confirmation token
- idempotency key
- AI action audit table

완료 기준:

- 중복 탭/재시도에도 중복 생성 방지
- 성공/실패 로그 조회 가능

### Phase 5. 캘린더 수정

- calendar patch API
- installation patch API
- 캘린더 quick adjust

완료 기준:

- 시간 이동, 메모 수정, 취소가 캘린더 내에서 가능

## 18. 수용 기준

### 18-1. 제품 수용 기준

- 모바일 홈/워크스페이스/캘린더에서 FAB가 항상 접근 가능하다
- 사용자는 3탭 이내로 거래/일정/고객 수정을 실행할 수 있다
- 캘린더에서 일정 추가와 조정이 모두 가능하다

### 18-2. AI 수용 기준

- plan 응답은 항상 구조화 JSON이다
- ambiguity를 숨기지 않고 사용자에게 노출한다
- confirmation 없이 write가 발생하지 않는다
- 같은 요청 재전송 시 중복 생성이 발생하지 않는다

### 18-3. 운영 수용 기준

- 누가 어떤 입력으로 어떤 액션을 실행했는지 추적 가능하다
- 기존 activity log와 연결된다
- 실패 로그를 기반으로 재현 가능하다

## 19. 리스크와 대응

| 리스크 | 설명 | 대응 |
| --- | --- | --- |
| 모바일 상단 UI 과밀 | 기존 PortalNav와 빠른 버튼이 이미 빽빽함 | 모바일에서 상단 버튼 축소, FAB 중심 전환 |
| 음성 인식 불안정 | 브라우저별 지원 차이 | 기본은 MediaRecorder + 서버 STT |
| 잘못된 엔터티 선택 | 고객/거래명이 유사함 | 후보 리스트, confidence threshold, confirmation 강제 |
| 중복 생성 | 네트워크 재시도/중복 탭 | idempotency key와 execution table |
| 캘린더 수정 API 부재 | 현재는 생성만 존재 | PATCH route 추가 후 MVP 범위 제한 |
| activity log만으로 AI 감사 부족 | 모델 판단 근거 추적 불가 | AI action audit 별도 저장 |

## 20. QA 매트릭스

### 20-1. 디바이스

- iPhone Safari
- Android Chrome
- Samsung Internet 실제 단말 확인

### 20-2. 시나리오

- 텍스트로 거래 생성
- 음성으로 거래 생성
- 고객 연락처 수정
- 미팅 일정 생성
- 설치 일정 생성
- 캘린더에서 일정 시간 조정
- ambiguity 처리
- missing field 처리
- 중복 탭 방지
- 인증 만료 처리

### 20-3. 실패 케이스

- deal_id 미확정
- 여러 후보 충돌
- 음성 업로드 실패
- STT 실패
- plan 실패
- execute 실패
- refresh 후 로컬 상태 불일치

## 21. 다음 구현 세션에 넘길 작업 묶음

다음 세션에서는 아래 순서로 바로 시작하면 된다.

1. `MobileActionLauncher`와 바텀시트 골격 추가
2. 홈/워크스페이스/캘린더에 FAB 연결
3. `POST /api/partner/ai-actions/plan` 라우트 뼈대 생성
4. 거래 생성, 고객 수정, 미팅 생성 3 intent만 먼저 지원
5. preview/confirmation UI 추가
6. execute + idempotency + audit 추가
7. 마지막으로 캘린더 patch API 추가

## 22. 구현 세션 체크리스트

- 기존 공개용 `MobileFloatingCTA`와 충돌 여부 확인
- 포털 route에서 공개용 플로팅 위젯 숨김 처리
- 모바일 전용 바텀시트 overflow 처리
- 캘린더 selected date context를 launcher에 주입
- execute 이전에는 기존 write API 직접 호출 금지
- update_deal은 `/api/portal/deals/[dealId]` 기반으로 연결
- AI 응답은 plain text 금지, JSON schema 고정

