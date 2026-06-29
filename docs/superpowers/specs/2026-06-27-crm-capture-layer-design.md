# CRM Capture Layer Design

> 정합화: 백엔드(파싱·매칭·적용)는 빌드 완료, 모달 UI는 미빌드(C1). 스키마는 빌드본이 캐논. 통합 캐논은 [CRM 통합 마스터 설계](docs/superpowers/specs/2026-06-27-crm-unified-master-design.md) §6 참조.

기준 시점: 2026-06-27

상태: 설계 승인 초안

범위: 공개 행사 참석자/신청자, 오프라인 행사·세미나 엑셀 명단, 카톡·메모 붙여넣기를 CRM 고객 activity와 후속 task로 바꾸는 입력 레이어 설계.

관련 문서:
- `docs/superpowers/specs/2026-06-27-crm-next-action-culture-fit-design.md`
- `docs/active/internal-crm-backend-operating-plan-2026-06-26.md`
- `docs/active/sales-crm-phase0-phase1-discussion-2026-06-27.md`
- `docs/active/lead-funnel-consent-auth-scoring-plan-2026-06-14.md`

---

## 1. 한 줄 결정

CRM Capture Layer는 매니저에게 "CRM에 기록하라"고 요구하는 기능이 아니다. **행사, 엑셀 명단, 카톡/메모 텍스트를 고객 activity와 후속 task로 바꿔주는 접점 정리 도구**다.

첫 버전은 자동 저장보다 **붙여넣기 + 자동 해석 + 검토 + 일괄 적용**에 집중한다.

---

## 2. 문제 정의

현재 팀은 고객 접점이 생겨도 기록을 잘 남기지 않는다. 특히 행사, 세미나, 방문, 데모 콜처럼 한 번에 여러 리드와 고객이 생기는 상황에서는 CRM에 한 명씩 입력할 가능성이 낮다.

실제 운영 문제:
- 공개 행사 참석자와 신청자가 CRM 후속 액션으로 잘 이어지지 않는다.
- 오프라인 행사나 세미나 명단은 엑셀로 따로 관리되거나 나중에 밀어넣는다.
- 카톡, 개인 메모, 현장 메모는 정형 데이터가 아니라 흩어진 텍스트로 남는다.
- 고객과 리드를 기존 DB에 매칭하는 작업이 귀찮다.
- 후속 연락 task가 만들어지지 않으면 행사 ROI와 고객 히스토리가 끊긴다.

따라서 CRM은 정돈된 입력만 받으면 안 된다. 팀이 실제로 쓰는 엑셀, 복사 붙여넣기, 지저분한 메모를 받아서 검토 가능한 CRM 데이터로 바꿔야 한다.

---

## 3. 제품 원칙

### 3.1 엑셀을 대체하지 말고 흡수한다

기존에 엑셀로 밀어넣던 행동은 나쁜 습관이 아니라 현실적인 업무 방식이다. 첫 버전은 엑셀 업로드뿐 아니라 표 복사 붙여넣기를 우선 지원한다.

### 3.2 지저분한 텍스트를 허용한다

카톡, 메모앱, 현장 메모처럼 정리되지 않은 텍스트를 허용한다. 완벽한 자동 인식보다 "검토 가능한 행"으로 바꾸는 것이 목표다.

### 3.3 자동화는 검토 가능해야 한다

고객 데이터가 틀리면 CRM 신뢰가 바로 무너진다. 확정 매칭만 일괄 적용하고, 후보가 여럿이거나 신규 리드로 보이는 행은 사람이 확인한다.

### 3.4 기록보다 후속 액션

접점 activity를 저장하는 것만으로는 부족하다. 행사 참석, 데모 콜, 방문, 설치 같은 접점은 후속 task 제안까지 연결되어야 한다.

### 3.5 고객 히스토리와 보고로 자동 연결

일괄 적용된 activity와 task는 고객 360, 매니저 홈, 주간 보고, 지사장 화면에 자동 반영되어야 한다.

---

## 4. 첫 범위

첫 버전에서 지원할 입력 원천은 세 가지다.

1. 공개 행사 참석자/신청자 목록
2. 오프라인 행사·세미나 후 엑셀/CSV 명단
3. 카톡·메모 텍스트 붙여넣기

