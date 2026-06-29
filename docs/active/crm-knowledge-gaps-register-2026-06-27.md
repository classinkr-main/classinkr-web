# CRM 지식 공백 & 선결 입력 레지스터

기준 시점: 2026-06-27
동반 문서: [CRM 통합 마스터 설계](docs/superpowers/specs/2026-06-27-crm-unified-master-design.md)
상태: 작업용 레지스터 (해소되면 줄을 닫는다)

## 한 줄

구조는 탄탄하다 — 매니저 홈은 culture-fit §11 "느린 외부 조회 없이 첫 화면" 게이트를 **구조적으로 통과**한다(홈/360 어디에도 동기 NEO HTTP 호출 없음, Supabase 스냅샷만 읽음). 문제는 두 가지다. ① **"편한지"를 측정할 장치가 0이다.** ② **모든 기능이 "정직하게" 설계돼서, 데이터에 빈 곳이 있으면 조용히 `미지정 / 정보 없음 / 검토 전부`로 무너진다.** 따라서 "더 편하게"의 다음 한 수는 코드 추가가 아니라 **데이터 현실 측정 + 사용 계측**이다.

소유 태그: `[라이브DB]` 쿼리 1회로 알 수 있음 · `[계측빌드]` 지어야 알 수 있음 · `[유저리서치]` 사람 관찰/인터뷰 · `[비즈니스결정]` 사람이 결정(코드 불가).

---

## 1. 즉시 측정 — 다음 설계 결정의 입력 `[라이브DB]`

진단 1회로 "Capture UI를 먼저 만들지 / 매칭 하드닝을 먼저 할지 / 지역 파이프라인을 고칠지"가 갈린다.

| 질문 | 무엇을 가름 | 방법 |
|------|-------------|------|
| 회사명 dedup 비율 + 5소스 교차 링크율 | 통합 고객이 무거운 머티리얼라이즈가 필요한가, 이름매칭으로 충분한가 / 수동링크 부담 | `npx tsx scripts/diagnose-company-dedup.ts` (라이브 크레덴셜 필요) — §2·3 |
| **leads의 phone·email 보유율**, customers 주소/region_label 커버리지 | **Capture "예외만 검토"의 성패를 결정하는 단일 숫자** + 지역 라벨 실효성 | leads `count(phone)/count(email)/total`, customers `count(region_label)/total` — 래핑 스크립트 없음, 4줄 작성 필요 |
| `external_crm_records.is_stale` 분포(객체별) + 마지막 `external_crm_sync_runs` 성공 시각 | stale 데이터가 매칭/360을 오염시키는가, 야간 1회로 충분한가 | `group by object_api_key, is_stale` + `max(finished_at)` — 컬럼 이미 존재 |
| `crm_customer_events` 중 `target_id IS NULL`/`target_type='unknown'` 수 + 어느 고객과도 안 맞는 고아 수 | 360 "고객 기록"이 비어 보이는 정도 | events 카운트 + `leads.id`/xiaoshouyi accountId anti-join |
| NEO 계정 중 `expireAt`+`lastClassAt` 보유율 | service-risk가 실제 신호인가 "normal" 노이즈인가 | EEO 레코드에서 active-paid + 만료일/최근수업 보유 카운트 |

> 가장 높은 레버리지 행동. 이 숫자들 없이 다음 기능을 만들면 "편하게"가 가정 위에 선다.

---

## 2. 측정 계측 공백 — 없으면 "편하다"를 영영 검증 못 함 `[계측빌드]`

- **admin 사용 계측이 0이다.** `lib/analytics.ts`의 이벤트는 전부 공개 퍼널용이고 `/admin`에서는 단 한 번도 안 fire한다. WAU·세션·첫화면시간·검색지연 측정 불가.
- 현재 "매니저" 신호는 전부 **입력 산물에서 파생**된다(tasks/deals의 `owner_key`, capture의 `created_by`) — 누가 로그인했는지가 아니라 **무엇을 타이핑했는지**만 센다. 아무도 안 여는 CRM도 manager-report는 깨끗하게 나온다([crm-manager-report.ts:202](lib/repositories/crm-manager-report.ts:202)).
- `last_login_at` 컬럼은 존재하지만 **어디서도 write하지 않는다**([admin-users.ts:50](lib/repositories/admin-users.ts:50) select-only). WAU 대시보드를 깔면 항상 null/stale 위에 짓게 됨.
- per-actor 입력수는 `created_by`/`owner_name_snapshot`로 today 집계 가능하나, `adminActorName`이 name→userId→role로 폴백해 **'admin' 역할 문자열로 붕괴**할 수 있음([deals-lite/route.ts:32](app/api/admin/crm/deals-lite/route.ts:32)).
- **필요 빌드(최소):** ① 로그인 시 `last_login_at` write ② admin usage 경량 이벤트(열람/입력/capture) ③ CRM API duration 로깅. 베이스라인을 잡아야 "더 편하게"의 전후 비교가 가능.

---

## 3. 기능이 조용히 무너지는 지점 — 데이터 의존 (코드 확인됨)

