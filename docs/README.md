# Docs Index

기준 시점: 2026-09-02
문서 목적: 현재 저장소에서 무엇을 먼저 읽어야 하는지, 어떤 문서를 믿어야 하는지, 어떤 문서가 역사 기록인지 빠르게 구분한다.

## Admin OS 정본 우선순위

Admin 관련 작업은 [Admin 지침 맵](./active/admin-guidance-map.md)에서 해당 화면·도메인의 정본을 먼저 찾고, 아래 순서로 적용한다. 지침 맵은 라우팅 진입점이며 정책 정본 자체를 대체하지 않는다. 상위 문서는 정책을, 하위 문서는 그 정책 안의 구체적 화면 또는 실행 범위를 정의한다.

1. [Admin OS 운영 결정](./active/admin-os-operating-decisions-2026-07-11.md)
   - 역할·권한, 데이터 정본, 상태·삭제·공개 기준의 최우선 정책 문서다.
2. [어드민 탭 재구성](./active/admin-tab-restructure-2026-07-29.md)
   - 운영 결정 안에서 내비게이션, 탭 노출, 화면 배치를 정의하는 UI 구조 정본이다.
3. [CS 어드민 콘솔 IA](./active/cs-admin-console-ia-2026-07-27.md)
   - CS 영역의 정보 구조와 작업 흐름을 정의한다. 상위 두 문서의 권한·탭 배치를 바꾸지는 않는다.
4. [Classin KR Team 스킬](../.codex/skills/classin-kr-team/SKILL.md)
   - `/admin/branch`와 매출 장부·동기화 정합성 작업을 안전하게 라우팅하는 실행 지침이다. Admin 전체 정책의 정본이 아니다.

## 1. Start Here

- [active/admin-guidance-map.md](./active/admin-guidance-map.md)
  - **Admin 작업 라우팅 정본.** 화면·도메인별로 읽을 운영 결정, UI 구조, 실행 지침을 연결하는 진입점.
- [active/admin-os-operating-decisions-2026-07-11.md](./active/admin-os-operating-decisions-2026-07-11.md)
  - **Admin OS 현재 운영 결정.** 관리자 역할·기능 권한, V2 정본, CRM 5작업면, 상태·삭제·공개 기준의 최우선 문서.
- [active/admin-tab-restructure-2026-07-29.md](./active/admin-tab-restructure-2026-07-29.md)
  - **Admin UI 구조 정본.** 상시 탭과 기타 메뉴, 모바일 내비게이션, 경로별 화면 배치 기준.
- [active/site-admin-separation-plan-2026-08-28.md](./active/site-admin-separation-plan-2026-08-28.md)
  - **홈페이지·Admin 실행 경계 분리 계획.** 단일 저장소·DB를 유지하면서 레이아웃, 앱, Vercel, Cron·Webhook을 단계적으로 분리하는 실행 기준.
- [active/cs-admin-console-ia-2026-07-27.md](./active/cs-admin-console-ia-2026-07-27.md)
  - **CS 영역 IA 정본.** CS 콘솔의 정보 구조, 작업 큐, 상세 화면 관계 기준.
- [active/playbook/README.md](./active/playbook/README.md)
  - **파트별 운영 플레이북.** 작업이 어느 파트(홈/어드민/콘텐츠/그로스/챗봇/플랫폼)인지 판별 → 담당 에이전트(`.claude/agents/`)·가이드·공통 철칙 적용. 업무 분담의 진입점.
- [active/prd.md](./active/prd.md)
  - Classin Home 공개 사이트의 현재 기준 PRD
- [active/brand-canon/README.md](./active/brand-canon/README.md)
  - **브랜드·콘텐츠 단일 기준 인덱스.** 정체성·카피·보이스·세그먼트·회사 팩트의 SSOT 계층(카테고리명 "수업 시스템 OS", 보이스 헌장, EEO 회사 팩트). 브랜드/마케팅 카피 작업의 진입점.
- [active/classin-korea-positioning-guidelines.md](./active/classin-korea-positioning-guidelines.md)
  - 한국 학원 시장용 Classin 메시지·CTA·비교 프레임 **규칙**(literal 카피 값은 lib/classin-positioning.ts)
- [active/classin-pre-adoption-question-matrix-2026-06-18.md](./active/classin-pre-adoption-question-matrix-2026-06-18.md)
  - 도입 전 22가지 질문의 답변 가능 범위, 확인 필요 항목, 상담·챗봇·리드마그넷 반영 기준
