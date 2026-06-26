# 자체 CRM 백엔드 운영 지침 및 상세 기획

기준 시점: 2026-06-26

상태: 실행 기준 초안 - CRM 기록 탭과 `crm_customer_events` 1차 구현 반영

범위: Admin CRM을 회사 내부 동료가 매일 쓰는 자체 CRM으로 발전시키기 위한 백엔드, 데이터 소유권, 회의록/녹음 기록, 동기화 운영 기준

관련 기준:
- [erp-blueprint-2026-06-22.md](./erp-blueprint-2026-06-22.md) - Account 360 스파인과 지사 운영 OS 상위 로드맵
- [crm-sheet-revenue-sync-plan.md](./crm-sheet-revenue-sync-plan.md) - 시트와 매출 싱크 기준
- [korean-crm-admin-integration-plan-2026-06-10.md](./korean-crm-admin-integration-plan-2026-06-10.md) - NEO/샤오셔우이 통합 기준
- [architecture-schema-erd.md](./architecture-schema-erd.md) - 스키마/ERD 입구

---

## 1. 한 줄 결정

자체 CRM은 외부 CRM을 다시 만드는 것이 아니다. **ClassIn Home Admin 안에 고객 스파인, 활동 타임라인, 다음 액션 큐, 외부 장부 동기화 어댑터를 두고, 시트/OCRM/HQ CRM은 참고용 또는 동기화 원천으로 강등한다.**

운영 판단:
- 고객을 보는 기본 화면은 `현황 -> 고객 -> 기록 -> 돈흐름 -> 인사이트`다.
- 외부 CRM, 시트, 본사/HQ CRM 스냅샷은 읽기 전용에 가깝게 취급한다.
- 우리가 직접 입력하고 책임지는 데이터는 CRM 이벤트, 다음 액션, 리드 상태, 고객 메모, 매칭 상태다.
- 외부 원천을 수정해야 하는 경우 직접 쓰지 않고 승인 큐 또는 동기화 요청으로 남긴다.
- 회사 동료가 매일 쓰는 기준은 "오늘 누구에게 연락해야 하는가", "최근 무슨 이야기가 있었는가", "다음 액션이 남아 있는가"다.

---

## 2. 제품 원칙

### 2.1 동료 사용 기준

동료가 아침에 CRM을 열면 바로 보여야 하는 것:
- 오늘 먼저 연락할 고객
- 24시간 이상 미응답 리드
- 최근 미팅 후 다음 액션이 남은 고객
- 갱신/만료/휴면/클레임 리스크
- 외부 CRM 또는 시트와 매칭이 안 된 고객
- 최근 회의록/녹음/메모에서 나온 합의, 리스크, 담당자

동료가 고객 통화나 미팅 후 2분 안에 남길 수 있어야 하는 것:
- 고객명 또는 임시 대상명
- 기록 종류: 간단 메모, 회의록, 녹음
- 요약 한 줄
- 다음 액션 1개
- 담당자와 기한
- 리스크 여부

### 2.2 데이터 입력 원칙

수기 입력은 적게 받되, 받은 입력은 CRM의 1급 데이터로 취급한다.

필수에 가까운 필드:
- `occurred_at`: 언제 있었는가
- `target_label`: 누구와 관련 있는가. 사용자는 내부 id가 아니라 학원/기관명을 입력한다.
- `title` 또는 `summary`: 무슨 일인가
- `next_actions`: 다음에 뭘 할 것인가

나중에 보강 가능한 필드:
- `target_id`: 고객/리드/딜 매칭 id
- `attendees`: 참석자
- `decisions`: 합의사항
- `blockers`: 막힌 점
- `tags`: 견적, 갱신, 설치, 리스크, 데모 등

동료용 UI는 내부 타입을 그대로 노출하지 않는다. `lead`, `neo_account`, `customer`, `deal`, `unknown`은 저장 모델의 언어이고, 화면에서는 "리드", "학원/기관", "딜", "미연결"처럼 업무 언어로 보여준다. `target_id`도 직접 입력시키지 않고 검색/자동완성으로 채우는 것이 목표다.

