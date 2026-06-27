# 자체 CRM 0차/1차 상세 논의 정리

기준 시점: 2026-06-27

상태: 논의 정리 및 0차/1차 실행 설계 초안

범위: Admin CRM을 지사장과 매니저가 매일 쓰는 자체 CRM으로 발전시키기 위한 최근 구현 내용, 자체 평가 결과, Salesforce/HubSpot식 CRM 본질의 ClassIn식 번역, 0차/1차 추가 기획, 입력 UX 원칙

관련 문서:
- [internal-crm-backend-operating-plan-2026-06-26.md](./internal-crm-backend-operating-plan-2026-06-26.md)
- [crm-merge-redesign-2026-06-24.md](./crm-merge-redesign-2026-06-24.md)
- [crm-merge-phase0-plan-2026-06-24.md](./crm-merge-phase0-plan-2026-06-24.md)
- [crm-phase0-spike-findings-2026-06-24.md](./crm-phase0-spike-findings-2026-06-24.md)

---

## 1. 현재까지의 작업 요약

최근 CRM 작업은 기존 외부 CRM/시트 참고 화면을 넘어, ClassIn Home Admin 안에 자체 CRM의 뼈대를 넣는 방향으로 진행됐다.

### 1.1 CRM 운영 골격

Admin CRM은 현재 다음 구조를 기준으로 운영한다.

- `현황`: 오늘 먼저 처리할 일, 우선순위 큐, 커버리지, 팀/돈 요약
- `고객`: 리드와 외부 CRM 고객을 통합해서 보는 고객 DB
- `기록`: 회의록, 녹음, 간단 메모 입력과 모아보기
- `돈흐름`: 견적, 매출, 오더, 설치, 수금, KPI
- `인사이트`: 리스크, 기회, 전환/운영 분석
- `연동`: 시트, 외부 CRM, HQ CRM 정합성 유지보수

관련 파일:
- [components/admin/crm/CrmSubnav.tsx](../../components/admin/crm/CrmSubnav.tsx)
- [app/admin/crm/page.tsx](../../app/admin/crm/page.tsx)
- [components/admin/crm/CrmPriorityQueuePanel.tsx](../../components/admin/crm/CrmPriorityQueuePanel.tsx)
- [components/admin/crm/CrmUnifiedCustomersClient.tsx](../../components/admin/crm/CrmUnifiedCustomersClient.tsx)

### 1.2 회의록, 녹음, 메모 기반

`기록` 탭이 추가되어 회의록, 녹음파일, 간단 메모를 CRM 활동 데이터로 저장할 수 있게 됐다.

구현된 것:
- `crm_customer_events` 테이블
- 녹음 private storage bucket
- 회의록/메모/녹음 입력 UI
- 기록 조회, 검색, 필터
- 다음 액션 JSON 저장
- 관리자 인증 기반 이벤트 생성/조회 API

관련 파일:
- [app/admin/crm/activity/page.tsx](../../app/admin/crm/activity/page.tsx)
- [components/admin/crm/CrmActivityClient.tsx](../../components/admin/crm/CrmActivityClient.tsx)
- [app/api/admin/crm/events/route.ts](../../app/api/admin/crm/events/route.ts)
- [lib/repositories/crm-events.ts](../../lib/repositories/crm-events.ts)
- [supabase/migrations/20260626_crm_customer_events.sql](../../supabase/migrations/20260626_crm_customer_events.sql)

### 1.3 지사장/매니저 계정 연동

CRM 담당자는 별도 사용자 테이블이 아니라 `admin_profiles`를 확장해 관리하는 방향으로 잡았다.

구현된 것:
- `crm_team_role`: 지사장, 매니저, 운영, 관리자
- `crm_assignable`: CRM 배정 가능 여부
- `crm_owner_key`: 안정적인 담당자 키
- `crm_owner_aliases`: 과거 이름, 시트 이름, 외부 CRM 이름 매칭
- `neo_owner_id`: 외부 CRM owner id
- `/api/admin/crm/owners`
- 현재 로그인 Admin 기준 `내 담당` 해석

관련 파일:
- [lib/repositories/admin-users.ts](../../lib/repositories/admin-users.ts)
- [app/api/admin/crm/owners/route.ts](../../app/api/admin/crm/owners/route.ts)
- [components/admin/crm/useCrmOwners.ts](../../components/admin/crm/useCrmOwners.ts)
- [supabase/migrations/20260626_admin_profiles_crm_assignments.sql](../../supabase/migrations/20260626_admin_profiles_crm_assignments.sql)

### 1.4 내 리드/고객 필터

로그인한 지사장/매니저 계정을 CRM owner로 해석해 `내 리드·고객`, `내 담당` 필터를 사용할 수 있게 했다.

