# CS 코파일럿 — 운영 데스크 UI 디벨롭 (2026-07-16)

대상: [components/admin/cs-chat/InternalCsChatWorkspace.tsx](../../components/admin/cs-chat/InternalCsChatWorkspace.tsx) (`/admin/cs-chatbot`).
보강 큐 린 루프([cs-gap-queue-loop-design-2026-07-16.md](cs-gap-queue-loop-design-2026-07-16.md)) 완성 후,
기능 우선으로 붙은 UI를 "일이 보이는 운영 데스크"로 끌어올렸다. 구조(4탭·데이터 흐름·API)는 유지, 표현 계층만 변경.

## 진단 → 처리

| # | 문제 | 처리 |
|---|------|------|
| 1 | 탭바에 작업량 신호 없음 | 대기열 = 위첨자 숫자(그린), 운영 도구 = 미판정 회귀 후보 존재 시 앰버 점. 회귀 후보는 부트스트랩 직후 로드 |
| 2 | 라이브 기능이 정적 링크 아래 묻힘 | 운영 도구 탭 IA 역전: 스탯 스트립 → 회귀 검수 → AI 브리지 → 바로가기 |
| 3 | 보강 큐 카운트가 캡션 한 줄 | 에디토리얼 스탯 스트립(큰 라이닝 숫자 + 대문자 마이크로 라벨). 챗봇/내부CS(폴백·수정요청 분해)/회귀 대기/브리지 상태 4칸, `zeroResultSearches` 별도 표기 |
| 4 | 판정 4버튼 무차별 | 연결된 세그먼트, 기본 중립 → hover에서만 의도색 (DESIGN.md 원칙). 판정 후 행은 제거 대신 회색 + 결과 칩 |
| 5 | 새 대화가 ← 아이콘 | ＋ 아이콘 + 라벨 버튼 |
| 6 | 네이티브 select 2개 | 대화 스위처 = 제목+셰브론 커스텀 드롭(상태 라벨 동반), 모델 모드 = 자동/Flash/Pro 세그먼트. "Pro로 심층 검토"는 최신 답변 카드 푸터의 "Pro로 재검토"로 이동 |
| 7 | 검토 상태가 작은 칩 하나 | AI 답변 카드 좌측 3px 레일 (검토 전=앰버 `#ECD29C` / 승인=그린 `#BDEFD8` / 수정 요청=레드 `#F2B8B8`), Disclosure 3단 → 가로 푸터 칩 |
| 8 | 후속 체크박스 2개 나열 | 검토 패널 "판정 후 자동 처리" 그룹. "보강 큐 제외" 부정형 → "문서 보강 큐로 유입" 긍정형+기본 체크 (전송 값 `excludeFromGapQueue` 반전 그대로) |

## 구현 노트

- 순수 로직은 [components/admin/cs-chat/ops-desk.ts](../../components/admin/cs-chat/ops-desk.ts)로 분리 —
  `summarizeDocsGaps`(소스별 집계·30+ 캡), `REGRESSION_JUDGE_ACTIONS`(hover 의도색), `regressionOutcomeChip`.
  테스트: [tests/internal-cs-chat/ops-desk.test.ts](../../tests/internal-cs-chat/ops-desk.test.ts).
- 회귀 판정 API·검토 PATCH 계약 변경 없음. 신규 API 없음.
- 색·보더·타이포는 [DESIGN.md](../../DESIGN.md) 토큰만 사용. 넓은 면 뉴트럴 유지, 그린은 숫자·호버·주요 버튼만.
- 검증: eslint 0 경고 · tsc · vitest 994 · build, 로컬 프리뷰에서 데스크/모바일(375px) 스크린샷 확인.
  메시지 스트림 레일·검토 패널은 라이브 대화 데이터가 아직 없어 화면 확인은 첫 실사용 시 재확인 권장.
