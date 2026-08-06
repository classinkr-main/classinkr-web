# 어드민 IA 재설계 기획서 (2026-06-29)

> 상태: 역사 기록. 2026-07-29 탭 재구성 결정에 의해 대체됐다.

> 서브에이전트 5종으로 어드민 사이드바 21탭 6섹션을 클러스터별로 코드 검증한 결과를 종합한 기획서.
> 목표: 기능 손실 없이 **더 컴팩트하고 직무 흐름대로 정렬된** 어드민 IA.

## 0. 요약

현재 사이드바는 기능 수는 충분하지만 다음 4가지 때문에 실제보다 복잡하다.

1. **중복 탭** — 같은 데이터/API를 두 번 그리는 화면들 (자료 퍼널·리드마그넷, Analytics·트래픽 등).
2. **섹션 오배치** — 직무와 다른 섹션에 놓인 탭들 (리드마그넷=CS, 하드웨어=분석 등).
3. **고아 화면** — 사이드바엔 없는데 살아있는 라우트 (`/admin/marketing`, `/admin/commercial`).
4. **3개로 쪼개진 딜/매출 시스템** — 서로 연결되지 않은 데이터 모델 3개.

**제안: 21탭 → 18탭, 6섹션을 직무 흐름대로 재배치.**

## 1. 현재 상태

사이드바 정의: [components/admin/AdminSidebar.tsx](../../components/admin/AdminSidebar.tsx) `NAV` 배열.

| 섹션 | 탭 |
|------|-----|
| 홈 | Overview |
| 고객 관리(sales) | CRM, 캘린더, 견적·문서, 딜 파이프라인 |
| 마케팅 운영 | 캠페인, 자료 퍼널, 콘텐츠, 공개 행사 |
| 고객 지원(cs) | 리드마그넷, 채널톡 상담, 챗봇 운영, 가이드 문서 |
| 분석(performance) | KR Team, 하드웨어 재고, 방문자/트래픽, Analytics |
| 시스템 | Ops Health, Settings, 회원 관리, Dev Mode |

CRM은 별도 드릴인 하위탭 보유: 현황 / 고객 / 기록 / 돈흐름 / 인사이트 / 연동
([CrmSubnav.tsx](../../components/admin/crm/CrmSubnav.tsx)).

## 2. 중복 판정 (코드 확정)

| # | 중복 쌍 | 판정 | 근거 | 조치 |
|---|---------|------|------|------|
| 🔴1 | 자료 퍼널 ↔ 리드마그넷 | 동일 기능 | 둘 다 `/api/admin/lead-magnets`+`/metrics`, 동일 타입·성과표. `materials`는 쓰기 0개(읽기 facade), 메인 버튼이 `/lead-magnets`로 이동 | materials 탭 제거, "오늘 먼저 볼 항목" 위젯만 이전 |
| 🔴2 | Analytics flow·tracking 탭 ↔ 방문자/트래픽 | 복붙 중복 | traffic 헤더 주석이 자인. 동일 API 4종·동일 패널. tone 값 드리프트 시작 | Analytics에서 두 탭 삭제 |
| 🟠3 | 챗봇 운영 ↔ 가이드 문서 | 같은 백로그 공유 | chatbot 고유 데이터 없음. 모든 버튼이 `/docs?tab=...`로 딥링크. `DocsGapsPanel`이 chatbot 대시보드 상위집합 | chatbot을 docs 탭으로 흡수 |
| 🟠4 | 캠페인 행사·이메일 탭 ↔ Analytics 행사퍼널·이메일 탭 | 3중 노출 | 행사 퍼널=events+campaigns+analytics, 이메일=campaigns+analytics | campaigns에 단일화 |
| 🟠5 | 연동 상태 (Ops + Settings + Dev) | 3중 fetch | 셋 다 `/api/admin/settings/integrations/status`. cron 카드 Ops·Settings 중복 | 편집=Settings, 상태/cron=Ops 전담 |

