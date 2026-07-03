# 어드민 유기적 구조 감사 (2026-07-02)

방법: 멀티에이전트 전수 감사 — 도메인 유닛 7개(CRM 고객/CRM 운영/하드웨어·지사/컨텐츠/마케팅/세일즈/챗봇·플랫폼) + 교차 스윕 6개(고아 API×3, 인증 가드, nav IA, 라이프사이클 흐름), critical/high 이슈는 적대적 검증자가 코드 재확인(21건 중 17건 확정, 4건 기각). 대상: `app/admin/**` 페이지 약 60개, `app/api/admin/**` 라우트 178개.

## 1. 즉시 수정 대상 버그 (P0 — 제품 결정 불필요)

| # | 심각도 | 내용 | 파일 |
|---|--------|------|------|
| 1 | critical | ContractsPanel·ReceiptsPanel이 `GET /api/admin/partners` 응답을 `{ partners }`로 기대하나 실제는 `{ workspaces }` — 계약 목록 파트너명이 UUID로 표시, 영수증 발행 폼 파트너 셀렉트가 항상 비어 발행 자체가 불가 | [ContractsPanel.tsx](../../components/admin/documents/ContractsPanel.tsx), [ReceiptsPanel.tsx](../../components/admin/documents/ReceiptsPanel.tsx) |
| 2 | high | CRM 인사이트 전환 퍼널 영구 미렌더 — `/api/admin/crm/action-kpis`는 `{ leads: {...} }` 반환인데 CrmInsightsClient가 언래핑 없이 사용(홈은 올바르게 언래핑) | [CrmInsightsClient.tsx](../../components/admin/crm/CrmInsightsClient.tsx) |
| 3 | high | 오버뷰 '연동 상태' 상시 오탐 — `GET /api/admin/settings`가 웹훅 URL 8종을 마스킹(빈 문자열)하는데 이를 연결 여부 판정에 사용, 항상 '미연결 4건' 경고. 올바른 소스는 `settings/integrations/status` | [overview/page.tsx](../../app/admin/overview/page.tsx) |
| 4 | high | ~~`/admin/commercial` 한국어 mojibake 렌더(검색 placeholder·고객 칩) + 중복 검색 input 2개 + hidden 잔해 블록~~ — 2026-07-02 딜 파이프라인 폐기로 페이지 삭제, 해소 | `app/admin/commercial/page.tsx` (삭제됨) |
| 5 | medium | `/admin/crm/deals/orders?deal={id}` 딥링크 4곳이 생성되지만 PortalHome이 쿼리를 읽지 않아 딜 포커스 소실 | [deals/orders/page.tsx](../../app/admin/crm/deals/orders/page.tsx) |
| 6 | medium | `/admin/materials` → `/admin/analytics?tab=tracking` 딥링크가 제거된 탭을 가리켜 조용히 leads 탭 폴백 | [materials/page.tsx](../../app/admin/materials/page.tsx) |
| 7 | medium | MarketingDashboard·SmsComposer가 `adminFetch` 대신 plain fetch — legacy 토큰 세션에서 401 | [MarketingDashboard.tsx](../../components/admin/marketing/MarketingDashboard.tsx) |
| 8 | medium | marketing/ai·subscribers·automation·git-log 라우트 한글 문자열 mojibake(사용자 노출 에러 메시지 판독 불가) | 해당 route.ts 4종 |
| 9 | low | 사이드바 warm-up 캐시 키 불일치 2건(chatbot/stats 쿼리, calendar year/month) + `/admin/quotes` warm-up이 죽은 V1 API를 데움 | [AdminSidebar.tsx](../../components/admin/AdminSidebar.tsx) |

## 2. 흐름 단절 (missing-handoff, 검증 확정)

