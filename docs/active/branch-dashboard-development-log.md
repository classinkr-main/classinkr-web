# Branch Dashboard 개발 로그

- 위치: `app/admin/branch`
- 작성: 2026-04-27
- 상태: **운영 가능** (45 커밋, 53 tests, build clean, real sync verified)

## 1. 한 줄 정의

회사 BD/MKT/CSM 전 팀의 매출·활동·지역·파이프라인·하드웨어 운영 데이터를 단일 어드민 대시보드에 통합. Google Sheets 2개(Sales Branding + Hardware) + 기존 Supabase 도메인(events, email_campaigns) 결합. Gemini 로 자연어 인사이트 생성, 모든 수치는 코드 계산.

## 2. 산출물 인덱스

### 코드
```
app/admin/branch/{page,loading}.tsx
app/api/admin/branch/{summary,heatmap,pipeline,kpi,hw,insights,data-quality,sync}/route.ts
app/api/admin/branch/insights/history/route.ts
app/api/admin/branch/insights/manager/route.ts
app/api/cron/sync-branch{,-insights}/route.ts

components/admin/branch/{BranchDashboardClient,SyncStatusBar,types}.tsx
components/admin/branch/sections/{InsightCard,CoreKpiGrid,FiscalRoadmap,RegionHeatmap,
  TeamPacingSection,ManagerScorecard,KpiActivityMatrix,PipelineTable,
  CampaignsSection,HardwareSection,DataQualityPanel,DealMixSection}.tsx

lib/branch/
  fiscal.ts                    FY 4월~3월 헬퍼
  google-sheets.ts             Sheets 읽기 + 빨간셀 추출
  parsers/
    rev.ts dsh.ts seg.ts kpi.ts hw.ts
  computations/
    heatmap.ts pacing.ts pipeline.ts core-kpi.ts
    data-quality.ts campaigns.ts member-teams.ts
  insights/
    input-builder.ts                팀 인사이트 input 빌더
    manager-input-builder.ts        매니저 인사이트 input 빌더
    prompt.ts                        시스템 프롬프트 + 스키마
    gemini-runner.ts                 Gemini API 호출 (mode: quality|fast)
    manager-runner.ts                매니저 인사이트 호출
    runner.ts                        팀 인사이트 오케스트레이터
    sanity-check.ts                  수치 검증 (±10% 휴리스틱)
  sync/
    sync-rev.ts sync-hw.ts run-all.ts

lib/repositories/
  branch-deals.ts branch-hw.ts branch-insights.ts branch-sync.ts

supabase/migrations/20260427_branch_dashboard.sql

scripts/                       (운영/디버그 전용, 프로덕션 미사용)
  list-branch-sheet-tabs.ts    시트 탭 이름 조회
  probe-branch-sheets.ts       탭별 헤더/데이터 probe
  probe-cells.ts               셀 단위 디버그 (raw value/format 동시)
  probe-insights.ts            실제 Gemini 호출 + 결과 저장
  run-branch-sync.ts           로컬 inline 동기화 트리거
  verify-sync.ts               동기화 결과 검증 (행수, target, first_payment 등)
  check-branch-tables.ts       Supabase 테이블 존재 확인
```

### 문서
```
docs/superpowers/specs/2026-04-27-branch-dashboard-design.md
docs/superpowers/plans/2026-04-27-branch-dashboard.md
docs/active/branch-dashboard-development-log.md   (이 문서)
```

## 3. 환경 변수

`.env.local` 에 필요:

| 변수 | 설명 |
|---|---|
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | 기존 service account (Sheets/Calendar/Gmail 공용) |
| `GOOGLE_PRIVATE_KEY` | 동일 (`\n` escaped) |
| `GOOGLE_BRANCH_DASHBOARD_SHEET_ID` | Sales Branding 시트 ID |
| `GOOGLE_BRANCH_HARDWARE_SHEET_ID` | Hardware 시트 ID |
| `GEMINI_API_KEY` | Google AI Studio key (인사이트 LLM) |
| `GEMINI_MODEL` | (선택) 기본 cron 모델, default `gemini-2.5-pro` |
| `GEMINI_FAST_MODEL` | (선택) force=1 사용자 클릭용, default `gemini-2.5-flash` |
| `CRON_SECRET` | 기존 cron 라우트 인증 (재사용) |