단건 기록은 같은 UI 안에 두되, 첫 설계의 중심은 bulk capture다.

비범위:
- 완전 자동 CRM 저장
- 복잡한 AI 판단으로 고객을 확정 병합
- 본사 CRM write-back
- 행사 운영 전체 관리 시스템
- 마케팅 자동 발송 캠페인

---

## 5. 접점 타입

Capture Layer의 접점 타입은 고객 activity와 후속 task 템플릿의 기준이 된다.

기본 타입:
- `event_attended`: 행사 참석
- `visit`: 방문
- `demo_call`: 데모 콜
- `check_in_call`: 안부 전화
- `installation`: 설치
- `consultation`: 상담
- `quote_sent`: 견적 발송
- `onboarding`: 교육/온보딩
- `cs_issue`: CS 이슈
- `memo`: 기타 메모

UI 라벨:
- 행사 참석
- 방문
- 데모 콜
- 안부 전화
- 설치
- 상담
- 견적 발송
- 교육/온보딩
- CS 이슈
- 기타 메모

---

## 6. UX 구조

### 6.1 진입점

주요 진입점은 `+ 접점 캡처` 버튼이다.

노출 위치:
- CRM 홈
- 고객 검색 결과
- 행사 관리 상세
- CRM 기록 탭
- 리드/고객 목록 bulk action

버튼은 "기록 추가"보다 "접점 캡처" 또는 "명단 정리"에 가깝게 표현한다. 팀이 느끼기에 기록 업무가 아니라 후속 정리 업무여야 한다.

### 6.2 입력 방식 탭

한 모달 또는 전용 화면 안에서 입력 방식만 바꾼다.

탭:
- 행사에서 불러오기
- 엑셀/CSV 붙여넣기
- 카톡/메모 붙여넣기
- 단건 기록

모든 탭은 같은 후속 단계로 이어진다.

공통 후속 단계:
1. 원천 입력
2. 자동 해석
3. 매칭 검토
4. activity/task 적용
5. 결과 요약

### 6.3 행사에서 불러오기

공개 행사나 어드민 행사 데이터를 선택하면 신청자/참석자 목록을 불러온다.

필드 후보:
- 행사명
- 행사 일시
- 신청자 이름
- 기관명
- 전화번호
- 이메일
- 참석 상태
- 신청 메모
- 유입 경로

기본 접점 타입:
- 참석자는 `행사 참석`
- 신청했지만 불참한 사람은 별도 상태로 두고, activity 생성 여부를 선택하게 한다.

기본 task 제안:
- 참석자: D+1 안부 전화
- 관심 높음 메모가 있는 참석자: D+1 데모 제안
- 불참자: D+1 자료 발송 또는 다음 행사 안내

### 6.4 엑셀/CSV 붙여넣기

파일 업로드와 표 붙여넣기를 모두 허용한다. 첫 버전에서는 표 붙여넣기를 가장 중요하게 본다.

허용 입력:
- CSV 파일
- 엑셀에서 복사한 표
- 구글시트에서 복사한 표
- 헤더가 있는 표
- 헤더가 없는 표

컬럼 매핑 후보:
- 기관명
- 이름
- 직함/역할
- 전화번호
- 이메일
- 지역
- 접점 타입
- 메모
- 담당자
- 후속 액션

헤더가 없으면 첫 행 몇 개를 보고 자동 후보를 제시하되, 저장 전 사용자가 매핑을 확인한다.

### 6.5 카톡/메모 붙여넣기

비정형 텍스트를 줄 단위 후보로 바꾼다.

입력 예:

```text
김원장 / 대치스파르타 / 행사 참석 / 관심 높음
이미숙국어 이실장 데모콜 완료 견적 요청
부산 해운대 A학원 051-000-0000 설치 완료 7일 후 확인
```

해석 목표:
- 사람 이름
- 기관명
- 전화번호
- 지역
- 접점 타입
- 관심도 또는 리스크
- 후속 액션 힌트
- 메모