| 기능 | 데이터가 나쁘면 | 근거 |
|------|----------------|------|
| **Capture "예외만 검토"** | org+이름만 있는 행사 명단 → **0 자동확정 → 검토 전부**. 단일 정확 phone/email만 confirm, 기관명은 절대 자동확정 안 함 | [matching.ts:135-148](lib/crm/capture/matching.ts:135) |
| 같은 학원 30명 명단 | org 후보가 needs_review→지역다중이면 multiple_candidates→배치내 동일 org는 duplicate_in_batch로 apply 스킵 → 적용 소수 + 검토 벽 | [matching.ts:102-143](lib/crm/capture/matching.ts:102) |
| **지역 라벨** | **대부분 "지역 미지정"** — NEO·주소·KR정규화 가능 행만. leads엔 주소 없음, manual override는 호출처 없는 死코드 | [region-label.ts:15](lib/crm/region-label.ts:15), [crm-customer-360.ts:161](lib/repositories/crm-customer-360.ts:161) |
| **360 "고객 기록"** | 빈 것처럼 보임 — `target_id` null/unknown 이벤트는 `.eq('target_id')` 필터에서 소멸. capture의 needs_review 행이 바로 그런 이벤트를 생성 | [crm-events.ts:369](lib/repositories/crm-events.ts:369), [capture/apply.ts:57](lib/crm/capture/apply.ts:57) |
| **service-risk** | money는 있는데 expireAt/lastClassAt null이면 reason 없는 `normal` → **신호 부재가 초록불처럼 보임** | [service-risk.ts:88-122](lib/crm/service-risk.ts:88) |
| 홈 "5초 파악"(통합 리스트) | risk·region 신호 없음 → 점수에만 의존, 리치 신호는 드로어 한 번 더 클릭해야 보임 | `crm-unified-customers.ts`엔 serviceRisk/region 0 |

---

## 4. 사람만 답할 수 있는 것 — 코드가 못 푸는 것

### 4.1 가정 검증 `[유저리서치]` — 매니저·지사장 2~3명 섀도잉/인터뷰

culture-fit §2의 네 전제는 **사실로 적혀 있으나 검증 안 됨**. 하나라도 틀리면 "최소입력·무감시" 베팅이 뒤집히고 = 문서가 스스로 적은 #1 실패 모드.

- 통화/미팅 기록을 정말 거의 안 남기나? (습관 공백 vs 의도적 선택 — 처방이 다름)
- "결과만 나오면 된다"가 실제 팀 규범인가? (주간보고 자동초안이 코칭 vs 감시로 착지하는지 가름)
- "고객 책임자 1명이 자연"이 현실인가, 대형 고객 경계는? (single-owner `owner_key` 모델 가름)
- 매니저는 자율·유연 단계인가, 일부는 명시 딜 단계를 원하나? (Deal Lite vs stage)

### 4.2 비즈니스/법무 결정 `[비즈니스결정]` — 비가역·선결

- **공유에 가까운 admin 로그인 은퇴 + per-rep 계정 발급**(`neo_owner_id` 채움). per-rep ownership·"내 고객"의 **하드 전제**. 안 하면 attribution이 조용히 불능. (실계정 2개뿐)
- **Capture raw_input PII 보존 기간 + 동의 근거**. master §6.4가 무기한 저장 금지하나 윈도우는 비어 있음 → PIPA 리스크. "source+consent 표시"가 정책 없는 라벨이 됨.
- **Vercel tier 확정**(Hobby vs Pro). 핫미니 sync cadence·위험 freshness 보장을 가름. 메모리상 cron ~13개 = Pro 추정이나 미확정.
- **`Collection__c.approvalStatus` 의미**(status=3만 실수금인가). 순수금 위젯이 ~50% 행만큼 과/소 표시. spike가 선결로 표시.
- **lead 원천(구글시트) 연결**. 현재 unified가 NEO:lead ≈ 281:1로 편중 → lead 커버리지가 비어 보여 triage 오도.

### 4.3 HQ 계약 `[비즈니스결정]` — NEO 통합, KR 단독 불가

NEO lead push(통합 Phase 1)는 6~7주로 잡혔으나 **모든 load-bearing 항목이 HQ 소유 미해결**: API auth, rate limit/burst, 중복 리드 정책(overwrite/ignore/merge), owner 라우팅, KR 리드 PII 저장 국가(국외이전 동의 문구), write-back 방향.

---

## 5. 이미 들어간 기술 부채 — 지금은 OK, 스케일에서 터질 곳

- **priority queue 무캐시**: 매 uncached 요청마다 `getLeads()`+`getNeoCrmCustomers()`(external_crm_records 객체별 최대 5000행 ×3) + tasks를 재계산·재정렬. 서버 메모/캐시 없음. §11 게이트는 오늘 통과하나, "느린 첫 화면" 실패가 터진다면 바로 이 모양(Supabase 스캔 지연). [crm-priority-queue.ts:104](lib/repositories/crm-priority-queue.ts:104)
- **`fetchPage`가 `.range()`를 `.order()` 없이** 사용 → 순서 없는 keyset 페이지네이션은 페이지 간 행 중복/누락 가능(홈 최중량 쿼리의 정확성+성능 위험). [admin-crm-customers-neo.ts:329](lib/admin-crm-customers-neo.ts:329)
- business-snapshot RPC가 없거나 에러나면 `getBusinessOverview`가 조용히 live 집계로 폴백 → 건강한 env에선 §11 통과하나 스냅샷 인프라 부재 시 보이지 않게 회귀. [admin-crm-overview.ts:578](lib/admin-crm-overview.ts:578)

---

## 6. 다음 한 수 (권장 순서)

1. **숫자부터.** §1 진단을 라이브로 1회(반나절). phone/email 보유율·지역 커버리지·고아 이벤트 수가 다음 우선순위를 결정한다.
2. **경량 admin 계측**을 동시에 깔아 베이스라인 확보(§2). 없으면 개선을 입증할 수 없다.
3. 그 숫자에 따라: 보유율이 높으면 → **Capture UI(C1)**, 낮으면 → **매칭 하드닝(C3)/연락처 보강** 또는 **지역 파이프라인**을 먼저.
4. 병렬로 사람 트랙: §4.1 섀도잉 1회 + §4.2 공유로그인·PII·tier 결정 착수(빌드와 독립).