> ⚠️ `GEMINI_MODEL=gemini-3.1-pro` 같은 미존재 모델은 코드에서 자동 fallback 됨. `UNSUPPORTED_GEMINI_MODELS` 셋에 추가하면 자동 감지.

## 4. 시트 권한

두 시트 모두 service account 이메일에 **Viewer** 공유:
- Sales Branding 시트
- Hardware 시트

탭명은 코드에서 정확히 `'1. DSH'`, `'2. REV'`, `'3. KPI'`, `'4. 지역 매출'`, `판매대시보드`, `재고현황`, `'2.입고 현황'`, `'3.출고 현황'`. 변경 시 `lib/branch/parsers/*.ts` 의 RANGE 상수 함께 수정.

## 5. Vercel Cron

`vercel.json` 에 등록됨:
- `/api/cron/sync-branch` — 4시간 주기 (REV/HW Supabase 동기화)
- `/api/cron/sync-branch-insights` — 매일 새벽 5시 KST (4팀 인사이트 일괄 생성)

배포 시 Vercel 환경변수에 위 env 키 모두 설정 필수. Cron 라우트는 `Authorization: Bearer ${CRON_SECRET}` 검증.

## 6. 데이터 흐름

```
Sheets ─ DSH/SEG/KPI ──── 직조회 + 60s unstable_cache ──┐
       └ REV/HW         ── cron 4h ─► Supabase ─────────┤
                                                         ├──► /admin/branch
events / email_campaigns / leads (기존) ────────────────┤
                                                         │
LLM (Gemini) ── 일 4팀 cron + 사용자 force=1 ─► 캐시 ──┘
```

원칙:
- **시트 = 단일 진실의 원천**. Supabase는 빠른 읽기 캐시.
- **수치 = 항상 코드 계산**. LLM 은 자연어 요약 + 액션 제안만.
- **동기화 실패 시 마지막 성공 데이터 보존**. 화면은 죽지 않음.

## 7. 9개 섹션 구성

| # | 섹션 | 컴포넌트 | 데이터 출처 |
|---|---|---|---|
| 0 | AI 인사이트 | `InsightCard` | LLM (Gemini), 모든 수치는 코드 계산 input 기반 |
| 1 | 핵심 지표 5카드 | `CoreKpiGrid` | summary API |
| 2 | 지역 히트맵 | `RegionHeatmap` | REV (M/Q/Y 토글) |
| 3 | FY 로드맵 | `FiscalRoadmap` | DSH 목표 vs REV 누적 매출 + events/deals/campaigns 마커 |
| 4 | 딜 믹스 | `DealMixSection` | DSH breakdown (Software/Hardware × New/Renew × Direct/Channel) |
| 5 | 팀 페이싱 | `TeamPacingSection` | DSH (Team KR 단일) |
| 6 | 매니저 스코어카드 | `ManagerScorecard` | KPI API + 매니저별 LLM 분석 |
| 7 | 활동 KPI 매트릭스 | `KpiActivityMatrix` | KPI 시트 (LD/ACC/OPP/SOL/VST) |
| 8 | 파이프라인 테이블 | `PipelineTable` | REV 딜별 확률·확정매출·파이프라인 가치 |
| 9 | 캠페인 성과 | `CampaignsSection` | email_campaigns (최근 30일) |
| 10 | 하드웨어 | `HardwareSection` | HW 입출고/재고/판매 |
| 11 | 데이터 품질 점검 | `DataQualityPanel` | 12+1 체크 |

## 8. 시트 ↔ 가정 mismatch (운영 중 발견 + 수정)