## 3. 불필요 / 죽은 것

**진짜 죽은 코드**
- ~~`NeoCrmCustomersClient.tsx`~~ — **정정(2026-06-29): 죽지 않음.** `app/admin/crm/customers/accounts/page.tsx`가 현역으로 렌더 중. 삭제 금지. (초기 서브에이전트 보고 오류를 코드 확인으로 정정함.)
- `app/admin/docs/gaps/page.tsx` — `redirect()` 한 줄 스텁(이미 docs 탭 병합).
- Settings `history` 탭 — `badge="준비중"`, 모델 미연결 빈 UI. 연결 전까지 숨김. **[적용됨]** 탭바에서 제외, 타입/렌더 블록은 유지.

**리다이렉트 스텁 (의도적, 북마크 보존용 — 정리는 선택)**
파트너 라우트 6개에 독립 UI 0개. 파트너 기능은 `돈흐름 > 파트너 KPI`(`/admin/crm/deals/kpi`)로 완전 흡수됨.
- `/admin/partners`, `/admin/partners/[id]` → `/admin/crm/deals/kpi`
- `/admin/crm/partners`, `/admin/crm/partners/[id]` → `/admin/crm/deals/kpi`
- `/admin/crm/partners/customers`, `/portal` → `/admin/crm/customers/unified?view=partner-portal`
- `/admin/crm/customers`, `/accounts` → `/unified`
- `/admin/crm/revenue` → 돈흐름

**중복 진입점 (legacy)**
- `/admin/contracts`, `/admin/receipts`, `/admin/software-quote-codes` — `견적·문서` 허브가 이미 탭으로 통합. 이 독립 라우트들은 같은 패널 재렌더. Settings가 `/software-quote-codes`로 링크 중 → 허브 탭 링크로 교체.

**고아 화면**
- `/admin/marketing` — 사이드바에 없는데 살아있는 풀 이메일 마케팅 허브(`<h1>`="캠페인" → 사이드바 캠페인과 제목 충돌). campaigns 이메일탭이 여기로 딥링크. → campaigns 흡수 또는 "이메일 허브"로 개명 후 정식 노출.
- `/admin/commercial` — 사이드바엔 `/commercial/board`(칸반)만, 그 board가 링크하는 풀 딜 상세 대시보드(`/commercial`)는 nav에 없음. board↔commercial은 목록/상세 관계 → 묶어야 함.

## 4. 섹션 오배치 (이동만)

| 탭 | 현재 | 문제 | 이동 |
|----|------|------|------|
| 리드마그넷 | cs | 그로스/퍼널 도구가 CS에 | → marketing |
| 하드웨어 재고 | performance | SCM 운영 콘솔이지 분석 아님 | → 운영/system |
| 회원 관리 | system | 194줄 읽기 전용인데 "관리" 라벨·최상위 비중 | Settings 탭 격하 또는 "팀 디렉터리" 개명 |
| Dev Mode | system | 엔지니어 전용 내부도구 | 슈퍼관리자/엔지니어 롤 게이팅 |

## 5. 핵심 아키텍처 이슈 — 딜/매출 3분할 ⚠️

세 화면이 서로 다른 데이터 모델 사용. (메모 `sales-pipeline-auth-audit`의 "3 disconnected data models / severed quote→contract seam"와 일치.)

- **A. 딜 파이프라인** (`/commercial/board` + `/commercial`) — Portal V2 모델. `/api/admin/deals`. 운영 파이프라인(컨택→견적→계약→확정→설치→수납→종결), `owner_id` 보유.
- **B. CRM 돈흐름** (`/crm/deals` = "매출·연결 대시보드") — `admin-crm-revenue` 모델. `/api/admin/crm/revenue`. 본사 CRM원천 매출 인식 + 외부 CRM 동기화 + 파트너 KPI + 발주.
- **C. 견적·문서 허브** (`/quotes`) — 독립 문서 모델. `/api/admin/contracts`·`/receipts`·`/software-quote-codes`. 실제 문서 생산.

