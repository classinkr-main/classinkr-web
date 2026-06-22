# Classin Home — Repository Notes

## 프로젝트 개요

- Next.js 16 (App Router) + React 19 + TypeScript
- Tailwind CSS 4, Supabase, Recharts, Lucide
- 공개 사이트(`/`), 관리자(`/admin`), 파트너 포털(`/partner`), 포털 API(`/app/api/portal`)

## 먼저 볼 문서

- [docs/README.md](docs/README.md)
- [docs/active/repository-audit-2026-04-15.md](docs/active/repository-audit-2026-04-15.md)
- [DESIGN.md](DESIGN.md)

## 코드 규칙

- 공용 컴포넌트는 `components/`에 둔다.
- 관리자 API는 `app/api/admin/`에서 `verifyAdmin()` 또는 동등한 관리자 인증 가드를 사용한다.
- 파트너 포털 V2 API는 `app/api/portal/`과 `lib/partner-portal/portal-authorize.ts` 기준으로 맞춘다.
- 데이터 접근은 `lib/repositories/` 또는 `lib/partner-portal/repositories/`로 모은다.
- 일부 기능은 여전히 `data/*.json` 또는 듀얼 모드 저장소를 통해 폴백한다.

## 챗봇 API 운영 규칙

- 공개 챗봇 `app/api/chatbot/query`는 느린 RAG/LLM 호출이 있어도 500으로 끊기지 않아야 한다.
- `lib/chatbot/service.ts`의 문서 검색, 벡터 검색, Gemini 생성 경로는 짧은 시간 예산과 deterministic fallback을 유지한다.
- `CHATBOT_KNOWLEDGE_SEARCH_TIMEOUT_MS`, `CHATBOT_FINAL_ANSWER_TIMEOUT_MS`를 늘릴 때는 `CHATBOT_ROUTE_TIMEOUT_MS`와 클라이언트 timeout도 함께 검토한다.
- 잘못된 JSON/body shape는 500이 아니라 400 계열로 처리한다.
- 챗봇 DB/RPC 계약을 건드리면 `npm run check:alpha-db`를 함께 실행한다.

## 검증 기준

```bash
npx eslint app components lib --max-warnings=0
npm run build
```

현재 저장소에서는 위 두 명령을 기본 품질 게이트로 본다.

## 배포 / Cron 안전 규칙

- Vercel 플랜은 명시 확인 전까지 Hobby 기준으로 본다.
- `vercel.json`의 각 cron expression은 하루 1회 이하만 허용한다.
  - 금지 예: `*/5 * * * *`, `0 */6 * * *`, `0 9,18 * * *`
  - 허용 예: `15 0 * * *`, `0 4 * * 4`, `0 0 1 * *`
- sub-daily 실행이 필요하면 `vercel.json`에 직접 추가하지 말고 외부 스케줄러, 큐, 또는 Vercel Pro 전환을 먼저 확정한다.
- `vercel.json`을 수정한 뒤에는 반드시 `npm run check:vercel-crons`를 실행한다. `npm run build` 전에도 자동 실행된다.

## UI 작업 시 필수 체크

- 색상: [DESIGN.md](DESIGN.md) 팔레트만 사용
- 보더: `1px solid rgba(0,0,0,0.08)`
- 섹션 배경: `#FFFFFF` ↔ `#F6F5F4` ↔ `#ECFDF5`
- 모바일 우선 반응형 유지

## 문서 운영 규칙

- 기준 문서는 repo-relative 링크만 사용한다.
- 브랜치명, 로컬 절대경로, 실제 비밀번호 예시는 남기지 않는다.
- 오래된 사고 메모는 현재 상태 단정에 쓰지 않고, 현재 audit 문서와 실제 코드로 재검증한다.
