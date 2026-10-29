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

## 7. CRM 배치·챗봇 민감 답변 통합 시 결정(2026-10-30)

- 확인된 SLA 리드가 24시간 넘게 미응답이면 임박한 계약보다 먼저 배치한다. 단, 우선순위 엔진이 정한 게이트·장기 미응답 감쇠와 고위험 만료 직후 고객의 골든타임은 유지한다. 동률은 기존 엔진 순서다. 연락 기록이 있는 리드는 원천 상태가 아직 `new`여도 응대 대기가 아닌 후속 확인으로 표기한다.
- 고객 360 모달 진입 모션과 모바일 선택 강조를 현재 분리된 고객 목록에 적용한다. `prefers-reduced-motion`에서는 모션을 끈다.
- 보안·개인정보, 설치 기간, A/S, 연동 가능 범위, S65 단일 상세 사양은 고정된 확인 필요 답변을 제공한다. 여러 모델 간 비교는 기존 공식 사양 가이드 검색을 유지한다. FAQ의 요금·설치·연동·지원 범위는 최신 견적과 실제 조건 확인을 전제로 한다.
- 내부 CS 전송 리댁션과 담당자 검토본 요구는 현재 구현을 유지한다. 과거 `20260719123000_internal_cs_consultation_rpc_no_overload.sql`은 도입하지 않는다. 같은 RPC의 단일 서명은 기존 `20260828_channel_match_rpc_single_overload.sql`과 운영 런북을 정본으로 사용한다. 이 판단은 DB 적용 상태를 확인하거나 마이그레이션을 실행했다는 의미가 아니다.
