# KR Team과 Compass 월별 과정지표 연동

KR Team(`/admin/branch`)의 개요·파이프라인에서 Compass의 현재 팀 명부와 월별 과정지표를 읽는다.
시트 영업 KPI(LD·ACC·OPP·SOL·VST), 매출 장부, 월별 가중 평가표는 서로 다른 정본이다. 서로 합산하거나 이름만 바꿔 대체하지 않는다.

## 정본과 계약

- Compass의 버전 1 읽기 응답을 서버에서 검증한다. 월·버전·필수 필드·유한 숫자가 다르면 조회 실패로 처리한다.
- 지표·목표·가중치·실적·수동값·자동값·조정 사유·정성 평가·종합 점수·월말 전망은 Compass가 계산한다. 관리자가 다시 계산하지 않는다. 평가자·일자·메모·참고 수치도 원본에서 표시한다.
- 확정 월은 Compass의 확정 스냅샷을 표시한다. 스냅샷이 없으면 실패이며 라이브 값으로 대체하지 않는다.
- 명부는 Compass의 현재 KPI 설정과 BD 명단에서 읽는다. 역할 CS는 KR 화면의 CSM과 대응하며 모르는 역할은 미분류다. KPI 전용 대상은 로그인 계정을 만들지 않는다.
- 현재 팀 변경으로 과거 매출 귀속을 바꾸지 않는다. 한글 명부와 영문 장부 이름은 `lib/branch/member-names.ts`로 정규화한다.
- Compass 전체 팀 월매출은 CNY·동기화 시각·미수집을 함께 표시한다. KR 장부 금액에 더하지 않는다. 기존 매출 장부의 액티브 임포트 → DB 미러 → 라이브 폴백 순서는 유지한다.

## 설정과 갱신

관리자 서버의 `COMPASS_BRIDGE_URL`은 Compass의 HTTPS 오리진, `COMPASS_BRIDGE_TOKEN`은 Compass 서버의 전용 토큰과 같은 값이다. 토큰은 브라우저 응답·로그에 넣지 않는다.
로컬 개발에서만 loopback HTTP를 허용한다. 크론 토큰으로 브리지를 열거나 인증 우회를 켜지 않는다.

`GET /api/admin/branch/compass?month=YYYY-MM`은 Compass 요약과 같은 CRM 직원 읽기 권한을 확인한 뒤 원천을 조회한다. 평가표를 일반 VIEWER에게 새로 공개하지 않는다. 응답은 no-store이며 원천 요청에 시간 상한을 둔다.
개요·파이프라인이 활성화된 동안에만 조회하고, 보이는 화면에서 60초마다 갱신한다. 히트맵·AI 탭은 요청하지 않는다.
로딩·미설정·장애·이전 조회·목표 없음·평가 전·매출 미수집을 구분한다. 잘못된 응답을 정상 0으로 바꾸지 않는다.

## 검증과 배포

Compass의 전용 읽기 라우트를 먼저 배포하고 두 서버의 토큰을 연결한 뒤 관리자 소비 코드를 배포한다. 이 연결 자체에는 DB 마이그레이션이 없다.
운영 동기화·마감·임포트는 조회 검증에 필요하지 않다. 설정 값은 채팅·코드·문서에 남기지 않는다.

- `tests/compass/kr-team.test.ts`: 계약·버전·월·음수·실패 상태·토큰 비노출.
- `tests/api/admin-branch-compass.test.ts`: 인증·월 경계·no-store.
- `tests/branch/compass-team-section.test.tsx`: 명부·평가·조정·빈 상태·확정 상태.
- `tests/api/admin-branch-summary-breakdown.test.ts`: 기존 시트 KPI의 월·분기 집계 일치.