1. **CRM 쓰기 승인 큐 데드엔드**: UI는 approve(PATCH)까지만 가능, 실제 Xiaoshouyi 쓰기(`write-requests/[id]/execute`)를 부르는 UI/크론이 전무 — approved 요청이 영원히 실행 안 됨.
2. **V1 계약 서명 전 구간 데드엔드**: sign_token 생성 코드 부재, `/share/contract/[token]`에 서명 UI 없음, `applyPartnerSignature` 미호출, 계약 생성 UI도 없음(POST 콜러 0).
3. **리드→견적 수동 재입력**: convert-v2가 만든 customer/deal이 견적 작성으로 이어지지 않음. QuickQuote는 고객을 또 생성(중복 유도). `quotes.lead_id` 컬럼은 죽은 링크.
4. **convert-v2 멱등성이 notes 텍스트 마커 의존**: `customers.notes ilike '%원본 리드 ID%'` — 노트 편집 시 재전환하면 고객/딜 중복 생성. 정식 링크(crm_source_links)는 기록만 하고 판정에 안 씀.
5. **하드웨어 출고→CRM 매출 미반영**: 출고 movement가 reference_no로 딜을 가리키지만 딜 installed_amount/stage 어디에도 반영 없음(기존 메모리의 '출고 매출 미캡처 함정' 재확인).
6. **전환된 고객이 통합 고객 목록에서 소실**: crm-unified-customers가 lead/neo 2원천만 합성 — portal customers(전환 산출물)는 deals 탭에서만 보임.
7. **채널톡 마이닝이 섬**: FAQ 후보→추천질문 승격 API가 있는데 버튼 없음, 미매칭 상담→리드 생성 없음, matchedLeadId 배지가 CRM 홈으로만 링크.
8. **문서 발행→챗봇 reindex가 클라이언트 best-effort** (`.catch(()=>null)`) — 실패 무통보, 롤백 경로는 미갱신.

## 3. 이중/삼중 모델 (duplicate-logic)

| 개념 | 계열 | 증상 |
|------|------|------|
| 견적·계약·영수증 | V1(partner 기반 quotes/contracts/receipts) vs V2(deal 기반 quote_documents/…) | `/admin/quotes` 한 화면에서 탭마다 다른 모델, 채번 `Q-{year}-{seq}` count 기반이 양쪽 독립 → 중복 번호 가능 |
| 딜 | portal deals vs crm_deals(deals-lite) vs 파트너 워크스페이스 | 상호 FK 없음, 'CRM 딜' 이름 아래 3계열 |
| 매출 지표 | admin-crm-overview vs admin-crm-revenue | outstanding 보정 등 계산식 상이 — 홈 히어로와 딜 대시보드 숫자 어긋남 가능 |
| 재고 | branch_hw staging(정규식) vs hardware_movements 원장 | low 임계값도 상이(2/5 vs reorder_point), 수기 입출고는 원장에만 |
| 행사 집계 | signup-counts(notes 토큰 파싱) vs event-attendance vs campaigns 클라 조합 | 토큰 키도 `[event:slug]` vs `[event:id]` 불일치로 events 신청수 누락 |
| source_links 정합성 | coverage API vs 매칭 인박스 totals vs overview RPC | 같은 화면에 상이 수치 동시 노출 가능 |
| 구독자/캠페인 KPI | marketing 클라 vs marketing/stats vs analytics 클라 | windowing·성공률 정의 상이 |
| 업로드 | admin/upload(blog-images) vs events/upload | 검증·rate-limit 중복 구현, docs 이미지가 blog 버킷에 저장 |

## 4. 고아 API (콜러 0, grep 검증)

**삭제 후보(대체 경로 존재)**: ~~`crm/source-links/lead-conversion`(convert-v2가 repo 직호출), `quotes` V1 3종(`quotes/[id]`, `quotes/[id]/convert`, POST), `meta/status`, `auth` DELETE, `docs/articles/[id]` GET, `event-metrics/[id]` GET·DELETE, `receipts/[id]` GET·PUT~~ — 2026-07-02 전부 삭제 완료.

**UI가 없어 죽은 것(살리거나 지우거나 결정 필요)**: automation CRUD 6종(규칙/템플릿 편집 UI 전무 — DB 직접 조작 의존), `teams` CRUD, `install-schedules` CRUD, `hardware/items/[id]` PATCH(품목 메타 편집), `crm/capture/batches/[id]` GET + cancel(배치 이어하기/취소 불가 → draft 누적), `crm/write-requests/[id]/execute`(§2-1), ~~`branch/insights/history`·`manager`(고아 컴포넌트 전이 — **LLM 비용 라우트가 UI 없이 열려 있음**)~~(2026-07-02 고아 컴포넌트와 함께 삭제), `crm/tasks/[id]` GET·DELETE, `crm/deals-lite/[id]` DELETE, `partners/*` GET 계열(서버 직조회로 대체됨), `marketing/ai`(고아 컴포넌트 전이), `crm/mcp-context`(외부 MCP 계약 여부 확인 후 결정).

**고아 컴포넌트**: ~~PartnerCustomersPage(+CustomerDetailSlideOver 어드민 잔재)~~(2026-07-02 commercial 폐기와 함께 삭제), AiCampaignComposer, AutomationRuleSlideOver 외 자동화 UI 6종, ~~branch sections 6종(RegionHeatmap/InsightCard/ManagerScorecard/KpiActivityMatrix/TeamPacingSection/TeamKpiIndexSection), DocsQuestionClusterBacklog, AdminAuthGate, 블로그 목록 편집 Dialog(unreachable)~~(2026-07-02 삭제 완료 — 블로그 Dialog는 handleSave까지 제거).

