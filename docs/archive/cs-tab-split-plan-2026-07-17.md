# CS 탭 외부/내부 이원화 (A안 얇은 대시보드) — 설계·구현 계획

> 상태: 역사 기록. 현재 CS 정보구조는 `docs/active/cs-admin-console-ia-2026-07-27.md`를 따른다.

> **For agentic workers:** 독립 worktree 실행. 계약 변경 금지. 한국어 conventional commit, push 금지.

**Goal:** CS 섹션을 외부(공개 챗봇 운영)/내부(코파일럿)/공유 큐 3면으로 재편 — `/admin/chatbot`을 얇은 외부 운영 대시보드로 재건하고 nav를 재분리한다. 기능 이동 없음(A안): 기존 API·패널 재사용 + 링크 허브.

**전제 (검증된 사실):**
- `/admin/chatbot`은 현재 9줄 redirect 스텁(→/admin/docs?tab=gaps). 과거 650줄 페이지가 쓰던 API는 전부 생존: `GET /api/admin/chatbot/stats`(질문·미해결·상담이관·응답속도), `GET /api/admin/docs/alpha-readiness`, `POST /api/admin/chatbot/eval`(빠른 회귀/심판 포함) — DocsGapsPanel이 현재도 소비 중(호출 shape는 그 파일에서 확인).
- nav CS 섹션: "챗봇 운영·보강 큐"(/admin/docs?tab=gaps, Bot) 항목이 외부 운영과 공유 큐를 겸직 중.
- DocsGapsPanel에 소스 필터 칩 존재: GapSourceFilter = "all" | "chatbot" | "internal_cs" (클라이언트 상태만, URL 미연동).
- 워크스페이스 OPERATING_TOOLS의 "챗봇 운영 현황" 정적 카드 href = /admin/docs?tab=gaps (직결 상태).
- tests/admin/sidebar-docs-gaps.test.ts가 "/admin/chatbot nav 부재"를 검증 중 — 이번에 반대로 뒤집힘. command-palette.test.ts도 라벨 검증.

## 인터페이스 계약 (변경 금지)

1. **큐 딥링크**: `/admin/docs?tab=gaps&source=all|chatbot|internal_cs` — DocsGapsPanel이 마운트 시 `source` 파라미터를 읽어 소스 필터 프리셋(잘못된 값은 all). 이후 칩 클릭은 기존대로 클라이언트 상태(URL 동기화 불요).
2. **nav 재분리**: CS 섹션에 두 항목 — `{ href: "/admin/chatbot", label: "챗봇 운영", icon: Bot }`(외부) + `{ href: "/admin/docs?tab=gaps", label: "문서 보강 큐", icon: Search }`(공유 큐). keywords 재분배: 챗봇 운영엔 "챗봇 운영 지표 골든셋 품질 평가 알파 준비도 chatbot ops", 보강 큐엔 "보강 큐 gaps faq 문서 검색 초안 질문 패턴". 기존 roles 유지.
3. **외부 대시보드 신규 파일**: `components/admin/chatbot/ExternalChatbotOpsDashboard.tsx`(클라이언트) + `app/admin/chatbot/page.tsx`(스텁 교체, 얇은 서버 페이지 — metadata "챗봇 운영 | Classin Admin", robots noindex, cs-chatbot/page.tsx 패턴).
4. **워크스페이스 카드**: "챗봇 운영 현황" 카드 href → `/admin/chatbot` (title/설명/아이콘 유지).

---

### Task X: 외부 운영 대시보드 (Sonnet, worktree: tx-split)

**소유**: app/admin/chatbot/page.tsx(교체), components/admin/chatbot/ExternalChatbotOpsDashboard.tsx(신규).

구성(위→아래): (1) 헤더 — "챗봇 운영 (외부)" + 설명 1줄 + 내부 CS 크로스링크(/admin/cs-chatbot). (2) 지표 카드 행 — stats API 소비(질문량·미해결률·상담 이관·응답 속도 등 그 API가 주는 핵심 4~6개, DocsGapsPanel의 소비 코드를 읽고 동일 shape 사용). (3) 알파 준비도 요약 — alpha-readiness 소비, 통과 n/전체 + 미통과 항목 목록(상세는 보강 큐 딥링크). (4) 품질 평가 실행 — 빠른 회귀/심판 포함 버튼 2개(POST eval, DocsGapsPanel의 호출·결과 표시 방식 참조, 로딩/이중클릭 방지/결과 요약 인라인). (5) 경로 카드 3개 — "보강 큐(챗봇 발)"→/admin/docs?tab=gaps&source=chatbot, "보강 큐 전체"→...&source=all, "추천 질문 관리"→/admin/docs?tab=recommended. 로드 실패는 조용한 플레이스홀더+수동 재시도(코파일럿 위젯 관례). 스타일: DESIGN.md(그린 액센트·뉴트럴·보더 1px rgba(0,0,0,0.08)), 기존 어드민 카드 패턴 재사용. 게이트: eslint components/admin app/admin --max-warnings=0 + tsc. 커밋 1개.

### Task Y: nav·큐 프리셋·워크스페이스 링크 (Sonnet, worktree: ty-split)

**소유**: components/admin/admin-nav.ts, components/admin/docs/DocsGapsPanel.tsx, components/admin/cs-chat/InternalCsChatWorkspace.tsx, tests/admin/sidebar-docs-gaps.test.ts, tests/admin/command-palette.test.ts.

스텝: (1) 정독. (2) nav 재분리(계약 2 — Bot import 유지, Search 재추가, 항목 순서: 가이드 문서→챗봇 운영→문서 보강 큐→내부 CS 챗봇→채널톡). (3) DocsGapsPanel: 마운트 시 useSearchParams로 source 프리셋(계약 1 — docs 페이지가 이미 ?tab=을 읽는 구조이므로 Suspense 경계 기존재 여부 확인, 없으면 cs-chatbot 페이지의 Inner+Suspense 패턴). (4) 워크스페이스 "챗봇 운영 현황" 카드 href → /admin/chatbot (계약 4). (5) 테스트 갱신: sidebar-docs-gaps — "/admin/chatbot nav **존재**(label 챗봇 운영, icon Bot)" + "문서 보강 큐" 항목 검증으로 재작성, command-palette — 라벨 재분리 반영. 게이트: vitest tests/admin/ + eslint components/admin. 커밋 1개.

### Task Z: 통합 (오케스트레이터)
머지 X→Y → vitest(admin/internal-cs-chat/chatbot) + eslint + build → Codex(diff 한정) → 보고.

## 비범위
DocsGapsPanel 기능 이동(B안), stats/eval API 변경, 공개 챗봇 변경, 워크스페이스 추가 개편.
