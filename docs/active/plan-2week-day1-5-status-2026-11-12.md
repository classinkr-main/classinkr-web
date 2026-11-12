# 2주 계획 1–5일 항목 — 코드 반영 현황과 수동 항목 (2026-11-12)

원본 계획: "클라우드 개발 초안 — 챗봇·가이드·마케팅·포지셔닝" 페이지의 2주 체크리스트.

## 코드로 반영 (브랜치, 미병합·미배포)

| 계획 항목 | 브랜치 | 상태 |
| --- | --- | --- |
| 1–2일 LEAD_SUBMIT 제거(토큰 스트립, saveLead 경로·지시 삭제, 테스트) | `fix/chatbot-lead-capture` | 완료 |
| 1–2일 source=chatbot 전달(lead-types, VALID_SOURCES, 문의폼) + lead-capture / lead-capture-effects 테스트 + 분류 합의 메모 | `fix/chatbot-lead-capture` | 완료, 합의 대기(`docs/active/chatbot-lead-source-decision.md`) |
| 1–2일 기존 chatbot_assist_registration 행 조회 쿼리 | `chore/plan-day1-2` | 작성만(`supabase/queries/chatbot_assist_registration_audit.sql`), 미실행 |
| 3–5일 가이드 지침 현재 IA로 교체 | `chore/plan-day1-2` | 완료(`docs/active/docs-center-content-guidelines.md`) |
| 3–5일 digest 공개 게이트 초안 | `chore/plan-day1-2` | 규칙·후보 목록만(`lib/docs-gate/digest-publish-gate.ts`, `docs/active/docs-digest-publish-gate-draft.md`), 공개 목록 미연결 |
| 3–5일 샘플 A(/docs 홈), 샘플 B(/docs/first-week) | `chore/plan-day1-2` | 완료 |
| 2주차·승인 후 Claude 어댑터(기본 Gemini) | `feat/chatbot-claude` | 코드 완료, 기본 비활성 |

## 수동(코드 밖) — 이번 작업에서 하지 않음

- 프로덕션에서 감사 쿼리 실행, 기존 행 재분류/유지/제외 결정
- Supabase 마이그레이션 적용(`20261112_chatbot_claude_labels.sql`)
- Vercel 환경 변수 설정, Claude 카나리 시작 일정·비율, 월 예산 확정
- Compass 쪽 `source=chatbot` 수용 확인
- 프로/비즈니스·2주 체험 카피 재대조
- 동의 UI(DemoModal vs 문의폼) 법무 검토
- 네이버·카카오 광고 채널 가동 확인, 광고 설정·지출
- KPI 정의 합의, 기준선 수집 시작, 포지셔닝·보상안 합의
- 공식 스킬 도구별 시험(외부 도구 계정 필요), 자료 2종 연결 초안
- 샘플 C(교실 기본 설정) 본문 수정 — 화면 캡처 확인 후
- digest 제외 후보의 실제 반영(승인 후)
