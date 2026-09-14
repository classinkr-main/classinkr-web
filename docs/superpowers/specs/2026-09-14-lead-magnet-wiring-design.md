# 블로그·리드마그넷 디벨롭 — 하위 프로젝트 1: 연결 작업 설계

작성일: 2026-09-14
상위 맥락: 리드마그넷 디벨롭 분석(2026-09-02). 진행 순서 합의 = 1 연결 작업 → 3 Meta 리드 후속 → 2 블로그 정리·발행 재개 → 4 자료 신규 제작 → 5 화면 품질.

## 0. 착수 시점 실측 (2026-09-14, 운영 DB·Vercel 읽기 전용)

- 9/02~9/14 리드 102건 중 Meta 리드 광고 100건. 블로그 조회 6, 자료실 조회 0, 자료 다운로드 2, 뉴스레터 구독 6명.
- 자료: 저장소 14종, 운영 `lead_magnets` 13종. `classroom-recording-replay-setup-guide`는 PDF가 운영 배포(fc341753)에 포함됐지만 DB 행이 없어 비공개 상태.
- 블로그: `blog_posts` 46편(공개 19·초안 27). 공개 19편 중 17편이 2023~2024 레거시. `lead_magnet_slug` 지정 0편. 글 하단 게이트(`components/blog/LeadMagnetGate.tsx`)와 어드민 지정 필드(`components/admin/BlogPostEditor.tsx`)는 구현돼 있음.
- 후속 메일: 자동화 룰 3건 `draft`. 운영 Vercel(classinkr-web)에 `RESEND_API_KEY`·`NEXT_PUBLIC_SITE_URL` 없음. `RESEND_FROM`은 코드 기본값 `Classin <noreply@classin.ai.kr>`(도메인 verified)이라 필수 아님.
- 템플릿(`email_templates`) 3건 제목에 "(광고)" 없음.

## A. 녹화 가이드 운영 공개

**문제**: `scripts/import-lead-magnets.mjs`는 JSON 전량을 upsert 해서 어드민에서 편집한 자료를 덮어쓴다.

**설계**: 단일 자료 삽입 스크립트 `scripts/insert-lead-magnet.mjs`.

- 사용: `node --env-file=.env.local scripts/insert-lead-magnet.mjs --slug <slug> [--dry-run]`
- 동작:
  1. `data/lead-magnets.json`에서 slug 항목을 찾는다. 없으면 종료(코드 1).
  2. `buildLeadMagnetImportPlan([item])`으로 유효성 검사. invalid면 종료.
  3. 운영 DB에서 같은 slug 조회. **이미 있으면 쓰지 않고 종료**(덮어쓰기 금지, 코드 1).
  4. `--dry-run`이면 "wouldInsert: <slug>, published: <bool>"만 출력.
  5. 아니면 `insert`(upsert 아님) `{ slug, data: item, published: item.published === true }`.
- 판정 로직(찾기·검사·존재 여부 → insert/skip/error)은 `scripts/lib/`의 순수 함수로 분리하고 단위 테스트를 둔다. DB 호출은 스크립트 본체에만.
- 운영 쓰기는 자동 모드 분류기가 막으므로 사용자가 직접 실행한다. dry-run 결과를 먼저 확인한다.

**캐시**: `/resources`는 `revalidate = 3600`이라 삽입 후 최대 1시간 뒤 목록에 반영된다. 상세 `/resources/[slug]`는 정적 파라미터에 없는 slug라 첫 요청 때 렌더된다. 즉시 반영이 필요하면 어드민 자료 화면에서 해당 자료를 변경 없이 저장한다(`app/api/admin/lead-magnets/route.ts`가 `/resources`·`/resources/<slug>`·`/blog`를 `revalidatePath`).

**검증**: 실행 후 `/resources/classroom-recording-replay-setup-guide` 200, 허브 목록 노출, 이메일 게이트 → 다운로드 동작.

## B. 블로그 글 ↔ 자료 매핑

**원칙**: 레거시(2023~2024) 공개 글에는 붙이지 않는다(하위 프로젝트 2에서 정리 대상). 지금 붙이는 건 최근 공개 2편뿐이고, 초안 매핑은 하위 프로젝트 2의 발행 시 적용할 입력값이다.

**즉시 적용 (어드민 편집기로 지정)**

| 글 | 자료 |
|---|---|
| 최대 500만원 지원! 국민내일배움카드 신청 가이드 | academy-system-checklist |
| 2026 Asia AI Education Forum in Busan | academy-case-match-brief |

**하위 프로젝트 2 발행 시 적용 (초안 매핑)**