### 2.3 신뢰 원칙

CRM의 숫자와 상태는 출처가 보여야 한다.

- ClassIn-owned 데이터: 리드, CRM 이벤트, 다음 액션, 매칭 상태
- External-owned 데이터: NEO/OCRM/HQ CRM 스냅샷, 시트 목표/실적, 본사 장부
- Derived 데이터: 우선순위 점수, 리스크 상태, 헬스 등급, 인사이트 집계

UI와 API는 이 세 종류를 섞어 보이더라도 저장 책임과 수정 가능 범위는 구분해야 한다.

---

## 3. 현행 구현 기준

현재 1차 구현된 기반:

| 영역 | 현재 기준 | 파일 |
|---|---|---|
| CRM 기록 탭 | 회의록, 녹음, 간단 메모를 모아보는 Admin CRM 탭 | [app/admin/crm/activity/page.tsx](../../app/admin/crm/activity/page.tsx), [components/admin/crm/CrmActivityClient.tsx](../../components/admin/crm/CrmActivityClient.tsx) |
| CRM 이벤트 API | 관리자 인증 후 기록 조회/생성 | [app/api/admin/crm/events/route.ts](../../app/api/admin/crm/events/route.ts) |
| 이벤트 저장소 | `crm_customer_events` 조회/생성, signed URL 생성 | [lib/repositories/crm-events.ts](../../lib/repositories/crm-events.ts) |
| 녹음 저장 | private Supabase Storage bucket `crm-recordings` | [lib/storage/crm-recordings.ts](../../lib/storage/crm-recordings.ts) |
| DB 마이그레이션 | `crm_customer_events` 테이블, RLS, 인덱스, storage bucket | [supabase/migrations/20260626_crm_customer_events.sql](../../supabase/migrations/20260626_crm_customer_events.sql) |
| CRM 내비게이션 | `기록` 탭을 1급 운영 탭으로 노출 | [components/admin/crm/CrmSubnav.tsx](../../components/admin/crm/CrmSubnav.tsx) |

이 구현은 완성형 CRM이 아니라 자체 CRM의 활동 타임라인을 시작하는 기반이다. 다음 단계는 이 이벤트를 고객 360, 현황 큐, 다음 액션 큐, 인사이트에 연결하는 것이다.

---

## 4. 백엔드 소유권 모델

### 4.1 우리가 소유하는 데이터

| 데이터 | 책임 | 저장 후보 |
|---|---|---|
| 리드 제출/상태 | ClassIn Home Admin | `leads` |
| 고객별 활동 기록 | ClassIn Home Admin | `crm_customer_events` |
| 회의록/녹음 메타데이터 | ClassIn Home Admin | `crm_customer_events` |
| 녹음 파일 | ClassIn Home Admin private storage | `crm-recordings` bucket |
| 다음 액션 | Phase 1은 이벤트 JSON, Phase 2는 `crm_tasks` | `crm_customer_events.next_actions`, future `crm_tasks` |
| 고객 매칭/스파인 연결 | ClassIn Home Admin | `crm_source_links` |
| 외부 수정 요청 | ClassIn Home Admin 승인 큐 | `crm_write_requests` |

### 4.2 외부 원천으로 유지하는 데이터

| 원천 | 역할 | 운영 기준 |
|---|---|---|
| 시트 | 목표/실적/일부 매출 원천 또는 import 원천 | 직접 CRM 입력 화면처럼 취급하지 않는다 |
| OCRM/NEO/샤오셔우이 | 고객/계정/계약/수납 스냅샷 | read-mostly, 수정은 승인 큐 |
| HQ CRM | 본사 기준 데이터 | 참고/동기화 원천, 로컬 임의 수정 금지 |
| 캘린더/회의록 원천 | 미팅 발견과 기록 연결 보조 | 이벤트로 복사하거나 링크만 보관 |

외부 데이터를 자체 CRM에 가져올 때는 `source_type`, `source_id`, `synced_at`, `freshness`를 남겨야 한다. 외부 데이터가 낡았거나 누락되면 숫자를 조용히 합산하지 말고 커버리지 경고를 표시한다.

