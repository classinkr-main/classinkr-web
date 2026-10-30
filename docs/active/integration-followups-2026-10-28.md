# 통합 병합 기록과 후속 과제 (2026-10-28)

기준 시점: 2026-10-28 · 대상: 통합 작업 브랜치(원격 `main` + 열린 PR 7건 + 10-28 핫픽스 4건 + 문서 브랜치 3건)
방식: 메인 세션이 `main`과 충돌 없는 브랜치를 순서대로 합치고, 충돌이 큰 PR 은 격리 워크트리의 에이전트 5개(Opus 3, Sonnet 2)가 각각 병합·검증한 뒤 메인 세션이 다시 합쳤다. 운영 DB·배포·푸시는 통합 브랜치에만 했다(`main` 에는 쓰지 않았다).

이 문서는 "무엇이 합쳐졌고, 합치면서 무엇을 결정했으며, 사람이 이어서 할 일이 무엇인지"를 남긴다. 각 기능의 정본은 해당 기획·런북 문서다.

---

## 1. 합친 것

| 순서 | 원천 | 내용 | 충돌·결정 |
|---|---|---|---|
| 1 | `origin/main`(e28b23f7) | 하드웨어 재고관리 프로세스·오더 연결(S1~S4)·자료실 수정 등 30커밋 | `schema-contract.ts`·DB 런북에서 10-28 마이그레이션 항목 양쪽 유지 |
| 2 | PR #44 `claude/ecstatic-einstein-4hbjj4` | 시트 가져오기 품목 조회가 따옴표·괄호 이름 행을 빠뜨리던 핫픽스 | 충돌 없음 |
| 3 | `claude/sweet-bohr-144otm` | DSH 파서 Team KR(ALL) Status 2배 집계 수정 | 충돌 없음 |
| 4 | `claude/dazzling-feynman-464ngl` | 임포트 모드 행 상세 404·예정 칸 확정 잠금 복원 | 충돌 없음 |
| 5 | `claude/trusting-archimedes-u0ju5q` | 매출 시트 동기화 뒤 화면 갱신 — 캐시 즉시 만료·결과 표시·하루 3회 크론 | 충돌 없음. `isAnyRunning` → `findActiveSyncRun` 교체가 하드웨어 자동 가져오기(`lib/hardware/sheet-auto-import.ts`)의 import 를 깨뜨린 것을 7번에서 복구 |
| 6 | `claude/jolly-knuth-dwgd68`, 발표자료 v2·v3 브랜치 2개 | AI 강의 분석 표기 통일, 강사 AI 발표자료 | 충돌 없음(문서·`lib/docs.ts`) |
| 7 | `claude/festive-wozniak-iuyrmj` | 운영 밖 동기화 쓰기 가드 + 실행 출처(`branch_sync_runs.runtime`) + 캡처 버전 단조성(`kept`) | `run-all.ts`: 가드 → `findActiveSyncRun` 잠금 순. 잠금 분기는 outcome 없음(화면이 "진행 중"으로 읽음). `complete.ts` 가 가드의 `skipped` 를 `running` 으로 덮던 자동 병합 결함 수정. 공용 응답 타입에 `kept` 변형 추가. `isAnyRunning` export 복구 |
| 8 | 테스트 수정 | `tests/crm/unified-segment-ui` 휴면 플래그 — `GENERATED_AT` 기준 `ago()` 와 `Date.now()` 비교가 작성 30일 뒤 뒤집히던 시한폭탄 | 시계를 가짜 타이머로 고정(PR #39 도 같은 수정을 갖고 있어 하나로 정리) |
| 9 | `feat/0921-cs-approval-customer-answer` | CS 답변 생성의 첨부 이미지 근거를 담당자 승인 분석만으로 | 충돌 없음 |
| 10 | PR #40 `claude/brave-ramanujan-80ja3i` | 네이버 블로그 원고 스냅샷·이미지 27장(6/18 사진 실명 흐림 1장 덮어씀 + 새 글 4편 이미지 26장, 약 12.7MiB) | `scripts/apply-naver-dev.mjs` 는 **10-26 봉인본 유지**(PR 쪽 쓰기 경로 전부 폐기). 스냅샷은 10-26 DB 공개본보다 오래됐으므로 DB 에 되돌려 쓰지 않는다. 런타임 코드 변경 없음 |
| 11 | `cloud_10.0.3` → PR #38 `claude/festive-hamilton-xjgg69` → `claude/quirky-gauss-ieaodm` | 마케팅 프로젝트 갤러리형 1b, 매출시트 DSH 진도 개요 1a, 캠페인 관리·프로젝트 한 화면 통합 | **festive-hamilton 의 1b 가 정본**(cloud_10.0.3 구현은 같은 6파일의 더 이른 중복 시도 — 폐기). 내비는 main 의 콘텐츠 상시 결정 유지 + 마케팅 프로젝트 사이드바 항목 제거(상시 9·기타 7·숨김 1). `/admin/campaigns/projects` 는 `manage?view=projects` 리다이렉트 스텁 |
| 12 | PR #39 `claude/intelligent-wozniak-3bescc`(PR #42 `youthful-cray` 포함) | 장부·REV 탭 통합, 누락·이중 계상 결함 3건, REV 시트 쓰기(ADR-011, 기본 꺼짐), 확도 '확정' 크림슨 | 충돌 3건(지침 맵·스키마 계약·휴면 테스트)만. 자동 병합 뒤 branch·admin·crm·api 테스트 7,348건 통과 |
| 13 | PR #41 `claude/quote-partner-simultaneous-send-v0jgo6` | 하드웨어 C/H 방식 총판 정산 — 총판용 견적서·원가 미수금·매출 원장 초안 | `accept/route.ts`: 처음 수락 시 **오더 보장 → 총판 견적서 자동 발행 → 알림** 순서, 둘 다 try/catch 로 서로 독립(한쪽 실패가 다른 쪽을 막지 않음). 재수락 시 둘 다 재보장. 검증 테스트 4건 추가 |
| 14 | PR #34 `claude/sharp-goldberg-qrydem` | 퍼널 Phase D — contact 직접 채널·패스트트랙, 쇼룸 공휴일 휴무 강제, checkout 희망일 달력, 디자인 토큰 가드 확장 | PR 의 `lib/analytics-paths.ts` 를 **`lib/tracking-paths.ts` 로 흡수**(`hidesPublicChrome`, `isAnalyticsTagExcludedPath`). contact 계측(`trackLeadSubmitted`·`trackFormStart`·prefill sessionStorage·`tel:` 링크)을 새 컴포넌트 구조에 보존. `/checkout` 은 10-28 결정 유지(gtag 만, GTM·픽셀·배너 없음) |

합치지 않은 것과 이유

| 브랜치 | 이유 |
|---|---|
| `cloud_0923-home4.71`, `cloud_0923-home4.71_hard` | 9월 29일 하드웨어·장부 라운드. `main` 보다 160커밋 뒤이고 충돌 35개. 같은 영역이 10-28 `hw-process-*` 병합으로 `main` 에 새로 들어가 사실상 대체됨. 되살릴 조각이 있으면 별도 PR |
| `claude/relaxed-mcnulty-f6c5ba` | "보관용 wip" 로 표기된 브랜치 |
| PR #28 `claude/admiring-dirac-9a012d` | 7월 성능 PR. 570커밋 분기, 재구성 필요 |
| 그 밖의 7월 이전 브랜치·`archive/*`·`codex/*` | 역사 기록 |

---

## 2. 검증

- `npm run typecheck`, `npx eslint app components lib --max-warnings=0`, `npm run check:design-tokens`, `npm run check:vercel-crons`, `npx vitest run` 전체 — 결과는 이 문서 끝 §6 에 기록.
- `npm run build` 의 `postbuild`(`check:public-content`)는 운영 DB 를 읽어 이 환경에서 돌릴 수 없다. 배포 전 Vercel Preview 빌드로 확인한다.

---

## 3. 운영 적용이 필요한 마이그레이션(서울 프로젝트, 파일명 순)

| 파일 | 출처 | 미적용 시 | 확인 |
|---|---|---|---|
| `20261023_branch_rev_sheet_writes.sql` | PR #39/#42 | 시트 쓰기 스위치(`BRANCH_REV_SHEET_WRITE_ENABLED`, 기본 꺼짐)가 꺼져 있으면 영향 없음. 켜기 전 필수 | `check:db -- --strict` 의 `branch_sales_ledger_sheet_writes`·`apply_branch_sales_ledger_draft_if_unchanged()` |
| `20261023_distributor_settlements.sql` | PR #41 | 견적 수락·오더 생성은 그대로, 총판 자동 발행만 건너뜀(화면은 적용 안내, 쓰기 503) | `check:db` 의 `distributor_*` 프로브 3개 |
| `20261028_blog_posts_content_updated_at.sql` | SEO 작업 | 사이트맵·RSS 가 `updated_at` 폴백(지금과 동일) | `check:db` + 파일 머리 `pg_trigger` 조회 |
| `20261028_branch_sync_runs_runtime.sql` | `festive-wozniak` | 동기화는 돌되 실행 출처가 비어 남음 | `check:db` 의 `branch_sync_runs` 프로브 |

이미 적용된 것(10-28 기록): `20261022_*` 3건, `20261028_hardware_inventory_process.sql`. 절차는 [DB 마이그레이션 런북](./db-migration-runbook.md).

---

## 4. 병합하며 드러난 후속 과제(코드 미수정, 담당 결정 필요)

| # | 항목 | 발견 경위 | 담당 |
|---|---|---|---|
| F1 | **쓰기 가드를 거치지 않는 경로 3개** — `app/api/admin/hardware/import-sheet/route.ts`·`lib/hardware/sheet-auto-import.ts` 의 `syncHw()` 직접 호출, `app/api/admin/branch/ledger/db-import/route.ts` 의 `captureRevDbImport` 직접 호출. 로컬·Preview 에서 부르면 운영 DB 에 쓴다 | 7번 병합 | 하드웨어·장부 |
| F2 | `recaptureActiveRevImport` 의 `kept` 분기 `capturedAt: status.capturedAt ?? ""` 가 빈 문자열을 화면 저장소로 보낼 수 있음 | 7번 병합 | 장부 |
| F3 | 담당자 "승인됨" 경로(`app/api/portal/quotes/[id]/route.ts` PUT)는 오더는 만들지만 총판 견적서를 자동 발행하지 않음(PR 범위). 이 경로에서도 `on_accept` 발행을 할지 | 13번 병합 | 영업·하드웨어 |
| F4 | H방식(총판 선구매) 건도 지금은 오더 → 하드웨어 승인 → 배송 예정을 동일하게 거침. 다르게 다룰지 미정 | 13번 병합 | 하드웨어 |
| F5 | **매출 이중 계상 가능성** — 총판 정산이 만드는 매출 원장 초안(C방식 입금 확인 시, H방식 설치 완료 시)과 연결 로직 §1 의 "과도기 하드웨어 매출 원본 = REV 시트"가 같은 매출을 두 번 잡을 수 있음. 검수 규칙 필요 | 13번 병합 | 장부·재무 |
| F6 | `/checkout` 에 동의 배너가 없어 광고에서 곧장 온 동의 전 방문자는 동의할 수 없고 gtag 는 cookieless 만 보냄. 배너를 띄울지 결정 | 14번 병합(D11) | 마케팅·개발 |
| F7 | PR #40 의 새 글 4편(한글 `naver-*` 슬러그 폴더)의 이미지 경로를 10-26 공개본(영문 슬러그)이 참조하는지 운영 DB 확인. 4편이 10-26 공개 23편에 포함됐는지도 | 10번 병합 | 콘텐츠 |
| F8 | `scripts/import-naver-blog-posts.mjs:359` `const module` 의 eslint 오류(`no-assign-module-variable`) — 병합 전부터 있던 것. `scripts/` 는 품질 게이트 범위 밖 | 10번 병합 | 콘텐츠 |
| F9 | `docs/active/admin-tab-restructure-2026-07-29.md` §15 는 09-25 시점 수치(상시 8·기타 7·숨김 2)를 그대로 둠 — 이력 문서. 현재 수치는 [Admin 지침 맵](./admin-guidance-map.md) 기준 | 11번 병합 | 어드민 코어 |
| F10 | 초안→공개 재발행 시 `published_at` 이 now 로 다시 쓰여 datePublished·lastmod 가 바뀜. 원래 발행일 유지 여부 | SEO 작업 | 콘텐츠 |

---

## 5. 열린 PR 처리 제안

PR #34·#38·#39·#40·#41·#42·#44 의 내용은 모두 이 통합 브랜치에 들어 있다(#42 는 #39 에 포함). 통합 브랜치를 `main` 에 올릴 때 각 PR 은 "통합 브랜치로 병합됨" 으로 닫는 것이 맞다. 각 PR 의 리뷰 코멘트가 있다면 이 브랜치에서 처리한다.

---

## 6. 품질 게이트 결과(통합 완료 시점, 메인 세션 실행)

| 게이트 | 결과 |
|---|---|
| `npm run typecheck` | 통과(Node 힙 6GB 필요 — 기본 힙으로는 OOM) |
| `npx eslint app components lib --max-warnings=0` | 통과, 경고 0 |
| `npm run check:design-tokens` | 통과(83 파일·7 루트, allowlist 0 — PR #34 가 공개 화면으로 범위를 넓힌 뒤에도 통과) |
| `npm run check:vercel-crons` | 통과(크론 39개 — 상한 40 에 근접, 다음 크론 추가 전 정리 필요) |
| `npx vitest run` 전체 | 982 파일 · 10,102 테스트 전부 통과(병합 전 실패하던 CRM 휴면 플래그 1건 포함) |
| `npm run build` | 컴파일만 별도 확인(`next build`). `postbuild` 는 운영 DB 필요 — Vercel Preview 에서 확인 |

병합 과정에서 고친 결함(병합 자체가 만들었거나 드러낸 것): `lib/hardware/sheet-auto-import.ts` 의 `isAnyRunning` import 깨짐 복구, `lib/branch/sync/complete.ts` 가 가드 `skipped` 를 `running` 으로 덮던 자동 병합 결함, `lib/db/schema-contract.ts` 프로브 객체 경계 누락(두 프로브가 하나로 붙음), `tests/crm/unified-segment-ui` 시한폭탄 테스트.

---

## 7. 2026-10-30 상태 — 병합 완료, 운영 배포 대기

| 항목 | 상태 | 근거 |
|---|---|---|
| `main` 병합 | **완료.** PR #45(2026-10-29 10:45, 운영자 머지)가 이 통합 브랜치 전체와 발표자료 v3·후킹 루프 문서 브랜치를 최신 `main`(3bf9b41) 위에 올렸다. `main`(a9b2ce32)은 이 브랜치를 모두 포함한다 | `git branch -r --contains` |
| PR #45 가 추가로 내린 결정 | `main` 의 10-28 로컬 커밋(6dd49b8)과 겹친 곳을 정리: 추적 경로 판정은 `lib/tracking-paths.ts` 하나(`main` 의 `lib/analytics-path.ts` 흡수·삭제), `/checkout` 은 gtag 만 유지·URL 정화, 제외 경로에서는 내부 적재까지 중단, Meta 픽셀 `disablePushState`·consent 유지, 챗봇 요약→문의폼은 `stashContactPrefill`/`takeContactPrefill` 하나(`lib/contact/draft.ts` 흡수), 자료 다운로드 구독 전환은 마케팅 동의 + 서버 저장 확인 둘 다 필요, 지도 iframe `referrerPolicy="no-referrer"` | PR #45 본문 |
| `main` 게이트(10-30, 이 세션) | typecheck 통과, vitest 10,147 중 10,145 통과. 실패 2건(`tests/server/cron-auth`, `tests/marketing/meta-instagram-dashboard-cache`)은 실제 `CRON_SECRET`·`META_*` 값이 환경에 있을 때만 깨지는 테스트(PR #45 본문에 명시) | 로컬 실행 |
| 마이그레이션 | **미적용 4건**(`check:db` 10-30 확인): `20261023_branch_rev_sheet_writes`, `20261023_distributor_settlements`, `20261028_blog_posts_content_updated_at`, `20261028_branch_sync_runs_runtime`. 그 밖의 프로브는 전부 ✓(경고는 Compass 뷰 `compass_meta_submissions_v` 뿐, 이 작업과 무관) | `NODE_USE_ENV_PROXY=1 npm run check:db` |
| Vercel 운영 | **아직 10-28 sha(1b679864)**. `main@a9b2ce32` 는 Preview 빌드 READY(`dpl_FB3KC3WtnBdxDAX3GVtXYwnwRDtQ`, postbuild DB 검사 포함). 프로젝트 `productionBranch` 가 `codex/backend2-admin-blog-design` 이라 `main` 푸시는 운영에 자동 반영되지 않는다(AGENTS.md 규칙과 일치) | Vercel API |
| Vercel 운영 환경변수 | 있음: `NEXT_PUBLIC_GTM_ID`, `NEXT_PUBLIC_META_PIXEL_ID`, `NEXT_PUBLIC_GOOGLE_ADS_DEMO_CONVERSION_LABEL`, `NEXT_PUBLIC_SUPABASE_URL`. **없음**: `NEXT_PUBLIC_GA4_MEASUREMENT_ID`, `GOOGLE_SITE_VERIFICATION`, `NAVER_SITE_VERIFICATION`, `NEXT_PUBLIC_NAVER_WCS_ID`, `NEXT_PUBLIC_NAVER_LEAD_CONVERSION_TYPE`, `NEXT_PUBLIC_SITE_URL`. `NEXT_PUBLIC_*` 는 빌드 때 박히므로 운영 배포 전에 넣어야 재빌드가 한 번으로 끝난다 | Vercel API(`/v9/projects/{id}/env`) |
| 클라우드 세션 한계 | 운영 DB 쓰기(Management API `database/query`)와 운영 배포(Deploy API)는 Auto 모드 분류기가 "Production Deploy" 로, `.claude/settings.json` 생성은 "Self-Modification" 으로 차단한다 — 사용자 승인 뒤 재시도해도 같다. 토큰·네트워크는 문제없다 | 2026-10-30 실측 |

### 운영 배포 절차(사람이 실행)

1. 마이그레이션 4건을 파일명 순으로 서울 프로젝트(`pxbrsbovoobowpfarxmn`)에 적용한다. Management API `POST /v1/projects/{ref}/database/query` 에 파일 본문을 `query` 로 넣는다(전부 멱등). 적용 뒤 `NODE_USE_ENV_PROXY=1 npm run check:db` 에서 위 4건이 ✓ 인지 본다.
2. 위 환경변수를 Vercel 운영에 넣는다(값은 [콘솔 런북](./seo-analytics-console-runbook-2026-10-28.md) §2).
3. 운영 배포: Deploy API `POST /v13/deployments?teamId=team_W39YZVJ5OewACs3sFThsXOEv` 에 `{"name":"classinkr-web","project":"prj_iZkSESk178bnLeCUF5MAfu1dPAvs","target":"production","gitSource":{"type":"github","repoId":1186773577,"ref":"main","sha":"a9b2ce320ef36b5bd3fc8558a2baf229198b91d1"}}` — 또는 대시보드에서 `main` Preview 를 Promote to Production.
4. 라이브 확인: `https://classin.co.kr/` 의 `<title>` 이 `클래스인 Classin | 학원 전자칠판·수업 녹화·운영 플랫폼`, Organization JSON-LD `alternateName` 에 클래스인, SearchAction `/docs/search?q=`, `robots.txt` 의 `Allow: /api/og/`, `sitemap.xml` 의 `/resources`·`/download`. 계측은 런북 §8 시나리오.
5. [DB 마이그레이션 런북](./db-migration-runbook.md)의 10-23·10-28 네 절을 "적용 완료" 로 바꾸고 적용 기록 한 줄을 남긴다.

### 머지 뒤 정리(PR #45 본문 기준, 아직 안 한 것)

- 닫을 PR: #34 #38 #39 #40 #41 #42 #44(내용이 #45 에 포함), #28(재구성 필요)
- 지워도 되는 브랜치: #45 가 포함한 19개, `hw-process-*` 4개, `cloud_10.0.2`


---

## 8. 2026-10-30 운영 배포 완료 — PR #48

§7 의 배포 절차 1~5 단계를 마쳤다. 운영은 `main@58ed2237`(PR #48 머지)이다.

### 8-1. 브랜치 판정(원격·로컬 30개, 내용 기준)

브랜치마다 분석 1회 + 병합 권고마다 반박 검토 1회. 스쿼시 병합 때문에 커밋 수가 부풀려지므로 `git cherry`·내용 diff·`git merge-tree` 로 판정했다.

| 판정 | 브랜치 | 처리 |
|---|---|---|
| 병합 | `claude/compassionate-brown-u5w0sj`(이 문서 §7), `claude/blissful-gates-t60cit`(후킹 루프 10-30), 로컬 `claude/adoring-chandrasekhar-0f1d9b`(정직성·개인정보 핫픽스 3건, 충돌 해소해 cherry-pick), `claude/beautiful-tesla-7d342h`(멀티터치 사진 삭제) | PR #48 |
| 작업 중이라 보류 | `cloud_10.3`(어드민 콘텐츠 「한눈에」, PR 없음), `claude/dreamy-wright-k65ld4`(PR #47, 가이드 사진 개인정보 가림 진행 중) | 담당 세션이 끝나면 병합 |
| 운영자 결정 | `cloud_10.0.4`(초안 PR #46 — 원격 16개 통합, 동의 정책 변경으로 GA4·Meta 측정 감소 포함, `cloud_0923-home4.71(_hard)`·`gallant-maxwell`·보관 v3·v5·`codex/crm-customer-placement-motion` 을 품음), `claude/cool-ramanujan-smpryc`(쇼룸 발표 — 고객사 이름·사진 동의 미확인), `design/p0-foundation`·`design/p1-visual`(공개 사이트 개편), 로컬 `anti10-1`(성격이 다른 작업 묶음) | 결정 대기 |
| 이미 있음·대체·폐기 | 그 밖 17개(`codex/supabase-korea-cutover`, `codex/remove-unresponded-webhooks`, `claude/confident-mclean`, `claude/relaxed-mcnulty`, `claude/admin-campaign-marketing-eval`, `claude/homepage-crm-routes-display`, `claude/claude-instructions-agent-review`, `claude/admiring-dirac`(PR #28 — 20개 파일 충돌, 다시 구현 필요), `worktree-cleanup-dead-json-crud`, 로컬 `2.27`·`2.28`·`2.6_MOONI`·`admin-3.0`·`worktree-agent-*` 등) | 병합하지 않음 |

핫픽스 충돌 해소 원칙: 10-28 이후 `main` 이 고친 홈 섹션·FAQ·사례 문구는 `main` 을 따르고, 핫픽스에서는 출처 없는 수치 삭제와 국가 수(150 → 160, "EEO 공식 소개 기준")만 가져왔다. 핫픽스가 지운 `setPhase(3)` 은 되살렸다(그대로면 `/product/sw` 고민→해결 섹션의 통계 카드·CTA 가 영영 안 뜬다).

### 8-2. 운영 적용

| 항목 | 결과 |
|---|---|
| 마이그레이션 | `20261028_branch_sync_runs_runtime` → `20261023_distributor_settlements` → `20261028_blog_posts_content_updated_at`(배포 직전) 적용. `20261023_branch_rev_sheet_writes` 는 이미 적용돼 있었다. 상세는 [DB 마이그레이션 런북](./db-migration-runbook.md) 2026-10-30 적용 기록 |
| Vercel 운영 env | 추가: `NEXT_PUBLIC_GA4_MEASUREMENT_ID=G-6MWTJ8C0L2`(라이브가 이미 `NEXT_PUBLIC_GA_ID` 폴백으로 쓰던 값), `NEXT_PUBLIC_SITE_URL=https://classin.co.kr`(없으면 자동 발송 메일에 수신 거부 링크가 빠진다). **아직 없음**: `GOOGLE_SITE_VERIFICATION`, `NAVER_SITE_VERIFICATION`, `NEXT_PUBLIC_NAVER_WCS_ID`, `NEXT_PUBLIC_NAVER_LEAD_CONVERSION_TYPE` — 각 콘솔 값이 필요 |
| 운영 배포 | `dpl_Cxkq2VVURjUwCMsgCQVzJTTo3hNa`(main `58ed2237`) READY, `classin.co.kr`·`classin.ai.kr`·`classinkr-web.vercel.app` 연결. 되돌릴 곳: `dpl_A1C32wRuCTswNFAgYuSagAi5Ka2e`(`1b679864`, 10-28) |
| GTM | 컨테이너 `GTM-PJH3SWVL` 은 버전 1·태그 0개 — [콘솔 런북](./seo-analytics-console-runbook-2026-10-28.md) §6 의 이중 집계 걱정 없음 |

### 8-3. 라이브 확인(배포 직후)

- §7 4단계: `<title>` 새 문구, Organization `alternateName` 클래스인, SearchAction `/docs/search?q=`, `robots.txt` 의 `Allow: /api/og/`, `sitemap.xml` 의 `/resources`·`/download`(URL 146 → 148) — 전부 확인
- 핫픽스: `/product/sw` 의 `$63.6M`·`4,000만` 0건, "EEO 공식 소개 기준" 표기, `/contact` 의 "2시간 이내" 0건, IP·전화번호 캡처 `admin-dashboard-source-2.webp`·멀티터치 사진 404
- 계측(콘솔 런북 §8): 동의 전 GA4 `G-6MWTJ8C0L2` 쿠키 없는 핑(`gcs=G100`)·쿠키 0, 한 화면 `page_view` 1회, `page_location` 에서 `prefill` 제거(`utm_*` 유지), 홈 → 요금 이동 시 `page_view` 1회 + `pricing_view{pricing_surface:"pricing"}` 1회, "필수만 사용" 뒤 동의 전부 denied·쿠키는 `cln_consent` 뿐·Meta·네이버·카카오 요청 없음
- 실행하지 않은 시나리오: 동의 "수락", 문의·쇼룸·자료 접수(운영 리드가 생긴다), `/share/quote/<토큰>`, 전화 클릭 — 사람이 시크릿 창에서 확인

### 8-5. 개인정보 핫픽스 — PR #50 운영 배포(같은 날)

PR #48 배포 뒤 '정직성·개인정보' 리뷰가 공개 `/docs/files/cs-figma/*` 캡처에서 고객사 교사 이름·전화번호·개인 이메일, 직원 전화·이메일, 시청자 IP, 로그인 없이 열리는 재생 링크를 찾았다(2026-06-21 85784ff8 부터 공개). 예: `/docs/admin/cs-figma-digest-919` 교사 목록, `cs-figma-digest-523` '전체 안내 한 장' 의 교사 전화, `web-live-playback` 시청자 IP.

| 항목 | 결과 |
|---|---|
| 수정 | PR #47(`claude/dreamy-wright-k65ld4` @4a6266ad)의 가림본 81장·사내 전용 13장 삭제·자산 목록·테스트 개수만 바이트 동일하게 가져옴(PR #50, main `898dbe5b`). PR #47 의 나머지(가이드 UI·검색·새 사진)는 그 세션 몫 — 이 경로들은 PR #47 과 같아 나중 병합에서 충돌하지 않는다 |
| 검증 | 지적 영역 라이브본·가림본 나란히 확인, 81장 타일 OCR(라이브본에서 잡히던 이메일·전화·재생 URL 이 가림본 0건), typecheck, `check:cs-figma-assets` 99/99, vitest 10,147 |
| 운영 배포 | `dpl_DY4yEcHFUPV3546reJvNjQBKqUKc`(main `898dbe5b`) READY. 배포 뒤 공개 URL 81장 전부 가림본과 sha256 일치, 삭제 13장 전부 404 |
| **되돌리기 주의** | 이 배포보다 앞선 `dpl_Cxkq2VVURjUwCMsgCQVzJTTo3hNa`(58ed2237)·`dpl_A1C32wRuCTswNFAgYuSagAi5Ka2e`(1b679864)로 되돌리면 가리지 않은 캡처가 다시 공개된다. 코드 문제로 되돌려야 하면 `898dbe5b` 위에서 고쳐 다시 배포한다 |
| 남은 위험 | `/docs/files/*` 는 `Cache-Control: public, max-age=31536000, immutable` 이라 이미 받아 간 브라우저·외부 캐시에는 옛 이미지가 남을 수 있다. 검색엔진 이미지 색인에 올라간 경우 Search Console '오래된 콘텐츠 삭제'로 해당 이미지 URL 을 요청한다 |

같은 리뷰의 문구 지적(코드 미수정, 사실 확인 필요): HW `ValueAnchor` "30일 만족 보장"·"평일 24시간 대응"(근거 없음, 문의 페이지 상담 시간은 평일 09:00~18:00)과 교육 시간 4시간/2시간 불일치, SW FAQ·`/product/ai-report` 의 "외부 다운로드 차단·워터마크"(공개 가이드는 다운로드 방법과 로그인 없는 재생 링크를 안내), HW `PainPointsV2`·`LatencyProof` 의 "분필보다 빠른"·출처 없는 경쟁사 지연 수치(사양 정본은 `lib/hardware/board-specs.ts` 2ms), SW '이 가격에' 포함 항목(1,000명·전담 지원)이 Standard 정의(`lib/billing/plans.ts` 50명·이메일 지원)와 다름.

### 8-4. 남은 일

- GA4 콘솔 설정(콘솔 런북 §5-2~§5-7: 향상된 측정 3개 끄기, 데이터 수정, 맞춤 측정기준 6개, 주요 이벤트 `generate_lead` 하나, 원치 않는 추천·내부 트래픽·보관 14개월·Search Console 연결) — Google 계정 로그인 필요
- 위 env 4개(서치어드바이저·서치 콘솔·네이버 애널리틱스·검색광고 값) 넣고 재배포
- 보류 브랜치 결정(8-1), PR #28 닫기 여부, 병합 끝난 원격 브랜치 정리
- §4 F1~F7·F9·F10(F8 은 PR #48 에서 처리)