첫 버전은 완벽한 자연어 이해가 아니라 규칙 기반 파싱과 안전한 후보 검토를 우선한다. AI 보조는 후속 옵션으로 둘 수 있으나, AI 결과도 사람이 검토할 수 있어야 한다.

---

## 7. 처리 흐름

### Step 1. 원천 선택

사용자가 원천과 기본 접점 타입을 선택한다.

예:
- `부산 원장 세미나 2026-06`
- 기본 접점 타입: `행사 참석`
- 기본 후속 task: `D+1 안부 전화`

### Step 2. 자동 해석

입력을 행 단위 후보로 바꾼다.

행 후보 필드:
- `raw_text`
- `organization_name`
- `contact_name`
- `phone`
- `email`
- `region_label`
- `activity_type`
- `memo`
- `suggested_task_type`
- `suggested_task_title`
- `suggested_due_at`

### Step 3. 매칭

각 행을 기존 데이터와 비교한다.

매칭 대상:
- 통합 고객
- NEO/HQ CRM account snapshot
- 기존 leads
- 최근 capture batch 안의 다른 행

매칭 상태:
- `confirmed_customer`
- `confirmed_lead`
- `multiple_candidates`
- `new_lead_candidate`
- `needs_review`
- `duplicate_in_batch`

### Step 4. 검토

사용자는 행을 전체가 아니라 예외 중심으로 검토한다.

기본 표시:
- 확정 매칭
- 확인 필요
- 신규 리드 후보
- 중복 의심
- 제외됨

확정 매칭은 기본 선택 상태로 둔다. 확인 필요와 신규 리드 후보는 저장 전 명시 확인을 요구한다.

### Step 5. 일괄 적용

선택된 행에 대해 아래 작업을 실행한다.

- `crm_customer_events` activity 생성
- `crm_tasks` 후속 task 생성
- 신규 리드 후보가 승인된 경우 `leads` 생성
- capture batch 결과 카운트 갱신

부분 실패가 있어도 전체를 실패시키지 않는다. 실패한 행만 `failed`로 남기고 재시도 가능하게 한다.

### Step 6. 결과 요약

저장 후 즉시 결과를 보여준다.

예:
- activity 32건 생성
- task 28건 생성
- 신규 리드 후보 6건 생성
- 확인 필요 4건 남음
- 중복 제외 2건

다음 행동:
- 오늘 생성된 task 보기
- 확인 필요 행 처리
- 행사 상세로 돌아가기
- 고객 히스토리 보기

---

## 8. 넛지 및 후속 task 템플릿

접점 타입별 기본 task 제안은 강제가 아니라 체크된 기본값이다. 사용자는 끄거나 날짜를 바꿀 수 있어야 한다.

| 접점 타입 | 기본 task 제안 |
|---|---|
| 행사 참석 | D+1 안부 전화, D+3 자료/데모 제안 |
| 행사 신청 후 불참 | D+1 자료 발송, 다음 행사 안내 |
| 데모 콜 | 견적 발송, 도입 의사 확인 |
| 방문 | 회의록 정리, 다음 미팅 잡기 |
| 안부 전화 | 다음 연락 예약 또는 부재 시 내일 재연락 |
| 설치 | 7일 후 사용 확인, 30일 후 활성화 체크 |
| 상담 | 상담 요약 저장, 다음 액션 지정 |
| 견적 발송 | D+3 견적 확인, 의사결정자 확인 |
| 교육/온보딩 | 7일 후 사용 점검 |
| CS 이슈 | 해결 확인, 재발 여부 체크 |

넛지 노출 위치:
- capture 적용 전 미리보기
- activity 저장 완료 후 결과 요약
- 고객 상세에서 마지막 접점 뒤 다음 액션이 없을 때
- 행사 종료 후 행사 상세 화면
- 매니저 홈의 확인 필요 큐

---

## 9. 데이터 모델 방향

### 9.1 `crm_capture_batches`

입력 한 묶음을 나타낸다.

필드 후보:
- `id`
- `source_type`: `public_event`, `spreadsheet`, `pasted_text`, `manual`
- `source_id`
- `source_label`
- `default_activity_type`
- `default_task_template`
- `raw_input_storage_path`
- `created_by`
- `status`: `draft`, `parsed`, `reviewed`, `applied`, `partial_failed`, `canceled`
- `total_rows`
- `confirmed_rows`
- `review_rows`
- `new_lead_rows`
- `activity_created_count`
- `task_created_count`
- `lead_created_count`
- `created_at`
- `updated_at`

