# CRM Next Action Culture Fit Design

기준 시점: 2026-06-27

상태: 설계 승인 초안

범위: ClassIn Home Admin CRM을 지사장과 매니저의 실제 팀 문화에 맞는 "Next Action First" 작업대로 발전시키기 위한 제품 원칙, 화면 우선순위, 서비스 만료/소모 위험 트래킹, NEO/HQ CRM 싱크 최적화 지침.

관련 문서:
- `docs/active/internal-crm-backend-operating-plan-2026-06-26.md`
- `docs/active/sales-crm-phase0-phase1-discussion-2026-06-27.md`
- `docs/active/crm-phase0-spike-findings-2026-06-24.md`
- `docs/active/erp-blueprint-2026-06-22.md`

---

## 1. 한 줄 결정

Admin CRM은 기록을 강제하는 감시형 CRM이 아니다. **매니저가 덜 놓치고, 보고를 덜 쓰고, 성과가 보이게 하는 Next Action First 작업대**다.

고객 360, 주간 보고, 리스크 관리는 별도 입력 부담을 늘려서 만들지 않는다. 매니저가 남긴 최소 다음 액션과 처리 결과가 고객 히스토리, 놓침 방지, 주간 보고, 지사장 코칭 화면으로 자동 누적되게 한다.

---

## 2. 팀 문화 전제

현재 팀의 실제 운영 문화:
- 통화/미팅 기록은 거의 남기지 않는다.
- 기록은 개인 정리, 보고, 팀 전달이 섞여 있으나 일상 습관은 약하다.
- 결과만 나오면 된다고 보는 경향이 있으나, 완전 무기록은 건강하지 않다.
- 대형 고객을 제외하면 고객 책임자는 1명이 자연스럽다.
- 매니저는 자율적으로 움직이고, 영업 단계는 유연하게 처리한다.
- 주간 단위 지사장 점검과 성과 확인은 필요하다.
- CRM이 세일즈에 직접 도움이 되지 않거나, 본사 CRM과 이중 작업을 만들거나, 느리거나, 고객 데이터가 맞지 않으면 쓰지 않을 가능성이 높다.

따라서 CRM은 아래 방식이어야 한다.
- 긴 기록보다 다음 액션과 결과 중심.
- 엄격한 딜 단계보다 빠른 후속 관리 중심.
- 개인 작업 화면을 먼저 만들고, 팀/지사장 화면은 자동 집계로 연결.
- 데이터 출처와 최신성을 분명히 표시.
- 본사 CRM은 공식 원천으로 존중하되, 매니저의 일상 작업은 Admin CRM에서 빠르게 처리.

---

## 3. 제품 원칙

### 3.1 입력은 최소, 보상은 즉시

매니저가 입력하는 기본 항목은 최대한 작게 유지한다.

필수에 가까운 입력:
- 고객
- 다음 액션
- 기한
- 결과 상태

선택 입력:
- 짧은 메모
- 회의록 붙여넣기
- 녹음 파일
- 리스크 태그

입력의 보상:
- 내 할 일 자동 정리
- 고객 히스토리 자동 축적
- 놓친 리드/고객 경고
- 주간 보고 초안 자동 생성
- 지사장에게 처리 성과가 보임

### 3.2 감시보다 작업 지원

초기 화면은 개인 작업 화면을 우선한다. 지연과 누락은 숨기지 않되, 첫 경험이 공개 압박처럼 느껴지지 않게 한다.

운영 방향:
- 매니저 홈은 개인 작업 큐 중심.
- 지사장 화면은 주간 점검과 코칭 중심.
- 팀 화면은 개인별 감시판이 아니라 리스크, 지연, 성과 요약으로 시작.

### 3.3 딜 단계보다 다음 액션

팀의 영업 방식은 유연하고 개인차가 크다. 초기 CRM은 Salesforce식 무거운 opportunity stage보다 다음 액션을 중심으로 한다.

Deal Lite는 후속 단계에서 붙인다. Deal Lite도 별도 복잡한 영업 방법론이 아니라 다음 액션, 예상금액, 예상종료일, 견적/오더 연결, 리스크 정도의 얇은 객체로 시작한다.

### 3.4 공식 원천과 작업 캐시 분리

서비스 만료, 충전 잔액, EEO 계정 상태의 공식 원천은 NEO/HQ CRM이다. Admin CRM은 공식 원천을 대체하지 않고, 빠른 작업용 스냅샷과 우선순위 계산층으로 동작한다.

---

## 4. 매니저 CRM 홈

첫 화면은 대시보드가 아니라 작업대다. 우선순위는 아래 순서로 둔다.

