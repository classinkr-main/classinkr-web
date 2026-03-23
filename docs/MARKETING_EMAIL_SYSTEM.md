# 마케팅 이메일 시스템 — 패치 문서

> **브랜치**: `marketing_use`
> **작성일**: 2026-03-21
> **상태**: 구현 완료 (빌드 통과)

---

## 1. 시스템 개요

수신 동의(옵트인)한 리드에게 이름, 성향(태그)별로 개인화된 이메일/행사 초대를 발송하고,
관리자 페이지(`/admin/marketing`)에서 구독자 관리 및 캠페인 발송을 통합 관리하는 시스템.

---

## 2. 아키텍처 도식

```
┌─────────────────────────────────────────────────────────────────┐
│                        프론트엔드 (Next.js)                      │
│                                                                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────┐              │
│  │ DemoModal │  │ Footer   │  │ /admin/marketing │              │
│  │ (기존)    │  │ 뉴스레터 │  │ 관리자 대시보드   │              │
│  └─────┬─────┘  └─────┬────┘  └────────┬─────────┘              │
│        │              │                │                         │
└────────┼──────────────┼────────────────┼─────────────────────────┘
         │              │                │
         ▼              ▼                ▼
┌────────────────────────────────────────────────────────────────┐
│                      API 라우트 (서버)                          │
│                                                                 │
│  /api/lead ──────────┐  /api/newsletter/subscribe               │
│  (기존 + 연동 추가)   │  /api/newsletter/unsubscribe            │
│                      │                                          │
│                      ▼                                          │
│              ┌──────────────┐   /api/admin/subscribers           │
│              │ 구독자 DB    │←── (CRUD)                          │
│              │ subscribers  │                                    │
│              │ .json        │   /api/admin/email/send            │
│              └──────┬───────┘──→ 이메일 발송                     │
│                     │           (웹훅 → 외부 서비스)             │
│              ┌──────┴───────┐                                    │
│              │ 캠페인 이력  │   /api/admin/email                 │
│              │ email-       │←── (이력 조회)                     │
│              │ campaigns    │                                    │
│              │ .json        │                                    │
│              └──────────────┘                                    │
└────────────────────────────────────────────────────────────────┘
         │                              │
         ▼                              ▼
┌──────────────────┐    ┌──────────────────────────┐
│ 기존 웹훅 연동    │    │ 이메일 발송 서비스        │
│ • Google Sheets  │    │ • EMAIL_WEBHOOK_URL       │
│ • Channel Talk   │    │ (Make / n8n / Zapier)     │
│ • Custom Webhook │    │ 또는 Resend / Brevo       │
└──────────────────┘    └──────────────────────────┘
```

---

## 3. 데이터 흐름 상세

### 3-1. 구독자 유입 경로

```
                ┌─── DemoModal 제출 ──→ /api/lead ──→ [NOTE-24] 자동 등록
                │
사용자 ─────────┼─── Contact 문의 ───→ /api/lead ──→ [NOTE-24] 자동 등록
                │
                └─── 뉴스레터 구독 ──→ /api/newsletter/subscribe ──→ 직접 등록

관리자 ─────────────── 수동 추가 ───→ /api/admin/subscribers ──→ 직접 등록
```

### 3-2. 이메일 발송 흐름

```
관리자 (admin/marketing)
    │
    ├─ 1. 제목/본문 작성 ({name}, {org}, {role} 변수 사용)
    ├─ 2. 대상 태그 선택 (빈=전체)
    └─ 3. 발송 버튼 클릭
         │
         ▼
    /api/admin/email/send
         │
         ├─ ① getActiveSubscribersByTags() → 대상 필터링 [NOTE-8]
         ├─ ② {name} 변수 치환 → personalizedBody 생성 [NOTE-12]
         ├─ ③ EMAIL_WEBHOOK_URL로 전달 (또는 시뮬레이션) [NOTE-11]
         └─ ④ 캠페인 이력 저장 [NOTE-3]
```

