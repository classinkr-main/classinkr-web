# NEO → 자체 DB 매출 적재 파이프라인 — PRD (설계)

작성 2026-06-30 · 상태: 설계(구현 보류) · 트리거: 성과 분석이 지사 시트(branch_rev_deals) 의존이라는 검증 결과

## 1. 배경 / 문제

- 현황 "성과 분석"(매출 추이·팀/개인)이 `lib/crm/revenue-performance.ts` → `listBranchRevDeals()` → **`branch_rev_deals`(지사 영업 시트, 공유 테이블)**를 읽는다. "CRM 매출 데이터"라 라벨했으나 **자체 소유 아님**.
- 6에이전트 검증 결론: 자체 DB 비율 — 활동/라벨/할일 100%, 리드 95%, **고객 ~30%, 매출 0%**. 핵심 비즈니스 지표가 외부 의존.
- 사용자 결정: **"NEO CRM 데이터를 자체 DB로 가져오기."**

## 2. NEO 원천 데이터 실태 (2026-06-30 라이브 확인 — 그대로 못 씀)

`external_crm_records`(xiaoshouyi 스냅샷, 우리 Supabase에 존재):

| 컬럼 | 실태 / 문제 |
|------|-------------|
| `owner_name` | 실제로는 **숫자 ownerId** 저장(주석 owner-names.ts:8). 일부 null. → `resolveOwnerName`로 해소 필요 |
| `status` | `续费`(갱신)·`新签`(신규)·`3611620562443119`(객체ID)·`1`~`4` 혼재 → **정규화 필요** |
| `amount` | xiaoshouyi = **CNY**(합계 2.1억+ 위안) → 통화 환산/분리 결정 필요 |
| `occurred_at` | 2035·2028·2027 등 **미래 이상치** 다수 → 정상범위 필터 필요 |
| `payload` | jsonb 원본 전체 보유 → 부족 필드(통화·상품·계약일) 추출 가능 |
| `is_stale` | 동기화 staleness 플래그 |

**이미 있는 자산(재사용)**: `lib/external-crm/owner-names.ts` — `getXiaoshouyiOwnerNameMap`(ownerId→이름), `resolveOwnerName`, `is_excluded`(중국팀 제외 → 한국팀만). `getNeoCrmCustomers`가 이 경로로 owner를 정제해 고객별 orderAmount를 이미 만든다(단, 고객 총액이지 주문×월 시계열 아님).

## 3. 목표

- CRM이 **소유한** 정제 매출 테이블(`crm_orders`)을 만들고, NEO raw를 owner 해소·통화 정합·status 정규화·날짜 정제해 적재한다.
- 현황 성과 분석을 `branch_rev_deals` → **`crm_orders`**로 재소스 → "자체 CRM 데이터" 진짜 충족.
- owner(개인)·team·월(₩ 또는 명시 통화) 단위 집계 지원.

## 4. 정제 규칙 (transform)

1. **Owner**: `resolveOwnerName(record.owner_name /*=ownerId*/, ownerNameMap)`. `is_excluded`(중국팀) ownerId는 **제외**(한국팀 한정). 해소 실패 시 "미지정".
2. **Status 정규화** → `won` | `renewal` | `new_sign` | `pipeline` | `other`. 매핑 테이블 신설(`续费→renewal`, `新签→new_sign`, 객체ID/숫자코드는 payload에서 stage 추출 후 분류). **매출 집계는 won/renewal/new_sign만**.
3. **통화**: source_system='xiaoshouyi' → CNY로 태깅. 표시 통화는 §8 결정(환산 vs CNY 분리). `crm_orders.currency` 컬럼 보존.
4. **날짜**: `occurred_at`을 정상범위(now−5y ~ now+1y) 밖이면 **제외 또는 null 처리**. month 키 = `occurred_at` 기준 `YYYY-MM`.
5. **Dedup**: `external_id` + `source_system` unique, `payload_hash`로 변경 감지(upsert).
6. **Stale**: `is_stale=true`는 집계 제외(또는 플래그).

