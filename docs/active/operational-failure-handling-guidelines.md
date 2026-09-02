# 운영 장애·Cron·Webhook 안전 지침

상태: Active — 운영 변경과 장애 대응의 현재 기준
기준 시점: 2026-09-02
범위: Cron, 외부 Webhook·알림, Supabase 의존성, 외부 API·LLM, 캐시, 빌드·배포
결정 근거: [ADR-010](../adr/ADR-010-operational-failure-containment.md)

이 문서는 자주 반복되거나 영향이 컸던 장애를 같은 방식으로 진단·격리하기 위한 운영 기준이다.
개별 기능의 상세 설계를 대신하지 않으며, 실제 코드와 운영 설정을 함께 확인한다.

## 1. 현재 알림 계약

- `app/api/cron/lead-response-alerts/route.ts`는 이름과 달리 Meta·홈페이지 리드 **아침 공지**만 보낸다.
- `미응답누적`, `24시간 미응답`, `48시간 미응답` Webhook 알림은 2026-09-02 폐기했다.
- 미응답 시간과 건수는 CRM 우선순위·필터·운영 지표로 계속 사용할 수 있다. 다만 이를 외부
  Webhook 발송 이벤트로 다시 연결하지 않는다.
- 리드 일간·주간·월간 보고는 `wecom_lead_report_webhook` 용도만 사용한다. CS, 운영, 중요 장애
  목적지는 서로 대체하지 않는다.
- 새 알림 종류는 수신자, 목적지, 발송 조건, 멱등 키, 실행당 상한, 비활성화 스위치, 테스트를
  갖춘 뒤에만 활성화한다.

## 2. 확인된 장애와 재발 방지 규칙

| 시점 | 장애 | 직접 원인 | 고정 규칙 |
| --- | --- | --- | --- |
| 2026-06-04~08-31 | Vercel Cron 다수가 계속 401 | 존재하지 않는 `x-vercel-cron` 헤더를 요구 | Cron 인증은 `Authorization: Bearer ${CRON_SECRET}` 하나만 사용 |
| 2026-09-02 | 복구된 리드 Cron이 262건 발송, 그중 과거 48시간 미응답 256건 | 첫 성공 실행에 대한 백로그 상한·초기화 기준 부재 | 외부 발송 Cron은 복구 전 backlog dry-run, 실행당 상한, 멱등성, circuit breaker 필수 |
| 2026-09-01 | Admin 로그인과 공개 데이터 경로 동시 장애 | Supabase API Gateway의 `PGRST303 JWT issued at future` | 인증 우회 금지, 의존성 오류 분류, 읽기 폴백과 쓰기 실패 의미 분리 |
| 2026-08-20 | AI 생성 504·빈 본문·중복 유료 호출 | route 시간 상한 누락, 모델 사고 토큰 소진, 요청 연타 | 하위 호출 timeout, route `maxDuration`, 모델별 생성 설정, 동기식 중복 실행 가드 |
| 2026-08-27~09-01 | 빌드 후 검증·Admin 화면이 간헐적으로 잘못 실패 | 빌드 산출물 경합, 외부 콘텐츠 timeout, 배포 간 캐시 shape 불일치 | 빌드 단독 실행, 실패 단계 분류, 배포 버전 캐시 키와 shape guard |

과거 커밋 메시지는 사건의 증거이지만 현재 지침은 아니다. 같은 종류의 문제가 생기면 이 표의
원인 이름을 그대로 추정하지 말고, 아래 진단 순서로 현재 증거를 다시 모은다.

## 3. Cron 필수 계약

### 인증과 소유권

- Vercel Cron의 인증 계약은 `Authorization: Bearer ${CRON_SECRET}` 하나다.
- `x-vercel-cron`의 존재 여부를 인증 또는 추가 게이트로 사용하지 않는다.
- `CRON_SECRET`이 없거나 값이 다르면 실행하지 않고 실패를 명확히 반환한다. 비밀값 자체는
  응답과 로그에 남기지 않는다.
- Site/Admin이 배포 단위로 분리돼도 같은 Cron은 한 프로젝트만 소유한다.
- `vercel.json`을 바꾸면 `npm run check:vercel-crons`를 실행하고, 실제 Production 프로젝트에
  등록된 path·schedule·소유 프로젝트를 별도로 대조한다.

### 멱등성과 복구 실행

- 스케줄러 전달은 at-least-once로 간주한다. 같은 기간·대상·이벤트를 재실행해도 결과가 중복되지
  않는 멱등 키 또는 DB unique 제약을 둔다.