---

## 5. 목표 백엔드 구조

### 5.1 Account 360 스파인

목표:
- 한 학원/고객을 하나의 운영 단위로 본다.
- 리드, 외부 CRM 계정, 딜, 매출, 활동 기록을 같은 고객 화면에서 읽는다.
- 매칭되지 않은 데이터는 버리지 않고 `연결 필요`로 노출한다.

권장 순서:
1. Phase 1에서는 물리 테이블보다 read model 또는 repository 조합으로 시작한다.
2. `crm_source_links.status='confirmed'`를 매칭의 기본 전제로 둔다.
3. 스파인 커버리지 지표를 먼저 만든다.
4. 수기 운영 필드가 늘어나면 `crm_customer_profiles` 같은 얇은 물리 테이블을 추가한다.

초기 read model 후보:
- `target_type`: `lead`, `neo_account`, `customer`, `deal`, `unknown`
- `target_id`: 원천 id
- `display_name`: 학원/기관명
- `owner_name`: 담당자
- `source_labels`: 연결된 원천 목록
- `last_event_at`: 최근 CRM 활동
- `open_next_actions`: 미완료 다음 액션 수
- `risk_flags`: 만료, 휴면, 미응답, 리스크 기록
- `money_refs`: 통화별 별도 금액 참조

### 5.2 CRM 이벤트 타임라인

`crm_customer_events`는 자체 CRM의 활동 spine이다.

역할:
- 통화, 카톡, 방문, 회의록, 녹음, 캘린더 미팅, 외부 기록 링크를 시간순으로 모은다.
- 고객 360 카드와 현황 큐가 읽는 공통 원천이 된다.
- 사람이 남긴 맥락을 외부 CRM 스냅샷보다 우선 보여준다.

현재 필드로 충분한 것:
- 기록 종류: `source_type`
- 대상: `target_type`, `target_id`, `target_label`
- 내용: `title`, `summary`, `body`
- 회의 구조화: `attendees`, `decisions`, `blockers`, `next_actions`
- 상태 신호: `sentiment`, `stage_signal`, `tags`
- 녹음: `recording_storage_path`, `recording_file_name`, `recording_mime_type`, `recording_size_bytes`

후속 분리 후보:
- 녹음/파일이 여러 개 붙기 시작하면 `crm_event_attachments`
- 다음 액션 완료/담당/알림이 중요해지면 `crm_tasks`
- STT/요약 파이프라인이 붙으면 `crm_event_transcripts`

### 5.3 다음 액션 큐

Phase 1:
- `crm_customer_events.next_actions` JSON을 그대로 사용한다.
- CRM 홈에서 "미팅 후 액션" 카드를 만든다.
- 고객 360에서 최근 미완료 액션을 보여준다.

Phase 2:
- `crm_tasks` 테이블로 승격한다.
- 담당자, 기한, 상태, 우선순위, 원천 이벤트를 기준으로 정렬한다.
- 완료 처리, 재배정, 지연 알림을 지원한다.

권장 `crm_tasks` 필드:
- `id`
- `source_event_id`
- `target_type`
- `target_id`
- `target_label`
- `title`
- `owner_name`
- `due_at`
- `priority`
- `status`: `open`, `done`, `deferred`, `canceled`
- `created_at`
- `updated_at`

### 5.4 녹음/회의록 처리

Phase 1:
- 녹음 파일은 private bucket에 저장한다.
- 이벤트 row에는 storage path와 파일 메타데이터만 둔다.
- signed URL은 조회 시점에 짧게 발급한다.
- 업로드 실패와 이벤트 저장 실패는 사용자에게 명확히 분리해서 보여준다.

Phase 2:
- `crm_event_attachments`를 두고 파일 여러 개를 허용한다.
- 이벤트 저장 실패 후 업로드된 orphan 파일 정리 job을 만든다.
- 50MB 초과 녹음은 direct upload 또는 외부 저장 링크 정책을 별도로 둔다.