## 5. 타겟 스키마 (`crm_orders`)

```
crm_orders (
  id uuid pk,
  source_system text,            -- 'xiaoshouyi' 등
  external_id text not null,
  customer_name text,            -- normalized_name/display_name
  owner_name text,               -- resolveOwnerName 결과(한국팀)
  owner_id text,
  team text,                     -- owner→team 매핑(§8)
  status_normalized text,        -- won|renewal|new_sign|pipeline|other
  amount numeric,
  currency text,                 -- CNY|USD|KRW
  occurred_at timestamptz,       -- 정제됨(이상치 제거)
  occurred_month text,           -- YYYY-MM (집계 키)
  ingested_at timestamptz default now(),
  unique(source_system, external_id)
);
-- index: (occurred_month), (owner_name), (team), (status_normalized)
-- RLS: is_active_admin()
```

## 6. 적재 파이프라인

- **방식**: 기존 NEO sync(cron) 직후 transform 단계 추가 → `external_crm_records`에서 읽어 정제 후 `crm_orders` upsert. (별도 cron 또는 sync 훅 확장.)
- **증분**: `synced_at`/`last_seen_run_id` 기준 변경분만, `payload_hash` 비교.
- **idempotent**: unique(source_system, external_id) upsert.
- 초기 1회 백필 + 이후 주기 동기화.

## 7. 재소스 (구현 단계에서)

- `lib/crm/revenue-performance.ts`: `listBranchRevDeals()` → `crm_orders` 쿼리로 교체. monthly/byTeam/byMember 집계는 동일 구조 유지(occurred_month·owner_name·team 기준).
- `branch_rev_deals` 의존 제거 → 검증의 "매출 소유권 0%" 해소.
- 엔드포인트 `/api/admin/crm/performance` 시그니처 불변(현황 UI 무변경).

## 8. 미해결 결정 (구현 전 확정)

1. **통화**: (a) CNY→KRW 환산(환율 출처·시점 필요) vs (b) 통화별 분리 표시(₩/¥) vs (c) NEO는 USD 정규화가 이미 있는지(getNeoCrmCustomers의 formatUSD) 재확인. — **권장: 우선 통화 명시(혼재 차단), 환산은 환율 소스 확정 후.**
2. **Status 정규화 매핑**: 실제 status 코드 전수 + payload stage 필드 조사 → 매핑 테이블 확정. (won 판정이 매출 정확도의 핵심.)
3. **team 매핑**: NEO owner→team 출처. admin-users(crm_team_role은 역할이지 팀명 아님) vs payload vs 별도 매핑 테이블. — 미정 시 1차는 owner(개인)만, team 보류.
4. **적재 주기**: 기존 NEO cron 빈도에 종속 vs 독립.
5. **백필 범위**: 최근 N개월 vs 전체.

## 9. 리스크

- **데이터 품질**: status/통화/날짜 정제가 부정확하면 "자체 데이터"가 오히려 더 틀린 수치를 줄 수 있음 → §8.2 status 매핑 검증 필수, 적재 후 합계를 기존 NEO 고객 총액과 대사(reconcile).
- **중복 소스**: branch_rev_deals(지사 시트)와 crm_orders(NEO) 매출이 다를 수 있음 — 어느 게 정본인지 명시(권장: crm_orders=NEO 고객 매출 정본, 지사 시트는 영업 파이프라인 보조).
- **환율 변동**: 환산 채택 시 시점 환율 고정 정책 필요.
- **마이그레이션 적용**: Management API로 `crm_orders` 생성(기존 방식).

## 10. 범위 / 비범위

- **In**: crm_orders 스키마·적재·정제·재소스(현황 성과 분석).
- **Out(이번)**: 월별 추이를 NEO로 완전 전환(주문 occurred_at 정제 품질 확인 후), 환율 자동화, 고객 360의 매출도 crm_orders로 전환(후속).