- [active/partner-portal-redistribution-plan-2026-06-26.md](./active/partner-portal-redistribution-plan-2026-06-26.md)
  - 파트너 포털/Portal V2/견적 문서 기능을 어드민·하드웨어 운영·공개 공유 링크·제한형 파트너 액션 포털로 재분배하는 최신 기획안
- [active/quote-feature-agent-audit-2026-06-26.md](./active/quote-feature-agent-audit-2026-06-26.md)
  - 견적 작성/저장/발송/기록/응답/열람 기능축별 에이전트 점검 결과와 P0/P1 구현 큐
- [active/partner-portal-master-spec.md](./active/partner-portal-master-spec.md)
  - 파트너 포털 도메인 모델과 거래건 중심 UX 상세 근거. 제품 면 재배치 판단은 redistribution plan 우선
- [active/architecture-schema-erd.md](./active/architecture-schema-erd.md)
  - 현재 아키텍처/스키마 입구
- [active/chatbot-knowledgebase-faq-analytics-plan.md](./active/chatbot-knowledgebase-faq-analytics-plan.md)
  - 문서/정보 탭 기반 챗봇 지식베이스와 FAQ 통계 설계
- [active/docs-center-content-guidelines.md](./active/docs-center-content-guidelines.md)
  - 공개 문서 탭의 가이드/매뉴얼/도움말 작성 지침과 미완성 콘텐츠 처리 규칙
- [active/classin-software-feature-inventory.md](./active/classin-software-feature-inventory.md)
  - 제품 캡처 기준 소프트웨어 도구·활동 유형·하드웨어 차별점 단일 진실 소스(SSOT)
- [active/classin-board-s-series-safe-manual-guidelines.md](./active/classin-board-s-series-safe-manual-guidelines.md)
  - ClassIn Board S 시리즈 설명서 기반 한국어 안전 사용·기본 조작 기준
- [hardware-ops/README.md](./hardware-ops/README.md)
  - 하드웨어 운영 허브 문서의 상위 인덱스
- [active/erp-blueprint-2026-06-22.md](./active/erp-blueprint-2026-06-22.md)
  - 어드민 → 지사 운영 OS(ERP) 청사진 & 실행 로드맵(Account 360 스파인·귀속·노션 캘린더 라이브 연동·거버넌스 결정)
- [active/internal-crm-backend-operating-plan-2026-06-26.md](./active/internal-crm-backend-operating-plan-2026-06-26.md)
  - 자체 CRM 백엔드/운영 기준. 시트·OCRM·HQ CRM은 참고/동기화 원천으로 두고, Admin CRM의 고객 스파인·회의록·녹음·다음 액션 구조를 정의
- [active/internal-cs-ai-bridge.md](./active/internal-cs-ai-bridge.md)
  - 내부 CS 캡처·사진 분석, 담당자 검토, 서명된 AI/MCP 수신·송신 계약과 운영 경계
- [active/internal-cs-content-arrangement-2026-07-15.md](./active/internal-cs-content-arrangement-2026-07-15.md)
  - 기존 정본과 전달 자료의 중복·충돌을 정리한 내부 CS 지식 등급, 소통 템플릿, 태그·자산 적용 기준
- [active/admin-3-revenue-sheet-workspace-plan-2026-06-29.md](./active/admin-3-revenue-sheet-workspace-plan-2026-06-29.md)
  - REV/매출 시트를 Admin CRM 안의 별도 매출시트 탭으로 승격하고, 이후 자체 매출 원장으로 옮기는 실행안

## 2. Product

- [active/prd.md](./active/prd.md)
  - 홈페이지, CTA, 리드 수집, 콘텐츠 운영 기준
- [active/partner-portal-redistribution-plan-2026-06-26.md](./active/partner-portal-redistribution-plan-2026-06-26.md)
  - 파트너 포털 기능 재배치, 견적 문서 라이프사이클, Admin Hardware 편입 기준
- [active/partner-portal-master-spec.md](./active/partner-portal-master-spec.md)
  - 파트너 포털 도메인 모델과 거래건 중심 UX 상세 근거
- [active/internal-crm-backend-operating-plan-2026-06-26.md](./active/internal-crm-backend-operating-plan-2026-06-26.md)
  - 내부 동료가 매일 쓰는 자체 CRM의 기록 입력, 회의록/녹음 모으기, 고객 360, 다음 액션 운영 기준
