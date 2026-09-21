# Classin Home — Repository Notes

## 프로젝트 개요

- Next.js 16 (App Router) + React 19 + TypeScript
- Tailwind CSS 4, Supabase, Recharts, Lucide
- 공개 사이트(`/`), 관리자(`/admin`), 공유 링크(`/share/{quote,contract}/[token]`), 포털 API(`app/api/portal/`)
  - `/partner` UI는 제거됐다(`app/partner` 없음). 포털 코드·데이터는 관리자가 흡수했고, 외부에 나가는 화면은 공유 링크뿐이다.

## 먼저 볼 문서

- [docs/README.md](docs/README.md)
- Admin 작업: [docs/active/admin-guidance-map.md](docs/active/admin-guidance-map.md)
- [DESIGN.md](DESIGN.md)

2026-04-15 저장소 감사 문서는 당시 상태를 남긴 역사 기록이다. 현재 상태 판단에는 `docs/README.md`가 지정한 최신 정본과 실제 코드를 사용한다.

## 인프라 현황 (서버 위치)

정본은 [Supabase 한국 리전 이관 결과](docs/active/supabase-korea-migration-status.md)다. 아래는 작업 전에 알아야 할 요약이다.

- 운영 DB는 **서울(ap-northeast-2) Supabase 프로젝트**다(2026-09-14 이관). 이관 전 싱가포르 프로젝트는
  보존 중이지만 쓰기가 차단돼 있고 앱이 붙는 대상이 아니다 — 삭제하지 않으며, 도메인·키만 되돌리는
  방식의 복귀도 하지 않는다(서울에서 생긴 쓰기와 갈라진다).
- Vercel 함수 리전은 `icn1`(`vercel.json`의 `regions`)이고 플랜은 Pro다. `regions`를 `sin1` 등으로
  되돌리지 않는다 — DB 옆에서 실행하려고 맞춘 값이다. 오래된 브랜치를 병합할 때 이 줄이 되살아나지 않는지 확인한다.
- 로컬 `.env.local`의 `NEXT_PUBLIC_SUPABASE_URL` 호스트가 상태 문서의 "현재 운영 프로젝트" ref와 다르면
  이관 전 값이다. 그 상태에서는 DB를 읽는 모든 로컬 작업(`check:db`, `check:alpha-db`, `npm run build`의
  postbuild `check:public-content` 등)이 `fetch failed`·쓰기 거절로 실패한다 — 코드 문제로 오인하지 말고
  서울 프로젝트의 URL·publishable key·secret key로 교체한다. 키 값은 문서·로그·커밋에 남기지 않는다.
- **main push 는 Preview 만 만든다 — 운영 배포는 따로 한다.** Vercel 대시보드에서 main 의 Ready 배포를 "Promote to Production"
  (운영 env 로 다시 빌드한 뒤 classin.co.kr 에 연결)하거나, Vercel 배포 API(`POST /v13/deployments`, `target: "production"`,
  `gitSource.ref: "main"` + sha)로 한다. 운영 배포 전에 그 코드가 요구하는 마이그레이션을 서울 프로젝트에 먼저 적용하고,
  배포 뒤에는 라이브 사이트에서 새 코드 흔적·런타임 로그를 확인한다(2026-09-21 절차: `docs/active/integration-followups-2026-09-21.md`).
- 마이그레이션은 수동 적용이다. 적용 대상·순서는 [DB 마이그레이션 런북](docs/active/db-migration-runbook.md),
  적용 여부 확인은 `npm run check:db`(`lib/db/schema-contract.ts`)로 한다. 2026-09-14 이전에 적용된 것은
  DB 복제로 서울에 그대로 넘어갔고, 그 뒤에 만든 마이그레이션은 서울 프로젝트에 직접 적용해야 한다.

## 코드 규칙

- 공용 컴포넌트는 `components/`에 둔다.
- 관리자 API는 `app/api/admin/`에서 `verifyAdmin()` 또는 동등한 관리자 인증 가드를 사용한다.
- 포털 V2 API는 `app/api/portal/`과 `lib/portal/portal-authorize.ts` 기준으로 맞춘다.
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
- 같은 연락처의 재문의는 응대 대상 소스(`RESPONSE_TARGET_SOURCES` = 데모·문의·쇼룸 예약·도입 신청·Meta 리드폼)에
  한해 새 행을 만들지 않고 기존 리드에 합친다(재유입 병합 — `last_inflow_at` 갱신 + "재문의(재유입)" 타임라인).
  합칠 때 담당·상태·팔로업·메모는 건드리지 않는다. 뉴스레터·자료 다운로드처럼 재제출이 정상인 소스는 합치지 않는다.
  전화 비교 키는 `normalizePhoneKey`(TS) = `public.norm_phone_key`(SQL) = Compass `normPhone` 한 규칙이다 — 한쪽만 바꾸지 않는다.
