# 콘텐츠 디벨롭 로드맵 — 블로그 · 행사 · 가이드 문서

작성일: 2026-06-10
범위: 공개 사이트 콘텐츠 3개 영역의 기능 디벨롭 + 최적화 기획.
2026-06-10 공개 사이트 개선 커밋(이미지 WebP, JSON-LD, 리드 방어 등) 이후 시점 기준.

---

## 0. 현재 상태 요약 (기획 근거)

| 영역 | 데이터 소스 | 어드민 | 이미 잘 갖춘 것 | 핵심 공백 |
|---|---|---|---|---|
| 블로그 | Supabase + JSON 폴백 듀얼 ([lib/repositories/blog.ts](../../lib/repositories/blog.ts)) | CRUD·복제·featured·Instagram 대시보드 | ISR, Article JSON-LD, seo 필드, 관련 글(카테고리 기반) | 저장소 이원화, 조회 데이터 없음, RSS 없음, 클라이언트 전체 로드 |
| 행사 | Supabase 전용 ([lib/repositories/public-events.ts](../../lib/repositories/public-events.ts)) | 빠른등록+상세편집, 상태 자동계산 | Event JSON-LD, sitemap, eventSlug 리드 연동 | 신청 UX가 contact 폼 경유, 신청자 집계 없음, 종료 후 활용 없음 |
| 가이드 문서 | 정적 24개 ([lib/docs.ts](../../lib/docs.ts)) + Supabase 하이브리드 ([lib/docs-content.ts](../../lib/docs-content.ts)) | 초안/버전/롤백/리다이렉트/일괄편집/사이드바 순서 | 피드백 수집, 검색 로그, RAG 청킹, 챗봇 연계, 분석 대시보드 | 정적 하드코딩 3,600줄, JSON-LD 없음, 조회수 없음, 한글 검색 약함, 임베딩 미활성 |

공통 인프라 자산 (재사용 대상):
- 이벤트 로깅: `client_events` + `/api/track/event` (page_view 이미 수집 중)
- 리드 파이프라인: [lib/server/lead-capture.ts](../../lib/server/lead-capture.ts) — eventSlug·leadMagnet 필드 이미 지원
- 알림/자동화: notification emit + automation engine + 이메일(Resend)
- SEO 헬퍼: [lib/seo.ts](../../lib/seo.ts) — Article/Event/Breadcrumb/FAQ JSON-LD 빌더 완비

---

## 1. 블로그

### Phase 1 — 기반 정리 (1주 내)

**B1. 저장소 단일화 (Supabase 확정)** — 효과: 운영 안정 / 노력: S
- 선행: Vercel 프로드 env에 `USE_SUPABASE_BLOG=true` 확인 (`vercel env ls`)
- JSON 폴백(`lib/blog-data.ts` CRUD)을 읽기 전용 백업으로 강등, 듀얼 분기 제거
- `data/blog-posts.json`이 오늘 날짜로 갱신된 이력이 있으므로, 어느 경로가 썼는지 먼저 추적

**B2. 인기글 데이터 연결** — 효과: 운영 인사이트 / 노력: S
- `client_events`의 `page_view`(path가 `/blog/...`)를 집계해 어드민 블로그 대시보드에 "최근 30일 조회 Top 10" 위젯 추가
- 신규 수집 없이 기존 데이터 조인만으로 가능 ([app/api/admin/event-counts](../../app/api/admin/event-counts) 패턴 재사용)

**B3. RSS 피드** — 효과: SEO·구독 / 노력: S
- `app/blog/rss.xml/route.ts` — `getPublishedPostsForStaticSitemap()` 재사용, revalidate 3600
- 뉴스레터 도구·포털 수집기 연동 기반

### Phase 2 — 전환 연결 (2~4주)

**B4. 리드 마그넷 CTA 블록** — 효과: 리드 전환 / 노력: M
- 글 본문/하단에 "자료 다운로드" 게이트 블록 (이메일 입력 → `newsletter` source + `lead_magnet` 태그 리드)
- 서버 인프라는 이미 완성 — `leadMagnet` 필드, 구독자 태깅 구현됨. 클라이언트 블록 컴포넌트 + 어드민에서 글별 마그넷 지정 필드만 추가
- 측정: `submit_newsletter` 이벤트에 `lead_magnet` 파라미터 추가

**B5. 카카오톡 공유 + 링크 복사** — 효과: 유통 / 노력: S
- 한국 시장 특성상 트위터/페북보다 카카오 공유가 우선. CSP에 `*.kakao.com` 이미 허용됨
- 글별 OG는 이번에 정비 완료 → 공유 시 썸네일 보장됨