### 3-3. 수신거부 흐름

```
수신자 (이메일 하단 링크 클릭)
    │
    └─ GET /api/newsletter/unsubscribe?email=xxx
         │
         ├─ status: "active" → "unsubscribed" [NOTE-7]
         ├─ unsubscribedAt 타임스탬프 기록
         └─ 확인 HTML 페이지 반환 [NOTE-16]
```

---

## 4. 신규 파일 목록

| 파일 경로 | 역할 | 주요 NOTE |
|-----------|------|-----------|
| `lib/marketing-types.ts` | 구독자, 캠페인, API 타입 정의 | NOTE-1~3 |
| `lib/marketing-data.ts` | JSON 파일 기반 CRUD 함수 | NOTE-4~8 |
| `app/api/admin/subscribers/route.ts` | 구독자 관리 API (GET/POST/DELETE) | NOTE-9~10 |
| `app/api/admin/email/route.ts` | 캠페인 이력 조회 API (GET) | |
| `app/api/admin/email/send/route.ts` | 이메일 발송 API (POST) | NOTE-11~13 |
| `app/api/newsletter/subscribe/route.ts` | 뉴스레터 구독 (공개) | NOTE-14~15 |
| `app/api/newsletter/unsubscribe/route.ts` | 수신거부 (공개, GET+POST) | NOTE-16 |
| `app/admin/marketing/page.tsx` | 관리자 마케팅 대시보드 | NOTE-21 |
| `components/admin/marketing/SubscriberTable.tsx` | 구독자 목록 테이블 | NOTE-17 |
| `components/admin/marketing/SubscriberForm.tsx` | 구독자 수동 추가 폼 | NOTE-18 |
| `components/admin/marketing/EmailComposer.tsx` | 이메일 작성/발송 UI | NOTE-19 |
| `components/admin/marketing/CampaignHistory.tsx` | 캠페인 이력 테이블 | NOTE-20 |
| `components/sections/NewsletterSubscribe.tsx` | 뉴스레터 간편 구독 컴포넌트 | NOTE-22~23 |
| `data/subscribers.json` | 구독자 데이터 (자동 생성) | |
| `data/email-campaigns.json` | 캠페인 이력 (자동 생성) | |

---

## 5. 수정된 기존 파일

| 파일 경로 | 변경 내용 | 주요 NOTE |
|-----------|----------|-----------|
| `app/api/lead/route.ts` | 리드 수집 시 구독자 DB 자동 등록 추가 | NOTE-24 |
| `components/sections/Footer.tsx` | 뉴스레터 구독 컴포넌트 삽입 | NOTE-25 |
| `app/admin/blog/page.tsx` | 마케팅 관리 네비게이션 링크 추가 | NOTE-21 |
| `.env.local` | `EMAIL_WEBHOOK_URL` 환경변수 추가 | |

---

## 6. 코드 각주(NOTE) 색인

