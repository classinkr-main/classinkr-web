# 파트 가이드 — 마케팅 / 그로스 / CRM (Growth)

> 담당 에이전트: `.claude/agents/growth-crm.md` · 기준 시점: 2026-06-23
> 변경 검증: `npx eslint app components lib --max-warnings=0` + `npm run build`

## 1. 파트 한 줄 정의

공개 사이트의 **리드 퍼널(동의 → 캡처 → 알림 → 자동화)**, 외부/내부 **분석 추적**, **이메일/캠페인**, 그리고 어드민의 **CRM(Portal V2 + 샤오셔우이/NEO + 시트 매출) · 지사(Branch) 대시보드 · 노션 마케팅 캘린더 라이브 연동**을 묶어, 흩어진 3개 장부를 하나의 학원(Account) 360 스파인으로 합치는 "지사 운영 OS(ERP)" 영역.

## 2. 핵심 디렉토리/파일 맵

- `lib/server/lead-capture.ts` — 리드 캡처 핵심: honeypot·중복창·검증, saveLead + 시트/웹훅/채널톡/구독DB 멀티전달 + `triggerOnSubmitRules` + 알림 emit.
- `app/api/lead/route.ts` — 리드 제출 API(동일출처·레이트리밋 가드 → submitLeadCapture).
- `lib/submitLead.ts` — 클라이언트 UTM/gclid 등 attribution 수집 + 제출.
- `lib/consent/consent.ts` + `app/api/consent/route.ts` — 쿠키 동의(옵트인) + Consent Mode v2 + `consent_logs` 감사(IP는 sha256만), `cln_aid` 익명ID.
- `lib/analytics.ts` + `lib/analytics-config.ts` — `trackEvent`/`trackAdsConversion`: dataLayer/gtag/Meta/Kakao + 내부 `/api/track/event` 적재(동의 게이팅).
- `app/api/track/event/route.ts` — 내부 이벤트 적재: `ALLOWED_EVENTS` 화이트리스트 + 파라미터 allowlist + PII redaction → `client_events`.
- `lib/admin-crm-revenue.ts` — 매출 퍼널 대시보드(견적→계약→수금), 시트 REV 매칭/이중계상 제거(`crm_source_links` confirmed만 합산).
- `lib/admin-crm-overview.ts` — 비즈니스 KPI 집계 + 싱크 건강도(레거시+V2 합산 시 중복 위험 주석).
- `lib/admin-crm-neo.ts` / `admin-crm-customers-neo.ts` — NEO/샤오셔우이 매출·고객·EEO·리뉴얼(한국 스코프).
- `lib/admin-crm-scope.ts` — 한국 스코프 판별(`EXTERNAL_CRM_KOREA_ONLY=true`).
- `lib/crm-source-linking.ts` + `lib/repositories/crm-source-links.ts` — 학원명 매칭 스코어링 + 자동확정(minConfidence 0.92, minGap 0.15).
- `lib/external-crm/sync-chain.ts` + `xiaoshouyi-sync.ts`/`-write.ts` — 샤오셔우이 야간 싱크 → 후보 생성 → 알림.
- `lib/notion-marketing-calendar.ts` — **노션 마케팅 캘린더 라이브 읽기**(서버전용 토큰, 5분 TTL, graceful, readonly).
- `lib/branch/` (google-sheets, sync, parsers, computations/rev-confirmed.ts, insights) — 지사 대시보드: 구글시트 싱크 + 색상기반 매출확정 + Gemini 인사이트.
- `lib/automation-engine.ts` + `automation-types.ts` — 세그먼트 수신자 추출 + on_submit 규칙 실행(`leads`+`newsletter_subscribers` dedupe).
- `lib/email.ts` / `lib/resend.ts` / `lib/marketing-data.ts` / `lib/marketing-types.ts` — Resend 발송 엔진 + 구독자/캠페인 모델(현재 `data/*.json` 폴백).
- `app/api/meta/webhook/route.ts` — Meta Lead Ads 웹훅(서명검증 → leadgen fetch → `source:"meta_lead_ads"` 리드).

## 3. 가장 중요한 업무

