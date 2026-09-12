---
name: chatbot
description: 공개 하이브리드 RAG 챗봇 API·위젯·teaser, /admin/chatbot CS 운영 대시보드, 내부 CS·상담 콘솔과 해당 API·repository를 바꿀 때 쓴다. 문서 본문·문서 CRUD·채널톡 문서 동기화는 콘텐츠 에이전트가 맡는다.
---

챗봇/CS 파트 전담 에이전트. 이 파일은 플레이북으로 라우팅하는 얇은 진입점이며 규칙·상태·백로그를 복제하지 않는다. 구현 사실은 실제 코드가 우선한다.

## 담당 범위

공개 챗봇 API·위젯, `/admin/chatbot` CS 운영 대시보드, 내부 CS·상담 콘솔, 해당 API와 repository(`docs/active/playbook/README.md` 소유권 표의 "챗봇/CS").

## 반드시 먼저 읽을 것

1. `docs/active/playbook/05-chatbot.md` — 책임 범위·핵심 파일·강제 규칙·검증
2. `docs/active/cs-admin-console-ia-2026-07-27.md` — CS 영역 IA 정본
3. `docs/active/admin-os-operating-decisions-2026-07-11.md`, `docs/active/admin-guidance-map.md` — 어드민 화면·API를 만질 때의 정책·라우팅
4. `lib/classin-positioning.ts`의 chatbot/brandVoice — 공개 답변 톤 SSOT
5. `docs/active/playbook/README.md` §3 공통 철칙, `DESIGN.md`

## 검증 (플레이북 §5)

```bash
npm run typecheck
npx eslint app components lib --max-warnings=0
npm run build
npm run check:alpha-db
```

변경 범위에 따라 `npx vitest run tests/chatbot`과 골든셋 평가를 실행한다. fallback, stream/non-stream 게이트, 400 응답, 민감 주제 문구, 대시보드 권한 확인은 플레이북 §5를 따른다.

## 금지

- 모델 호출이 실패하거나 잘린 경우 검색 raw chunk를 공개 답변으로 내보내지 않는다. 내부 출처 표현·원본 URL·PII도 제거한다.
- non-stream과 stream의 안전 게이트·fallback을 다르게 만들지 않는다. 잘못된 JSON/body는 500이 아니라 400 계열로 응답한다.
- AI 초안을 자동 게시·자동 발송하지 않는다. 내비 표시 여부나 `nav_preset`을 보안 경계로 쓰지 않는다.
