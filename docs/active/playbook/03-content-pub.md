# 파트 가이드 — 컨텐츠 발행 (Content Publishing)

> 담당 에이전트: `.claude/agents/content-pub.md`(이 가이드를 SSOT로 참조) · 기준 시점: 2026-06-23
> 변경 검증: `npx eslint app components lib --max-warnings=0` + `npm run build`

## 1. 파트 한 줄 정의

공개 사이트의 모든 발행 콘텐츠 — 문서센터(`/docs`), 블로그(`/blog`), 행사(`/events`), 리소스/리드마그넷(`/resources`), 업데이트(`/updates`) — 와 그 콘텐츠가 흘러들어오는 4개 인입 파이프라인(채널톡 헬프센터 동기화, CS-Figma 소비자 가이드 생성, 정적 시드, Supabase 어드민 CRUD)을 담당. **톤·PII 마스킹·수기 편집본 보호** 규칙이 핵심.

## 2. 핵심 디렉토리/파일 맵

- `lib/docs.ts` — 정적 문서 SSOT + CS-Figma 가이드를 문서로 변환(`buildCsFigmaDocArticle`) + PII 키워드 정규식(`CS_FIGMA_PII_KEYWORD_RE`). 챗봇·시드·문서센터 공통 원천.
- `lib/docs-content.ts` — 정적(`lib/docs.ts`) + Supabase(`docs_articles`) **듀얼모드 병합**. `USE_SUPABASE_DOCS`로 분기, 실패 시 정적 폴백. published+public/unlisted만 노출.
- `lib/admin-docs.ts` — 어드민 문서 CRUD(버전/롤백/리다이렉트/검색인덱스).
- `scripts/sync-channel-documents.ts` — 채널톡 Documents Open API → `docs_articles`+`docs_ai_chunks`. 이미지/표/첨부 보존, 전수 크롤+reconcile, 수기편집본 보호.
- `scripts/embed-docs-chunks.ts` — `docs_ai_chunks` Gemini 임베딩 백필(멱등, 누락분만).
- `scripts/seed-docs.ts` — `lib/docs.ts` → Supabase 시드(멱등, **적용 보류** — 수기 편집본 덮어쓰기 위험).
- `lib/cs-figma-guides.ts` (+`.generated.ts`) — `CS_FIGMA_GUIDES`, `sanitizeGuideStep`, `formatCsFigmaGuideAnswer`. 화면 주석·PII·피그마 표현 제거.
- `lib/cs-figma-enrichments.ts` (+`.generated.ts`) — docSlug별 소비자 보강(제목/도입문/단계별 분리 이미지/팁). 큐레이션 > 자동생성. 플래그십 `cs-figma-digest-523`.
- `lib/cs-figma-assets.ts` (+`.generated.ts`) — 이미지 경로 매칭 + de-Figma 캡션.
- `lib/blog-data.ts` — `data/blog-posts.json` 정규화 CRUD(soft delete/trash). (어드민 실경로는 Supabase `blog_posts` 듀얼 — `lib/repositories/blog.ts`)
- `lib/lead-magnets.ts` + `lib/materials.ts` — 리드마그넷 타입/조회(`data/lead-magnets.json`) + 다운로드 게이트(Supabase Storage 서명 URL + `material_downloads`·`client_events` 로깅).
- `lib/calendar-data.ts` — 팀 캘린더(`data/calendar-events.json`+Google sync, Notion 라이브 머지).
- `lib/patch-notes-data.ts`·`lib/roadmap-data.ts`·`lib/testimonials.ts` — patch notes·roadmap·정적 후기.
- `app/docs/...`, `app/blog/BlogPageClient.tsx`, `app/events/EventsClient.tsx`, `app/resources/[slug]/page.tsx`, `app/updates/page.tsx` — 공개 렌더 표면.
- `app/admin/{docs,blog,events,lead-magnets,channel-talk}` — 어드민 CRUD(전부 `verifyAdmin()`, TipTap 에디터).