- `/api/lead`를 거치지 않고 리드를 미러링하는 경로(도입 신청 `lib/checkout-requests.ts`, 쇼룸 예약
  `lib/showroom/bookings.ts`)는 광고 귀속을 `lib/lead-attribution-payload.ts`의 `sanitizeLeadAttribution` 하나로
  정규화한다(utm·클릭ID·네이버 `n_*` 묶음). 새 미러링 경로도 이 함수를 쓰고, 폼은 `collectLeadAttribution()`을
  평평하게 한 번만 보낸다.
- 접수 확인 문자·알림톡(`lib/messaging/customer-receipt.ts`)은 `SOLAPI_API`·`SOLAPI_SECRET`이 있으면 **고객에게 실발송**된다.
  새 환경에 키를 넣거나 접수 경로를 바꿀 때는 `MESSAGING_DRY_RUN=1`로 먼저 확인한다.
- 마케팅/채널톡 스크립트 도메인을 추가할 때는 `next.config.ts`의 CSP를 directive별로 갱신하고 `/contact` 응답 헤더를 확인한다.

## 검증 기준

```bash
npm run typecheck
npx eslint app components lib --max-warnings=0
npm run build
```

현재 저장소에서는 위 세 명령을 표시된 순서대로 기본 품질 게이트로 본다.

- `typecheck`가 맨 앞인 이유: eslint는 인자가 `app components lib`로 스코프돼 `tests/`를 열지 않고 `next build`도
  `tests/`의 타입 오류를 통과시킨다. tsconfig include가 `**/*.ts(x)`라 tsc만 `tests/`·`scripts/`까지 본다.
- 동작을 바꿨으면 `npx vitest run`(전체 약 1분)도 돌린다. 여러 브랜치를 합친 뒤에는 필수다 — 서로를 못 본 채
  같은 계약을 바꾼 테스트가 여기서만 드러난다.
- `npm run build`는 `prebuild`(`check:vercel-crons`·`check:design-tokens`)와 `postbuild`(`check:public-content`)를
  함께 돈다. `postbuild`는 운영 DB를 읽으므로 로컬 env가 이관 전 값이면 컴파일이 끝난 뒤 `fetch failed`로
  실패한다(위 "인프라 현황" 참고) — 라우트 표가 출력됐다면 컴파일·정적 생성 자체는 통과한 것이다.
- `.next/`가 오래된 채 브랜치를 크게 옮기면 `typecheck`가 `.next/types/validator.ts`의 없는 라우트 참조로
  실패한다. 생성물이므로 `.next/types`·`.next/dev/types`를 지우고 다시 돌린다.
- 줄바꿈은 LF 하나다(`.editorconfig` + `.gitattributes`의 `* text=auto eol=lf`). Windows에서 소스 스캔 테스트가
  `\r\n` 때문에 실패하면 작업 트리가 옛 CRLF 체크아웃인 것이다 — 커밋 안 된 변경이 없을 때
  `git rm --cached -r -q . && git reset --hard -q`로 한 번 다시 푼다. 테스트에서 파일을 걸을 때 경로는 `/`로 통일한다.

## 배포 / Cron 안전 규칙

- 상세 기준은 [운영 장애·Cron·Webhook 안전 지침](docs/active/operational-failure-handling-guidelines.md)과
  [ADR-010](docs/adr/ADR-010-operational-failure-containment.md)을 따른다.
- Vercel Cron 인증은 `Authorization: Bearer ${CRON_SECRET}` 하나만 사용한다. `x-vercel-cron`을
  인증 또는 추가 실행 조건으로 사용하지 않는다.
- 크론 라우트의 인증 판정은 `lib/server/cron-auth.ts`의 `checkCronAuth(req)`(timing-safe 비교)로 통일한다.
  라우트에서 `process.env.CRON_SECRET`을 직접 `===`/`!==`로 비교하지 않는다 — 새 크론 라우트도 같은 헬퍼를 쓴다.
- Vercel 플랜은 Pro다(2026-09-14 API 확인). 크론은 분 단위 정시에 실행된다.
- `vercel.json` cron 식은 UTC로 적는다. 경로마다 항목은 하나만 두고, 하루 288회(5분 간격) 이하로 둔다. 전체 항목은 40개 이하로 유지한다.
  - 허용 예: `0 0,4,8 * * *`(KST 09·13·17시), `*/5 * * * *`, `50 0,1,4,6,8 * * 1-5`
  - 금지 예: `* * * * *`(하루 1,440회), 같은 경로를 여러 항목으로 나누기
- 주기를 올릴 때는 외부 API 한도, 하루 1회를 전제로 한 실패 알림·중복 방지 코드, 실행 잠금 시간을 함께 확인한다.
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