| NOTE | 위치 | 설명 |
|------|------|------|
| NOTE-1 | marketing-types.ts | Subscriber 모델: 옵트인 시간/수신거부 시간 관리 |
| NOTE-2 | marketing-types.ts | Tags 시스템: 성향별 세그먼트 분류 |
| NOTE-3 | marketing-types.ts | EmailCampaign: 외부 서비스 연동용 externalId |
| NOTE-4 | marketing-data.ts | JSON 파일 기반 → Supabase 전환 포인트 |
| NOTE-5 | marketing-data.ts | 파일 잠금 미구현 (DB 전환 시 해결) |
| NOTE-6 | marketing-data.ts | 구독자 upsert: 중복 방지 + 재구독 복원 |
| NOTE-7 | marketing-data.ts | 수신거부: 삭제가 아닌 status 변경 (법적 증빙) |
| NOTE-8 | marketing-data.ts | 태그 기반 OR 필터링 (전체/세그먼트) |
| NOTE-9 | admin/subscribers | Bearer Token 인증 (기존 체계 통일) |
| NOTE-10 | admin/subscribers | 수동 추가 시 source="manual" 구분 |
| NOTE-11 | admin/email/send | 웹훅 기반 발송 전략 (Make/n8n/Zapier) |
| NOTE-12 | admin/email/send | {name}, {org}, {role} 개인화 변수 치환 |
| NOTE-13 | admin/email/send | 웹훅 미설정 시 시뮬레이션 모드 |
| NOTE-14 | newsletter/subscribe | 공개 엔드포인트 (인증 불필요) |
| NOTE-15 | newsletter/subscribe | Google Sheets 웹훅 병행 기록 |
| NOTE-16 | newsletter/unsubscribe | 원클릭 수신거부 + 확인 HTML 페이지 |
| NOTE-17 | SubscriberTable | 태그 뱃지, 상태 표시 |
| NOTE-18 | SubscriberForm | PRESET_TAGS 빠른 선택 |
| NOTE-19 | EmailComposer | 미리보기 모드 (변수 치환 확인) |
| NOTE-20 | CampaignHistory | 발송 이력 읽기 전용 테이블 |
| NOTE-21 | admin/marketing | 관리자 대시보드 3탭 구성 |
| NOTE-22 | NewsletterSubscribe | Footer/CTA 배치용 구독 컴포넌트 |
| NOTE-23 | NewsletterSubscribe | 옵트인 동의 문구 (법적 필수) |
| NOTE-24 | api/lead | 리드 → 구독자 자동 연동 |
| NOTE-25 | Footer | 뉴스레터 구독 영역 삽입 |

---

## 7. 환경변수

```env
# 기존
ADMIN_PASSWORD=         # 관리자 인증 (블로그 + 마케팅 공용)
GOOGLE_SHEET_WEBHOOK_URL=  # Google Sheets 연동
LEAD_WEBHOOK_URL=       # 범용 웹훅
CHANNEL_TALK_WEBHOOK_URL=  # 채널톡

# 신규
EMAIL_WEBHOOK_URL=      # 이메일 발송 웹훅 (Make/n8n/Zapier)
                        # 미설정 시 시뮬레이션 모드
```

---

## 8. 향후 마이그레이션 가이드

### 8-1. Supabase 전환 시

```
현재: JSON 파일 (data/subscribers.json, data/email-campaigns.json)
전환: Supabase PostgreSQL 테이블

변경 범위: lib/marketing-data.ts 내부 구현만 변경
          함수 시그니처(getAllSubscribers, upsertSubscriber 등)는 유지
```

### 8-2. Resend 직접 연동 시

```
현재: EMAIL_WEBHOOK_URL → 외부 자동화 서비스가 발송
전환: Resend SDK로 서버에서 직접 발송

변경 범위: app/api/admin/email/send/route.ts의 발송 로직
          npm install resend 후 SDK 호출로 교체
```

### 8-3. 수신 동의 명시적 옵트인 전환

```
현재: 데모 신청 시 자동 구독 (옵트아웃 방식)
전환: DemoModal에 "마케팅 이메일 수신 동의" 체크박스 추가

변경 범위: DemoModal 폼에 체크박스 추가
          submitLead 호출 시 marketingConsent: true/false 전달
          /api/lead에서 marketingConsent === true일 때만 등록
```

---

## 9. 관리자 페이지 사용법

1. `/admin/marketing` 접속 → 기존 비밀번호로 로그인
2. **구독자 관리 탭**: 목록 조회, 태그/상태 필터, 수동 추가, 삭제
3. **이메일 발송 탭**: 제목/본문 작성 → 태그 선택 → 미리보기 → 발송
4. **발송 이력 탭**: 캠페인별 발송 상태, 수신자 수, 대상 태그 확인

> 블로그 관리(`/admin/blog`)와 마케팅 관리(`/admin/marketing`) 간
> 상단 네비게이션 링크로 즉시 전환 가능.