구현된 것:
- `/api/admin/crm/customers/unified?owner=__me`
- `/api/admin/crm/home/priority-queue?owner=__me`
- `내 리드·고객` 저장 뷰
- 우선순위 큐 `내 담당` 필터
- owner key/alias/외부 owner id 기반 매칭

관련 파일:
- [app/api/admin/crm/customers/unified/route.ts](../../app/api/admin/crm/customers/unified/route.ts)
- [app/api/admin/crm/home/priority-queue/route.ts](../../app/api/admin/crm/home/priority-queue/route.ts)
- [lib/repositories/crm-unified-customers.ts](../../lib/repositories/crm-unified-customers.ts)
- [lib/repositories/crm-priority-queue.ts](../../lib/repositories/crm-priority-queue.ts)

---

## 2. 자체 평가 결론

현재 CRM은 예전 단순 탭보다 확실히 개선됐다. 다만 아직 완성형 자체 CRM이라기보다 다음 성격이 강하다.

- 리드 triage
- 고객 위험/갱신/휴면 신호
- 외부 CRM/시트 정합성 관리
- 매출/오더/수금 가시성
- 회의록/녹음/메모 저장 기반

부족한 핵심은 다음 3가지다.

### 2.1 진짜 task 시스템 부재

현재 다음 액션은 `crm_customer_events.next_actions` JSON에 남길 수 있지만, 완료/재배정/지연/담당자별 코칭이 가능한 1급 업무 객체는 아니다.

필요한 것:
- `crm_tasks` 테이블
- 완료/미루기/재배정 API
- 홈 우선순위 큐에 task 통합
- 고객 360에 열린 task 표시
- 매니저용 지연/미완료 관리

### 2.2 고객 360 부재

통합 고객 DB는 생겼지만, 행 클릭이 아직 리드 화면 또는 외부 CRM 고객 화면으로 분기된다. 자체 CRM 느낌을 내려면 하나의 고객 화면에서 다음을 모두 봐야 한다.

- 리드/고객 기본 정보
- 연락처와 담당자
- 활동 타임라인
- 회의록/녹음/메모
- 열린 task
- 딜/견적/오더/수금
- 리스크/갱신/휴면
- 외부 CRM/시트/HQ CRM 연결 상태

### 2.3 딜 진행 관리 약함

`돈흐름`은 매출, 오더, 설치, 수금 가시성은 좋지만, 영업사원이 딜을 전진시키는 opportunity workspace는 아직 약하다.

필요한 것:
- Deal Lite
- 단계
- 예상금액
- 예상종료일
- 다음 task
- 관련 견적/오더
- 리스크
- 고객 360 연결

---

## 3. CRM 본질과 상위 1% 운영 기준

Salesforce와 HubSpot을 그대로 복제하는 것이 목표가 아니다. 가져올 본질은 다음이다.

### 3.1 System of Record

고객, 리드, 딜, 활동, task, 담당자, 외부 원천 연결이 기준 데이터로 남아야 한다.

ClassIn 기준:
- 리드는 ClassIn Home Admin이 소유한다.
- 고객/계정 스냅샷은 외부 CRM/OCRM/HQ CRM을 참고한다.
- 우리가 책임지는 운영 데이터는 기록, task, 담당자, 매칭, 메모, 다음 액션이다.

### 3.2 System of Action

CRM은 "고객 목록"이 아니라 "오늘 무엇을 해야 하는가"를 알려줘야 한다.

상위 1% 기준:
- 오늘 처리할 일이 자동으로 올라온다.
- 왜 해야 하는지 근거가 보인다.
- 클릭 한두 번으로 완료/미루기/재배정이 된다.
- 처리 결과가 고객 타임라인에 자동 축적된다.

### 3.3 System of Accountability

지사장과 매니저가 같은 CRM을 쓰려면 누가 어떤 고객과 task를 책임지는지 분명해야 한다.

필요 지표:
- 담당자별 열린 task
- 지연 task
- 미응답 리드
- 다음 액션 없는 딜
- 최근 기록 없는 고객
- 갱신 위험 고객
- 완료율과 지연율

### 3.4 System of Customer Success

Sales만 보면 CRM이 반쪽이 된다. ClassIn 운영에서는 도입 이후의 고객 성공이 갱신과 확장으로 이어진다.

고객 성공 축:
- 설치/온보딩
- 수업 활성화
- 잔액/만료
- 휴면
- 클레임/환불
- 갱신
- 확장/업셀

---

## 4. 0차 상세 설계

0차는 기능을 많이 만드는 단계가 아니라, 자체 CRM이 어떤 객체와 업무 원칙으로 움직일지 확정하는 단계다.