| 가정 (spec) | 실제 시트 | 수정 |
|---|---|---|
| 탭명 `DSH/REV/KPI/SEG` | `1. DSH` / `2. REV` / `3. KPI` / `4. 지역 매출` | RANGE 상수 변경 |
| REV 헤더 row 0 | row 1 (row 0 은 통화 합계) | parseRev 헤더 인덱스 1 |
| REV 월 컬럼 매월 1개 | 매월 6개 (월합계 + w1~w5) | 월합계 컬럼만 추출 (정수 1~12 매칭) |
| KPI goals B~F (1-5) / actuals V~Z (21-25) | goals E~I (4-8) / actuals O~S (14-18) | 컬럼 인덱스 변경 |
| KPI row 1 = 첫 멤버 | row 1 = 헤더, row 2 = "Sum" 합계, row 3+ = 멤버 | 데이터 시작 row 3 + Sum row skip |
| DSH = BD/MKT/CSM 팀 + 멤버 행 | Team KR 단일, Software/Hardware × New/Renew × Direct/Channel 분해 | parseDsh 새 구조 (team="ALL" 합산 + breakdown 추출) |
| Team 값 = `BD/MKT/CSM` | `BD/MK/CSM` (MK ≠ MKT) | normalizeTeam 별칭 매핑 (`MK→MKT`, `CS→CSM`, 기타→`기타`) |
| 시트 금액 = 순수 숫자 | `¥ 4,000` 등 통화 기호 + 콤마 | asNumber 에서 `¥₩$€£,whitespace` strip |
| 시트 날짜 = 문자열 ISO | epoch serial number (45524) | readRangeWithFormat 가 formattedValue 우선시 |
| 빨간 셀 = 확정 매출 표시 | 시트에 빨간 셀 0건 (색 컨벤션 없음) | first_payment 있으면 모든 monthly_payments 를 확정으로 fallback |
| 매니저-팀 매핑 = DSH 에서 추출 | DSH 에 멤버 행 없음 | REV 에서 매니저별 가장 빈번한 team 으로 도출 (`deriveMemberTeams`) |
| HW 재고현황 = 현재 재고 | FY별 입출고 누적표 (col 1=제품, col 3+=수량) | parseStock 재구조 + 입출고 합산으로 io_stock 계산 |

## 9. AI 인사이트 디벨롭 단계

| 단계 | 변경 | 임팩트 |
|---|---|---|
| 1차 (베이스) | one_liner + next_actions[5], system prompt 9줄 | 동작은 함, 일부 owner 다중값, DSH breakdown 미사용 |
| 2차 (input 풍부화) | summary_metrics + deal_mix + data_caveats 추가, 4단계 분석 우선순위 프롬프트, response schema 강화 | DSH 풍부 데이터 활용, 데이터 부재 신호 명시, owner 단일 강제 |
| 3차 (속도+안전망) | force=1 시 gemini-2.5-flash (5~10s vs pro 30s), numerical sanity check (±10% 휴리스틱, 3+ warning 시 1회 재시도) | 사용자 click 시 빠른 응답, LLM 환각 자동 검출 |
| 4차 (UX) | InsightCard 상대시각/모델뱃지/재시도뱃지/sanity warning/이전 분석 history toggle | 운영자가 "지금 vs 이전" 즉시 비교 가능 |
| 5차 (매니저 단위) | 매니저별 1:1 코칭 인사이트 (3 actions + strengths/risks), ManagerScorecard 클릭 시 expand | 팀 인사이트 vs 개인 액션 분리 |

## 10. 검증 결과 (실 sync)

첫 sync 후 측정:
- REV: 344 deals (146 with first_payment, 314 with target>0)
- 팀 분포: BD 192 / MKT 88 / CSM 64
- 매니저: Han(105), Heesung(60), Wangchan(59), Somang(52), Junhyuk(28), Gyusung(26), New 2(12), New 1(2)
- 지역: 서울(79), 온라인(63), 경기(55), 대구(33), 부산(31), 충북(21), ...
- HW: inbound 50, outbound 274, stock 26, sales_monthly 36
- LLM 응답 (pro): one_liner + 5 actions, 29s, 입력 수치 정확 인용 확인

## 11. 알려진 제약 / 후속 후보

- **빨간 셀 컨벤션 없음**: 시트가 "확정"을 다른 방식 (별도 컬럼? 굵은 글씨? 메모?) 으로 표시한다면 `lib/branch/parsers/rev.ts` 의 `isRedBg` 변경 + heatmap/pipeline/insights/summary 4곳의 fallback 로직 수정.
- **매니저 "New 1"/"New 2"**: KPI 시트에 placeholder 같은 이름. 실제 매니저인지 운영자 확인 필요.
- **DSH 의 team 분해 부재**: 현재 DSH 는 Team KR 합산만. BD/MKT/CSM 별 goal 비교는 REV 에서 도출 (각 매니저의 team 으로 합산). 더 정확한 비교가 필요하면 별도 시트 또는 컬럼 필요.
- **인사이트 history diff**: 현재는 timeline 만. "지난 주 vs 이번 주" 자동 비교 코멘트는 미구현.
- **Numerical sanity tolerance**: 10% hardcoded. 실 운영 시 false positive 너무 많거나 적으면 조정.