Phase 3:
- STT 작업 큐를 둔다.
- 원문 transcript, 요약, 결정사항, 다음 액션 추출 결과를 별도 테이블에 저장한다.
- 사람이 수정한 요약과 AI 초안은 구분한다.

권장 `crm_event_transcripts` 필드:
- `event_id`
- `provider`
- `status`: `pending`, `processing`, `ready`, `failed`
- `language`
- `transcript_text`
- `summary`
- `extracted`
- `error_message`
- `created_at`
- `updated_at`

---

## 6. API 설계 지침

모든 Admin CRM API는 다음을 지킨다.

- `app/api/admin/crm/**` 아래에 둔다.
- 첫 줄 흐름에서 `verifyAdmin()` 또는 동등한 관리자 인증을 통과한다.
- 작성자 감사 필드는 클라이언트 입력을 신뢰하지 않고 관리자 인증 컨텍스트에서 채운다.
- Supabase 접근은 서버에서 `createSupabaseAdminClient()`를 사용한다.
- UI 컴포넌트가 Supabase를 직접 호출하지 않는다.
- 데이터 접근 로직은 `lib/repositories/`로 모은다.
- 파일 저장 로직은 `lib/storage/`로 격리한다.
- 잘못된 body shape는 500이 아니라 400 계열로 반환한다.
- 마이그레이션 미적용은 generic 500이 아니라 503 또는 health 메시지로 반환한다.
- 외부 원천 일부가 실패해도 전체 CRM 화면이 죽지 않게 partial health를 반환한다.
- `external_crm_records` 같은 외부 snapshot 테이블은 sync writer가 아닌 일반 Admin mutation에서 직접 수정하지 않는다.

권장 API:

| Method | Path | 목적 |
|---|---|---|
| `GET` | `/api/admin/crm/events` | CRM 기록 목록, 검색, 필터 |
| `POST` | `/api/admin/crm/events` | 간단 메모, 회의록, 녹음 저장 |
| `GET` | `/api/admin/crm/customers/unified` | 고객 통합 DB 목록 |
| `GET` | `/api/admin/crm/customers/unified/[key]` | 고객 360 상세 |
| `GET` | `/api/admin/crm/home/priority-queue` | 오늘 먼저 연락할 고객 |
| `GET` | `/api/admin/crm/tasks` | 미완료 다음 액션 |
| `PATCH` | `/api/admin/crm/tasks/[id]` | 다음 액션 완료/수정 |
| `POST` | `/api/admin/crm/source-links` | 원천 매칭 생성/확정 |
| `POST` | `/api/admin/crm/write-requests` | 외부 CRM 수정 요청 생성 |

---

## 7. 회의록/녹음 입력 설계

### 7.1 수동 입력 흐름

1. 동료가 `/admin/crm/activity`에서 기록 종류를 고른다.
2. 고객명 또는 임시 대상명을 입력한다. 고객 자동검색이 가능하면 `target_id`를 함께 채운다.
3. 요약, 합의사항, 리스크, 다음 액션을 입력한다.
4. 녹음 모드라면 파일을 첨부한다.
5. `POST /api/admin/crm/events`가 파일 업로드 후 이벤트를 저장한다.
6. 저장된 이벤트는 기록 탭, 고객 360, 현황 큐에서 읽힌다.

### 7.2 미팅 연결 흐름

향후 캘린더/회의록 원천이 연결되면 다음 흐름을 쓴다.

1. 캘린더에서 최근 미팅 후보를 가져온다.
2. 고객 매칭이 안 된 미팅은 `미연결 회의` inbox에 둔다.
3. 동료가 고객/리드/딜에 연결한다.
4. 연결 후 `crm_customer_events`에 `source_type='calendar_event'`로 이벤트를 생성한다.
5. 회의록 또는 녹음이 있으면 attachment/transcript로 붙인다.

### 7.3 입력 품질 규칙

