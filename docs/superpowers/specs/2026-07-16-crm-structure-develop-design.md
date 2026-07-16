# CRM 구조 디벨롭 — 설계 스펙 (2026-07-16)

상태: 설계 승인 완료(A~D + E 2건 모두 포함, 2026-07-16). 구현 계획 작성 대기.

## 0. 한 줄 요약

고객DB·기록·360 드로어 세 표면을 "찾기 빠르게(빠른 보기 모드) · 보기 가볍게(컴팩트 행) · 쓰기 자연스럽게(컴포저)"로 재구성하고, 홈페이지 유입 리드를 별도 태깅해 NEO 등록 시 정식 리드로 전환되는 흐름을 만든다. 새 top-level 탭 0개, 신규 마이그레이션 1개(이벤트 종류 CHECK 확장)의 린 스코프.

## 1. 배경 / 문제

- 우측 상세 패널([components/admin/crm/Customer360Drawer.tsx](../../../components/admin/crm/Customer360Drawer.tsx))은 이미 있으나 **기록(활동)이 5개 섹션 중 4번째**로 묻혀 있어 "클릭하면 빠른 기록이 보인다"는 체감이 없음.
- 저장 뷰 8종([components/admin/crm/CrmUnifiedCustomersClient.tsx](../../../components/admin/crm/CrmUnifiedCustomersClient.tsx)의 `SAVED_VIEW_FILTERS`)이 검색창·드롭다운 4개와 한 덩어리라 "빠른 필터"로 기능하지 못함.
- 기록 탭([components/admin/crm/CrmActivityClient.tsx](../../../components/admin/crm/CrmActivityClient.tsx))은 카드 1장에 배지 3개+제목+메타+요약+본문+녹음+3색 박스+태그가 전부 펼쳐지고, 입력 폼([components/admin/crm/rail/ActivityQuickForm.tsx](../../../components/admin/crm/rail/ActivityQuickForm.tsx))은 컴팩트 변형도 상시 노출 필드가 10개+.
- 홈페이지 유입 분류기([lib/crm/capture/origin.ts](../../../lib/crm/capture/origin.ts)의 `site_lead`)는 이미 있으나 고객DB·기록 표면에 노출되지 않고, "NEO(회사 CRM) 등록 = 정식 리드 전환" 판정 메커니즘이 없음.

## 2. 확정 결정 (사용자 선택, 2026-07-16)

1. **빠른 필터 = 빠른 보기 모드** — 칩 진입 시 검색 UI 전체 접힘, 기본 진입은 현행 검색-필터 유지.
2. **우측 빠른 기록 = 기존 360 드로어 개편** — 최근 기록 승격 + 한 줄 메모 컴포저 고정. 신규 패널 없음.
3. **홈페이지 리드 전환 = 자동(매칭 확정) + 수동 보정('NEO 등록됨' 액션)** 병행.
4. **기록 탭 = 리스트+입력 모두 개편** — 한 줄 행 + 채팅 컴포저식.
5. **E 제안 2건 모두 포함** — 미응답 SLA 배지, 발송허브 딥링크.

## 3. 설계

### A. 고객DB 빠른 보기 모드

대상: [components/admin/crm/CrmUnifiedCustomersClient.tsx](../../../components/admin/crm/CrmUnifiedCustomersClient.tsx)

- 저장 뷰 칩 행을 리스트 카드 **최상단 첫 요소로 승격**, 항상 노출. 칩 구성 = 기존 8종 + 신규 2종(`site_leads` 홈페이지 유입, `unanswered` 미응답 — §D·§E1).
- **빠른 보기 모드**: `?view=` 파라미터가 있으면 검색창·소스 토글·상태/담당자 셀렉트·라벨 행·요약 타일을 통째로 접고, `활성 칩 행 + 결과 수 + '전체 보기(검색·필터)' 버튼`만 렌더.
  - 모드 상태는 `?view=` 존재 여부에서 **파생**(별도 state 저장 없음) → 사이드바 딥링크·뒤로가기·새로고침 일관.
  - '전체 보기' 클릭 = view 해제(replace) + 전체 UI 복원. 기본 진입(파라미터 없음)은 현행과 동일.
  - 기존 "?view= 착지 시 로컬 필터 초기화" 로직(칩 카운트 정합)은 그대로 유지.
- 서버: [lib/repositories/crm-unified-customers.ts](../../../lib/repositories/crm-unified-customers.ts)의 `matchesSavedView` + `viewCounts`에 신규 뷰 2종 추가.

### B. 360 드로어 — 기록 승격

대상: [components/admin/crm/Customer360Drawer.tsx](../../../components/admin/crm/Customer360Drawer.tsx) + `Customer360Detail*.tsx`