## 5. 고아/중복 페이지 (nav IA)

- **완전 고아(인바운드 0)**: `/admin/receipts`, `/admin/contracts`(quotes 탭과 동일 패널 중복 — CRM은 redirect 스텁으로 정리했는데 문서 계열은 방치), `/admin/materials`(고유 기능 '오늘 먼저 볼 항목' 사장).
- **고립 섬**: ~~`/admin/commercial` + `/admin/commercial/board`(nav 숨김 이후 진입로 0 — 전용 API `deals`·`commercial/overview`도 도달 불가로 잔존, 향방 결정 필요)~~ — 2026-07-02 폐기 확정: 페이지·전용 컴포넌트·전용 API(`deals`, `commercial/overview`)와 콜러가 사라진 `customers`·`members` API까지 삭제 완료.
- **막다른 페이지**: `/admin/marketing`(campaigns EmailHubPanel 링크로만 진입, 복귀 링크·nav 하이라이트 없음).
- **은닉**: `/admin/crm/insights`·`/admin/crm/deals`(nav·서브탭 부재, 홈 하단 텍스트 링크와 ⌘K로만), `/admin/crm/matching`(직속 nav 없음).
- **⌘K 팔레트가 6-29 IA 재편 미반영**: 그룹 체계 상이, channel-talk·customers/unified·capture·activity 항목 부재 — NAV 배열에서 파생 생성으로 SSOT화 권장.
- '문서 보강 큐' nav 항목이 redirect 스텁 경유라 active 하이라이트 영구 불능(sidebar-docs-gaps.test.ts가 현 구조를 고정 중).

## 6. 데이터 영속성 리스크

- **JSON 파일 저장소가 프로덕션(서버리스 읽기전용 FS)에서 쓰기 불가/유실**: lead-magnets, event-metrics, channel-conversations(코드 주석 스스로 인정 — cron이 여기 씀), bugs/roadmap/patch-notes의 42P01 폴백 쓰기.
- capture parse 매칭 후보 `limit:2000` 메모리 스냅샷 — 초과분 고객 조용히 누락 → 중복 리드 생성.
- subscribers 1000행 고정 캡, leads GET 페이지네이션 부재.
- SMS 발송이 provider 스텁(console.log)인데 `status='sent'` 기록 — write-only 테이블.
- `git-log` 라우트가 child_process `git` 실행 — Vercel에서 항상 500.
- import-ledger 실행 시 branch staging 빈 배열 교체 → 다음 시트 동기화까지 `/admin/branch` HW 전 품목 재고부족 오탐.

## 7. 인증 가드 현황 (양호)

178개 라우트 전수 정적 분석(2중 기법 교차검증): 무가드는 의도적 공개인 `auth`·`auth/logout` 2개뿐, 부분 가드 0건. 다만:
- **심층방어 부재**: proxy.ts는 `/admin` 페이지만 리다이렉트, `/api/admin/*`은 통과 — 유일한 보호막이 각 route.ts 내부 가드 호출이며 이를 강제하는 CI 스윕 테스트 없음(라우트 1개 실수 = 전체 노출). **가드 존재를 검사하는 스냅샷 테스트 추가 권장.**
- CRM 롤 매트릭스 파편화(검증 확정): unified·360·capture는 BRANCH 허용, leads·customers-neo·matching·coverage는 거부 — 사이드바는 BRANCH에게 CRM을 노출하므로 깨진 화면 발생. 게다가 unified가 같은 데이터를 합성 반환하므로 원천 API 거부는 보호 효과도 없음(우회 노출).
- 가드 스타일 3종 혼재(verifyAdmin / requireVerifiedAdminContext / verifyAdmin+getVerifiedAdminContext 이중 호출 — 후자는 세션 검증 왕복 2회).

## 8. 재설계 로드맵