입력 화면 기본값:
- 기본 영역은 `고객/기관`, `요약`, `다음 액션`, `담당/기한`, `녹음파일`까지만 둔다.
- 참석자, 결정사항, 리스크, 단계 신호, 태그는 고급 영역으로 접는다.
- 고객 검색 결과가 없으면 `미연결 기록`으로 저장할 수 있어야 한다.
- 내부 타입명과 원천 id는 고급 디버그 정보로만 취급한다.

동료 운영 규칙:
- 한 미팅은 한 이벤트로 남긴다.
- 녹음만 올릴 때도 제목 또는 요약은 남긴다.
- 다음 액션이 없으면 "후속 없음"을 명시한다.
- 고객 매칭이 불확실하면 `unknown`으로 저장하고 주간 정리에서 연결한다.
- 리스크로 판단하면 `sentiment='risk'`와 tag를 함께 남긴다.

권장 태그:
- `견적`
- `갱신`
- `데모`
- `설치`
- `하드웨어`
- `CS`
- `리스크`
- `결정대기`
- `미연결`

---

## 8. 안정성 및 보안 기준

### 8.1 녹음 파일

- bucket은 private이어야 한다.
- public URL을 저장하거나 노출하지 않는다.
- signed URL은 조회 시점에 생성한다.
- MIME type allowlist를 둔다.
- 기본 업로드 제한은 50MB로 유지한다.
- 서버 메모리/타임아웃 리스크가 보이면 direct upload 또는 background upload로 전환한다.
- 장기적으로 파일 보존 기간과 삭제 정책을 정한다.

### 8.2 RLS와 관리자 권한

- 신규 CRM 테이블은 RLS enable을 기본으로 한다.
- Admin 전용 테이블은 `is_active_admin()` 정책을 둔다.
- API는 service role/admin client를 서버에서만 사용한다.
- 클라이언트에 storage path 이상의 민감 정보를 불필요하게 노출하지 않는다.

### 8.3 장애 처리

장애 시 사용자 경험:
- 마이그레이션 미적용: "CRM 기록 DB 마이그레이션이 아직 적용되지 않았습니다."
- 외부 CRM 실패: 자체 CRM 기록은 계속 표시, 외부 원천만 stale/failed로 표시
- 녹음 업로드 실패: 이벤트 본문 저장 여부를 명확히 구분
- 파일 업로드 성공 후 DB insert가 실패하면 orphan 파일 정리 기준을 따른다.
- 검색 실패: 화면 전체 blank 금지, 오류 toast와 기존 캐시 유지

운영 로그:
- API route는 `[GET /api/admin/crm/events]` 같은 경로 prefix로 로그를 남긴다.
- 외부 동기화 job은 run id, source, started_at, finished_at, status, row_count를 남긴다.

---

## 9. 자체 평가 기준

### 9.1 사용성

점검 질문:
- 동료가 아침에 처음 보는 화면에서 오늘 연락할 대상을 알 수 있는가
- 최근 미팅 후속 액션이 묻히지 않는가
- 고객명을 몰라도 임시 기록을 남길 수 있는가
- 녹음 업로드만 하고 끝나는 흐름을 막을 최소 요약 장치가 있는가
- 모바일에서 기록 입력이 깨지지 않는가

통과 기준:
- 신규 메모 저장까지 2분 이내
- 고객명 미확정 기록 저장 가능
- raw target id를 몰라도 고객 검색 또는 미연결 저장 가능
- 검색/필터로 회의록과 녹음을 3초 이내 찾을 수 있음
- 미완료 다음 액션이 CRM 홈 또는 고객 360에 노출

### 9.2 기능성

점검 질문:
- 리드, 외부 계정, 딜, unknown 대상에 모두 이벤트를 붙일 수 있는가
- 외부 CRM 원천을 수정하지 않고도 자체 CRM 메모가 쌓이는가
- 회의록, 녹음, 간단 메모가 같은 타임라인으로 합쳐지는가
- source freshness와 매칭 상태가 보이는가

통과 기준:
- `crm_customer_events`가 단일 수기 활동 저장소 역할을 함
- `crm_source_links` 기반 고객 연결률을 측정함
- 외부 원천 수정은 `crm_write_requests` 또는 별도 승인 큐로 분리