**B6. OG 이미지 자동 생성** — 효과: 공유 CTR / 노력: M
- 히어로 이미지 없는 글: `ImageResponse`로 제목+카테고리 템플릿 OG 동적 생성 (`app/blog/[slug]/opengraph-image.tsx`)

**B7. 관련 글 추천 고도화** — 효과: 체류·내부링크 / 노력: M
- 현재 카테고리 기반 폴백만 동작. 어드민 편집기에 관련 글 수동 지정 UI 추가(`relatedPostIds` 활용) + 태그 교집합 스코어 폴백

### Phase 3 — 확장 (분기)

**B8. 서버 검색 + 페이지네이션** — 글 50개 이상 시점에 착수. 현재 클라이언트 전체 로드 구조는 글이 늘면 LCP·전송량 악화
**B9. 시리즈(연재) 묶음** — `series_slug` 컬럼 + 글 상단 시리즈 네비게이션. 온보딩형 콘텐츠(원장 가이드 연재 등)에 적합
**B10. 발행 워크플로우** — `IN_REVIEW` 상태는 DB에 이미 정의돼 있으나 미사용. 검수 단계 활성화 + 예약 발행(`published_at` 미래 시각)

---

## 2. 행사

### Phase 1 — 신청 전환율 (1주 내)

**E1. 행사 상세 인라인 신청 모달** — 효과: 전환율(최우선) / 노력: M
- 현재: 상세 → `/contact?source=event&event=...` 이동 → 긴 폼. 페이지 이탈 지점이 하나 더 있음
- 개선: 행사 상세에서 바로 뜨는 경량 신청 모달(이름/기관/연락처만) — DemoModal 패턴 재사용, `source: "contact_page"` + `eventSlug` 유지로 서버 변경 불필요
- honeypot·중복 방지는 이번 커밋으로 이미 서버에 적용됨

**E2. 어드민 신청자 집계** — 효과: 운영 / 노력: S
- 리드 테이블에서 `eventSlug`별 카운트를 어드민 행사 목록에 컬럼으로 표시 + 행사별 신청자 명단 뷰
- 행사 ROI(신청자 수/노출)를 처음으로 측정 가능해짐

### Phase 2 — 참석 경험 (2~4주)

**E3. 캘린더 추가** — 효과: 노쇼 감소 / 노력: S
- `.ics` 다운로드(`app/events/[slug]/calendar.ics/route.ts`) + 구글 캘린더 추가 링크(URL 파라미터 방식, API 불필요)

**E4. 리마인더 자동화** — 효과: 참석률 / 노력: M
- 행사 D-1: `eventSlug` 리드 대상 이메일 발송 — automation engine + Resend 인프라 재사용, vercel.json cron 1개 추가
- 마케팅 동의와 무관한 거래적(transactional) 안내로 분류

**E5. 마감임박·정원 표시** — 효과: 긴급성 / 노력: S
- `capacity` 컬럼 추가(마이그레이션 필수) + 신청자 수 대비 "잔여 N석"/"마감 임박" 배지, D-day 표시

### Phase 3 — 종료 후 활용 (분기)

**E6. 행사 아카이브 + 후기 연결** — 효과: SEO·신뢰 / 노력: M
- 종료 행사 전용 아카이브 섹션 + 행사에 `recap_blog_slug` 필드 추가 → 상세 페이지가 "후기 보기"로 전환
- 행사 페이지가 일회성 소모가 아니라 누적 SEO 자산이 됨

**E7. 다음 행사 알림 구독** — 노력: S
- 마감/종료 행사 상세에 "다음 행사 알림 받기" → `newsletter` source + `event_alert` 태그. 기존 구독자 인프라 그대로 사용

---

## 3. 가이드 문서

### Phase 1 — 단일화·SEO (1~2주)

**D1. Supabase 모드 확정 + 정적 문서 마이그레이션** — 효과: 운영 일원화(최우선) / 노력: L
- [lib/docs.ts](../../lib/docs.ts) 3,600줄 하드코딩 24개 문서를 `docs_articles`로 이관하는 시드 스크립트 작성
- 어드민(초안/버전/리다이렉트)이 이미 완성돼 있는데 실제 노출이 정적 데이터면 편집해도 반영이 안 되는 split-brain — 이걸 끝내는 게 다른 모든 문서 개선의 전제
- 이관 후 `lib/docs.ts`는 타입·경로 헬퍼만 남기고 콘텐츠 제거