- 외부 발송 작업은 `조회 → 대상 확정 → 멱등 예약 → 발송 → 결과 기록`의 상태 전이를 명시한다.
  발송 성공 전에 완료 상태를 기록하지 않고, 실패한 발송을 업무 처리 성공으로 가장하지 않는다.
- 새 Cron 활성화, 인증 수리, 장기 중단 복구 전에는 발송 없이 대상 건수와 가장 오래된 시각을
  확인하는 dry-run을 먼저 한다.
- 첫 성공 실행이 전체 과거분을 한 번에 재생하지 않도록 lookback, 실행당 건수, 목적지별 발송량과
  동시성 상한을 둔다. 상한을 넘으면 개별 발송을 중단하고 요약과 운영자 확인으로 전환한다.
- 401/403, 연속 5xx, 평소 대비 급격한 대상 증가, delivery 실패율 급증은 circuit breaker 조건이다.
  자동 재시도로 계속 밀어붙이지 않는다.
- 루프 안에서 외부 발송을 하는 구현은 부분 성공과 재실행을 테스트한다. 한 건의 실패가 이미 성공한
  항목을 다시 보내지 않아야 한다.

## 4. Webhook·알림 필수 계약

- 목적지는 `lead report`, `CS`, `ops`, `critical`처럼 용도별로 분리한다. 한 목적지가 비어 있거나
  실패했다고 다른 방으로 암묵적으로 우회하지 않는다.
- 설정값이 있는 것과 활성화된 것은 다르다. 새 목적지는 URL과 별도의 enable 상태를 가져야 하며,
  운영 화면은 `configured / enabled / healthy`를 구분한다.
- Webhook URL, key, token, Authorization 헤더는 문서·Git·로그·오류 응답·관리 화면에 그대로 노출하지
  않는다. 확인에는 provider, host, 끝자리 마스킹 또는 단방향 fingerprint만 사용한다.
- 비밀 URL이 채팅, 이슈, 로그 등에 노출되면 P0 보안 사건으로 보고 해당 key를 회전한 뒤 발송 smoke
  test를 수행한다.
- delivery 로그에는 `runId`, `eventType`, `destinationKind`, `idempotencyKey`, `status`, `attempt`,
  `durationMs`, 일반화한 오류를 남긴다. 메시지 본문과 개인정보는 복제하지 않는다.
- `requireSuccessfulDelivery`는 외부 전달 자체가 작업 완료 조건인 경우에만 쓴다. 그렇지 않은 경우에도
  delivery 실패를 숨기지 말고 업무 결과와 전달 결과를 별도 필드로 기록한다.

## 5. Supabase·저장 실패 처리

- `PGRST303`, session invalid, timeout, unavailable, rate limit, schema mismatch를 서로 다른 의존성
  오류로 분류한다. DB CPU나 migration 문제로 먼저 단정하지 않는다.
- Admin 인증은 장애 중에도 fail closed다. `PGRST303`을 무시하거나 비밀번호 폴백·service-role로
  사용자 검증을 우회하지 않는다.
- 읽기는 `found / not_found / unavailable`을 구분한다. 의존성 오류에서 나온 빈 배열, `null`, 404를
  정상 캐시에 저장하지 않는다.
- last-known-good·정적 bundle은 공개 읽기에만 제한적으로 사용할 수 있다. 응답과 로그에서 degraded
  상태를 식별할 수 있어야 한다.
- 리드 제출, 피드백, 이벤트처럼 저장이 핵심인 쓰기는 저장 실패를 성공으로 응답하지 않는다. 중복 방지
  상태도 실제 저장 또는 외부 전달 중 하나 이상이 성공한 뒤에만 accepted로 바꾼다.
- Supabase 장애 상세 복구는 [Supabase 운영 복구·하드닝 계획](supabase-operational-recovery-hardening-plan-2026-09-01.md)을 따른다.

## 6. 외부 API·LLM·빌드

- 외부 호출 timeout은 route·함수의 플랫폼 상한보다 충분히 짧게 둬 catch·fallback·로그가 실행될
  시간을 남긴다. 연속 호출의 최악 시간 합도 `maxDuration` 안에 들어와야 한다.