→ 단기: 명칭으로 역할 구분(딜 파이프라인=진행중 거래 / 돈흐름=매출 인식·정산 / 견적·문서=문서 작업).
→ 중기: 단일 딜 라이프사이클 통합 (별도 이니셔티브, 대규모 작업).

## 6. 사이드바 재설계안 (21 → 18)

| 섹션 | 제안 탭 구성 |
|------|--------------|
| 홈 | Overview |
| 영업 | CRM / 캘린더 / 딜 파이프라인 / 견적·문서 |
| 마케팅 | 캠페인(+이메일 허브 흡수) / 콘텐츠 / 자료 퍼널 / 공개 행사 |
| 고객 지원 | 챗봇·문서 운영(docs+chatbot) / 채널톡 상담 |
| 분석 | Analytics(비즈니스) / 방문자·트래픽 / KR Team |
| 운영·시스템 | Ops Health / 하드웨어 재고 / Settings(+회원) / Dev Mode* |

변경: 자료퍼널 병합(−1) · 챗봇→문서 흡수(−1) · 회원관리→Settings(−1) · 리드마그넷 cs→마케팅 · 하드웨어 분석→운영 · `*`Dev 롤 게이팅. 고아 `/admin/marketing` 캠페인 흡수, 중복 문서 라우트 허브 단일화.

## 7. 컴팩트화 (코드 비대 — IA와 별개)

무거운 단일 파일: `DocsArticleEditor.tsx` 3,246줄 · `campaigns/page.tsx` 2,501줄 · `hardware ...Client` 2,337줄 · `analytics/page.tsx` 1,972줄(flow/tracking 제거 시 ~1,600) · `settings/page.tsx` 1,958줄(7탭 catch-all). Settings·Branch 개요 탭은 분석 카드 과밀 → 핵심 KPI만 기본 노출, 나머지 접기.

## 8. 단계별 로드맵

- **Phase 0 (즉시·저위험):** NeoCrmCustomersClient 삭제 · Settings cron 카드 제거 · Settings history 탭 숨김 · lead-magnets "Preview" 뱃지 제거.
- **Phase 1 (IA 정리·저~중위험):** materials→lead-magnets 병합·개명·마케팅 이동 · 하드웨어 운영 이동 · 회원관리 Settings 흡수 · 섹션 재배치 · Analytics flow/tracking 삭제 · `/admin/marketing` 캠페인 흡수.
- **Phase 2 (머지·중위험):** 챗봇→docs 탭 흡수+딥링크화 · campaigns↔analytics 행사·이메일 단일화 · Dev Mode 롤 게이팅.
- **Phase 3 (아키텍처·별도 이니셔티브):** 딜/매출 3시스템 단일 라이프사이클 통합.

## 부록 — 검증 출처

클러스터별 서브에이전트가 각 라우트의 `page.tsx`+주 클라이언트 컴포넌트를 직접 읽어 기능·성숙도·중복·API를 확인. 주요 파일:
[AdminSidebar.tsx](../../components/admin/AdminSidebar.tsx) ·
[app/admin/quotes/page.tsx](../../app/admin/quotes/page.tsx) ·
`app/admin/commercial/page.tsx`(2026-07-02 폐기 삭제) ·
[app/admin/crm/deals/page.tsx](../../app/admin/crm/deals/page.tsx) ·
[app/admin/materials/page.tsx](../../app/admin/materials/page.tsx) ·
[components/admin/LeadMagnetsAdminClient.tsx](../../components/admin/LeadMagnetsAdminClient.tsx) ·
[app/admin/analytics/page.tsx](../../app/admin/analytics/page.tsx) ·
[app/admin/traffic/page.tsx](../../app/admin/traffic/page.tsx) ·
[app/admin/marketing/page.tsx](../../app/admin/marketing/page.tsx).