| 초안 | 자료 |
|---|---|
| 화상영어학원 창업 가이드 | academy-software-selection-worksheet |
| 학원에 따른 전자칠판 선택 가이드 | electronic-whiteboard-classroom-checklist |
| 수학도 온라인으로 전환이 가능할까 | academy-software-selection-worksheet |
| 온라인 강의 플랫폼 선택 전 체크 포인트 | classin-pre-adoption-questions-checklist |
| 화상강의 플랫폼, 결국 줌이 맞을까 | academy-software-selection-worksheet |
| 고교학점제, 학원들은 어떻게 대비하나 | academy-system-checklist |
| 강사 인건비 지원사업 총정리 | academy-resource-reduction-calculator |
| 학원 퇴원율 이렇게 관리하세요 | parent-replay-retention-script-kit |
| 온라인 학원 창업, Zoom이면 충분할까요 | classin-pre-adoption-questions-checklist |
| 명절 보강 학원 운영 방법 | classroom-recording-replay-setup-guide |
| 저출산 시대 학원 생존 | academy-case-match-brief |
| 모르면 과태료, 원장님 의무 총정리 | academy-admin-dashboard-template |
| 학원 배상책임보험 가입해야 할까 | academy-system-checklist |
| 싱가포르 TP 대학의 미래형 강의실 | classroom-install-av-readiness-checklist |
| AI 수업 예산 지원 최대 500만원 | classin-90-day-adoption-roadmap |
| AI 디지털교과서가 남긴 과제 | teacher-edb-onboarding-sop-kit |
| AI 시대, ClassIn이 선생님을 믿는 이유 | teacher-edb-onboarding-sop-kit |
| 온라인 소통의 한계를 깬 클래스인 | showroom-demo-readiness-kit |
| 2026학년도 교육급여 바우처 신청 가이드 | academy-system-checklist |
| 칠판 하나로 바뀐 수업의 몰입도 | electronic-whiteboard-classroom-checklist |
| 모든 학생의 풀이를 한눈에 확인하는 방법 | electronic-whiteboard-classroom-checklist |
| 사람이 바뀌어도 흔들리지 않는 학원 운영 체크리스트 | teacher-edb-onboarding-sop-kit |
| 전자칠판을 사기 전에 확인해야 할 것 | electronic-whiteboard-classroom-checklist |
| 학원 전자칠판 도입 체크리스트 | classroom-install-av-readiness-checklist |
| 강사가 바뀔 때마다 흔들리는 학원의 공통점 | teacher-edb-onboarding-sop-kit |

하위 프로젝트 2로 넘기는 판단: 네이버 초안 "2026 Asia AI Education Forum in Busan"은 공개 글과 중복, "테스트1-1"은 삭제 후보. 분석(9/02)에서 제안한 "후반 사다리 4종 공개 허브 제외"가 확정되면 매핑 중 `academy-admin-dashboard-template`·`classroom-install-av-readiness-checklist`·`parent-replay-retention-script-kit`·`academy-case-match-brief` 행을 basic 자료로 교체한다.

## C. 후속 메일 자동화 켜기

**선행 (사용자)**: 운영 Vercel(classinkr-web, Production)에
- `RESEND_API_KEY` — 필수
- `NEXT_PUBLIC_SITE_URL=https://classin.co.kr` — 필수(수신거부 링크·추적 URL 기준. 없으면 수신거부 링크가 빠진다)
- `RESEND_FROM` — 선택(기본 `Classin <noreply@classin.ai.kr>`)

입력 후 재배포. 키 값은 대화나 저장소에 남기지 않는다.

**켜기 전 점검**
1. Vercel env 키 이름 존재 확인(값은 보지 않음) + 재배포가 키 입력 이후인지 확인.
2. 템플릿 제목 "(광고)" 표기: 3일 후·7일 후 메일(`b95a41d5`·`164ffe06`)은 상담 유도 광고성이므로 제목 앞에 "(광고)"를 붙인다. 신청 즉시 메일(`524a4c91`)은 요청 자료 전달이라 표기하지 않는 안을 기본으로 하되, 상담 CTA가 들어 있어 사용자 판단으로 확정한다. 변경 전 현재 제목을 백업한다.
3. 발신자 정보: `lib/email.ts`의 `wrapCampaignHtml` 푸터는 "Classin Korea · classin.co.kr"와 수신거부 문구뿐이고 연락처(전화 또는 주소)가 없다. 광고성 메일 요건에 맞추도록 푸터에 연락처 한 줄을 추가한다(모든 캠페인 메일에 적용되는 공용 래퍼라 코드 1곳 수정). 표기할 연락처 값은 사용자에게 받는다.

**켜기**: `node tmp/automation-golive-20260902.mjs activate` (사용자 실행). 롤백은 `pause`.

**실수신 검증**
1. 본인 이메일로 자료실 이메일 게이트 제출 → 즉시 메일 수신, 수신거부 링크 동작 확인.
2. `automation_logs` 해당 룰 `sent`, `automation_delay_queue`에 72h·168h 예약 2건 생성 확인.
3. 3일 뒤 크론(18:00 KST) 처리 결과 확인은 하위 프로젝트 3 진행 중 점검 항목으로 넘긴다.
4. 실패 시 즉시 `pause`, 원인 확인 후 재시도.

**알려진 한계 (수정하지 않음)**: 자료 게이트·블로그 게이트·푸터 뉴스레터가 모두 `source=newsletter`로 들어와 세 룰에 전부 매칭된다. 템플릿이 자료 공통 문안이라 당장 문제는 아니며, 자료별 분기·`{resource_url}` 변수는 하위 프로젝트 3에서 다룬다.

## 범위 밖

- 자료별 후속 메일 분기(엔진 코드) → 하위 프로젝트 3
- 초안 검수·발행, 레거시 글 처리 → 하위 프로젝트 2
- 문자(솔라피) 발송 경로 → 하위 프로젝트 3

## 완료 기준

- 운영 `lead_magnets` 14종, 녹화 가이드 공개 페이지·다운로드 동작.
- 최근 공개 2편에 자료 지정, 글 하단 게이트 노출.
- 자동화 3건 `active`, 본인 테스트 메일 수신·수신거부 동작 확인, 지연 큐 2건 예약.
- 단위 테스트 포함 품질 게이트(typecheck + eslint + build) 통과.