**D2. 문서 JSON-LD** — 효과: SEO / 노력: S
- 이번에 만든 [lib/seo.ts](../../lib/seo.ts) 헬퍼 재사용: 가이드는 `Article`(또는 `TechArticle`), FAQ형 문서는 기존 `createFaqJsonLd`, 전 문서 `BreadcrumbList`
- 블로그·행사와 동일 패턴이라 반나절 작업

**D3. 문서 조회수 연결** — 효과: 우선순위 데이터 / 노력: S
- `client_events` page_view(`/docs/...`)를 어드민 docs 분석에 조인 → "많이 보는데 도움률 낮은 문서" = 최우선 개선 큐
- 피드백·검색 로그는 이미 수집 중이므로 조회수만 합치면 콘텐츠 우선순위가 데이터로 결정됨

### Phase 2 — 검색·셀프서브 (2~4주)

**D4. 검색 개선** — 효과: 셀프서브 해결률 / 노력: M
- 전용 `/docs/search` 페이지 + Supabase 검색 함수의 `simple` 모드를 pg_trgm 기반으로 보강 (한글 부분일치)
- zero-result 검색어(이미 `zeroResultSearches`로 집계 중)를 어드민 "질문 백로그"에 자동 적재 → 신규 문서 주제 소스

**D5. 임베딩 활성화** — 효과: 챗봇 정확도 / 노력: M
- `docs_ai_chunks.embedding` 채우는 파이프라인 + 주석 처리된 HNSW 인덱스 활성화 ([supabase/migrations/20260421_docs_center.sql](../../supabase/migrations/20260421_docs_center.sql))
- 챗봇 doc_suggestion 모드의 검색 품질이 키워드 → 시맨틱으로 올라감

**D6. 문서 → 상담 전환 동선** — 효과: 리드 / 노력: S
- troubleshooting/도입 가이드 하단에 "해결되지 않았나요?" CTA → `/contact?topic=...` (topic 파라미터 이미 지원)
- 부정 피드백 제출 직후에도 같은 CTA 노출 — 불만 이탈을 상담 기회로 회수

### Phase 3 — 운영 자동화 (분기)

**D7. 콘텐츠 신선도 운영** — `REVIEW_STALE_DAYS`(현재 60 하드코딩) 설정화 + 검토 기한 초과 문서를 어드민 작업 큐·알림으로
**D8. 어드민 페이지 분리** — [app/admin/docs/page.tsx](../../app/admin/docs/page.tsx) 1,500줄 → 탭별 컴포넌트/훅 분리 (기능 추가 전 부채 정리)
**D9. 영문 문서** — 수요 확인 후. 스키마에 locale 컬럼 추가 방식 권장 (별도 테이블 불필요)

---

## 4. 영역 공통 (크로스커팅)

**C1. 콘텐츠 상호 연결 모델** — 블로그 글 ↔ 가이드 문서 ↔ 행사 간 "관련 콘텐츠" 연결 필드 표준화. docs에는 이미 `docs_article_relations` 그래프가 있으므로 이 모델을 블로그·행사로 확장하는 방향
**C2. 콘텐츠 퍼널 대시보드** — client_events 기반: 콘텐츠 조회 → CTA 클릭 → 리드 제출을 영역별로 한 화면에. 콘텐츠 투자 대비 리드 기여를 비교 가능하게
**C3. 검색엔진 운영 체크** — 네이버 서치어드바이저·구글 서치콘솔에 sitemap 제출 상태 확인 (코드 외 운영 작업, JSON-LD 효과 측정의 전제)

---

## 5. 우선순위 제안 (통합)

| 순위 | 항목 | 이유 |
|---|---|---|
| 1 | D1 문서 Supabase 단일화 | 어드민 기능이 이미 완성돼 있는데 노출과 분리된 상태 — 가장 큰 구조적 낭비 |
| 2 | E1 행사 인라인 신청 모달 | 리드 전환 직결, 서버 변경 없이 가능 |
| 3 | B1 블로그 저장소 단일화 | 듀얼 모드 리스크 제거 (env 확인 선행) |
| 4 | D2+D3 문서 JSON-LD·조회수 | 반나절×2, 기존 인프라 재사용 |
| 5 | B2+E2 인기글·신청자 집계 | 운영 의사결정 데이터 확보 |
| 6 | B4 리드 마그넷 | 블로그를 리드 채널로 전환 |
| 7 | E3+E4 캘린더·리마인더 | 행사 참석률 |
| 8 | D4 검색 개선 | 셀프서브 해결률 |

마이그레이션이 필요한 항목(E5 capacity, B9 series, C1 관계 테이블 등)은 반드시 `supabase/migrations/`에 파일을 먼저 작성한다.