- **리드 퍼널 무결성**: 제출이 절대 무음 실패하지 않게 — 저장 실패 시 502 + incident 알림, 중복창(60s)·honeypot·레이트리밋(5/min).
- **동의 게이팅 정확성**: 분석동의→내부적재/GA, 마케팅동의→Meta/Kakao 픽셀. Consent Mode v2 신호가 외부 픽셀 발화 최종 통제.
- **매출 이중계상 제거**: 시트 REV·샤오셔우이·V2 딜을 `crm_source_links` status=confirmed로만 합산. 미확정은 "검토 대기"로만 노출.
- **노션 캘린더 라이브 연동 유지**: Supabase 복제 없이 읽기전용 머지만.
- **지사 매출 확정**: 구글시트 셀 색상(빨강=확정/파랑=90%+)을 매출 확정 신호로 파싱.

## 4. 지침 & 규칙

- **어드민 API 가드**: `app/api/admin/crm/**`·`branch/**`는 전부 `verifyAdmin()` + `createSupabaseAdminClient()`(RLS 우회).
- **CRM 한국 스코프**: `EXTERNAL_CRM_KOREA_ONLY=true` — 현 샤오셔우이 인스턴스는 한국지사 전용이라 모든 외부 레코드를 한국팀으로 본다. owner_name이 숫자ID로만 와서 매니저 휴리스틱 신뢰 불가. 본사 통합 시 false로 복구.
- **자동확정 임계**: `crm_source_links` minConfidence 0.92 / minGap 0.15(둘 다 만족). 매칭 임계: normal 0.72, secondary-signal 0.45.
- **소스 우선순위**: app_v2 > xiaoshouyi > lead > branch_rev_sheet.
- **Consent/Lead**: 옵트인 기본(미결정=전부 거부). `marketingConsent===true`일 때만 구독DB 동기화. 쿠키 13개월(391일, KR PIPA), 정책버전 명시. IP 원본 미저장(sha256만).
- **Notion = SoR, 복제 금지**: ERP blueprint §4·§6 명시 — 노션 캘린더를 Supabase로 복제 ❌. `NOTION_API_TOKEN`은 서버전용(`NEXT_PUBLIC_` 금지).
- **추적 컨벤션**: 이벤트는 `lib/analytics.ts` `EventNames` 유니온 + `/api/track/event` `ALLOWED_EVENTS`·`ALLOWED_PARAM_KEYS` 양쪽에 등록(누락 시 무음 드랍). 파라미터는 화이트리스트만 + PII redaction.

## 5. 절대 깨면 안 되는 것 / 주의점

- **PII/consent**: `/api/track/event`는 email/주민번호/전화 redaction + allowlist 필수 — 새 이벤트에 PII 유입 금지. `consent_logs`에 raw IP 금지. 마케팅 픽셀은 `consent.marketing` 없이 발화 금지.
- **매출 sync 무결성**: 레거시 contracts/receipts + V2 deals 무비판 합산 시 이중계상. confirmed source-link로만 dedupe. 시트 색상 파싱(`rev-confirmed.ts`) 깨지면 확정/예상 매출 혼선.
- **Notion live rule**: `notion-marketing-calendar.ts` 실패는 빈 배열로 격리(다른 캘린더 소스 보호). 양방향 쓰기/Supabase 백업 추가 금지. 토큰 클라이언트 노출 금지.
- **Analytics 이중집계**: `trackEvent`가 dataLayer push + gtag + 내부 fetch를 한 번에 — GTM에서 같은 이벤트 또 태깅하면 더블카운트. Meta는 page_view/view_resource_card 제외 로직 유지.
- **리드 저장 실패 처리**: stored=false면 중복창 클리어 후 502(재시도 허용). 이 분기 깨지면 리드 유실.

## 6. 관련 문서