## 12. 주요 커밋 (시간순)

```
c085c89  fiscal-year helpers
590e88f  supabase tables + replace functions
f299e75  repository skeletons
8ed3de4  google sheets reader
6d454f7  REV parser
8426033  DSH parser
db18bc4  SEG parser
35c7eba  KPI parser
d946eb3  HW parsers
7e57c81  heatmap
ce9db62  pacing
0a09102  pipeline
b0dbf7e  core KPI
70c9d2a  data quality
a06a681  campaign summary
0562185  REV sync
bef8d81  HW sync
508b3d6  runAll
70a6895  sync routes (manual + cron)
4b0a384  /admin/branch shell
cadc563  dashboard client + toggles
e9f590d  summary API + 5 cards
d979eac  region heatmap UI
20cc4a5  FY roadmap
c66ab1f  team/manager + activity matrix
91268df  pipeline table
997da09  campaigns section
93441e8  HW section
e2b171b  data quality panel
f816861  insight input builder
a3d29d6  gemini runner
e86f501  insights API + cron + InsightCard
3e48e2b  react-hooks fix
e8d4915  code review fixes (server-only, Q4 velocity, stale lock, rate limit)
ab3d051  parsers vs real sheet alignment
b8af9e4  currency/date format handling
0b15600  full sync verified
e058545  team aliases + member-team + DSH breakdown
ac1e035  deal mix section
3a9ad37  insight input enrichment + prompt v2
03c1da8  fast model + numerical sanity
5876a89  insight history + UX polish
caa4352  manager-level insight
```

총 45 커밋, 53 tests passing, lint clean, build clean.

## 13. 운영 가이드

### 동기화 수동 트리거

```bash
# 운영자 (admin 로그인 후)
POST /api/admin/branch/sync   (Authorization: Bearer ADMIN_PW)

# 또는 로컬 (스크립트)
npx tsx --conditions=react-server scripts/run-branch-sync.ts
```

### 시트 변경 시 체크리스트

1. 탭 추가/삭제 → `lib/branch/parsers/*.ts` 의 RANGE 상수 갱신
2. 컬럼 추가/이동 → 해당 parser 의 인덱스 매핑 갱신
3. 새 컬럼 의미 추가 → `BranchRevDeal` 인터페이스 + 마이그레이션 + parser
4. 새 팀 등장 → `lib/branch/parsers/rev.ts` 의 `TEAM_ALIASES` 매핑 추가
5. `npm run build` + `npx vitest run tests/branch` 통과 확인 후 배포

### 디버깅

- 동기화 실패 → `branch_sync_runs` 테이블 최근 행의 `error` 필드 확인
- 빈 매출 → REV 의 `first_payment` 가 있는 행 카운트 확인 (`scripts/verify-sync.ts`)
- 인사이트 환각 → `branch_dashboard_insights.raw_response._warnings` 확인 (sanity check 결과)
- 잘못된 모델 → `_model` / `_mode` 필드 확인

### 비용 추정

| 항목 | 호출 빈도 | 비용/월 (Pro 기준) |
|---|---|---|
| Sheets API (read) | cron 4h × 4 영역 + 직조회 캐시 | $0 (free tier) |
| Supabase | replace ~700 rows × 6/일 | $0 (existing plan) |
| Gemini Pro (cron) | 일 4팀 × 30일 = 120 | ~$3-5 |
| Gemini Flash (force=1) | 임의 사용자 클릭 (rate limit 1/min/team) | ~$0.5 |
| Gemini Flash (manager click) | 임의 (캐시 없음) | ~$1-2 |

월 합계 약 **$5-10** (사용량 따라). 미달 시 모델을 모두 flash 로 바꾸면 $1 미만.
