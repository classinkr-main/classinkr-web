# Classin Home — Supabase 백엔드 마스터플랜

기준 시점: 2026-03-24 (rev.2)
브랜치: `claude/supa`
목적: 현재 JSON 파일 기반 → Supabase 전환 전략 + 중장기 가치 성장 로드맵

---

## 목차

1. [현재 상태 진단](#1-현재-상태-진단)
2. [Supabase 전환 아키텍처](#2-supabase-전환-아키텍처)
3. [데이터베이스 스키마 설계](#3-데이터베이스-스키마-설계)
4. [안전한 백엔드 이전 전략](#4-안전한-백엔드-이전-전략)
5. [관리자 페이지 Supabase 연동](#5-관리자-페이지-supabase-연동)
6. [테이블 도메인 분류 (Company / Customer / Content / Storage)](#6-테이블-도메인-분류)
7. [구현 로드맵 (Phase 1~5)](#7-구현-로드맵)
8. [가치 성장 전략](#8-가치-성장-전략)
9. [기술 결정 사항](#9-기술-결정-사항)
10. [리스크와 대응](#10-리스크와-대응)

---

## 1. 현재 상태 진단

### 1-1. 이미 갖춰진 것 (강점)

| 영역 | 상태 | 비고 |
|------|------|------|
| **Supabase 클라이언트** | ✅ 완료 | `lib/supabase/` — server, browser, admin, middleware 4종 세팅 |
| **Next.js 16 App Router** | ✅ 완료 | SSR/SSG 혼합 가능 |
| **Admin UI 골격** | ✅ 완료 | 대시보드, 블로그 CMS, CRM, 마케팅, 캘린더 등 12개 메뉴 |
| **블로그 CMS** | ✅ 완료 | CRUD + Markdown + 상태관리(draft/published/archived) + 소프트딜리트 |
| **이메일 마케팅** | ✅ 완료 | 구독자 관리, 캠페인 작성/발송, 태그 세그멘테이션 |
| **리드 수집** | ✅ 완료 | 웹훅 연동(Google Sheets, Make, Zapier, Channel Talk) |
| **랜딩 페이지** | ✅ 완료 | Hero + 12개 섹션, 반응형 |
| **설계 문서** | ✅ 완료 | PRD, 백엔드 설계서, 체크리스트, 스키마 계획 |

### 1-2. 해결해야 할 것 (약점)

| 문제 | 영향 | 심각도 |
|------|------|--------|
| **JSON 파일 저장소** | 동시 쓰기 충돌, 데이터 유실 위험, 배포 시 초기화 | 🔴 Critical |
| **패스워드 기반 인증** | 보안 취약, 역할 관리 불가 | 🔴 Critical |
| **RLS/접근제어 부재** | 데이터 노출 위험 | 🟡 High |
| **이미지 외부 의존** | URL 깨짐, 관리 불가 | 🟡 High |
| **분석 데이터 미수집** | 마케팅 ROI 측정 불가 | 🟡 High |
| **검색/필터링 한계** | JSON 전체 로드 후 필터 | 🟢 Medium |

### 1-3. 아키텍처 현황

```
현재:
┌─────────────┐    ┌──────────────┐    ┌────────────┐
│  Next.js    │───▶│  JSON Files  │    │  Webhooks  │
│  (SSR/SSG)  │    │  (data/*.json)│    │  (외부)     │
│  + Admin UI │    └──────────────┘    └────────────┘
└─────────────┘
      │
      ▼
┌─────────────┐
│ Supabase    │  ← 클라이언트만 세팅됨, 실제 DB 사용 안 함
│ (미사용)     │
└─────────────┘
```

---

## 2. Supabase 전환 아키텍처

### 2-1. 목표 아키텍처

```
목표:
┌─────────────────────────────────────────────────────────┐
│                    Next.js 16 App Router                 │
│  ┌──────────┐  ┌──────────────┐  ┌───────────────────┐  │
│  │ Public   │  │ Admin (SSR)  │  │ API Routes        │  │
│  │ (SSG)    │  │ + Auth Guard │  │ /api/admin/*      │  │
│  └────┬─────┘  └──────┬───────┘  └─────────┬─────────┘  │
│       │               │                    │             │
│       ▼               ▼                    ▼             │
│  ┌─────────────────────────────────────────────────┐     │
│  │              lib/supabase/ (기존)                │     │
│  │  browser.ts | server.ts | admin.ts | middleware │     │
│  └──────────────────────┬──────────────────────────┘     │
└─────────────────────────┼────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│                    Supabase Cloud                        │
│  ┌──────────┐  ┌──────────┐  ┌─────────┐  ┌─────────┐  │
│  │ Postgres │  │   Auth   │  │ Storage │  │  Edge   │  │
│  │ + RLS    │  │ (Email)  │  │ (이미지) │  │Functions│  │
│  └──────────┘  └──────────┘  └─────────┘  └─────────┘  │
│  ┌──────────┐  ┌──────────┐                              │
│  │ Realtime │  │  Cron    │                              │
│  │ (추후)   │  │ (추후)   │                              │
│  └──────────┘  └──────────┘                              │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│               외부 연동                                   │
│  Google Sheets │ Resend │ Channel Talk │ GA/Meta/Kakao   │
└─────────────────────────────────────────────────────────┘
```

### 2-2. 핵심 설계 원칙

1. **점진적 전환** — JSON → Supabase를 한 번에 바꾸지 않고, 테이블별로 전환
2. **듀얼 모드** — 전환 중에는 fallback으로 JSON도 읽을 수 있게 유지
3. **기존 UI 보존** — 어드민 UI는 그대로 두고 데이터 레이어만 교체
4. **타입 안전** — Supabase CLI로 DB 타입 자동 생성, 기존 TypeScript 타입과 매핑

---

## 3. 데이터베이스 스키마 설계

### 3-1. 전체 ERD

```
┌─────────────────┐
│   auth.users    │ (Supabase 관리)
│   id, email     │
└────────┬────────┘
         │
    ┌────┴────────────────────────────────────────┐
    │                    │                        │
    ▼                    ▼                        ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────────┐
│admin_profiles│  │  blog_posts  │  │   audit_logs     │
│role, status  │  │slug, status  │  │action, target    │
└──────────────┘  └──────┬───────┘  └──────────────────┘
                         │
              ┌──────────┼──────────┐
              ▼          ▼          ▼
     ┌──────────┐ ┌──────────┐ ┌─────────────┐
     │blog_post │ │blog_post │ │blog_post    │
     │_revisions│ │_tags     │ │_categories  │
     └──────────┘ └──────────┘ └─────────────┘

┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│   leads      │  │ subscribers  │  │  campaigns   │
│source, status│  │tags, status  │  │subject, body │
└──────────────┘  └──────────────┘  └──────┬───────┘
                                           │
                                    ┌──────┴───────┐
                                    │campaign_logs │
                                    │delivery info │
                                    └──────────────┘

┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│    events    │  │    bugs      │  │   roadmap    │
│date, location│  │status, pri   │  │status, pri   │
└──────────────┘  └──────────────┘  └──────────────┘
```

### 3-2. 핵심 테이블 상세

#### `admin_profiles`

```sql
CREATE TABLE admin_profiles (
  user_id       UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name  TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('SUPER_ADMIN','ADMIN','EDITOR','VIEWER')),
  status        TEXT NOT NULL DEFAULT 'INVITED' CHECK (status IN ('INVITED','ACTIVE','SUSPENDED')),
  invited_by    UUID REFERENCES auth.users(id),
  last_login_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);
```

#### `blog_posts` (확장 버전)

```sql
CREATE TABLE blog_posts (
  id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title               TEXT NOT NULL,
  slug                TEXT NOT NULL UNIQUE,
  excerpt             TEXT,
  content_markdown    TEXT,          -- 기존 contentMarkdown 호환
  content_html        TEXT,          -- 렌더링 캐시
  category            TEXT,
  tags                TEXT[] DEFAULT '{}',
  author_name         TEXT,          -- 표시용 작성자명
  author_role         TEXT,          -- 작성자 직책
  author_bio          TEXT,
  author_avatar_url   TEXT,
  author_user_id      UUID REFERENCES auth.users(id),
  read_time           TEXT,
  image_url           TEXT,          -- 썸네일
  hero_image_url      TEXT,          -- 상세 히어로
  featured            BOOLEAN DEFAULT FALSE,
  status              TEXT NOT NULL DEFAULT 'DRAFT'
                      CHECK (status IN ('DRAFT','IN_REVIEW','PUBLISHED','ARCHIVED')),
  seo_title           TEXT,
  seo_description     TEXT,
  benefit_items       TEXT[] DEFAULT '{}',
  target_reader       TEXT,
  cta_text            TEXT,
  cta_url             TEXT,
  cta_style           TEXT DEFAULT 'primary',
  related_post_ids    UUID[] DEFAULT '{}',
  published_at        TIMESTAMPTZ,
  published_by        UUID REFERENCES auth.users(id),
  deleted_at          TIMESTAMPTZ,   -- 소프트딜리트
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- 인덱스
CREATE INDEX idx_blog_posts_slug ON blog_posts(slug);
CREATE INDEX idx_blog_posts_status ON blog_posts(status);
CREATE INDEX idx_blog_posts_category ON blog_posts(category);
CREATE INDEX idx_blog_posts_published_at ON blog_posts(published_at DESC);
```

#### `leads`

```sql
CREATE TABLE leads (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  source      TEXT NOT NULL,            -- 'demo_modal', 'contact_page', etc.
  name        TEXT,
  org         TEXT,                      -- 학원명
  role        TEXT,                      -- 원장/관리자/강사
  size        TEXT,                      -- 학생 수 규모
  email       TEXT,
  phone       TEXT,
  message     TEXT,
  branch      TEXT,
  status      TEXT NOT NULL DEFAULT 'new'
              CHECK (status IN ('new','contacted','converted','closed')),
  notes       TEXT,
  utm_source  TEXT,                      -- 마케팅 추적용
  utm_medium  TEXT,
  utm_campaign TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);
```

#### `subscribers`

```sql
CREATE TABLE subscribers (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name            TEXT NOT NULL,
  email           TEXT NOT NULL UNIQUE,
  org             TEXT,
  role            TEXT,
  size            TEXT,
  phone           TEXT,
  tags            TEXT[] DEFAULT '{}',
  status          TEXT NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active','unsubscribed')),
  source          TEXT NOT NULL DEFAULT 'manual',
  opt_in_at       TIMESTAMPTZ DEFAULT NOW(),
  unsubscribed_at TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
```

#### `email_campaigns`

```sql
CREATE TABLE email_campaigns (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  subject         TEXT NOT NULL,
  body            TEXT NOT NULL,          -- HTML
  target_tags     TEXT[] DEFAULT '{}',    -- 비어있으면 전체 발송
  status          TEXT NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft','sending','sent','failed')),
  sent_at         TIMESTAMPTZ,
  recipient_count INT DEFAULT 0,
  external_id     TEXT,                   -- Resend/Brevo 외부 ID
  created_by      UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
```

#### `audit_logs`

```sql
CREATE TABLE audit_logs (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  actor_user_id   UUID REFERENCES auth.users(id),
  action          TEXT NOT NULL,          -- 'post.publish', 'user.suspend', etc.
  target_type     TEXT NOT NULL,          -- 'blog_post', 'subscriber', etc.
  target_id       TEXT,                   -- 대상 PK (UUID or string)
  payload         JSONB,                  -- 변경 전후 데이터
  ip_address      TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
```

### 3-3. RLS 정책 설계

```sql
-- blog_posts: 공개 읽기 (PUBLISHED만), 관리자 전체 접근
ALTER TABLE blog_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read published posts"
  ON blog_posts FOR SELECT
  USING (status = 'PUBLISHED' AND deleted_at IS NULL);

CREATE POLICY "Admins can do everything"
  ON blog_posts FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM admin_profiles
      WHERE user_id = auth.uid()
      AND status = 'ACTIVE'
    )
  );

-- leads, subscribers, campaigns: 관리자만 접근
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscribers ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_campaigns ENABLE ROW LEVEL SECURITY;

-- 공개 리드 삽입은 서비스 롤 또는 anon INSERT 정책으로 처리
CREATE POLICY "Anyone can submit leads"
  ON leads FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Admins manage leads"
  ON leads FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM admin_profiles
      WHERE user_id = auth.uid()
      AND status = 'ACTIVE'
    )
  );
```

---

## 4. 안전한 백엔드 이전 전략

> **핵심 질문:** 7개 JSON 파일 + 28개 CRUD 함수가 돌아가는 상태에서 어떻게 안전하게 Supabase로 옮기는가?

### 4-0. 전환 원칙

| 원칙 | 설명 |
|------|------|
| **함수 시그니처 유지** | `getAllPosts()`, `createPost()` 등 기존 함수명/파라미터/리턴타입 그대로 유지 |
| **환경변수 스위치** | `USE_SUPABASE_BLOG=true` 하나로 JSON↔Supabase 전환 |
| **테이블별 독립 전환** | blog 먼저, 그다음 leads, 그다음 subscribers — 한 번에 바꾸지 않음 |
| **JSON 백업 유지** | 전환 완료 확인 전까지 `data/*.json` 삭제하지 않음 |
| **시드 스크립트** | 기존 JSON 데이터를 Supabase로 밀어넣는 1회성 스크립트 작성 |
| **듀얼 모드 운영** | 전환 중에는 `USE_SUPABASE_*=false` 로 즉시 롤백 가능 |

### 4-1. 현재 백엔드 데이터 흐름 전체 맵

```
┌─────────── 공개 진입점 ───────────┐
│  Demo Modal   Contact Page   Newsletter │
│       └──────────┬──────────┘         │
└──────────────────┼────────────────────┘
                   ▼
          POST /api/lead
                   │
         ┌─────────┼─────────┐
         ▼         ▼         ▼
    leads.json  Webhooks  Auto-subscribe
    (db.ts)     (외부)    (subscribers.json)
                          (marketing-data.ts)
                                │
                   POST /api/newsletter/subscribe
                                │
                                ▼
                        subscribers.json

┌─────────── 관리자 영역 ──────────────────────────────────┐
│  /admin/blog     → blog-data.ts    → blog-posts.json     │
│  /admin/crm      → db.ts           → leads.json          │
│  /admin/marketing→ marketing-data.ts→ subscribers.json    │
│                                     → email-campaigns.json│
│  /admin/calendar → calendar-data.ts → calendar-events.json│
│  /admin/settings → db.ts           → settings.json        │
│  /admin/dev      → bugs-data.ts    → bugs.json            │
│                  → roadmap-data.ts  → roadmap.json         │
│                  → patch-notes-data.ts→ patch-notes.json   │
│                                                            │
│  인증: ADMIN_USERS env → Base64 쿠키 (admin_session)      │
└────────────────────────────────────────────────────────────┘
```

### 4-2. 전환 순서 (위험도 + 의존성 기준)

```
1단계: leads         ← 공개 API에서 직접 INSERT, 가장 중요
2단계: blog_posts    ← 어드민 CMS 핵심 + 공개 /blog 페이지
3단계: subscribers   ← leads에서 auto-subscribe 의존
4단계: campaigns     ← subscribers 테이블 의존
5단계: calendar, bugs, roadmap, patch-notes ← 내부 도구, 위험도 낮음
6단계: settings      ← 단일 레코드, 마지막에 정리
```

### 4-3. Repository Pattern 구현 예시

```typescript
// lib/repositories/leads.ts
import { createServerClient } from '@/lib/supabase/server';
import * as jsonDb from '@/lib/db';  // 기존 JSON

const USE_SUPABASE = process.env.USE_SUPABASE_LEADS === 'true';

export async function getLeads() {
  if (USE_SUPABASE) {
    const supabase = await createServerClient();
    const { data, error } = await supabase
      .from('leads')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data;
  }
  return jsonDb.getLeads(); // JSON fallback
}

export async function saveLead(payload: LeadPayload) {
  if (USE_SUPABASE) {
    const supabase = await createServerClient();
    const { data, error } = await supabase
      .from('leads')
      .insert({
        source: payload.source,
        name: payload.name,
        email: payload.email,
        // ... 매핑
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  }
  return jsonDb.saveLead(payload);
}
```

### 4-4. 전환 검증 체크리스트 (테이블별)

각 테이블 전환 시 아래를 통과해야 스위치 ON:

```
□ 시드 스크립트로 기존 데이터 이관 완료
□ 어드민 UI에서 CRUD 정상 동작 확인
□ 공개 페이지 (해당 시) 정상 조회 확인
□ RLS 정책: 비로그인 사용자가 관리자 데이터 접근 불가 확인
□ 에러 핸들링: Supabase 에러 → 사용자 친화적 메시지
□ 롤백 테스트: USE_SUPABASE_*=false 시 JSON으로 정상 복귀
```

### 4-5. 데이터 이전 순서

```
1단계: blog_posts     (가장 복잡, 가장 중요)
2단계: leads          (공개 폼 연동 필요)
3단계: subscribers    (이메일 마케팅 연동)
4단계: campaigns      (subscribers 이후)
5단계: bugs, roadmap, calendar, patch-notes  (내부 도구)
6단계: settings       (key-value → Supabase 또는 env)
```

### 4-2. 전환 패턴 (Repository Pattern)

```typescript
// lib/blog/repository.ts — 전환 중 듀얼 모드 예시
import { createServerClient } from '@/lib/supabase/server';

const USE_SUPABASE = process.env.USE_SUPABASE_BLOG === 'true';

export async function getPublishedPosts() {
  if (USE_SUPABASE) {
    const supabase = await createServerClient();
    const { data, error } = await supabase
      .from('blog_posts')
      .select('*')
      .eq('status', 'PUBLISHED')
      .is('deleted_at', null)
      .order('published_at', { ascending: false });
    if (error) throw error;
    return data;
  }
  // fallback to JSON
  return (await import('@/lib/blog-data')).getPublishedPosts();
}
```

### 4-3. 시드 데이터 이관 스크립트

```
scripts/
  seed-blog-posts.ts      — data/blog-posts.json → blog_posts 테이블
  seed-leads.ts            — data/leads.json → leads 테이블
  seed-subscribers.ts      — data/subscribers.json → subscribers 테이블
  seed-campaigns.ts        — data/email-campaigns.json → email_campaigns 테이블
  seed-admin.ts            — 최초 SUPER_ADMIN 생성
```

---

## 5. 관리자 페이지 Supabase 연동

> **핵심 질문:** 관리자 페이지도 Supabase와 연동해야 하는가? → **반드시 해야 함**

### 5-1. 현재 관리자 인증의 문제점

```
현재 플로우:
  .env → ADMIN_USERS=[{"name":"홍길동","password":"classin2014","role":"admin"}]
         ↓
  POST /api/admin/auth → 패스워드 비교
         ↓
  Base64(JSON) → admin_session 쿠키 (7일 만료)
         ↓
  verifyAdmin() → 쿠키 디코딩 → 역할 확인
```

| 문제 | 심각도 | 설명 |
|------|--------|------|
| **비밀번호 평문 저장** | 🔴 | `.env`에 비밀번호가 평문으로 들어있음 |
| **세션 위조 가능** | 🔴 | Base64 디코딩만으로 세션 내용 확인/위조 가능 |
| **역할 확장 불가** | 🟡 | admin/branch 2종뿐, EDITOR/VIEWER 추가 불가 |
| **초대 불가** | 🟡 | 새 관리자 추가 = `.env` 수정 + 재배포 필요 |
| **감사 로그 없음** | 🟡 | 누가 뭘 했는지 추적 불가 |
| **MFA 불가** | 🟢 | 2차 인증 추가할 인프라 없음 |

### 5-2. 목표 인증 플로우

```
목표 플로우:
  /admin/login → signInWithPassword() → Supabase Auth
         ↓
  Supabase 세션 쿠키 (자동 갱신, 안전한 토큰)
         ↓
  middleware.ts → Supabase 세션 검증
         ↓
  requirePermission() → admin_profiles 테이블 조회
         ↓
  역할 기반 접근 제어 (SUPER_ADMIN > ADMIN > EDITOR > VIEWER)
```

### 5-3. 어드민 페이지별 연동 계획

| 어드민 페이지 | 현재 데이터 소스 | 목표 | 변경 범위 |
|--------------|-----------------|------|----------|
| `/admin/login` | `ADMIN_USERS` env | `signInWithPassword()` | 🔴 전면 교체 |
| `/admin/blog` | `blog-data.ts` → JSON | `repositories/blog.ts` → Supabase | 🟡 데이터 레이어만 |
| `/admin/crm` | `db.ts` → JSON | `repositories/leads.ts` → Supabase | 🟡 데이터 레이어만 |
| `/admin/marketing` | `marketing-data.ts` → JSON | `repositories/subscribers.ts` → Supabase | 🟡 데이터 레이어만 |
| `/admin/users` | `.env` 읽기 | `admin_profiles` CRUD + 초대 UI | 🔴 전면 교체 |
| `/admin/settings` | `db.ts` → JSON | `site_settings` 테이블 또는 env | 🟢 소규모 |
| `/admin/calendar` | `calendar-data.ts` → JSON | `repositories/calendar.ts` → Supabase | 🟡 데이터 레이어만 |
| `/admin/overview` | 각 API 조합 | Supabase 집계 쿼리 / DB View | 🟡 쿼리 최적화 |
| `/admin/analytics` | 하드코딩 | Supabase 집계 + 외부 분석 연동 | 🟢 추후 |

**핵심 포인트:**
- **UI 컴포넌트는 바꾸지 않는다** — BlogPostTable, SubscriberTable 등 그대로
- **API Route 내부만 교체** — `lib/blog-data.ts` → `lib/repositories/blog.ts`
- **로그인 페이지만 전면 교체** — 나머지는 데이터 레이어 스위치

### 5-4. 권한 모델 적용

```typescript
// lib/auth/guards.ts
import { createServerClient } from '@/lib/supabase/server';

export async function requireSession() {
  const supabase = await createServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new AuthError('로그인이 필요합니다');
  return user;
}

export async function requireRole(...roles: AdminRole[]) {
  const user = await requireSession();
  const supabase = await createServerClient();
  const { data: profile } = await supabase
    .from('admin_profiles')
    .select('role, status')
    .eq('user_id', user.id)
    .single();

  if (!profile || profile.status !== 'ACTIVE')
    throw new AuthError('접근 권한이 없습니다');
  if (!roles.includes(profile.role))
    throw new AuthError('권한이 부족합니다');

  return { user, profile };
}

// API Route에서 사용:
export async function POST(req: Request) {
  const { user, profile } = await requireRole('SUPER_ADMIN', 'ADMIN');
  // 발행 등 관리자 전용 작업...
}
```

---

## 6. 테이블 도메인 분류

> **핵심 질문:** 테이블을 고객/회사 CRM/스토리지로 어떻게 구성하는가?

### 6-1. 4개 도메인 분류

```
┌─────────────────────────────────────────────────────────────┐
│                    Supabase Postgres                         │
│                                                              │
│  ┌─ 🏢 COMPANY (내부 운영) ──────────────────────────────┐  │
│  │  admin_profiles     — 관리자 계정/역할/상태            │  │
│  │  audit_logs         — 감사 로그 (누가 뭘 했는지)       │  │
│  │  site_settings      — 사이트 설정 (key-value)         │  │
│  │  calendar_events    — 팀 캘린더                        │  │
│  │  bugs               — 버그 리포트                      │  │
│  │  roadmap_items      — 제품 로드맵                      │  │
│  │  patch_notes        — 패치 노트                        │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌─ 👥 CUSTOMER (고객 데이터) ────────────────────────────┐  │
│  │  leads              — 리드 (데모신청/문의)             │  │
│  │  subscribers        — 뉴스레터 구독자                   │  │
│  │  email_campaigns    — 이메일 캠페인 이력                │  │
│  │  campaign_recipients — 발송 상세 (추후)                │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌─ 📝 CONTENT (콘텐츠) ──────────────────────────────────┐  │
│  │  blog_posts         — 블로그 게시글                     │  │
│  │  blog_post_revisions — 게시글 버전 이력 (추후)         │  │
│  │  events             — 공개 이벤트/프로모션              │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌─ 📁 STORAGE (Supabase Storage Buckets) ────────────────┐  │
│  │  blog-images/       — 블로그 썸네일 + 히어로 이미지    │  │
│  │  avatars/           — 작성자/관리자 프로필 이미지       │  │
│  │  attachments/       — 다운로드 자료 (PDF 등)           │  │
│  │  campaign-assets/   — 이메일 캠페인 이미지              │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### 6-2. 왜 이렇게 나누는가?

| 도메인 | 접근 패턴 | RLS 정책 | 백업 | 성격 |
|--------|----------|---------|------|------|
| **🏢 Company** | 관리자 전용 | 엄격 (ACTIVE 관리자만) | 주 1회 | 내부 운영 도구 |
| **👥 Customer** | 공개 INSERT + 관리자 관리 | 쓰기 열림 / 읽기 잠김 | 매일 | 비즈니스 핵심 자산 |
| **📝 Content** | 공개 READ + 관리자 WRITE | 읽기 열림 / 쓰기 잠김 | 매일 | 마케팅 자산 |
| **📁 Storage** | 버킷별 다름 | 버킷 정책 | Supabase 자동 | 바이너리 파일 |

### 6-3. 도메인별 RLS 정책

```sql
-- ═══════════════════════════════════════════
-- 🏢 COMPANY: 관리자만 접근
-- ═══════════════════════════════════════════

-- 공통 헬퍼: "이 사용자가 활성 관리자인가?"
CREATE OR REPLACE FUNCTION is_active_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM admin_profiles
    WHERE user_id = auth.uid()
    AND status = 'ACTIVE'
  )
$$ LANGUAGE sql SECURITY DEFINER;

-- admin_profiles, audit_logs, calendar_events, bugs, roadmap_items, patch_notes
-- 모두 동일한 패턴:
ALTER TABLE calendar_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins only" ON calendar_events
  FOR ALL USING (is_active_admin());

-- ═══════════════════════════════════════════
-- 👥 CUSTOMER: 공개 쓰기 + 관리자 읽기/수정
-- ═══════════════════════════════════════════

ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can submit lead"
  ON leads FOR INSERT
  WITH CHECK (true);  -- 문의는 누구나 가능

CREATE POLICY "Admins manage leads"
  ON leads FOR SELECT USING (is_active_admin());

CREATE POLICY "Admins update leads"
  ON leads FOR UPDATE USING (is_active_admin());

CREATE POLICY "Admins delete leads"
  ON leads FOR DELETE USING (is_active_admin());

-- subscribers: 동일 패턴 (공개 INSERT + 관리자 관리)

-- ═══════════════════════════════════════════
-- 📝 CONTENT: 공개 읽기(PUBLISHED) + 관리자 전체
-- ═══════════════════════════════════════════

ALTER TABLE blog_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public reads published posts"
  ON blog_posts FOR SELECT
  USING (
    (status = 'PUBLISHED' AND deleted_at IS NULL)  -- 공개
    OR is_active_admin()                            -- 관리자는 전부 봄
  );

CREATE POLICY "Admins write posts"
  ON blog_posts FOR INSERT USING (is_active_admin());

CREATE POLICY "Admins update posts"
  ON blog_posts FOR UPDATE USING (is_active_admin());

CREATE POLICY "Admins delete posts"
  ON blog_posts FOR DELETE USING (is_active_admin());
```

### 6-4. Storage 버킷 정책

```sql
-- blog-images: 공개 읽기, 관리자 업로드
INSERT INTO storage.buckets (id, name, public) VALUES ('blog-images', 'blog-images', true);
-- avatars: 공개 읽기, 관리자 업로드
INSERT INTO storage.buckets (id, name, public) VALUES ('avatars', 'avatars', true);
-- attachments: 공개 다운로드, 관리자 업로드
INSERT INTO storage.buckets (id, name, public) VALUES ('attachments', 'attachments', true);
-- campaign-assets: 비공개, 이메일에서만 참조
INSERT INTO storage.buckets (id, name, public) VALUES ('campaign-assets', 'campaign-assets', false);
```

### 6-5. 테이블 간 관계도

```
auth.users (Supabase 관리)
  │
  ├──→ admin_profiles (1:1) — 역할/상태
  │
  ├──→ blog_posts (1:N) — author_user_id
  │     └──→ blog_post_revisions (1:N) — 버전 이력
  │
  ├──→ email_campaigns (1:N) — created_by
  │
  └──→ audit_logs (1:N) — actor_user_id

leads ←── (독립) ──→ subscribers
  │                      │
  └── auto-subscribe ────┘ (리드 제출 시 자동 구독)

email_campaigns ──→ subscribers (태그 기반 타겟팅)
```

---

## 7. 구현 로드맵

### Phase 1: 기반 구축 (1~2주)

**목표:** Supabase DB 연결 + 인증 전환 + 첫 번째 테이블(blog_posts) 라이브

| # | 작업 | 파일/위치 | 우선순위 |
|---|------|-----------|----------|
| 1.1 | Supabase SQL 에디터에서 테이블 생성 (admin_profiles, blog_posts, audit_logs) | Supabase Dashboard | P0 |
| 1.2 | RLS 정책 적용 | Supabase Dashboard | P0 |
| 1.3 | `npx supabase gen types typescript` 로 타입 생성 | `lib/supabase/database.types.ts` | P0 |
| 1.4 | Admin 로그인을 Supabase Auth로 전환 | `app/admin/login/page.tsx` | P0 |
| 1.5 | `admin_profiles` 기반 역할/권한 가드 구현 | `lib/auth/guards.ts` | P0 |
| 1.6 | blog_posts Repository 생성 (듀얼 모드) | `lib/blog/repository.ts` | P0 |
| 1.7 | 기존 JSON 데이터 시드 스크립트 작성 | `scripts/seed-blog-posts.ts` | P1 |
| 1.8 | SUPER_ADMIN 1명 수동 생성 | Supabase Auth Dashboard | P0 |

**완료 기준:**
- Supabase Auth로 어드민 로그인 가능
- blog_posts 테이블에서 CRUD 동작
- 공개 `/blog` 페이지가 Supabase에서 PUBLISHED 글만 조회

---

### Phase 2: 데이터 전면 이전 (2~3주)

**목표:** 모든 JSON 파일을 Supabase로 교체

| # | 작업 | 우선순위 |
|---|------|----------|
| 2.1 | leads 테이블 생성 + `/api/lead` 전환 | P0 |
| 2.2 | subscribers 테이블 + 마케팅 UI 연동 | P1 |
| 2.3 | email_campaigns 테이블 + 발송 연동 | P1 |
| 2.4 | bugs, roadmap, calendar, patch-notes 테이블 | P2 |
| 2.5 | settings → 환경변수 또는 key-value 테이블 | P2 |
| 2.6 | `data/` 폴더 제거 (fallback 코드 제거) | P2 |

**완료 기준:**
- `data/*.json` 파일 의존성 제로
- 모든 어드민 기능이 Supabase DB 기반

---

### Phase 3: 운영 안정화 + 보안 강화 (2주)

**목표:** 프로덕션 배포 가능 수준의 안정성

| # | 작업 | 우선순위 |
|---|------|----------|
| 3.1 | Supabase Storage 도입 (이미지 업로드) | P1 |
| 3.2 | 운영자 초대 플로우 구현 | P1 |
| 3.3 | 감사 로그 적재 + 조회 UI | P1 |
| 3.4 | blog_post_revisions 테이블 + 버전 관리 | P2 |
| 3.5 | Custom SMTP 설정 (초대 메일용) | P1 |
| 3.6 | 에러 핸들링 표준화 | P1 |
| 3.7 | 환경별(dev/staging/prod) 설정 분리 | P2 |

**완료 기준:**
- 이미지를 Supabase Storage에 업로드/조회 가능
- 운영자 초대 → 가입 → 로그인 플로우 동작
- 모든 민감 작업 감사 로그 기록

---

### Phase 4: 마케팅/분석 고도화 (3~4주)

**목표:** 데이터 기반 마케팅 자동화

| # | 작업 | 우선순위 |
|---|------|----------|
| 4.1 | UTM 파라미터 자동 수집 (leads) | P1 |
| 4.2 | 리드 스코어링 시스템 | P2 |
| 4.3 | 구독자 세그멘테이션 고도화 | P2 |
| 4.4 | 이메일 자동화 (드립 캠페인) | P3 |
| 4.5 | 대시보드 실시간 KPI (Supabase Realtime) | P2 |
| 4.6 | A/B 테스트 인프라 (CTA, 랜딩 페이지) | P3 |
| 4.7 | 전환 퍼널 분석 대시보드 | P2 |

**완료 기준:**
- 리드 유입 소스별 전환율 추적 가능
- 자동화된 이메일 캠페인 운영 가능
- 어드민 대시보드에서 핵심 KPI 실시간 확인

---

### Phase 5: 확장 + 차별화 (4주~)

**목표:** 경쟁 우위를 만드는 기능

| # | 작업 | 설명 |
|---|------|------|
| 5.1 | **다국어 지원** | 일본/동남아 시장 진출 기반 |
| 5.2 | **API 공개** | 파트너/리셀러용 API 제공 |
| 5.3 | **고객 포털** | 기존 고객 전용 리소스/지원 공간 |
| 5.4 | **AI 콘텐츠 어시스턴트** | 블로그 초안/SEO 추천 자동화 |
| 5.5 | **예약 발행** | Supabase Cron/Edge Function 활용 |
| 5.6 | **Webhook 관리 UI** | 외부 연동 설정을 어드민에서 관리 |
| 5.7 | **멀티테넌시 (지점 관리)** | 브랜치별 독립 데이터 + 통합 뷰 |

---

## 8. 가치 성장 전략

### 6-1. 단기 (0~3개월): "신뢰할 수 있는 리드 머신"

```
현재 가치: 예쁜 랜딩 페이지 + 수동 운영
목표 가치: 리드 유실 제로 + 자동 추적 + 데이터 기반 의사결정
```

**핵심 개선:**
- JSON → Supabase: 데이터 안정성 확보
- 감사 로그: 누가 뭘 했는지 추적
- UTM 추적: 어디서 온 리드가 전환되는지 파악

**측정 가능한 성과:**
- 리드 누락률: 현재 측정불가 → 0%
- 리드 응답 시간: 측정불가 → 평균 N시간 추적
- 블로그 → 문의 전환율 추적 시작

### 6-2. 중기 (3~6개월): "마케팅 자동화 플랫폼"

```
목표 가치: 수동 이메일/연락 → 자동 너처링 + 세그멘트 캠페인
```

**핵심 개선:**
- 리드 스코어링 (관심도 자동 평가)
- 드립 캠페인 (문의 후 자동 팔로업 이메일)
- 전환 퍼널 대시보드

**비즈니스 임팩트:**
- 영업팀 리드 응대 효율 2~3배 향상
- 마케팅 비용 대비 전환 효율 측정 가능
- 콘텐츠 ROI 정량화

### 6-3. 장기 (6~12개월): "교육 시장 SaaS 허브"

```
목표 가치: 단순 리드 수집 → 고객 라이프사이클 관리
```

**핵심 개선:**
- 고객 포털 (도입 후 리소스/지원)
- API 공개 (파트너 생태계)
- 다국어 (일본/동남아 진출)
- AI 콘텐츠 어시스턴트 (블로그 운영 자동화)

**비즈니스 임팩트:**
- 신규 고객 획득 비용(CAC) 감소
- 고객 유지율(Retention) 향상
- 해외 시장 진출 기반 확보

### 6-4. 가치 성장 매트릭스

```
         가치
          ▲
          │                                    ★ SaaS 허브
          │                              ★ 마케팅 자동화
          │                        ★ 데이터 기반 운영
          │                  ★ Supabase 전환 완료
          │            ★ 인증 + 블로그 CMS
          │      ★ 현재 (JSON + 수동)
          │
          └──────────────────────────────────▶ 시간
              Phase1   Phase2   Phase3   Phase4   Phase5
```

---

## 9. 기술 결정 사항

### 7-1. Supabase 활용 범위

| Supabase 기능 | 사용 시기 | 용도 |
|---------------|----------|------|
| **Postgres** | Phase 1 | 모든 데이터 저장 |
| **Auth** | Phase 1 | 관리자 인증 (이메일/비밀번호) |
| **RLS** | Phase 1 | 행 단위 접근 제어 |
| **Storage** | Phase 3 | 이미지/파일 업로드 |
| **Realtime** | Phase 4 | 대시보드 실시간 업데이트 |
| **Edge Functions** | Phase 5 | 예약 발행, 웹훅 처리 |
| **Cron (pg_cron)** | Phase 5 | 정기 작업 (감사 로그 정리, 예약 발행) |

### 7-2. 코드 구조 변화

```
lib/
  supabase/          ← 기존 유지
    browser.ts
    server.ts
    admin.ts
    middleware.ts
    database.types.ts  ← NEW: 자동 생성 타입
  auth/              ← NEW
    guards.ts         # requireSession, requireRole, requirePermission
    permissions.ts    # ROLE → Permission 매핑
  repositories/      ← NEW (JSON 대체)
    blog.ts
    leads.ts
    subscribers.ts
    campaigns.ts
    audit.ts
  validators/        ← NEW
    blog.ts           # Zod 스키마
    lead.ts
    subscriber.ts
```

### 7-3. 환경변수 구성

```env
# Supabase (기존)
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SECRET_KEY=

# 전환 플래그 (Phase 1~2 동안)
USE_SUPABASE_BLOG=true
USE_SUPABASE_LEADS=false
USE_SUPABASE_SUBSCRIBERS=false

# 기존 (점진적 제거)
ADMIN_PASSWORD=       ← Phase 1 완료 후 제거
ADMIN_USERS=          ← Phase 1 완료 후 제거
```

---

## 10. 리스크와 대응

### 8-1. 기술 리스크

| 리스크 | 가능성 | 영향 | 대응 |
|--------|--------|------|------|
| JSON → DB 마이그레이션 중 데이터 손실 | 중 | 높음 | 시드 스크립트 + JSON 백업 유지 |
| Supabase Free Tier 제한 도달 | 낮음 | 중간 | Pro 플랜 전환 (월 $25) |
| RLS 정책 실수로 데이터 노출 | 중 | 높음 | 테스트 환경에서 RLS 검증 + 감사 로그 |
| 인증 전환 중 기존 어드민 접근 불가 | 중 | 높음 | 전환 완료 전까지 패스워드 인증 병행 |

### 8-2. 운영 리스크

| 리스크 | 대응 |
|--------|------|
| 배포 시 다운타임 | Vercel Preview Deploy 활용, Blue-Green 패턴 |
| Supabase 장애 | 크리티컬 데이터(leads)는 웹훅 병행 유지 |
| 팀원 온보딩 | 이 문서 + Supabase Dashboard 접근 권한 분리 |

### 8-3. 비즈니스 리스크

| 리스크 | 대응 |
|--------|------|
| 전환 기간 중 리드 유실 | 듀얼 모드 운영 (JSON fallback) |
| 기능 과다 개발 | Phase별 MVP → 검증 → 확장 |
| 비용 증가 | Supabase Pro $25/월 기준, 초기 Free Tier 충분 |

---

## 부록: Phase 1 실행 체크리스트

Phase 1을 시작할 때 아래 순서로 진행:

```
□ 1. Supabase Dashboard → SQL Editor에서 테이블 생성
     - admin_profiles
     - blog_posts
     - audit_logs
     - RLS 정책 적용

□ 2. SUPER_ADMIN 계정 생성
     - Supabase Auth → Users → 이메일로 생성
     - admin_profiles에 SUPER_ADMIN 레코드 삽입

□ 3. 타입 생성
     - npx supabase gen types typescript --project-id <id> > lib/supabase/database.types.ts

□ 4. 인증 전환
     - app/admin/login/page.tsx → signInWithPassword 연결
     - lib/auth/guards.ts 작성
     - middleware.ts 업데이트

□ 5. blog Repository 작성
     - lib/repositories/blog.ts (듀얼 모드)
     - app/api/admin/blog/ 라우트 전환

□ 6. 시드 데이터 이관
     - scripts/seed-blog-posts.ts 실행
     - 데이터 검증

□ 7. 검증
     - 어드민 로그인 테스트
     - 블로그 CRUD 테스트
     - 공개 /blog 페이지 확인
     - RLS 정책 검증 (비로그인 시 PUBLISHED만 보이는지)
```

---

*이 문서는 Classin Home 프로젝트의 Supabase 전환 및 가치 성장 전략을 정의합니다.*
*Phase별 구현 시 이 문서를 기준점으로 삼고, 완료된 항목은 체크해 나가세요.*