### 4.1 객체 정의

| 객체 | 의미 | ClassIn 운영 기준 |
|---|---|---|
| Lead | 아직 고객이 아닌 문의/상담 후보 | 공개 폼, 자료 신청, 데모 문의, 행사 유입 |
| Customer/Account | 실제 학원/기관 운영 단위 | 고객 360의 중심 |
| Contact | 원장, 실장, 담당 교사, 의사결정자 | 1차에서는 메모/연락처 수준, 후속 확장 |
| Deal | 견적, 신규 도입, 확장, 갱신 기회 | 1차는 Deal Lite |
| Task | 앞으로 해야 할 일 | 1급 객체로 승격 필요 |
| Activity/Event | 이미 일어난 일 | 회의록, 녹음, 통화, 카톡, 메모 |
| Success Motion | 설치, 활성화, 갱신, 이탈방지 | 고객성공 task로 표현 |
| Source Link | 외부 원천과 연결 | 시트/OCRM/HQ CRM 참고/동기화 |

### 4.2 전환 규칙

리드가 곧 고객이 되면 안 된다. 전환 기준을 정해야 한다.

- 문의만 있음: `Lead`
- 상담 가능성 확인: `Lead - contacted`
- 데모/견적 가능성 있음: `Deal`
- 실제 학원 운영 단위 확인: `Customer`
- 기존 고객의 추가 구매/갱신: 새 lead가 아니라 `Deal` 또는 `Success Motion`

### 4.3 task 원칙

`next_actions` JSON은 임시 기록이다. 1차에서는 반드시 `crm_tasks`로 승격한다.

권장 필드:
- `id`
- `target_type`
- `target_id`
- `target_label`
- `owner_key`
- `owner_name_snapshot`
- `task_type`
- `title`
- `due_at`
- `priority`
- `status`: `open`, `done`, `snoozed`, `canceled`
- `source_event_id`
- `created_by`
- `assigned_by`
- `completed_at`
- `completed_by`
- `outcome`
- `created_at`
- `updated_at`

task type 후보:
- `call`
- `kakao`
- `email`
- `meeting`
- `quote`
- `demo`
- `install`
- `renewal`
- `cs_checkin`
- `data_fix`

### 4.4 입력 UX 원칙

0차에서 가장 중요한 원칙은 "입력이 귀찮으면 CRM은 실패한다"다.

입력 원칙:
- 필수 입력은 1~3개만 둔다.
- 내부 ID 직접 입력은 금지한다.
- 담당자, 날짜, 대상은 최대한 자동 세팅한다.
- 자유 입력보다 버튼을 우선한다.
- 회의록은 구조화 입력이 아니라 붙여넣기 중심으로 받는다.
- 녹음은 파일 업로드와 한 줄 요약만으로 저장 가능해야 한다.
- 고객 360 안에서는 고객 선택도 생략한다.

목표 입력 시간:
- 리드 연락 완료: 2클릭
- 부재 후 내일 팔로업: 2클릭
- 고객 메모 추가: 10초
- 회의록 저장: 붙여넣기 1번 + 저장
- 녹음 업로드: 파일 선택 + 고객 선택 + 저장
- task 완료: 1클릭
- task 미루기: 1클릭

---

## 5. 1차 상세 설계

1차 목표는 "동료들이 매일 쓰는 최소 완성 자체 CRM"이다.

### 5.1 `crm_tasks` 구현

우선순위 1순위다.

구현 범위:
- migration
- repository
- `/api/admin/crm/tasks`
- `/api/admin/crm/tasks/[id]`
- 완료
- 미루기
- 재배정
- 취소
- 이벤트에서 task 자동 생성
- 홈 우선순위 큐 task 통합

### 5.2 CRM 홈 재편

홈은 dashboard가 아니라 업무 시작 화면이어야 한다.

정렬 기준:
1. 오늘 마감 task
2. 지연 task
3. 신규 리드 첫 응답
4. 미팅 후 후속 액션
5. 갱신/만료 위험
6. 담당 미배정
7. 데이터 연결 필요

빠른 처리 버튼:
- `완료`
- `내일로`
- `부재`
- `미팅 잡힘`
- `견적 요청`
- `담당 변경`
- `기록 추가`

### 5.3 고객 360 1차

고객 통합 DB 행 클릭은 원천별 화면으로 흩어지지 않고 고객 360 드로어 또는 상세 화면을 열어야 한다.

1차 구성:
- 고객 헤더
- 연락처
- 담당자
- 점수/상태
- 최근 활동
- 열린 task
- 최근 회의록/녹음
- 돈흐름 요약
- 리스크
- 외부 원천 연결 상태
- 빠른 메모
- 빠른 task
- 빠른 견적/딜 액션