- `docs/active/erp-blueprint-2026-06-22.md` — **최상위 로드맵 단일 문서**(thesis·Phase 0~5·노션 §4·거버넌스 3결정).
- `docs/active/lead-funnel-consent-auth-scoring-plan-2026-06-14.md` — 동의/인증/스코어링 기획.
- `docs/active/crm-sheet-revenue-sync-plan.md` — 시트↔매출 싱크.
- `docs/active/korean-crm-admin-integration-plan-2026-06-10.md` (+ `*-operational-unblock-runbook.md`/`*.sql`) — NEO/샤오셔우이 통합 + 마이그 런북.
- `docs/active/crm-ia-phase3-plan-2026-06-12.md` (+ `*-url-migration-checklist.md`) — CRM IA 재구성.
- `docs/active/MARKETING_EMAIL_SYSTEM.md`, `email-campaigns-ux-upgrade.md` — 이메일/캠페인.
- `docs/active/branch-dashboard-development-log.md`, `admin-2.201-sales-ops-upgrade.md` — 지사 대시보드.
- `docs/active/neo-crm-integration-request.md`, `page-form-webhook-guide.md` — NEO 연동, 페이지폼 웹훅.

## 7. 현재 목표 & 백로그 (2026-06-23 스냅샷)

- **ERP thesis**: 새 탭이 아니라 ONE 스파인 = 학원(Account) 360. 3개 장부를 `crm_source_links`로 합쳐 한 학원=생애매출·HW대수·SW활성·만료·오너 1뷰 + 매출 한 번만 집계 + "오늘 할 일" 코파일럿. 노스스타: HW설치→30일 SW활성, 리뉴얼 80%.
- **이미 구현(재빌드 금지)**: 골든타임 24h(`unresponded_24h`/`lead-response-alerts`), Lead Router(on_submit AutomationRule), `crm_source_links` 자동확정, `/admin/overview` OS 요약 스트립, 노션 캘린더 라이브 연동.
- **In-flight 백로그**: (Phase 0) 커버리지 지표·UTM 정규화 채널 리드 KPI·HW 진척바 / (Phase 1) `account_master` 읽기뷰·리뉴얼 캘린더 v1 / (Phase 2) 귀속 1컬럼 jsonb(자문형)·`branch_kpi_targets` 시트→DB / (Phase 5) `cs_tickets` 영속화(현 `channel-conversations.json` 서버리스 비영속=유실버그).
- **거버넌스 3결정(대기)**: ①매출 book-of-record ②귀속 단일 오너+자문형 ③목표 소스 시트→DB.
- **알려진 갭**: 브랜치 파이프라인 칸반(`components/admin/branch/sections/BranchPipelineKanban.tsx`)이 아직 하드코딩 BD 4단계 + `hashStageIndex` 임시 매핑이고, 팀별 stage 분기(MKT: lead/account/content/event vs CSM: template/case study/event)를 반영하지 못함.

## 8. 검증 방법

```bash
npx eslint app components lib --max-warnings=0
npm run build
```
- **추적**: 새 이벤트는 `lib/analytics.ts` `EventNames` + `/api/track/event` ALLOWED_EVENTS/ALLOWED_PARAM_KEYS 양쪽 등록. `client_events` 마이그(`20260429_client_events.sql`) 적용 필요(미적용 시 INSERT 무음 실패).
- **노션 스모크**: 날짜행 없는 달이면 캘린더를 데이터 있는 달로 이동해 확인. prod엔 `NOTION_API_TOKEN` 필요.
- **CRM**: `app/api/admin/crm/readiness` / `admin-crm-readiness.ts` / `admin-crm-schema-contract.ts`가 스키마 계약·중복·자격증명 사전점검.
- **동의/리드**: 크로스오리진 403, 레이트리밋, honeypot 드롭, 중복창 분기 확인.

## 9. 작업 시작 시 먼저 읽을 것

1. `docs/active/erp-blueprint-2026-06-22.md` — 로드맵·결정·비범위 단일 출처.
2. `lib/server/lead-capture.ts` — 리드 퍼널의 모든 분기(검증·전달·알림·자동화).
3. `lib/admin-crm-revenue.ts` + `lib/crm-source-linking.ts` — 매출 집계·이중계상 제거(0.92 자동확정).
4. `lib/notion-marketing-calendar.ts` + `lib/calendar-data.ts` — 라이브-복제금지 규칙의 실제 구현.
5. `lib/analytics.ts` + `app/api/track/event/route.ts` + `lib/consent/consent.ts` — 추적·동의 게이팅·PII 규약.