1. 오늘 연락할 고객
2. 고객 검색
3. 이번 주 해야 할 일
4. 최근 처리 성과
5. 지연, 누락, 리스크 요약

### 4.1 오늘 연락할 고객

가장 위에는 매니저가 바로 처리해야 할 고객을 둔다.

포함 신호:
- 오늘 due인 task
- 미응답 리드
- 다음 액션 없는 상담 또는 딜
- 구독 만료 30일 이내 고객
- 충전제 잔액 부족 고객
- 30일 내 충전 소진 예상 고객
- 최근 리스크 메모가 있는 고객
- 보류 상태가 오래된 고객
- 지사장이 지정한 우선 고객

각 항목은 이유를 함께 표시한다.

예시:
- `구독 만료 D-18`
- `잔액 18%`
- `30일 내 소진 예상`
- `3일 미응답`
- `다음 액션 없음`
- `최근 리스크 메모`

### 4.2 고객 검색

두 번째 영역은 빠른 검색이다. 매니저가 고객을 떠올렸을 때 바로 열 수 있어야 한다.

검색 대상:
- 학원명
- 원장, 실장, 담당 교사 이름
- 전화번호 일부
- 지역 라벨
- 담당자
- NEO/HQ CRM 표시명
- 과거 alias 또는 오타 후보

검색 결과는 고객의 최신 업무 맥락을 같이 보여준다.
- 마지막 기록
- 다음 액션
- 담당자
- 지역
- 서비스 만료/잔액 위험
- 데이터 최신성

### 4.3 이번 주 해야 할 일

세 번째 영역은 오늘이 아니지만 이번 주에 처리해야 할 액션이다.

포함 항목:
- 이번 주 due task
- 미룬 task
- 기한이 없는 다음 액션
- 다음 액션 없이 열린 고객
- 갱신/소모 위험이 커지는 고객

---

## 5. 지역 라벨 지침

지역 라벨은 고객 실제 위치 기준이다. 담당자나 영업권과 섞지 않는다.

구분:
- 지역 라벨: 고객 주소 기준. 예: `서울 강남`, `부산 해운대`, `대구 수성`
- 담당자: 현재 관리 매니저
- 운영 권역: 필요 시 후속 분류. 예: `수도권`, `부산권`, `대구권`

이렇게 분리해야 부산 고객을 서울 담당자가 관리하는 경우도 왜곡 없이 표현할 수 있다.

초기 구현 규칙:
- NEO/HQ CRM 또는 내부 고객 데이터에 주소가 있으면 주소에서 지역 라벨을 추출한다.
- 주소가 없으면 `지역 미지정`으로 표시한다.
- 담당자가 수동 보정할 수 있더라도, 보정값과 공식 주소 기반 값은 출처를 구분한다.
- 지역은 우선순위 계산과 필터에 사용하되, 담당자 배정의 유일한 기준으로 쓰지 않는다.

---

## 6. 서비스 만료 및 충전 소모 트래킹

### 6.1 공식 원천

NEO/HQ CRM을 공식 원천으로 본다.

공식 판단:
- 구독 만료: NEO 만료일 기준
- 충전 잔액: NEO 잔액 기준
- EEO 계정 상태: NEO 서비스 상태 기준

보조 데이터:
- 내부 admin 계약, 견적, 오더, 수금 데이터는 설명과 대조용이다.
- 시트는 운영 메모 또는 보정 참고용이다.
- NEO 정보가 없으면 추정해서 채우지 않고 `NEO 정보 없음`으로 표시한다.

### 6.2 위험 조건

구독제:
- `expire_at <= now + 30 days`이면 CRM 홈에 노출한다.
- 이미 만료된 고객은 별도 `만료됨` 상태로 올린다.

충전제:
- 잔액 비율이 20% 이하이면 노출한다.
- 최근 사용량 기준 30일 이내 소진 예상이면 노출한다.
- 둘 중 하나라도 해당하면 `오늘 연락할 고객` 후보에 올린다.

잔액 비율 계산의 분모가 불명확하면 비율을 억지로 만들지 않는다. 이 경우에는 잔액 절대값, 최근 소모 속도, 예상 소진일 중심으로 표시한다.

### 6.3 위험 표시

매니저 화면에는 복잡한 계산식을 노출하지 않는다.

표시 예시:
- `구독 만료 D-18 · NEO 2시간 전`
- `충전 잔액 18% · 30일 내 소진 예상`
- `사용량 급증 · 최근 14일 기준`
- `NEO 최신 확인 필요`

관리자/디버그 영역에는 출처와 계산 기준을 표시한다.
- source object
- source synced at
- balance field
- usage window
- confidence

---

## 7. NEO/HQ CRM 싱크 최적화

