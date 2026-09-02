# Classin Home — Repository Notes

## 프로젝트 개요

- Next.js 16 (App Router) + React 19 + TypeScript
- Tailwind CSS 4, Supabase, Recharts, Lucide
- 공개 사이트(`/`), 관리자(`/admin`), 파트너 포털(`/partner`), 포털 API(`app/api/portal/`)

## 먼저 볼 문서

- [docs/README.md](docs/README.md)
- Admin 작업: [docs/active/admin-guidance-map.md](docs/active/admin-guidance-map.md)
- [DESIGN.md](DESIGN.md)

2026-04-15 저장소 감사 문서는 당시 상태를 남긴 역사 기록이다. 현재 상태 판단에는 `docs/README.md`가 지정한 최신 정본과 실제 코드를 사용한다.

## 코드 규칙

- 공용 컴포넌트는 `components/`에 둔다.
- 관리자 API는 `app/api/admin/`에서 `verifyAdmin()` 또는 동등한 관리자 인증 가드를 사용한다.
- 파트너 포털 V2 API는 `app/api/portal/`과 `lib/portal/portal-authorize.ts` 기준으로 맞춘다.
- 데이터 접근은 `lib/repositories/` 또는 `lib/portal/repositories/`로 모은다.
- 일부 기능은 여전히 `data/*.json` 또는 듀얼 모드 저장소를 통해 폴백한다.

## 챗봇 API 운영 규칙

- 공개 챗봇 `app/api/chatbot/query`는 느린 RAG/LLM 호출이 있어도 500으로 끊기지 않아야 한다.
- `lib/chatbot/service.ts`의 문서 검색, 벡터 검색, Gemini 생성 경로는 짧은 시간 예산과 deterministic fallback을 유지한다.
- `CHATBOT_KNOWLEDGE_SEARCH_TIMEOUT_MS`, `CHATBOT_FINAL_ANSWER_TIMEOUT_MS`를 늘릴 때는 `CHATBOT_ROUTE_TIMEOUT_MS`와 클라이언트 timeout도 함께 검토한다.
- 잘못된 JSON/body shape는 500이 아니라 400 계열로 처리한다.
- 챗봇 DB/RPC 계약을 건드리면 `npm run check:alpha-db`를 함께 실행한다.

## 리드 제출 / 컨택 폼 운영 규칙

- 공개 리드 제출 `app/api/lead`는 저장 실패를 성공으로 숨기지 않는다.
- `lib/server/lead-capture.ts`의 중복 제출 방지는 `pending`과 `accepted` 상태를 구분한다.
- 같은 연락처의 재제출을 성공 중복으로 처리하는 시점은 Supabase 저장 또는 외부 전달 중 하나 이상이 성공한 뒤여야 한다.
- 저장과 전달이 모두 실패한 요청은 중복 캐시에 남기지 말고 즉시 재시도 가능해야 한다.
- 리드 저장/전달 흐름을 바꾸면 `npx vitest run tests/api/lead-capture.test.ts`를 함께 실행한다.
- Vercel 런타임은 read-only 파일시스템이므로 공개 리드 제출은 JSON fallback을 쓰면 안 된다. 저장소 모드를 바꾸면 `npx vitest run tests/repositories/leads-mode.test.ts`도 함께 실행한다.
- 마케팅/채널톡 스크립트 도메인을 추가할 때는 `next.config.ts`의 CSP를 directive별로 갱신하고 `/contact` 응답 헤더를 확인한다.

## 검증 기준

```bash
npm run typecheck
npx eslint app components lib --max-warnings=0
npm run build
```

현재 저장소에서는 위 세 명령을 표시된 순서대로 기본 품질 게이트로 본다.

## 배포 / Cron 안전 규칙

- 상세 기준은 [운영 장애·Cron·Webhook 안전 지침](docs/active/operational-failure-handling-guidelines.md)과
  [ADR-010](docs/adr/ADR-010-operational-failure-containment.md)을 따른다.
- Vercel Cron 인증은 `Authorization: Bearer ${CRON_SECRET}` 하나만 사용한다. `x-vercel-cron`을
  인증 또는 추가 실행 조건으로 사용하지 않는다.
- Vercel 플랜은 명시 확인 전까지 Hobby 기준으로 본다.
- `vercel.json`의 각 cron expression은 하루 1회 이하만 허용한다.
  - 금지 예: `*/5 * * * *`, `0 */6 * * *`, `0 9,18 * * *`
  - 허용 예: `15 0 * * *`, `0 4 * * 4`, `0 0 1 * *`
- sub-daily 실행이 필요하면 `vercel.json`에 직접 추가하지 말고 외부 스케줄러, 큐, 또는 Vercel Pro 전환을 먼저 확정한다.
- `vercel.json`을 수정한 뒤에는 반드시 `npm run check:vercel-crons`를 실행한다. `npm run build` 전에도 자동 실행된다.
- 외부 발송 Cron은 새 활성화·인증 복구·장기 중단 후 재개 전에 backlog dry-run을 하고, 실행당 발송
  상한·멱등 키·부분 성공 회귀 테스트를 갖춘다. 상한 초과 시 개별 과거분 발송을 중지한다.
- `미응답누적`, `24시간 미응답`, `48시간 미응답` Webhook 알림은 폐기 상태다. CRM의 미응답
  지표·필터는 유지하되 외부 발송으로 다시 연결하지 않는다. 리드 아침 공지는 유지한다.
- Webhook URL과 token은 로그·문서·오류 응답에 남기지 않는다. 노출되면 해당 key를 회전한다.

## 운영 장애 안전 규칙

- Supabase 오류는 인증/JWT, timeout, unavailable, rate limit, schema mismatch를 구분한다.
  Admin 인증은 fail closed로 유지하고 장애를 권한 없음으로 가장하거나 우회하지 않는다.
- 읽기 오류의 빈 배열·`null`·404를 정상 캐시에 저장하지 않는다. 공개 읽기에는 식별 가능한 bounded
  fallback을 허용할 수 있지만, 저장이 핵심인 쓰기 실패는 성공으로 응답하지 않는다.
- 외부 API·LLM 호출 timeout은 route의 플랫폼 상한보다 짧게 두고, 연속 호출의 최악 시간 합을
  `maxDuration` 안에 둔다. 유료 호출은 클라이언트 연타와 서버 중복 실행을 모두 막는다.
- 브라우저 영속 캐시와 서버 캐시는 배포 또는 응답 schema 버전과 shape guard를 사용한다.
- 운영 hotfix는 확인된 Production commit에서 관련 변경만 배포하고, 관련 없는 dirty 변경을 포함하지 않는다.

## UI 작업 시 필수 체크

- 색상: [DESIGN.md](DESIGN.md) 팔레트만 사용
- 보더: `1px solid rgba(0,0,0,0.08)`
- 섹션 배경: `#FFFFFF` ↔ `#F6F5F4` ↔ `#ECFDF5`
- 모바일 우선 반응형 유지

## 문서 운영 규칙

- 기준 문서는 repo-relative 링크만 사용한다.
- 브랜치명, 로컬 절대경로, 실제 비밀번호 예시는 남기지 않는다.
- 오래된 사고 메모는 현재 상태 단정에 쓰지 않고, `docs/README.md`가 지정한 최신 정본과 실제 코드로 재검증한다.
