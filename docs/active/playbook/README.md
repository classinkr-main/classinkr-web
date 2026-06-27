# Classin Home — 파트별 운영 플레이북 (Team Playbook)

> 기준 시점: 2026-06-23 · 목적: **업무를 6개 파트로 나누고, 각 파트마다 "담당 에이전트 + 가이드 문서 + 현재 목표"를 고정**해 두어, 앞으로 어떤 작업이 들어와도 (1) 어느 파트인지 즉시 판별하고 (2) 그 파트의 철칙·핵심 파일·검증 기준을 빠짐없이 적용할 수 있게 한다.

이 플레이북은 "무엇을 먼저 읽고, 무엇을 절대 깨면 안 되는지"를 파트 단위로 정리한 **가이딩 레이어**다. 사실 검증은 항상 실제 코드와 `docs/active/`의 기준 문서로 한다.

---

## 0. 사용법 — 작업 들어오면 이 순서로

1. **파트 판별**: 아래 [§2 소유권 매트릭스](#2-소유권-매트릭스-경로--파트)로 건드릴 경로가 어느 파트인지 찾는다. (여러 파트에 걸치면 [§4 크로스컷](#4-크로스컷-의존성)을 본다)
2. **담당 에이전트 위임**: 해당 파트의 전담 에이전트를 띄운다. 예) 챗봇 작업 → `Agent(subagent_type: "chatbot")`. 각 에이전트는 자기 파트의 스코프·철칙·핵심 파일을 이미 알고 있다. (정의: `.claude/agents/`)
3. **가이드 정독**: 해당 파트 가이드(`docs/active/playbook/0N-*.md`)의 §4 지침 · §5 절대 금지 · §9 먼저 읽을 것을 본다.
4. **공통 철칙 적용**: [§3 공통 철칙](#3-공통-철칙-모든-파트-공통)은 모든 파트에 적용된다.
5. **검증**: 항상 `npx eslint app components lib --max-warnings=0` + `npm run build`. 스키마를 만졌으면 마이그레이션까지.

---

## 1. 파트 지도

| # | 파트 | 한 줄 정의 | 담당 에이전트 | 가이드 |
|---|------|-----------|--------------|--------|
| 1 | **홈 및 랜딩** (Front) | 전환 중심 공개 마케팅 사이트(`/`, `/product`, `/pricing`, 랜딩) | `home-front` | [01-home-front.md](./01-home-front.md) |
| 2 | **어드민 코어** (Admin) | `/admin` 셸 + 인증·권한·repository 데이터층 + Ops/Settings | `admin-core` | [02-admin-core.md](./02-admin-core.md) |
| 3 | **컨텐츠 발행** (Content) | 문서센터·블로그·행사·리소스 + 4개 콘텐츠 인입 파이프라인 | `content-pub` | [03-content-pub.md](./03-content-pub.md) |
| 4 | **마케팅/그로스/CRM** (Growth) | 리드 퍼널·동의·추적·이메일 + CRM·지사·노션 캘린더(ERP) | `growth-crm` | [04-growth-crm.md](./04-growth-crm.md) |
| 5 | **챗봇** (Chatbot) | 하이브리드 RAG 챗봇 + 상단 퍼널 + 운영 콘솔 | `chatbot` | [05-chatbot.md](./05-chatbot.md) |
| 6 | **플랫폼 & 데이터** (Platform) | Supabase·마이그레이션·Portal V2 인가·결제·cron·인증 (공유 기반층) | `platform-data` | [06-platform-data.md](./06-platform-data.md) |

---

## 2. 소유권 매트릭스 (경로 → 파트)

| 경로/영역 | 파트 |
|-----------|------|
| `app/page.tsx`, `app/{about,product,pricing,contact,faq}`, `app/l/*` | 1 Front |
| `components/{landing,sections,product,ui,seo,transitions}`, `components/AppChrome.tsx` | 1 Front |
| `app/globals.css`, `DESIGN.md`, `lib/classin-positioning.ts`, `lib/seo.ts`, `app/{sitemap,robots,opengraph-image}` | 1 Front |
| `app/admin/{overview,ops,settings,users,dev,analytics,login}`, `app/admin/layout.tsx` | 2 Admin |
| `lib/admin-auth*.ts`, `lib/admin-client.ts`, `lib/admin-api-response.ts`, `lib/admin-env.ts`, `lib/repositories/*` | 2 Admin |
| `app/{docs,blog,events,resources,updates}`, `app/admin/{docs,blog,events,lead-magnets,channel-talk}` | 3 Content |
| `lib/{docs,docs-content,admin-docs,blog-*,cs-figma-*,calendar-data,lead-magnets,materials,patch-notes,roadmap,channel-talk*}.ts`, `scripts/{sync-channel-documents,embed-docs-chunks,seed-docs}.ts` | 3 Content |
| `app/admin/{crm,marketing,campaigns,branch,calendar}`, `app/api/{lead,identify,consent,track,newsletter,meta}` | 4 Growth |
| `lib/{admin-crm-*,marketing-*,branch/*,automation-engine,notion-marketing-calendar,analytics*,consent/*,submitLead,lead-*,email,resend,external-crm/*,crm-source-linking}.ts`, `lib/server/lead-capture.ts`, analytics `components/*Script.tsx`+`TrackedLink.tsx` | 4 Growth |
| `app/api/chatbot/*`, `app/admin/chatbot`, `lib/chatbot/*`, `components/ui/{FloatingChatbot,ChatbotTeaser,useChatbotTeaser}.*` | 5 Chatbot |
| `lib/supabase/*`, `supabase/migrations/*`, `lib/{db,server,storage,auth,identity,regions}/*`, `lib/portal/*`, `app/api/{portal,billing,webhook,cron}`, `app/{share,checkout,receipt,auth}`, `lib/billing/*`, `lib/notifications/*` | 6 Platform |
| `data/*.json` 듀얼모드 | 6 Platform(저장소 메커니즘) + 해당 도메인 파트 |
| `next.config.ts`, `vercel.json`, `eslint.config.mjs`, `vitest.config.ts`, `tests/*` | 6 Platform |

---

## 3. 공통 철칙 (모든 파트 공통)

이 7가지는 파트를 막론하고 위반 시 무음 사고로 이어진다.

1. **검증 게이트**: 모든 변경은 `npx eslint app components lib --max-warnings=0` + `npm run build` 통과. (build에 `check:vercel-crons`/`check:public-content` 훅 포함)
2. **어드민 API = 가드 + admin 클라이언트**: `app/api/admin/*`는 `verifyAdmin()`(또는 `requireVerifiedAdminContext()`)으로 보호하고, 데이터 접근은 항상 `createSupabaseAdminClient()`. server 클라이언트를 어드민 경로에 쓰면 RLS가 전 행 차단 → 빈 배열 무음 반환. (파트 2·4·6)
3. **마이그레이션 규율**: 타입/INSERT에 컬럼 추가 시 반드시 `supabase/migrations/YYYYMMDD_*.sql`(`ADD COLUMN IF NOT EXISTS`) 동반 + 적용. 누락 시 INSERT가 catch에 먹혀 무음 실패. (파트 6 + 데이터 만지는 모든 파트)
4. **동의·PII**: 마케팅 픽셀은 `consent.marketing` 없이 발화 금지. 내부 이벤트(`/api/track/event`)는 `ALLOWED_EVENTS`/파라미터 allowlist + PII redaction 통과. raw IP는 해시로만. (파트 1·4)
5. **노션 마케팅 캘린더 = 라이브 읽기 전용**: Supabase로 복제 금지, 양방향 쓰기 금지, 토큰 클라이언트 노출 금지. (파트 3·4)
6. **포지셔닝 SSOT**: 공개 카피는 `lib/classin-positioning.ts` + `docs/active/classin-korea-positioning-guidelines.md` 기준. 가격·국내 기관/보드 수 단정 금지 → 상담 연결. (파트 1·5)
7. **UI 디자인 시스템**: `DESIGN.md` 팔레트만(그린 `#084734`는 액센트로만), 보더 `1px solid rgba(0,0,0,0.08)`, 섹션 배경 `#FFFFFF`↔`#F6F5F4`↔`#ECFDF5`, 모바일 우선. 시안 먼저 보여주고 합의. (파트 1, UI 손대는 모든 파트)

---

## 4. 크로스컷 의존성

파트 경계를 넘나드는 연결. 한쪽을 바꾸면 반대쪽을 확인한다.

- **콘텐츠(3) ↔ 챗봇(5)**: 챗봇 KB는 `lib/docs.ts` + `docs_articles`/`docs_ai_chunks`(콘텐츠 파트가 채운다)를 검색한다. 채널톡 동기화/CS-Figma sanitize 경로를 바꾸면 챗봇 출처·중복제거(`selectDiverseSources`)에 영향.
- **그로스(4) ↔ 플랫폼(6)**: 리드 캡처·CRM·결제·cron이 모두 Supabase 스키마·마이그레이션·인가 위에 올라간다. 새 이벤트/컬럼은 마이그레이션 + allowlist 양쪽.
- **프론트(1) ↔ 그로스(4)**: CTA·폼·랜딩의 계측(`trackEvent`)과 동의 게이팅은 그로스가 정의한 이벤트/consent 규약을 따른다.
- **프론트(1) ↔ 챗봇(5)**: `AppChrome`가 챗봇 위젯·teaser 라이프사이클을 마운트. `/pricing` teaser 미노출 등 페이지별 정책은 양쪽 합의.
- **어드민(2)은 3·4·5의 어드민 화면을 호스팅**: 인증·repository·응답 규약(파트 2)을 공유하되, 각 도메인 로직은 해당 파트 소유.

---

## 5. 지금 공통으로 주시할 것 (cross-part watch, 2026-06-23)

- **미적용 성능 마이그레이션**: `supabase/migrations/20260618_admin_dashboard_query_performance.sql`, `20260618_crm_status_counts_rpc.sql` — DB 적용 전엔 어드민/CRM/챗봇 집계가 느린 폴백. (파트 2·4·5·6)
- **결제 개편 P0**: 마이그레이션 3종 순서 적용 + Vercel 환경변수(KRW/USD) + 견적코드 강화. (파트 6)
- **`client_events` 마이그레이션**: 내부 이벤트 로깅 테이블 적용 안 되면 INSERT 무음 실패. (파트 4)
- **CS-Figma 롤아웃 ~114개 대기**, **채널톡 동기화 cron 미구현(수동)**. (파트 3)
- **챗봇 상단 퍼널 C/D 로드맵** 다음 사이클. (파트 5)

---

## 6. 이 플레이북 유지보수

- 파트 구조·철칙이 바뀌면 이 README와 해당 파트 가이드, 그리고 `.claude/agents/`의 대응 에이전트 정의를 **함께** 갱신한다.
- 각 가이드의 "현재 목표 & 백로그"는 스냅샷이다. 큰 사이클이 끝나면 날짜와 함께 갱신한다.
- 새 파트가 생기면: 가이드 1개 + 에이전트 1개 + 이 README의 §1·§2 행 추가.