매니저 화면에서 NEO를 매번 실시간 조회하지 않는다. Admin CRM은 스냅샷을 먼저 읽고, 필요한 경우 좁게 최신화한다.

### 7.1 야간 전체 싱크

하루 1회, 비업무 시간에 전체 스냅샷을 갱신한다.

대상 후보:
- `account`
- `ShroffAccount__c`
- `ResourceInformation__c`
- `opportunity`
- `Collection__c`

기준:
- 기존 `external_crm_records`, `external_crm_sync_runs`, `is_stale`, `payload_hash` 구조를 활용한다.
- Vercel Hobby 기준을 전제로 하루 1회 이하 cron 원칙을 지킨다.
- 전체 싱크 실패는 CRM 홈 전체 장애로 번지지 않고 freshness 경고로 표시한다.

### 7.2 핫 데이터 미니 싱크

CRM 홈에 필요한 최소 필드만 좁게 최신화한다.

대상 후보:
- 만료 D-45 이내 고객
- 잔액 30% 이하 고객
- 최근 14일 소모량이 큰 고객
- 담당 매니저가 오늘 열어본 고객
- 지사장이 지정한 우선 고객

필드 후보:
- `expireTime__c`
- `DateBack__c`
- `ContractEndDate__c`
- `CurrencyAmount__c`
- `ServiceStatus__c`
- `serviceState__c`
- `updatedAt`
- `ResourceInformation__c.ChangeTime__c`
- `ResourceInformation__c.ChangeNumber__c`
- `ResourceInformation__c.Margin__c`

미니 싱크는 전체 싱크와 다른 작업으로 관리한다. 전체 객체를 다시 긁지 않고, 후보 고객과 필요한 필드만 갱신한다.

### 7.3 고객 단위 좁은 refresh

매니저가 고객 상세를 열면:

1. Admin CRM 스냅샷을 즉시 보여준다.
2. 스냅샷이 오래됐으면 백그라운드로 해당 고객만 새로고침한다.
3. 새로고침 결과가 오면 위험 상태와 freshness만 갱신한다.
4. 실패해도 화면은 닫히지 않고 `최신 확인 실패`를 표시한다.

### 7.4 Read Model

CRM 홈은 매번 `external_crm_records` 전체를 조합하지 않는다. 별도 read model을 둔다.

후보 테이블: `crm_service_risk_snapshots`

필드 후보:
- `account_id`
- `customer_name`
- `region_label`
- `owner_key`
- `expire_at`
- `balance`
- `balance_ratio`
- `predicted_depletion_at`
- `risk_level`: `urgent`, `soon`, `watch`, `normal`
- `risk_reasons`: `subscription_expiring`, `subscription_expired`, `low_balance`, `depleting_fast`, `neo_missing`, `stale_snapshot`
- `source_synced_at`
- `calculated_at`
- `confidence`: `high`, `medium`, `low`

이 read model은 매니저 홈 속도를 위해 존재한다. 공식 원천은 여전히 NEO/HQ CRM이며, 원본 스냅샷은 `external_crm_records`에 둔다.

---

## 8. Task 모델 지침

`crm_customer_events.next_actions` JSON은 초기 메모 구조로는 충분하지만, 완료, 미룸, 재배정, 지연, 주간 보고에는 부족하다. 다음 단계에서는 `crm_tasks`를 1급 객체로 승격한다.

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

Task type 후보:
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

Task는 CRM 홈의 기본 단위다. 고객 기록, 주간 보고, 지사장 코칭 화면은 task 처리 결과에서 파생된다.

---

## 9. 지사장 화면 지침

지사장 화면은 매일 감시판이 아니라 주간 점검과 코칭 도구다.

포함 항목:
- 담당자별 완료 task
- 담당자별 지연 task
- 미응답 리드
- 만료/소모 위험 고객
- 다음 액션 없는 고객
- 최근 처리 성과
- 지사장 확인 필요 고객
- 데이터 불일치 또는 NEO 최신 확인 필요 고객

표시 원칙:
- 개인별 순위 경쟁보다 막힌 고객과 놓친 액션을 먼저 보여준다.
- 매니저가 CRM을 쓰면 보고가 자동으로 편해지는 구조여야 한다.
- 주간 보고 초안은 task, event, service risk snapshot에서 자동 생성한다.

---

## 10. 데이터 신뢰와 표시 원칙

모든 고객 상태와 위험 신호는 출처가 보여야 한다.

출처 구분:
- ClassIn-owned: task, CRM event, lead status, memo, source link
- NEO/HQ-owned: subscription expiry, balance, EEO status, account snapshot
- Derived: priority score, risk level, predicted depletion, weekly report summary