- 재시도는 멱등한 읽기 또는 같은 멱등 키를 사용하는 쓰기에만 bounded backoff로 허용한다.
- 유료 생성 버튼은 React state만 믿지 말고 동기식 ref·서버 멱등 키로 연타를 막는다.
- 모델별 thinking·출력 설정, 빈 응답, 안전 필터, schema 검증을 명시하고 실패를 정상 빈 결과로
  바꾸지 않는다.
- 프롬프트에 들어가는 운영 입력은 길이와 제어문자를 제한한다.
- `npm run build`의 compile, static generation, postbuild 콘텐츠 검증을 서로 다른 단계로 기록한다.
  외부 콘텐츠 timeout이나 `.next` 경합이면 코드 결함으로 즉시 단정하지 말고, 동시에 실행 중인 dev/build
  프로세스를 제거한 뒤 한 번 재현한다. 반복 실패하면 실패를 무시하지 않고 원인을 고친다.

## 7. 캐시·배포 호환성

- 브라우저 영속 캐시와 서버 캐시의 key에 응답 schema 또는 배포 버전을 포함한다.
- 소비자는 필수 필드의 shape를 검증하고, 이전 배포 응답을 읽을 때 화면을 깨뜨리기보다 해당 캐시만
  폐기해 재조회한다.
- DB migration과 공용 응답 변경은 직전 배포와의 하위 호환을 유지한다. 파괴적 rename은 additive
  필드 추가 → 양쪽 읽기 → 소비자 전환 → 구 필드 제거 순서로 나눈다.
- 운영 hotfix는 확인된 Production commit을 기준으로 만들고 관련 없는 dirty 변경을 포함하지 않는다.
  배포 후 도메인 alias가 가리키는 deployment와 target commit을 확인한다.

## 8. 장애 등급과 즉시 행동

| 등급 | 예 | 즉시 행동 |
| --- | --- | --- |
| P0 | 알림 폭주, 비밀값 노출, Admin 전체 인증 불가, 핵심 쓰기 유실·거짓 성공 | 해당 발송·작업 중지, 비밀 회전 필요성 판단, 배포·provider 상태 보존, 담당자 즉시 호출 |
| P1 | 단일 Cron 연속 실패, 공개 데이터 대규모 degraded, 외부 API 504 반복 | 영향 경로 격리, bounded fallback, 30분 내 원인·완화 기록 |
| P2 | 단일 대상 발송 실패, 일시적 timeout, 비핵심 화면 오류 | 재현·delivery 기록 확인, 정상 배치에서 수정 |

알림 폭주 때는 애플리케이션을 먼저 재배포하기 전에 목적지 발송을 중지한다. 이후 `runId`, 시작 시각,
대상 건수, 마지막 정상 실행, 배포 commit, 스케줄러 상태를 보존하고 과거분이 왜 대상이 됐는지 계산한다.

## 9. 표준 대응 순서

1. KST·UTC 장애 시작 시각, 영향 경로, 최근 배포, provider 상태를 기록한다.
2. 발송 폭주·데이터 오염을 만드는 작업만 중지한다. 인증·RLS를 우회하지 않는다.
3. HTTP 상태, 구조화 오류 코드, DB/외부 provider, 스케줄러, delivery log 순으로 실패 경계를 좁힌다.
4. 실패 건수, 중복 건수, 누락·백로그 범위, 개인정보·비밀 노출 여부를 추정한다.
5. 가장 좁은 코드·설정 변경을 Preview 또는 로컬에서 재현하고 부분 성공·재실행까지 검증한다.
6. Production 기준 commit에서 배포하고 alias·Cron 등록·환경 readiness를 확인한다.
7. 정상 1회만 보지 말고 다음 스케줄 또는 15분 안정 구간까지 401/5xx·발송량·저장 실패를 관찰한다.
8. 사건별 사실은 사고 기록에, 장기 결정은 ADR과 이 지침에 반영한다.

## 10. 변경 검증 체크리스트

- Cron: 무인증·잘못된 Bearer·정상 Bearer, 중복 실행, 장기 중단 후 첫 실행, 부분 성공
- Webhook: 비활성·미설정·429·5xx·timeout, 상한 초과, secret redaction
- Supabase: true not-found·timeout·`PGRST303`·schema mismatch·복구 후 cache refresh
- 외부 API/LLM: timeout·빈 응답·재시도·연타·플랫폼 시간 상한
- 캐시: 직전 배포 shape, 손상 payload, 로그아웃·버전 변경 후 무효화
- 배포: `npm run typecheck` → ESLint → `npm run build`, Cron 변경 시 `npm run check:vercel-crons`