- [active/admin-3-revenue-sheet-workspace-plan-2026-06-29.md](./active/admin-3-revenue-sheet-workspace-plan-2026-06-29.md)
  - 매출시트 별도 탭, REV 동기화본 운영화, 매칭 커버리지, app-owned revenue ledger 전환 기준
- [active/partner-portal-implementation-roadmap.md](./active/partner-portal-implementation-roadmap.md)
  - 파트너 포털 구현 순서. 현재 경로명과 구현 상태는 실제 코드로 재확인
- [active/quote-lifecycle-execution-plan.md](./active/quote-lifecycle-execution-plan.md)
  - 견적 문서 라이프사이클 실행 기준
- [active/quote-feature-agent-audit-2026-06-26.md](./active/quote-feature-agent-audit-2026-06-26.md)
  - 견적 작성/저장/발송/기록/응답/열람 기능축별 결손과 구현 우선순위
- [active/software-checkout-revamp-plan.md](./active/software-checkout-revamp-plan.md)
  - /checkout 구독형/충전형 재정렬 실행안
- [active/contact-showroom-store-develop-plan-2026-08-29.md](./active/contact-showroom-store-develop-plan-2026-08-29.md)
  - **컨택·쇼룸 예약·구매 화면 실행 기준.** /contact 항목 재편, 신설 /showroom 예약(슬롯·스키마·가용성), /pricing 가격 페이지 승격과 가격 SSOT 단일화. 결제 활성화 이전 단계까지가 범위
- [active/docs-center-db-design.md](./active/docs-center-db-design.md)
  - 공개 가이드/매뉴얼/도움말/문제 해결/업데이트 문서센터와 챗봇 지식 베이스 설계
- [active/docs-center-content-guidelines.md](./active/docs-center-content-guidelines.md)
  - 문서센터 콘텐츠 작성 순서, 공개/보류 기준, 운영 가이드 우선순위
- [active/classin-korea-positioning-guidelines.md](./active/classin-korea-positioning-guidelines.md)
  - 홈페이지, 블로그, 가이드, 자료실, 챗봇, 상담 CTA에 적용하는 Classin 한국 시장 포지셔닝 기준
- [active/classin-pre-adoption-question-matrix-2026-06-18.md](./active/classin-pre-adoption-question-matrix-2026-06-18.md)
  - 실제 도입 전 질문 리스트를 상담 대응과 자료실 콘텐츠로 전환하는 기준
- [active/classin-board-s-series-safe-manual-guidelines.md](./active/classin-board-s-series-safe-manual-guidelines.md)
  - 하드웨어 안전 안내와 기본 매뉴얼 답변의 한국어 기준
- [active/chatbot-knowledgebase-faq-analytics-plan.md](./active/chatbot-knowledgebase-faq-analytics-plan.md)
  - 문서/정보 탭을 챗봇 답변 원천으로 쓰고 질문 통계를 FAQ 개선으로 되돌리는 설계

## 3. Architecture

- [active/site-admin-separation-plan-2026-08-28.md](./active/site-admin-separation-plan-2026-08-28.md)
  - 홈페이지와 Admin의 레이아웃·앱·배포 경계, 공용 패키지, Cron·Webhook 이전 순서
- [adr/ADR-009-site-admin-deployment-boundary.md](./adr/ADR-009-site-admin-deployment-boundary.md)
  - 한 저장소·한 Supabase 정본을 유지하고 Site/Admin 실행·배포 경계를 단계적으로 분리하는 결정
- [active/supabase-shared-db-consolidation-analysis-2026-09-02.md](./active/supabase-shared-db-consolidation-analysis-2026-09-02.md)
  - Compass 마케팅 앱과 공유하는 Supabase DB의 동기화·스키마·거버넌스 감사, 도메인별 통폐합 판정과 4단계 로드맵
- [active/admin-performance-plan-2026-09-02.md](./active/admin-performance-plan-2026-09-02.md)
  - Admin 속도 가설 판정(인증 왕복·팬아웃·메모이제이션·플랜), 적용한 조치와 측정 방법, 운영 확인 목록
- [active/architecture-schema-erd.md](./active/architecture-schema-erd.md)
  - 엔티티와 스키마 관점의 입구