## 3. 가장 중요한 업무 (콘텐츠 인입 4경로)

1. **채널톡 헬프센터 → 문서센터/챗봇/리드마그넷**: `sync-channel-documents.ts`가 전수 크롤 → `docs_articles`(slug `channel-talk-document-{id}`, 기본 `unlisted`) + `docs_ai_chunks`(1800자). 이미지·표·첨부·콜아웃 보존. 이후 `embed-docs-chunks.ts`로 임베딩. **cron 미구현(수동)**: `npx tsx scripts/sync-channel-documents.ts && npx tsx scripts/embed-docs-chunks.ts`.
2. **CS-Figma 소비자 가이드 생성**: `docs/active/cs-figma-board-digest-*.md` → 생성 스크립트 → `cs-figma-guides.generated.ts`. 합성 PNG는 패널 분리 + PII 블러 → `public/docs/files/cs-figma/`. `cs-figma-enrichments.ts`가 단계별 카피로 보강. 문서·챗봇 동일 sanitize 경로.
3. **정적 시드 → Supabase 듀얼모드**: `lib/docs.ts`(정적 원천) ↔ `lib/docs-content.ts`가 라이브와 병합. 어드민(`/admin/docs`, TipTap) 편집이 정본.
4. **블로그/행사/리드마그넷 어드민 CRUD**: 블로그=Supabase `blog_posts`(JSON 폴백), 행사=Supabase `public_events`, 리드마그넷=`data/lead-magnets.json`(JSON 전용). 행사 추가 시 `/events`+`/admin/calendar` 자동 반영. 모든 어드민 라우트 `verifyAdmin()`.

## 4. 지침 & 규칙

- **문서 톤/보류 기준**(`docs/active/docs-center-content-guidelines.md`): 문서센터=기능 나열 아닌 "운영 사고 예방 공개 KB". 공개 문서에 `TBD`/`준비 중`/내부 메모 금지. 미확정 수치·요금·SLA·릴리즈 날짜·PII는 공개 전 검증 필수.
- **CS PII 마스킹**(2026-06-22 결정: 마스킹 후 유지): `CS_FIGMA_PII_KEYWORD_RE`(메인 계정/학원X/클립N/8자리+숫자 등, `lib/docs.ts`). `sanitizeGuideStep`이 화면 주석·"예:숫자"·URL→"링크"·피그마/캡처 표현 제거. 이미지는 블러 마스킹(로그인ID·계정명·교사명+전화).
- **소비자 톤 강제**: 피그마/CS 언급 금지, 합성 1장 → 단계별 분리, 끝에 PDF/이미지 다운로드. 챗봇 source heading "사용 순서 안내"(`CS_FIGMA_GUIDE_SOURCE_HEADING`).
- **이미지/표/첨부 보존**(`channel-docs-sync-2026-06-17.md`): 구조화 `body` 블록 우선 + `bodyHtml` 이미지 보강, 이모지/아이콘은 노이즈로 제외. `state` 쿼리 파라미터 신뢰 불가 → 클라이언트 필터.
- **HW 매뉴얼 톤**(`classin-board-s-series-safe-manual-guidelines.md`): 전원/설치/분해 위험은 명확히, 일반 팁은 부드럽게, 고장 원인 단정 금지 → A/S 연결.
- **발행 전 체크리스트**: `/admin/docs` 상단 `Supabase live` 확인 → draft/review 검수 → published+public 승격 → 검색 인덱스 재생성.

## 5. 절대 깨면 안 되는 것 / 주의점