### 9.2 `crm_capture_rows`

파싱된 개별 행을 나타낸다.

필드 후보:
- `id`
- `batch_id`
- `row_index`
- `raw_text`
- `parsed`
- `organization_name`
- `contact_name`
- `phone`
- `email`
- `region_label`
- `activity_type`
- `memo`
- `match_status`
- `matched_target_type`
- `matched_target_id`
- `match_candidates`
- `apply_status`: `pending`, `applied`, `skipped`, `failed`
- `created_event_id`
- `created_task_id`
- `created_lead_id`
- `error_message`
- `created_at`
- `updated_at`

### 9.3 Existing Objects

Capture Layer는 기존 CRM 객체에 결과를 남긴다.

- activity: `crm_customer_events`
- 후속 할 일: `crm_tasks`
- 신규 리드 확정: `leads`
- 고객 매칭: `crm_source_links` 또는 unified customer repository

---

## 10. API 설계 지침

모든 API는 `app/api/admin/crm/**` 아래에 둔다.

권장 API:

| Method | Path | 목적 |
|---|---|---|
| `POST` | `/api/admin/crm/capture/batches` | capture batch 생성 |
| `POST` | `/api/admin/crm/capture/batches/[id]/parse` | 원천 입력 파싱 |
| `GET` | `/api/admin/crm/capture/batches/[id]` | batch와 rows 조회 |
| `PATCH` | `/api/admin/crm/capture/rows/[id]` | 매칭/제외/필드 수정 |
| `POST` | `/api/admin/crm/capture/batches/[id]/apply` | 선택 행 일괄 적용 |
| `POST` | `/api/admin/crm/capture/batches/[id]/cancel` | batch 취소 |

규칙:
- 관리자 인증을 통과한다.
- Supabase 접근은 repository로 모은다.
- 잘못된 body shape는 400 계열로 반환한다.
- 일부 행 실패는 전체 500으로 만들지 않는다.
- 적용 작업은 idempotent해야 한다. 이미 적용된 행은 중복 생성하지 않는다.
- 원문에는 개인정보가 있을 수 있으므로 접근 권한과 보존 정책을 명확히 둔다.

---

## 11. 매칭 규칙

초기 매칭은 보수적으로 한다.

우선순위:
1. 전화번호 정확 일치
2. 이메일 정확 일치
3. 기관명 정규화 일치
4. 기관명 유사도 + 지역 일치
5. 기관명 유사도 + 담당자/이름 힌트

자동 확정 기준:
- 전화번호나 이메일이 정확히 하나의 기존 고객/리드에만 매칭되면 자동 확정 가능.
- 기관명만 비슷한 경우는 후보로 둔다.
- 후보가 여러 개면 사람이 선택한다.
- 같은 batch 안에서 중복되는 행은 저장 전 경고한다.

신규 리드 후보:
- 기존 고객/리드에 확정 매칭되지 않고, 기관명 또는 연락처가 있으면 신규 리드 후보로 둔다.
- 신규 리드는 사용자가 확인한 뒤 생성한다.
- 개인정보 동의/출처가 필요한 경우 source와 consent 상태를 명확히 표시한다.

---

## 12. 오류 및 안전장치

오류 처리:
- 파싱 실패 행은 `확인 필요`로 둔다.
- 매칭 후보가 여러 개면 자동 저장하지 않는다.
- activity 생성 실패와 task 생성 실패를 분리 표시한다.
- 일부 행 실패 시 성공한 행은 유지하고 실패 행만 재시도한다.

중복 방지:
- 같은 batch 안 중복
- 최근 capture batch 중복
- 기존 lead 중복
- 기존 customer/contact 중복
- 이미 적용된 capture row 재적용

개인정보:
- 원문 입력에는 전화번호, 이메일, 이름이 포함될 수 있다.
- 원문 보존 기간을 정한다.
- 다운로드/내보내기는 초기 범위에서 제외한다.
- 접근은 Admin CRM 권한으로 제한한다.