표시 규칙:
- 공식 데이터와 보조 데이터가 다르면 조용히 합치지 않는다.
- 불일치 상태는 `확인 필요`로 표시한다.
- freshness를 표시한다.
- 오래된 데이터는 위험 계산 confidence를 낮춘다.
- 데이터가 없으면 추정값을 확정값처럼 보이지 않는다.

---

## 11. 실패 방지 기준

이 CRM이 실패하는 이유는 귀찮음, 중복 입력, 느림, 데이터 불일치, 본사 CRM과 이중 작업이다. 모든 기능은 아래 질문을 통과해야 한다.

- 입력이 10초 안에 가능한가.
- 매니저에게 즉시 보상이 있는가.
- 본사 CRM 중복 작업을 늘리지 않는가.
- 느린 외부 조회 없이 첫 화면이 열리는가.
- 데이터 출처와 freshness가 보이는가.
- 잘못된 데이터가 조용히 확정값처럼 보이지 않는가.
- 지사장 화면이 코칭과 성과 인정으로 이어지는가.
- 매니저가 몰아서 입력해도 주간 보고와 고객 히스토리에 반영되는가.

---

## 12. 단계 제안

### Phase 1 - Next Action CRM

목표:
- 매니저 홈을 오늘 연락할 고객, 고객 검색, 이번 주 해야 할 일 중심으로 만든다.
- `crm_tasks`를 1급 객체로 추가한다.
- 기록 탭의 next action을 task와 연결한다.

완료 기준:
- 매니저가 오늘 처리할 고객을 바로 볼 수 있다.
- 완료, 미룸, 재배정, 결과 입력이 가능하다.
- task 처리 결과가 고객 히스토리에 남는다.

### Phase 2 - Service Risk Snapshot

목표:
- NEO/HQ CRM 기준 구독 만료와 충전 소모 위험을 빠르게 보여준다.
- `crm_service_risk_snapshots` read model을 만든다.
- 야간 전체 싱크, 핫 데이터 미니 싱크, 고객 단위 refresh 전략을 적용한다.

완료 기준:
- CRM 홈에서 30일 이내 만료와 30일 내 소진 예상 고객이 빠르게 보인다.
- 각 위험 신호에 source freshness와 confidence가 표시된다.
- NEO 조회 실패가 화면 전체 장애로 번지지 않는다.

### Phase 3 - Weekly Manager Report

목표:
- 매니저의 task 완료, 미룸, 리스크, 고객 기록을 주간 보고 초안으로 만든다.
- 지사장 주간 점검 화면을 제공한다.

완료 기준:
- 매니저는 보고서를 따로 쓰는 시간이 줄어든다.
- 지사장은 담당자별 성과, 지연, 리스크를 한 번에 본다.

### Phase 4 - Customer 360 Lite

목표:
- 고객 검색에서 고객 360 드로어 또는 상세 화면을 연다.
- 한 고객 안에서 task, event, 서비스 위험, 딜/돈흐름 요약을 본다.

완료 기준:
- 고객 히스토리 검색과 다음 액션 생성이 한 화면에서 가능하다.
- 공식 원천, 보조 데이터, 파생 데이터가 구분되어 보인다.

---

## 13. 비범위

초기 범위에 포함하지 않는다.

- 모든 외부 CRM 필드를 Admin CRM에 복제하는 것
- Salesforce식 무거운 opportunity pipeline
- 본사 CRM 실시간 양방향 write-back
- 매니저의 모든 통화 기록 강제
- 공식 원천이 불명확한 잔액 비율 추정
- NEO 장애 시 화면 전체 차단
- 개인별 감시 중심의 랭킹 화면

---

## 14. 검증 기준

제품 검증:
- 매니저가 첫 화면에서 오늘 연락할 고객을 5초 안에 파악한다.
- 기본 task 입력은 10초 안에 가능하다.
- 고객 검색 결과가 1초대 체감 속도로 뜬다.
- 서비스 위험 항목에는 이유, 출처, freshness가 표시된다.
- 주간 보고 초안이 별도 수작업보다 시간을 줄인다.

기술 검증:
- Admin CRM API는 `verifyAdmin()` 또는 동등한 관리자 인증을 사용한다.
- Supabase 접근은 repository에 모은다.
- NEO/HQ CRM 라이브 조회 실패가 화면 전체 실패로 번지지 않는다.
- 서비스 위험 read model은 리스트 화면에서 빠르게 읽힌다.
- 전체 싱크는 하루 1회 이하 cron 원칙을 지킨다.
- 신규 테이블은 migration, RLS, admin policy를 포함한다.

권장 명령:

```bash
npx eslint app components lib --max-warnings=0
npm run build
```