- **수기 편집본 절대 보호**: sync upsert/reconcile은 `updated_by=sync-channel-documents`만 대상. `updated_by=classin-admin`(어드민 직접 편집)은 절대 안 건드림. `seed-docs.ts` 재실행도 덮어쓰기 위험 → **적용 보류 상태**.
- **reconcile 안전성**: 전수 크롤(fetch 실패 0건)일 때만 이번 세트에 없는 자동동기화 문서를 `archived`로 내림. `--ids` 모드는 reconcile 안 함. draft는 항상 `unlisted`, `--public`은 채널 published 글만 공개 승격.
- **챗봇 출처 중복**: 채널 문서 다수가 seeded(`lib/docs.ts`)와 동일 주제 → `selectDiverseSources` 중복제거 유지 필수(`tests/chatbot/source-dedup.test.ts`).
- **Notion 마케팅 캘린더**: 라이브 읽기 전용, Supabase 복제 금지(거버넌스 결정).
- **임베딩 멱등성**: `embed-docs-chunks.ts` 기본은 누락분만(`--all`만 전체 재임베딩). 차원 변경 주의(`GEMINI_EMBED_DIM`, 기본 1536).
- **PII git 히스토리**: 원본 합성 PNG의 실제 PII가 과거 커밋에 남음(작업트리는 마스킹). 완전 제거하려면 history rewrite 필요.
- **postbuild 게이트**: `check:public-content`가 공개 콘텐츠 가시성 검증.

## 6. 관련 문서

- `docs/active/docs-center-content-guidelines.md` — 공개 문서 톤·보류·발행 체크리스트.
- `docs/active/docs-center-db-design.md` — `docs_articles`/`docs_ai_chunks` 스키마.
- `docs/active/channel-docs-sync-2026-06-17.md` — 채널톡 동기화 파이프라인 운영 SSOT.
- `docs/active/content-roadmap-blog-events-docs-2026-06-10.md` — 블로그/행사/문서 백로그 상태표.
- `docs/active/cs-figma-asset-requirements.md`, `cs-figma-board-digest-2026-06-21.md`, `cs-figma-digest-qa-2026-06-21.md` — CS 자산/원천/QA.
- `docs/active/classin-board-s-series-safe-manual-guidelines.md` — HW 매뉴얼 안전 톤.

## 7. 현재 목표 & 백로그 (2026-06-23 스냅샷)

- **CS-Figma 롤아웃(~114개 대기)**: 플래그십 `cs-figma-digest-523`만 완료. 나머지는 격자가 제각각이라 이미지별 vision 분석 워크플로 필요. 미연결 자산 일부.
- **slug/asset 경로 `cs-figma` 잔존**: 본문 카피엔 없으나 URL·JSON-LD·`/docs/files/cs-figma/` 폴더에 남음(일괄 변경은 구조적 → 결정 대기).
- **채널 동기화 cron 미구현**: 현재 수동. 주기 cron(동기화→임베딩) 승격 검토.
- **D1 문서 Supabase 완전 이관 보류**: `seed-docs.ts` 멱등 완성됐으나 수기 편집본 덮어쓰기 위험으로 적용 보류.
- **content-roadmap 미착수**: 리드마그넷 폼, OG 자동생성, 행사 리마인더 cron, 정원 마이그레이션 등.

## 8. 검증 방법

```bash
npx eslint app components lib --max-warnings=0
npm run build   # postbuild: check:public-content
```
콘텐츠 전용: `npm run check:cs-figma-assets` / `npx tsx scripts/sync-channel-documents.ts --dry-run [--dump]` / `npx tsx scripts/seed-docs.ts --dry-run`. 라이브 확인: 챗봇에 "수업 참여 어떻게 해요?" → docs 출처 답변 / `/docs/...` 공개 URL 제목·SEO / CS 가이드 PII 누출 0.

## 9. 작업 시작 시 먼저 읽을 것

1. `docs/active/docs-center-content-guidelines.md` — 공개 콘텐츠 톤·보류·발행 규칙.
2. `docs/active/channel-docs-sync-2026-06-17.md` — 동기화 파이프라인 + 수기편집본 보호.
3. `lib/docs-content.ts` — 정적/Supabase 듀얼모드 + 가시성 규칙.
4. `lib/cs-figma-enrichments.ts` — PII 마스킹/소비자 톤/롤아웃 현황.
5. `docs/active/content-roadmap-blog-events-docs-2026-06-10.md` — 백로그 상태표.
