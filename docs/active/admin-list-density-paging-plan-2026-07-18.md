# 어드민 리스트 밀도·페이징 디벨롭 — 설계·구현 계획

> **For agentic workers:** 독립 worktree 실행. 계약 변경 금지. 한국어 conventional commit, push 금지. **디자인·레이아웃 품질에 힘줄 것** — 기계적 페이저 추가가 아니라 밀도 체계·계층·인터랙션까지. UI 구현 전 frontend-design 스킬을 로드해 밀도/모션/상태 감각을 끌어올리되, DESIGN.md 팔레트·기존 어드민 패턴 안에서.

**Goal:** 어드민 리스트가 무한정 쌓여 스크롤이 길어지는 3곳에 페이징/더보기를, 항상 펼쳐져 과밀한 2곳+Docs 카드에 접기/컴팩트화를 적용한다. 공용 부품 2개로 일관성 확보.

**전제 (스캔으로 검증된 사실):**
- 무한스크롤(프론트 상한 0): app/admin/channel-talk/page.tsx:585(백엔드 500), components/admin/marketing/SubscriberTable.tsx:279(백엔드 1000, 서버 offset 지원), components/admin/marketing/LeadSegmentView.tsx:325(라우트 상한 없음)
- 과밀(항상 펼침): components/admin/crm/CrmActivityClient.tsx:353(페이징은 됨, 행이 본문+녹음+3그리드 상시), components/admin/cs-chat/InternalCsChatWorkspace.tsx:2619(회귀 후보 행)
- Docs: components/admin/docs/DocsGapsPanel.tsx:712(gap 카드 버튼3 상시), :782(결과없는 검색어)
- 기존 페이저 2개: MessageLogTable.tsx:286(Button variant=outline, h-7 px-2.5 text-[11px], "offset+1–offset+len / 총 total건"), CrmActivityClient.tsx:455(raw button, tabular-nums, "offset+1–.. / total개"). → Pager로 표준화
- DESIGN.md: 보더 1px solid rgba(0,0,0,0.08), 그린 #084734 액센트만, 웜 뉴트럴 면, tabular-nums 카운트, 파스텔 채움 지양·아웃라인 강조, 모션 은은.

## 인터페이스 계약 (변경 금지)

1. **`components/admin/ui/Pager.tsx`** (신규): `<Pager offset total pageSize onPrev onNext disabled? label? />` — "N–M / 총 T건" (tabular-nums) + 이전/다음(아웃라인, h-7 px-2.5 text-[11px]). total=0이면 렌더 안 함. 접근성: 버튼 aria-label, 카운트 role="status". 라벨 단위는 prop("건"/"개" 기본 "건").
2. **`components/admin/ui/ShowMore.tsx`** (신규): `useVisibleCount(total, step, initial?)` 훅 + `<ShowMore visible total step onMore onCollapse? />` 버튼. "더보기(N개 더)" + total 초과 표시 시 "접기"(initial로 복귀). 뉴트럴 아웃라인. count는 tabular-nums.
3. 두 부품 모두 서버/클라 상태를 소유하지 않음(순수 표시+콜백). 소비처가 offset/visibleCount 상태 보유.

## Phase P0: 공용 부품 + 기존 페이저 통합 (Sonnet, worktree: p0-density)

**소유**: components/admin/ui/Pager.tsx(신규), components/admin/ui/ShowMore.tsx(신규), components/admin/marketing/MessageLogTable.tsx(페이저→Pager 교체), components/admin/crm/CrmActivityClient.tsx(페이저→Pager 교체 — 행 접기는 W2 담당이니 페이저 부분만), 테스트(있으면).

스텝: (1) 두 기존 페이저 실코드 정독 → 공통 시그니처 도출. (2) Pager/ShowMore 구현(계약 1·2, DESIGN.md 준수, frontend-design 감각). (3) MessageLogTable·CrmActivityClient의 인라인 페이저를 Pager로 교체 — 시각·동작 무회귀(라벨 단위 유지: 발송로그 "건", 활동 "개"). (4) 게이트: eslint components/admin + tsc + 관련 vitest. 커밋 1~2개. **W1/W2가 이 부품을 import하므로 P0 머지가 선행.**

