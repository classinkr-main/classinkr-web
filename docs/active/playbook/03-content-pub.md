# 파트 가이드 — 콘텐츠 발행 (Content Publishing)

> 담당 에이전트: `.claude/agents/content-pub.md`

## 1. 책임 범위

공개 문서센터·블로그·행사·리소스·업데이트와 이를 관리하는 어드민 화면/API/repository, 콘텐츠 인입 파이프라인을 소유한다.

- 공개 화면: `app/{docs,blog,events,resources,updates}`
- 어드민 화면: `app/admin/{docs,blog,events,lead-magnets}`
- 어드민 API: `app/api/admin/{docs,blog,events,lead-magnets,content}`
- repository: `docs-articles.ts`, `blog.ts`, `public-events.ts`, `lead-magnets.ts`, `lead-magnet-metrics.ts` 등 콘텐츠 데이터 구현
- 인입: `scripts/{sync-channel-documents,embed-docs-chunks,seed-docs}.ts`, `lib/docs*.ts`, `lib/cs-figma-*.ts`

채널톡 도움말을 문서로 동기화하는 파이프라인은 콘텐츠 소유다. 상담 Inbox·대화 데이터와 `/admin/channel-talk` 운영 화면은 챗봇/CS 소유다. 캘린더 집계와 `admin_calendar_events`는 Growth 소유이며, 콘텐츠는 공개 행사 데이터를 제공한다.

## 2. 콘텐츠 원천과 병합

- `lib/docs.ts`: 정적 문서와 CS 가이드 변환 원천
- `lib/docs-content.ts`: 정적 문서와 Supabase `docs_articles` 병합, 공개 가시성 판정
- `lib/admin-docs.ts`: 어드민 문서 CRUD·버전·리다이렉트·검색 인덱스
- `scripts/sync-channel-documents.ts`: 채널톡 Documents API → `docs_articles`/`docs_ai_chunks`
- `scripts/embed-docs-chunks.ts`: 누락 임베딩 백필
- `lib/cs-figma-guides.ts`, `lib/cs-figma-enrichments.ts`, `lib/cs-figma-assets.ts`: 소비자용 가이드 정제·자산 연결

문서·블로그·행사처럼 Supabase와 정적/JSON 폴백이 함께 있는 데이터는 실제 feature flag와 repository 구현을 확인한다. 플레이북의 과거 상태 설명을 현재 운영 모드로 간주하지 않는다.

## 3. 강제 규칙

- 수기 편집본 보호: 자동 sync/reconcile은 자동 동기화가 소유한 레코드만 갱신한다. `updated_by=classin-admin` 같은 수기 편집본을 덮어쓰지 않는다.
- reconcile 안전: 전수 크롤이 정상 완료된 경우에만 누락된 자동 동기화 문서를 archive한다. 부분 실행과 fetch 실패에서는 archive하지 않는다.
- 공개 가시성: draft/review와 internal 문서를 공개하지 않는다. published이면서 public/unlisted 정책을 충족한 문서만 노출한다.
- PII 제거: CS 원천의 계정명·전화·로그인 ID·화면 주석·내부 표현을 텍스트와 이미지 모두에서 제거한다.
- 소비자 톤: 공개 본문에 Figma, 내부 CS, 캡처 작업, TBD, 준비 중, 내부 메모를 남기지 않는다.
- 수치·요금·SLA·릴리스 날짜는 검증되지 않았으면 단정하지 않는다.
- 이미지·표·첨부 구조를 보존하고, 구조화 body를 우선하며 필요한 경우 `bodyHtml`로 자산을 보강한다.
- AI 초안은 자동 게시하지 않는다.
- 임베딩은 누락분 백필을 기본으로 하며 차원·모델 변경 시 DB 계약과 챗봇 검색을 함께 검증한다.

### Notion 캘린더 경계

금지 대상은 Notion을 원천으로 읽은 마케팅 캘린더 이벤트의 Supabase 미러링과 양방향 쓰기다. Classin이 자체 생성하는 `admin_calendar_events`나 공개 행사 데이터까지 금지하는 규칙이 아니다. 캘린더 통합 변경은 Growth 가이드를 따른다.

## 4. 크로스컷

- 콘텐츠 청크·slug·가시성 변경은 챗봇 검색, 출처 중복 제거, 공개 URL/SEO에 영향을 준다.
- `selectDiverseSources`와 source dedup 회귀를 유지한다.
- 어드민 콘텐츠 API는 Admin Core의 auth/role/capability 규약과 admin Supabase client 규약을 따른다.
- UI는 `DESIGN.md`를 정본으로 사용한다.

## 5. 검증

```bash
npm run typecheck
npx eslint app components lib --max-warnings=0
npm run build
```

변경 범위에 따라 다음을 추가한다.

```bash
npm run check:cs-figma-assets
npx tsx scripts/sync-channel-documents.ts --dry-run
npx tsx scripts/seed-docs.ts --dry-run
```

- 공개 문서/행사의 가시성·SEO 확인
- CS 가이드 텍스트와 이미지의 PII 누출 확인
- 챗봇 문서 검색과 `tests/chatbot/source-dedup.test.ts` 확인

## 6. 먼저 읽을 것

1. `docs/active/docs-center-content-guidelines.md`
2. `docs/active/channel-docs-sync-2026-06-17.md`
3. `lib/docs-content.ts`, `lib/admin-docs.ts`
4. 변경 대상의 어드민 route와 repository
5. CS 가이드 변경이면 `lib/cs-figma-enrichments.ts`