- [active/internal-crm-backend-operating-plan-2026-06-26.md](./active/internal-crm-backend-operating-plan-2026-06-26.md)
  - `crm_customer_events`, private recording storage, future `crm_tasks`/attachments/transcripts, 외부 CRM write request 경계 기준
- [active/docs-center-db-design.md](./active/docs-center-db-design.md)
  - 문서센터 DB, RLS, SEO 노출 정책, AI 청크 파이프라인
- [active/notification-architecture-plan.md](./active/notification-architecture-plan.md)
  - 알림 아키텍처 계획
- [active/partner-portal-front-back-contract.md](./active/partner-portal-front-back-contract.md)
  - 파트너 포털 BFF/API 계약 문서
- [active/chatbot-knowledgebase-faq-analytics-plan.md](./active/chatbot-knowledgebase-faq-analytics-plan.md)
  - 챗봇 지식베이스, 질문 이벤트, FAQ 통계 스키마와 API 설계
- [adr/README.md](./adr/README.md)
  - ADR 작성 규칙과 초기 백로그
- [adr/ADR-010-operational-failure-containment.md](./adr/ADR-010-operational-failure-containment.md)
  - **Cron 인증·복구 실행·Webhook·외부 의존성의 폭주와 유실 방지 결정.**

## 4. Domains

- [hardware-ops/README.md](./hardware-ops/README.md)
  - 하드웨어 운영 문서 모음
- [active/partner-portal-document-hub-guidelines.md](./active/partner-portal-document-hub-guidelines.md)
  - 문서 허브 세부 운영 규칙
- [active/partner-portal-document-hub-wireframes.md](./active/partner-portal-document-hub-wireframes.md)
  - 문서 허브 화면 설계
- [active/MARKETING_EMAIL_SYSTEM.md](./active/MARKETING_EMAIL_SYSTEM.md)
  - 마케팅 이메일 시스템 구현 메모
  - 현재 제품 기준 문서가 아니라 역사적 구현 스냅샷으로 읽는다

## 5. Runbooks And Incidents

- [active/operational-failure-handling-guidelines.md](./active/operational-failure-handling-guidelines.md)
  - **운영 장애·Cron·Webhook 현재 지침.** 미응답 Webhook 폐기 상태, Cron 인증·백로그 상한,
    비밀값, Supabase·외부 API·캐시·배포 장애의 공통 대응 기준.
- [active/supabase-operational-recovery-hardening-plan-2026-09-01.md](./active/supabase-operational-recovery-hardening-plan-2026-09-01.md)
  - **Supabase 운영 복구·하드닝 현재 실행 계획.** 2026-09-01 Admin 접속 장애의 인과관계, 즉시 복구, 실패 의미·캐시·권한·토큰 키·CRM 성능 개선의 독립 배포 순서와 종료 조건.
- [active/cs-ops-standard-runbook-2026-08.md](./active/cs-ops-standard-runbook-2026-08.md)
  - CS 운영 데스크, 문서 보강 큐, 회귀 검수와 채널톡 실제 원인 검토 절차
- [archive/repository-status-2026-06-08.md](./archive/repository-status-2026-06-08.md)
  - 2026-06-08 시점의 저장소 상태 스냅샷. 현재 상태 판단에는 사용하지 않는다.
- [archive/repository-audit-2026-04-15.md](./archive/repository-audit-2026-04-15.md)
  - 2026-04-15 시점의 역사적 감사 스냅샷. 파일 위치와 무관하게 현재 상태 판단이나 선행 지침으로 사용하지 않는다.
- [archive/error-fix-notes.md](./archive/error-fix-notes.md)
  - 과거 에러/불안 요소 메모
  - 현재 상태 단정에 쓰지 말고, 히스토리 참고용으로만 사용
- [archive/error_handle.md](./archive/error_handle.md)
  - 관리자 로그인/배포 설정 관련 과거 장애 메모
  - 현재 운영 기준은 항상 실제 코드와 이 인덱스가 지정한 최신 정본으로 재검증

## 6. Operating Rules

- 한 제품 영역에는 `기준 문서`를 하나만 둔다.
- 구현 순서는 이니셔티브당 `로드맵 문서` 하나에 모은다.
- 사고/장애 문서는 `archive/`에 두되, 현재 상태처럼 읽히지 않도록 역사 기록으로 표시한다.
- 문서 링크는 항상 repo-relative 경로만 사용한다.
- 브랜치명, 로컬 절대경로, 실제 비밀번호 예시를 기준 문서에 남기지 않는다.
