# Supabase Migration Checklist 2.22

기준 시점: 2026-06-08

목적: `2.22` 작업에서 가이드/블로그 비공개 검수, 문서센터 draft 편집, 견적서 저장·공유·신규 고객 생성 흐름을 운영 DB에 안전하게 반영하기 위한 migration 적용 순서를 정리한다.

CRM 운영 통합(`crm_source_links`, Xiaoshouyi snapshot, write-back 승인 큐)은 별도 runbook을 따른다: [`korean-crm-operational-unblock-runbook-2026-06-10.md`](./korean-crm-operational-unblock-runbook-2026-06-10.md)

## 0. 운영 REST 확인 결과

확인일: 2026-06-08

로컬 `.env`/`.env.local`의 Supabase URL과 secret key를 사용해 REST 읽기 요청으로 확인했다. 키 값은 출력하지 않았다.

### 적용 확인

- `docs_articles.visibility`, `docs_articles.noindex`: 적용됨.
- `lead_alert_states`: 적용됨.
- `leads.follow_up_at`, `leads.assigned_to`: 적용됨.
- `leads.source_detail`, `leads.lead_magnet`, 전체 UTM/click/referrer 컬럼: 적용됨.
- `customers`, `deals`, `quote_documents`, `quote_document_versions`: 기본 테이블 적용됨.
- `quote_documents.created_by_role`, `approved_by`, `approved_at`: 적용됨.
- `quote_document_status_v2.pending_approval`: 적용됨.
- `quote_document_shares`: `quote_document_version_id`, `token`, `access_mode`, `expires_at` 기준 적용됨.
- `activity_logs`: `action_type`, `target_type`, `target_id`, `after_json` 기준 적용됨.
- 챗봇 분석 테이블/뷰: `chat_sessions`, `chatbot_answer_events`, `question_clusters`, `v_chatbot_daily_question_stats` 적용됨.
- `docs_article_drafts`: 적용됨.
- `chatbot_recommended_questions`: 적용됨.

### 미적용 또는 선택 적용

- `blog_posts.visibility`: 컬럼 없음. 현재 코드는 `status = draft/published`만 사용하므로 필수는 아니지만, `published + unlisted/private` 검수 흐름을 쓰려면 별도 migration과 앱 반영이 필요하다.

### `20260604_lead_response_alert_states.sql` 재실행 주의

운영 DB에는 `lead_alert_states`와 `leads.follow_up_at`, `leads.assigned_to`가 이미 있다. 이 파일을 SQL Editor에서 다시 실행하면 마지막 `CREATE POLICY "Admins manage lead alert states"` 구문에서 정책 중복 에러가 날 수 있다. 재실행이 필요하면 먼저 정책을 지우거나 `drop policy if exists`를 넣은 idempotent 버전으로 실행한다.

## 1. 반드시 적용할 신규 migration

### 1-0. 운영 DB 기본 스키마 선행 확인

확인 이유:

- `admin_profiles`, `is_active_admin()`, `blog_posts`, `leads`는 `scripts/001-create-tables.sql`에는 있지만 현재 `supabase/migrations` 안에는 동일한 base migration이 없다.
- 이후 문서센터/블로그/리드 migration은 `is_active_admin()` 또는 `update_updated_at()` 같은 선행 함수와 기본 테이블이 있다고 가정한다.
- 새 환경을 migration만으로 재현하려면 base migration을 먼저 보강해야 한다.

필요 항목:

- `admin_profiles` 테이블과 `is_active_admin()` 함수
- `blog_posts` 테이블과 기본 draft/published/archive 상태 정책
- `leads` 테이블과 기본 index/policy
- `update_updated_at()` 함수. 현재는 `20260407_notifications.sql`에서 제공된다.

### 1-1. 견적 승인 상태 enum 보강

파일: `supabase/migrations/20260608_quote_pending_approval_status.sql`

적용 이유:

- 코드와 타입은 `quote_documents.status = 'pending_approval'`을 사용한다.
- 기존 `20260404_partner_portal_v2_domain.sql`의 `quote_document_status_v2` enum에는 `pending_approval` 값이 없다.
- `20260414_quote_approval_gate.sql`은 승인 추적 컬럼은 추가하지만 enum 값은 실제로 추가하지 못한다.
- 이 값을 추가하지 않으면 관리자 생성 견적이나 승인 대기 견적 저장/공유 흐름에서 DB enum 에러가 날 수 있다.

검증 쿼리:

```sql
select enumlabel
from pg_enum
where enumtypid = 'public.quote_document_status_v2'::regtype
order by enumsortorder;
```

기대값: `draft`, `shared`, `accepted`, `expired`, `archived`, `pending_approval`이 모두 있어야 한다.

### 1-2. 블로그 비공개/비공개 링크 검수 컬럼

현재 앱은 블로그 비공개 검수를 `status = draft`로 처리한다. 운영 DB에서 `published + unlisted` 또는 `private`까지 분리하려면 별도 migration이 필요하다.