---

## 13. UI 디테일

### 13.1 Row Review Table

행 검토 테이블은 예외 중심이어야 한다.

기본 그룹:
- 확정 매칭
- 확인 필요
- 신규 리드 후보
- 중복 의심
- 제외됨

각 행 표시:
- 원문 요약
- 추출된 기관/사람/연락처
- 매칭 대상
- 저장될 activity
- 생성될 task
- 상태 badge

액션:
- 매칭 변경
- 신규 리드로 저장
- 제외
- 메모 수정
- task 날짜 변경

### 13.2 Bulk Apply CTA

CTA는 명확해야 한다.

예:
- `확정된 32명에게 행사 참석 기록 + D+1 task 생성`
- `확인 필요 5건 제외하고 적용`
- `신규 리드 후보 8건 검토하기`

### 13.3 Result Summary

저장 후 결과를 숫자로 보여준다.

예:
- `activity 32건 생성`
- `task 28건 생성`
- `신규 리드 6건 생성`
- `확인 필요 4건 남음`

결과 화면은 바로 다음 업무로 이어져야 한다.
- 오늘 생성된 task 보기
- 확인 필요 처리
- 행사 상세 보기
- 고객 검색으로 이동

---

## 14. 단계 제안

### Phase 1 - Pasted Table/Text MVP

목표:
- 엑셀/구글시트 표 붙여넣기와 카톡/메모 붙여넣기를 지원한다.
- 파싱 결과를 검토 가능한 row table로 보여준다.
- 확정 매칭 행에 activity와 task를 일괄 생성한다.

완료 기준:
- 표 붙여넣기 후 행 후보가 생성된다.
- 카톡/메모 텍스트가 행 후보로 분리된다.
- 기존 고객/리드 후보가 표시된다.
- 확정된 행만 일괄 적용할 수 있다.

### Phase 2 - Public Event Source

목표:
- 어드민 행사 또는 공개 행사 신청자/참석자 목록을 원천으로 불러온다.
- 행사별 default activity/task 템플릿을 적용한다.

완료 기준:
- 행사 상세에서 `참석자 CRM 반영`을 시작할 수 있다.
- 참석/불참 상태에 따라 다른 후속 task를 제안한다.
- 결과가 고객 activity와 task에 반영된다.

### Phase 3 - Matching Hardening

목표:
- 전화번호, 이메일, 기관명, 지역, alias 기반 매칭 품질을 높인다.
- 중복 리드와 기존 고객 충돌을 줄인다.

완료 기준:
- 자동 확정과 확인 필요의 기준이 설명 가능하다.
- 잘못된 자동 매칭을 되돌릴 수 있다.
- batch별 적용 이력이 남는다.

### Phase 4 - Capture Nudges

목표:
- 사용자가 명단을 직접 찾지 않아도 CRM이 접점 정리 타이밍을 제안한다.

넛지 예:
- 행사 종료 후 `참석자 후속 연락 만들기`
- 데모 콜 완료 후 `견적 발송 task 만들기`
- 설치 완료 후 `7일 후 사용 확인 예약`
- 고객 검색 후 기록 없이 닫을 때 `짧은 메모 남기기`

---

## 15. 검증 기준

제품 검증:
- 행사 후 참석자 30명을 5분 안에 CRM activity와 후속 task로 전환할 수 있다.
- 엑셀/구글시트 표를 그대로 붙여넣어도 동작한다.
- 카톡/메모 텍스트에서 최소한 행 후보와 확인 필요 상태가 생성된다.
- 매니저가 애매한 행만 검토하면 된다.
- 적용 결과가 고객 히스토리와 매니저 홈 task에 바로 보인다.

기술 검증:
- 신규 API는 관리자 인증을 사용한다.
- 신규 테이블은 migration, RLS, admin policy를 포함한다.
- apply 작업은 중복 실행되어도 activity/task를 중복 생성하지 않는다.
- 파싱 실패와 일부 행 실패가 전체 batch 실패로 번지지 않는다.
- 관련 repository와 parser 단위 테스트를 둔다.

권장 명령:

```bash
npx eslint app components lib --max-warnings=0
npm run build
```