### 5.4 기록 입력 개선

현재 기록 탭의 `대상 ID 또는 외부 링크 키`는 실무자에게 부담이다.

개선 방향:
- 고객명/리드명 자동완성
- 최근 본 고객 추천
- 내 담당 고객 우선
- 고객 360에서 열면 대상 자동 세팅
- 다음 액션 입력 시 task 자동 생성
- 저장 후 고객 타임라인에 즉시 반영

### 5.5 Deal Lite

Salesforce식 full Opportunity를 바로 만들면 무거워진다. 1차에서는 Deal Lite가 맞다.

필드:
- 고객
- 담당자
- 단계: 상담, 데모, 견적, 의사결정, 오더/설치, 완료, 실패
- 예상금액
- 예상종료일
- 다음 task
- 리스크
- 관련 견적/오더

### 5.6 Customer Success 연결

영업 이후 고객성공 task도 같은 CRM 안에 들어와야 한다.

CS task 후보:
- 설치 일정 확정
- 초기 세팅 확인
- 첫 수업 활성화 확인
- 잔액/만료 확인
- 휴면 고객 재활성화
- 갱신 상담
- 클레임 후속

---

## 6. 경로/탭 논의 결론

현재 주 탭 순서는 유지한다.

`현황 -> 고객 -> 기록 -> 돈흐름 -> 인사이트 -> 연동`

이유:
- `현황`은 아침 업무 시작점이다.
- `고객`은 통합 DB와 360의 중심이다.
- `기록`은 자체 CRM 데이터의 1급 입력이다.
- `돈흐름`은 딜/견적/수금의 운영 흐름이다.
- `인사이트`는 팀/성과/리스크 분석이다.
- `연동`은 유지보수 탭으로 분리하는 것이 맞다.

지금 새 top-level 탭을 늘리면 안 된다.

추가하지 말아야 할 top-level 탭:
- `Tasks`
- `Customer 360`
- `Meetings`
- `External CRM`
- `Write Requests`
- `Revenue`

이들은 각각 `현황`, `고객`, `기록`, `연동`, `돈흐름` 안으로 흡수되어야 한다.

---

## 7. 이후 논의해야 할 결정사항

### 7.1 고객 360 형태

결정 필요:
- 드로어로 시작할지
- 별도 상세 페이지로 갈지
- 둘 다 둘지

권장:
- 1차는 드로어
- 이후 복잡해지면 상세 페이지 추가

### 7.2 task 생성 방식

결정 필요:
- 회의록 저장 시 task 자동 생성 여부
- 리드 연락 로그와 task 완료를 어떻게 연결할지
- 미루기 기본값을 내일 오전으로 둘지

권장:
- 회의록/녹음의 다음 액션은 task 자동 생성
- task 완료 시 고객 timeline에 완료 이벤트 남김
- 미루기 기본값은 내일 오전 9시

### 7.3 Deal Lite 범위

결정 필요:
- 1차에 deal 테이블을 새로 둘지
- 기존 견적/오더 데이터를 read model로 묶을지

권장:
- 1차는 read model + 최소 local deal 상태
- full deal ledger는 사용 패턴 확인 후 확장

### 7.4 Customer Success 범위

결정 필요:
- CS task를 1차에 포함할지
- 영업 task와 CS task를 같은 테이블에 둘지

권장:
- 같은 `crm_tasks`에 두고 `task_type`으로 구분
- 고객 360에서 Sales/CS를 함께 보여줌

### 7.5 입력 UX 세부

결정 필요:
- 기록 빠른 입력 필수값
- 고객 자동완성 범위
- 녹음 업로드 최대 크기와 후처리
- 붙여넣기 회의록의 구조화 방식

권장:
- 필수값은 최소화
- 내부 ID 입력은 숨김
- 고객 선택은 자동완성
- STT/AI 요약은 task/360 이후 도입

---

## 8. 실행 우선순위

권장 순서:

1. `crm_tasks` 스키마/API/UI
2. CRM 홈 우선순위 큐 task 통합
3. 고객 360 드로어 1차
4. 기록 입력 대상 자동완성
5. 기록 저장 시 task 자동 생성
6. Lead contact log와 CRM event/task 연결
7. Deal Lite
8. 지사장/매니저 task 코칭 뷰
9. Customer Success task 확장
10. STT/AI 요약/자동 추천

핵심 판단:

AI보다 먼저 task가 필요하다.

STT보다 먼저 고객 360이 필요하다.

대시보드보다 먼저 입력이 쉬워야 한다.

외부 CRM 동기화보다 먼저 내부 운영 책임 데이터가 쌓여야 한다.