- 섹션 순서 재배치: 요약(헤더) → **활동(최근 기록)** → 할일 → 딜 → 머니. 점프탭(스크롤 스파이) 순서 동기화.
- 헤더 바로 아래 **한 줄 빠른 메모 컴포저 고정(pin)**: 본문 한 칸 + 저장 버튼. 저장 시 타임라인 즉시 갱신(기존 refresh 패턴). '+ 상세' 클릭 시 전체 필드로 확장.
  - 폼 SSOT 유지: [components/admin/crm/rail/ActivityQuickForm.tsx](../../../components/admin/crm/rail/ActivityQuickForm.tsx)에 `variant="composer"`(초경량) 추가. 필드 값·FormData 직렬화·`POST /api/admin/crm/events` 계약 불변.
- 활동 섹션 = 최근 기록 5건 컴팩트 행 + '전체 기록 보기'(기존 기록 탭 `?targetId=` 딥링크 유지).
- 헤더 액션에 **발송허브 딥링크** 추가(§E2).

### C. 기록 탭 컴팩트 개편

대상: [components/admin/crm/CrmActivityClient.tsx](../../../components/admin/crm/CrmActivityClient.tsx), [components/admin/crm/rail/ActivityQuickForm.tsx](../../../components/admin/crm/rail/ActivityQuickForm.tsx)

- **리스트**: 풀펼침 카드 → **한 줄 행**: `[종류 칩] 제목·요약 · 고객명 · 담당 · 시간 · (위험/미처리 액션/홈페이지 뱃지)`. 행 클릭 시 그 자리 아코디언 펼침(본문·녹음 플레이어·결정/리스크/다음 액션·태그 — 기존 카드 내용물 재사용).
- **입력**: 채팅 컴포저식. 상단 고정 1행: `[종류 칩(메모/회의록/녹음 등 MODE_OPTIONS)] [고객 피커] [본문 한 칸] [저장]`.
  - 참석자·목적·분위기·단계신호·태그 등은 전부 '+ 상세' 접힘 뒤로. **다음 액션 입력만 컴포저 1차에 유지**(기록→할 일 자동 생성 리듬 보존).
  - 계약·API 불변. `variant="composer"`를 기록 탭·드로어·레일이 공유.
- 우측 레일([components/admin/crm/rail/CrmActionRail.tsx](../../../components/admin/crm/rail/CrmActionRail.tsx))의 오늘 할 일·최근 기록은 유지, 폼 부분만 컴포저로 교체. 모바일은 컴포저가 타임라인 위.
- 대상이 홈페이지 유입 리드인 기록 행에 '홈페이지' 출처 칩(§D).

### D. 홈페이지 유입 리드 태깅 + 정식 전환

- **판정**: [lib/crm/capture/origin.ts](../../../lib/crm/capture/origin.ts)의 기존 분류 재사용 — `lead.source`가 site 계열(`demo_modal`/`contact_page`/`newsletter` 등 광고·수기 외)이면 '홈페이지' 출처.
- **전환의 단일 진실 = `crm_source_links`** (source lead → target `external_account`, `status='confirmed'`):
  - 자동: 기존 검수(매칭) 파이프라인이 NEO 레코드와 연결 확정하면 자동 전환.
  - 수동: 드로어·리스트의 'NEO 등록됨' 액션 → NEO 계정 피커로 confirmed 링크 생성. [lib/repositories/crm-source-links.ts](../../../lib/repositories/crm-source-links.ts)의 `CrmManualLinkTargetType`에 `external_account` 추가 — **DB CHECK는 이미 11개 값에 `external_account`를 허용하므로 마이그레이션 불필요**(2026-06-24 스파이크 검증 사실).
  - NEO 계정이 아직 미동기화라 피커에 없으면: 다음 동기화 후 매칭 후보로 자동 승격되거나 그때 수동 연결. 별도 "미지정 등록" 플래그는 만들지 않는다(진실 이원화 방지).
- **표시**: 통합 리스트·드로어·기록의 리드에 '홈페이지' 배지 → 링크 확정 시 '정식 리드(NEO 등록)' 배지 전환, '홈페이지' 출처는 유래(provenance)로 병기 유지.
- **신규 저장 뷰 `site_leads`** = 홈페이지 유입 & 미등록(confirmed 링크 없음) — "NEO 등록 대기 큐".
- **유입 자동 기록**: [lib/server/lead-capture.ts](../../../lib/server/lead-capture.ts)에서 리드 저장 성공 시 `crm_customer_events`에 '홈페이지 상담 신청' 이벤트 자동 삽입(target=lead, `source_type='site_inflow'`).
  - **마이그레이션 1개**: `crm_customer_events.source_type` CHECK에 `'site_inflow'` 추가([supabase/migrations/20260629_crm_events_contact_types.sql](../../../supabase/migrations/20260629_crm_events_contact_types.sql) 패턴 반복). database.types → repo → SQL(IF NOT EXISTS 스타일) → apply → smoke 순서 준수.
  - 자동 이벤트 삽입 실패는 리드 저장을 실패시키지 않는다(부수 효과 — 기존 notification emit과 동일한 fire-and-forget 패턴). 기록 탭 종류 필터로 걸러볼 수 있게 `SOURCE_FILTERS`에 노출.