### 9.3 쾌적성

점검 질문:
- CRM 홈이 외부 API 하나 때문에 느려지지 않는가
- 검색/필터가 서버 페이지네이션을 쓰는가
- signed URL 생성이 리스트 조회를 과도하게 느리게 만들지 않는가
- 빈 상태와 오류 상태가 업무 언어로 설명되는가

통과 기준:
- 목록 API 기본 limit 50, 최대 100
- 외부 원천 실패에도 자체 이벤트 목록 표시
- 기록 탭 로딩, empty, health 상태 모두 존재

### 9.4 안정성

점검 질문:
- 잘못된 JSON/body가 400으로 떨어지는가
- 마이그레이션 미적용이 500으로 터지지 않는가
- 녹음 파일 업로드와 DB insert 사이 실패가 추적 가능한가
- RLS와 관리자 인증이 빠진 API가 없는가

통과 기준:
- 신규 Admin CRM API 전부 `verifyAdmin()` 사용
- 신규 테이블 RLS enable 및 admin policy 존재
- 저장소 함수 단위 테스트 존재
- lint/build 통과

---

## 10. 단계별 실행 계획

### Phase 0 - 현재 적용됨

완료 기준:
- `기록` 탭 추가
- `crm_customer_events` 마이그레이션 추가
- private recording bucket 추가
- 회의록/녹음/간단 메모 입력 및 목록 조회
- 마이그레이션 미적용 시 friendly health 처리

남은 운영 작업:
- Supabase 프로젝트에 migration 적용
- production storage bucket 설정 확인
- 실제 동료 계정으로 업로드 smoke test

### Phase 1 - 고객 360 연결

목표:
- 고객 상세 드로어에서 최근 CRM 기록을 읽는다.
- 리드/고객 행에서 "기록 추가"가 바로 열린다.
- 미완료 다음 액션을 고객별로 보여준다.

작업:
- `GET /api/admin/crm/events?targetType=&targetId=`를 고객 상세에 연결
- 고객/리드 테이블 행에 최근 기록 시간과 리스크 badge 추가
- 저장 후 고객 상세 캐시 무효화
- 기록 입력의 대상 선택을 고객/리드 자동검색으로 교체
- unknown 기록을 고객에 연결하는 action 추가

완료 기준:
- 리드 상세에서 회의록 저장 후 바로 타임라인에 보임
- NEO 계정 상세에서도 자체 CRM 기록은 추가 가능
- 동료가 raw id 없이 학원/기관명으로 기록을 연결
- 외부 CRM 읽기 실패와 자체 기록 실패가 분리 표시

### Phase 2 - 다음 액션 CRM화

목표:
- "미팅 후 액션"을 CRM 홈의 1급 업무 큐로 만든다.
- 담당자와 기한이 있는 후속 액션을 완료 처리한다.

작업:
- `crm_tasks` 마이그레이션
- event 저장 시 next action을 task로 materialize
- `/api/admin/crm/tasks`
- CRM 홈 카드와 고객 360 task list
- task 완료, 재배정, 기한 변경 API와 UI

완료 기준:
- 동료가 오늘 할 일을 CRM 홈에서 바로 확인
- task 완료 시 이벤트 기록과 task 상태가 일관됨
- 지연 task가 리스크 큐에 반영됨

### Phase 3 - 동기화/매칭 정리

목표:
- 시트/OCRM/HQ CRM이 자체 CRM을 방해하지 않고 보강만 하도록 한다.
- 매칭되지 않은 원천 데이터를 정리한다.

작업:
- `crm_source_links` 커버리지 지표
- `연동` 탭에 미연결 회의/고객/외부 계정 inbox
- `crm_write_requests` 초안 생성 UI
- 외부 source freshness banner

완료 기준:
- 매칭률과 stale source가 보임
- 외부 CRM 수정은 직접 save가 아니라 요청 큐로 감
- unmatched 데이터를 삭제하지 않고 운영 큐에 남김