권장 migration:

```sql
alter table public.blog_posts
  add column if not exists visibility text not null default 'public'
  check (visibility in ('public', 'unlisted', 'private'));

create index if not exists idx_blog_posts_public_visibility
  on public.blog_posts (status, visibility, deleted_at, published_at desc);
```

추가 코드 반영 필요:

- 공개 `/blog` 목록은 `status = PUBLISHED`, `visibility = public`, `deleted_at is null`만 노출한다.
- 직접 링크 검수는 `status = PUBLISHED`, `visibility in ('public', 'unlisted')`까지 허용한다.
- `visibility = private`는 관리자/서비스 권한에서만 조회한다.

### 1-3. 리드 알림용 컬럼/index 보강

`20260604_lead_response_alert_states.sql`은 dedupe state만 만든다. 리드 응답/후속 알림 코드가 안정적으로 작동하려면 base `leads`에 아래 컬럼이 있어야 한다.

권장 migration:

```sql
alter table public.leads
  add column if not exists follow_up_at timestamptz,
  add column if not exists assigned_to text;

create index if not exists idx_leads_follow_up_at
  on public.leads (follow_up_at)
  where follow_up_at is not null;

create index if not exists idx_leads_assigned_to
  on public.leads (assigned_to)
  where assigned_to is not null;
```

### 1-4. 리드마그넷/attribution 추적 컬럼

파일: `supabase/migrations/20260608_lead_attribution_fields.sql`

적용 이유:

- 공개 폼은 이미 `sourceDetail`, UTM, click id, landing/current page, referrer를 수집한다.
- 기존 `leads` 테이블은 `utm_source`, `utm_medium`, `utm_campaign`만 저장해 블로그/가이드/리드마그넷별 성과 추적이 끊겼다.
- CRM에서 세부 유입과 리드마그넷 필터를 쓰려면 운영 DB에 컬럼이 있어야 한다.

검증 쿼리:

```sql
select column_name
from information_schema.columns
where table_schema = 'public'
  and table_name = 'leads'
  and column_name in (
    'source_detail',
    'lead_magnet',
    'utm_term',
    'utm_content',
    'gclid',
    'fbclid',
    'msclkid',
    'ttclid',
    'landing_page',
    'current_page',
    'referrer'
  )
order by column_name;
```

기대값: 위 컬럼 11개가 모두 조회되어야 한다.

### 1-5. 관리자 Quick Quote direct-sales 계정 정리

관리자 신규 고객 생성은 `partner_accounts.name = 'Classin Direct Sales'` 계정을 자동 생성/재사용한다. 앱 코드는 중복 행이 있어도 가장 오래된 행을 재사용하도록 보강했지만, 운영 DB에서는 아래를 확인한다.

- 중복 `Classin Direct Sales` 계정이 있으면 하나로 정리한다.
- 정리 후 필요하면 `lower(name)` 기준 partial unique index를 추가한다.
- 중복 정리 전 unique index를 바로 적용하면 migration이 실패할 수 있다.

## 2. 이미 있는 migration 중 운영 DB 적용 확인 필요

### 2-1. 문서센터 기본 스키마

파일: `supabase/migrations/20260421_docs_center.sql`

포함 테이블:

- `docs_categories`
- `docs_articles`
- `docs_article_versions`
- `docs_article_relations`
- `docs_ai_chunks`
- `docs_feedback`
- `docs_search_events`
- `docs_redirects`

확인 이유:

- `/admin/docs`와 공개 `/docs`의 단일 원본이다.
- `docs_articles.status`, `visibility`, `noindex`로 비공개 검수와 공개 전환을 관리한다.

### 2-2. 문서센터 추천 질문/챗봇 분석

파일:

- `supabase/migrations/20260421_z_chatbot_analytics.sql`
- `supabase/migrations/20260520_chatbot_recommended_questions.sql`

확인 이유:

- `/admin/docs`의 추천 질문, 질문 백로그, chatbot citation/feedback 집계에 필요하다.
- 공개 문서 검색 인덱스 재생성 후 챗봇 후보 문서 품질을 점검할 때 필요하다.

### 2-3. 문서 작업 초안

파일: `supabase/migrations/20260604_docs_article_drafts.sql`

포함 테이블:

- `docs_article_drafts`

확인 이유:

- 게시된 문서를 바로 덮어쓰지 않고 관리자에서 작업 초안을 저장한다.
- 최종 검수 후 `공개본에 반영`으로 `docs_articles`에 반영하는 흐름에 필요하다.

검증 쿼리:

```sql
select to_regclass('public.docs_article_drafts');
```

기대값: `docs_article_drafts`

### 2-4. 파트너/고객/거래/견적 도메인

파일:

- `supabase/migrations/20260404_partner_portal_v2_domain.sql`
- `supabase/migrations/20260414_quote_approval_gate.sql`