## Phase W1: 무한스크롤 3곳 (Sonnet, worktree: w1-infinite — P0 머지 후 분기)

**소유**: app/admin/channel-talk/page.tsx, components/admin/marketing/SubscriberTable.tsx, components/admin/marketing/MarketingHub.tsx(구독자 페이징 배선만), components/admin/marketing/LeadSegmentView.tsx.

- **상담 목록**(channel-talk:585): 클라 배열 → `useVisibleCount`+ShowMore. 초기 50, step 50. 상단 필터와 독립.
- **구독자**(SubscriberTable:279 + MarketingHub 배선): 서버 offset 페이징. `getAllSubscribers(limit,offset)`+`?count=1` 활용, Pager로 이전/다음. MarketingHub가 offset 상태 소유·재요청. (필터가 클라측이면 서버 페이징과 충돌 없게 — 필터 존재 시 동작을 정독해 결정; 서버필터면 offset 리셋, 클라필터면 필터 후 ShowMore가 더 안전할 수 있음. 실코드 보고 판단해 보고서에 근거 남길 것.)
- **리드**(LeadSegmentView:325): 클라 배열 → `useVisibleCount`+ShowMore(초기 50). 백엔드 limit 추가는 비범위(후속).

스텝: 각 화면 정독 → 적용 → 빈/로딩 상태 유지 → 게이트(eslint app components + tsc + vitest). 커밋 3개.

## Phase W2: 컴팩트 2곳 + Docs (Sonnet, worktree: w2-compact — P0 머지 후 분기)

**소유**: components/admin/crm/CrmActivityClient.tsx(행 접기만 — P0가 페이저 이미 교체했으니 그 위에서 행 Disclosure), components/admin/cs-chat/InternalCsChatWorkspace.tsx(회귀 후보 행 컴팩트), components/admin/docs/DocsGapsPanel.tsx(gap 카드·검색어 컴팩트+더보기).

주의: CrmActivityClient는 P0도 건드림(페이저) → **W2는 P0 머지 후 분기**해 충돌 회피. W2는 행 렌더(CrmEventRow)만 수정.

- **활동 로그 행**(CrmActivityClient CrmEventRow): 기본 헤더+요약(sentiment·stage·일시·담당·요약 1~2줄)만, 클릭 시 Disclosure로 본문(whitespace-pre-wrap)·녹음 플레이어(지연 마운트)·결정/리스크/액션 3그리드·태그 확장. chevron 회전 모션. 페이지 로드 시 전부 접힘=기본.
- **CS 회귀 후보 행**(InternalCsChatWorkspace:2619): py 축소, excerpt line-clamp 유지, 제안 배지+근거+판정버튼을 밀도 높게 재배치(근거는 이미 details). 지식 승격 버튼은 유지하되 시각적 무게 낮춤.
- **Docs gap 카드**(DocsGapsPanel:712): 카드 밀도 상향, 액션 3버튼(초안/추천질문/무시)을 hover 노출 또는 오버플로로. 12개 표시 후 ShowMore. 결과없는 검색어(:782)도 컴팩트+더보기.

스텝: 각 정독 → 적용 → frontend-design 감각으로 밀도·계층·모션 → 게이트. 커밋 3개.

## Phase Z: 통합 + 시각 검증 (오케스트레이터)
P0→W1→W2 머지 → vitest+eslint+build → Codex → **preview 서버로 실화면 스크린샷 검증**(밀도 전/후, 접기 동작, 페이저) → 사용자에게 시각 증거 제시.

## 비범위
가상화(react-window), 리드 백엔드 limit(후속 칩), CS 대화 스레드, 신규 색 토큰.