### Phase 0 — 버그 수정 ✅ 완료 (2026-07-02)
§1의 P0 전건 수정. commercial mojibake(#4)·materials 딥링크(#6)는 Phase 1의 폐기/스텁화로 흡수. warm-up은 지시 3건 외 같은 결함 2건(calendar 페이지 키, overview settings URL) 추가 교정.

### Phase 1 — 죽은 것 정리 + nav 정합 ✅ 완료 (2026-07-02)
- commercial 폐기 확정 반영: 페이지 2·전용 컴포넌트 2·전용 API 3 + 콜러가 사라진 `customers`·`members` API와 `admin-members` repo까지 삭제(총 28파일), 잔존 참조 0.
- redirect 스텁 4(receipts/contracts/software-quote-codes → quotes 탭, materials → lead-magnets) + 레거시 스텁 경유 링크 5곳 직링크화.
- nav SSOT: [admin-nav.ts](../../components/admin/admin-nav.ts) 신설, ⌘K 팔레트 파생 재구성(누락 4항목 포함), '문서 보강 큐' 직링크 + 쿼리 인지 active 매칭.
- 가드 스냅샷 테스트 [admin-route-guards.test.ts](../../tests/api/admin-route-guards.test.ts) 신설(전 라우트 자동 편입, 음성 검증 완료).
- CRM 롤 매트릭스: 총 27개 라우트 CRM_STAFF 통일(GET 완화, 쓰기 기본롤 유지) + [crm-role-matrix.test.ts](../../tests/admin/crm-role-matrix.test.ts).

### Phase 2 — 유기적 흐름 복원 ✅ 완료 (2026-07-02, 스키마 변경 없이)
- **리드 계보**: convert-v2 멱등 판정을 crm_source_links 확정 링크 SSOT로 교체(레거시 notes 마커 폴백 유지), 전환 직후 '딜 열기/고객 보기' 딥링크 패널.
- **unified 3원천**: portal customers를 '전환 고객' 소스로 병합, 링크 기반 리드 행 접기(중복 제거), 소스 필터/배지/요약 카드.
- **승인 큐 완결**: approved 행 '실행' 버튼(execute 와이어링) + 감사 이벤트 로그 확장 행. 자동 실행 크론은 미구현(후속).
- **capture 라이프사이클**: 배치 목록 GET 신설 → '이어서 하기/취소', apply 완료 딥링크.
- **행사 attribution**: [lib/events/attribution.ts](../../lib/events/attribution.ts) 공용 파서로 slug/id 토큰 정규화 집계 — signup-counts 누락 해소, 토큰 생성부 slug 통일.
- **채널톡 루프**: FAQ 후보 → 추천질문 원클릭 승격(draft), 미매칭 상담 → 리드 등록(source=channel_talk), matchedLeadId → `?lead=` 드로어 딥링크.
- **reindex 서버 훅**: 발행 영향 쓰기 5경로 서버측 재색인(+롤백 ISR 캐시 갱신 누락 수정), 클라 best-effort 제거, 실패는 reindexWarning으로 표출.
- 보류: 출고→딜 매출 브리지(하드웨어 파트 진행 중 작업과 충돌 위험 — 별도 착수), 채널톡 Supabase 승격(마이그레이션 필요).

검증(2026-07-02): `npx eslint app components lib --max-warnings=0` 통과, `npx tsc --noEmit` 통과, vitest 133파일/725건 통과, `npm run build` + postbuild 콘텐츠 체크 통과.

### Phase 3 — 모델 단일화 (큰 공사, 별도 설계 필요)
- 문서 체인 V1→V2 통합(계약 서명 루프 포함 — §2-2와 함께 해결), 채번 시퀀스/RPC화.
- 매출 지표 SSOT(revenue-core 추출), 재고 이중 계산 수렴, 행사 집계 3계통 수렴.
- JSON 저장소 Supabase 승격(lead-magnets, event-metrics, channel-conversations).
- commercial 섬 향방(부활 시 CRM 딜 하위 통합 / 폐기 시 페이지·API·컴포넌트 일괄 제거).

## 9. 검증에서 기각된 주장 (오탐 기록)

- "BRANCH가 CRM 절반에서 403으로 깨진 화면" — 절반은 사실이나 핵심 시나리오 일부 과장(crm-ops 쪽 주장 기각, crm-customers 쪽 구체 시나리오는 확정).
- "출고 revenue가 어느 탭에서도 미집계" — 거짓: branch_hw_outbound.revenue는 집계됨. 미반영은 '딜 단계/수납'으로 한정(§2-5로 축소 확정).
- "전환하는 순간 CRM 탭에서 리드가 사라지는 역설" — getLeads는 converted 포함 전체 반환이므로 기각(통합 목록에 portal customer가 없는 문제는 §2-6으로 확정).

## 10. 미커버 영역 (후속 감사 대상)

포털 API(app/api/portal) ↔ 어드민 중복·역할 경계, cron 8종과 어드민 sync의 공유 로직 정합(수동 sync만 revalidateTag 호출하는 비대칭 확인됨), 알림 파이프라인, 캘린더, data/*.json 폴백 계층 전반의 쓰기 거동.