### Phase 4 - 녹음/회의록 intelligence

목표:
- 녹음과 회의록을 다음 액션, 리스크, FAQ, 고객 인사이트로 재사용한다.

작업:
- `crm_event_attachments`
- `crm_event_transcripts`
- STT job queue
- 요약/결정/리스크/다음 액션 추출
- 사람이 수정한 최종 요약 저장

완료 기준:
- 녹음 업로드 후 transcript status가 보임
- AI 추출 결과는 초안으로 표시
- 사람이 승인한 요약만 CRM 신뢰 데이터로 승격

### Phase 5 - Account 360 read model

목표:
- 리드, 외부 고객, 딜, 매출, 활동, 다음 액션을 하나의 고객 화면에서 본다.

작업:
- Account 360 read repository 또는 DB view
- 통합 고객 검색
- 통화별 금액 분리 표시
- 헬스/리스크 rule engine
- 인사이트 집계

완료 기준:
- 한 고객 화면에서 최근 미팅, 다음 액션, 외부 CRM 상태, 돈흐름을 확인
- 시트/OCRM/HQ CRM은 출처와 동기화 시점이 표시됨
- 이중계상 방지와 unmatched 표시가 적용됨

---

## 11. 하지 말 것

- 외부 CRM 전체를 복제해서 새 Salesforce처럼 만들지 않는다.
- 시트와 자체 CRM을 동시에 쓰기 가능한 이중장부로 두지 않는다.
- 녹음 파일 public URL을 만들지 않는다.
- 고객 매칭이 안 된 데이터를 조용히 버리지 않는다.
- 출처가 다른 통화를 합산한 grand total을 만들지 않는다.
- owner가 없는 수기 테이블을 늘리지 않는다.
- AI 요약을 사람이 확인한 사실처럼 표시하지 않는다.
- 마이그레이션 없는 UI만 먼저 만들지 않는다.

---

## 12. 구현 체크리스트

신규 CRM 백엔드 작업마다 확인:

- [ ] `app/api/admin/crm/**` API에 관리자 인증이 있다.
- [ ] 작성자/수정자 감사 필드는 인증 컨텍스트에서 채운다.
- [ ] Supabase 접근이 repository에 모여 있다.
- [ ] 마이그레이션 파일이 `supabase/migrations/`에 있다.
- [ ] RLS enable과 admin policy가 있다.
- [ ] missing migration 상태가 friendly response로 처리된다.
- [ ] 외부 원천 실패가 자체 CRM 기능 전체 실패로 번지지 않는다.
- [ ] 파일 업로드는 MIME/크기 제한을 검증한다.
- [ ] 업로드 성공 후 DB 저장 실패의 orphan cleanup 정책이 있다.
- [ ] private file은 signed URL로만 조회한다.
- [ ] 리스트 API는 limit/offset 또는 cursor가 있다.
- [ ] 테스트가 repository 또는 API의 핵심 분기를 덮는다.
- [ ] `npx eslint app components lib --max-warnings=0` 통과
- [ ] `npm run build` 통과

---

## 13. 결정 필요 사항

1. Account 360 스파인 형태

   초기에는 repository/read model로 충분한가, 아니면 `account_master` DB view를 먼저 둘 것인가.

2. 다음 액션 승격 시점

   `next_actions` JSON을 얼마나 오래 유지하고, 언제 `crm_tasks`로 분리할 것인가.

3. 녹음 보존 정책

   보존 기간, 삭제 권한, 다운로드 허용 여부, 대용량 파일 처리 방식을 정해야 한다.

4. STT/요약 제공자

   한국어 회의록 품질, 비용, 개인정보 처리, 실패 시 fallback을 기준으로 고른다.

5. 외부 CRM write request 운영자

   `crm_write_requests`를 누가 승인하고 실제 외부 CRM 반영 여부를 어떻게 확인할지 정한다.

6. 동료별 owner 매핑

   Admin 사용자, NEO owner, 리드 `assigned_to`를 어떻게 연결할지 정해야 "내 고객" 큐가 정확해진다.