포함 테이블:

- `partner_accounts`
- `partner_account_users`
- `customers`
- `deals`
- `deal_line_items`
- `quote_documents`
- `quote_document_versions`
- `quote_document_shares`
- `activity_logs`

확인 이유:

- Quick Quote 저장은 `customers -> deals -> quote_documents -> quote_document_versions` 순서로 연결된다.
- 공유 링크는 `quote_document_shares.token`을 통해 `/share/quote/[token]`에서 조회된다.
- 고객 확인/내부 확인은 별도 confirmation 테이블이 아니라 `activity_logs.after_json`에 `public_quote_review_confirmed` payload로 기록된다.

### 2-5. 리드 응답/주간·월간 알림 state

파일: `supabase/migrations/20260604_lead_response_alert_states.sql`

포함 테이블:

- `lead_alert_states`

확인 이유:

- WeCom 리드 미응답/주간/월간 digest alert가 같은 조건을 매번 반복 발송하지 않게 dedupe state를 저장한다.

## 3. 콘텐츠 배포 상태 기준

### 가이드 문서

관리 화면: `/admin/docs`

권장 상태:

- 작성 중: `status = draft`, `visibility = internal`
- 링크 검수: `status = review`, `visibility = unlisted`
- 공개 전 최종 검수: `status = published`, `visibility = unlisted`, 필요 시 `noindex = true`
- 공개: `status = published`, `visibility = public`, `noindex = false`

게시 후 해야 할 일:

1. `/admin/docs` 상단 상태가 `Supabase live`인지 확인한다.
2. 문서를 저장하거나 공개본에 반영한다.
3. 검색 인덱스 재생성을 실행한다.
4. 공개 `/docs/...` URL에서 제목, 본문, SEO, 관련 문서를 확인한다.

### 블로그 글

관리 화면: `/admin/blog`

현재 블로그 모델은 별도 `visibility` 컬럼 없이 `status`로 공개 여부를 관리한다.

- 비공개 검수: `status = draft`
- 공개: `status = published`
- 폐기/보관: `status = archived` 또는 soft delete

포럼 리뷰 글처럼 이미지 교체 전 콘텐츠는 `draft`로 두고, 대표 이미지/alt/CTA/SEO가 모두 완료된 뒤 공개한다.

`published + unlisted` 검수 링크가 필요하면 1-2의 `visibility` migration과 앱 타입/UI 반영을 먼저 적용한다.

## 4. 배포 순서

1. base migration으로 `admin_profiles`, `is_active_admin()`, `blog_posts`, `leads`가 migration 재현 가능한지 확인한다.
2. `20260407_notifications.sql` 또는 별도 migration으로 `update_updated_at()` 함수가 있는지 확인한다.
3. 운영 DB에 `20260421_docs_center.sql` 이후 문서센터 관련 migration이 적용되어 있는지 확인한다.
4. `20260604_docs_article_drafts.sql` 적용 여부를 확인한다.
5. 블로그 unlisted/private가 필요하면 `blog_posts.visibility` migration을 적용한다.
6. `20260404_partner_portal_v2_domain.sql`, `20260414_quote_approval_gate.sql` 적용 여부를 확인한다.
7. `20260608_quote_pending_approval_status.sql`을 적용한다.
8. `Classin Direct Sales` 계정 중복 여부를 확인하고 필요 시 정리한다.
9. 리드 알림용 `follow_up_at`, `assigned_to` 컬럼/index를 보강한 뒤 `20260604_lead_response_alert_states.sql` 적용 여부를 확인한다.
10. `USE_SUPABASE_DOCS=true`, `USE_SUPABASE_BLOG=true`, `USE_SUPABASE_LEADS=true` 운영 환경변수를 확인한다.
11. `/admin/docs`, `/admin/blog`, Quick Quote 저장/공유/신규 고객 생성 smoke test를 실행한다.

## 5. 배포 후 smoke test

### 문서센터

- `/admin/docs`에서 새 문서를 `review + unlisted`로 저장한다.
- 작업 초안을 저장한 뒤 공개본에 반영한다.
- 검색 인덱스 재생성을 실행한다.
- `/docs/...` 직접 URL에서 문서가 열리는지 확인한다.

### 블로그

- `/admin/blog`에서 draft 글이 공개 `/blog`에 노출되지 않는지 확인한다.
- 공개할 글 1개를 `published`로 바꾸고 `/blog/[slug]` 상세가 열리는지 확인한다.
- CTA 버튼 URL과 대표 이미지가 정상 렌더링되는지 확인한다.

### 견적

- Quick Quote에서 신규 고객을 생성한다.
- 신규 고객으로 거래/견적을 저장한다.
- 저장 직후 공유 링크를 생성한다.
- `/share/quote/[token]`에서 견적을 열고 고객 확인을 기록한다.
- 관리자 직접 보기 `/admin/quotes/[id]/view`와 인쇄 버튼을 확인한다.