### E1. 미응답 SLA 배지

- 대상 리드: `RESPONSE_TARGET_SOURCES`(= `demo_modal`, `contact_page`, `meta_lead_ads`, [lib/repositories/leads.ts](../../../lib/repositories/leads.ts)).
- **첫 응답 판정** = 해당 리드를 target으로 한 팀 작성 기록(`site_inflow` 등 자동 유입 제외) 최초 발생. 미응답이면 리드 생성 후 경과시간 배지(`미응답 3h` 등), 24시간 초과 시 위험톤(terracotta `#B85C33`).
- **신규 저장 뷰 `unanswered`** = 대상 소스 & 미응답 — 빠른 필터 칩으로 노출(§A).
- 기존 데이터만으로 판정(신규 컬럼·마이그 없음). 통합 리스트 응답에 `firstResponseAt`(파생) 노출.

### E2. 발송허브 딥링크

- 드로어 헤더 액션에 '알림톡/문자' 버튼 → 캠페인 메시지 탭(`/admin/campaigns`, 구 발송허브)으로 **수신자 프리필 쿼리 파라미터**와 함께 이동. 컴포저([components/admin/marketing/KakaoComposer.tsx](../../../components/admin/marketing/KakaoComposer.tsx) 등)가 파라미터를 읽어 수신자 필드 프리필.
- 발송 자동화 아님 — 이동+프리필만. 연락처 없는 고객은 버튼 비활성(툴팁으로 사유).

## 4. 데이터 · API 변경 요약

| 항목 | 변경 | 마이그 |
|------|------|--------|
| unified list API | 저장 뷰 2종(`site_leads`, `unanswered`) + `origin`/`crmRegistered`/`firstResponseAt` 파생 필드 | 없음 |
| events POST | 불변 (composer는 동일 계약) | 없음 |
| events source_type | `site_inflow` 추가 | **1개** (CHECK 확장) |
| manual link API | `CrmManualLinkTargetType`에 `external_account` 추가 | 없음 (DB CHECK 기허용) |
| 360 GET | 불변 (섹션 순서는 클라이언트) | 없음 |
| 캠페인 메시지 탭 | 수신자 프리필 쿼리 파라미터 수용 | 없음 |

## 5. 에러 · 엣지

- 컴포저 저장 실패: 토스트 + 입력값 보존(기존 패턴).
- 빠른 보기 모드에서 칩 카운트 로드 실패: 숫자만 생략, 칩은 동작.
- 알 수 없는 `?view=` 값: 현행처럼 `all`로 폴백하되 빠른 보기 모드로 들어가지 않음.
- 자동 유입 이벤트 삽입 실패: 리드 저장에 영향 없음(로그만).
- 수동 링크 생성 충돌(이미 confirmed 링크 존재): 기존 링크 유지 + 안내.
- 드로어 컴포저 dirty 상태에서 backdrop 닫기: 확인 가드(기존 UI 스펙 2026-06-27의 dirty-state 가드 항목과 정렬).

## 6. 비범위

- 새 top-level 탭, 기록 검색 고도화, '내 고객' 오너 정규화(admin_profiles ↔ NEO owner 매핑), 발송 자동화 규칙, 칸반, ML/임베딩. 미수/머니 로직 불변.

## 7. 검증 계획

- 게이트: `npx eslint app components lib --max-warnings=0` + `npm run build`.
- 유닛: origin 분류 노출, `site_leads`/`unanswered` 뷰 필터, 전환 배지 파생(`confirmed` 링크 유무), 첫 응답 판정.
- 브라우저 실검증 5플로우: ① 칩 진입→빠른 보기→'전체 보기' 복귀·뒤로가기 ② 고객 클릭→드로어 기록 확인→한 줄 메모 저장 ③ 기록 탭 컴포저 저장·행 펼침 ④ 홈페이지 배지→수동 'NEO 등록됨'→정식 전환 표시 ⑤ 발송허브 딥링크 프리필.
- 디자인 철칙: DESIGN 팔레트만, 그린 액센트 한 화면 1점, 보더 `1px solid rgba(0,0,0,0.08)`, 모바일 우선.

## 8. 관련 문서

- [docs/active/crm-ui-layout-improvement-spec-2026-06-27.md](../../active/crm-ui-layout-improvement-spec-2026-06-27.md) — 레이아웃 개선 스펙(본 설계의 B·C와 정렬: activity-as-hero, 폼 접기, 저장 뷰 칩)
- [docs/active/crm-merge-redesign-2026-06-24.md](../../active/crm-merge-redesign-2026-06-24.md) — 병합·재설계 캐논
- [docs/active/crm-phase0-spike-findings-2026-06-24.md](../../active/crm-phase0-spike-findings-2026-06-24.md) — `crm_source_links` target_type DB CHECK 검증 근거
