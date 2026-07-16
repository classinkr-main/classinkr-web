# 어드민 = 클래스인 코리아 세일즈·운영 허브 — 진단 브리프 (2026-07-10)

작성: 세일즈·운영·인에이블러 3개 트랙 코드 전수조사(파일:라인 대조) + 마스터플랜·머니메시·REV감사·운영캐논 교차검증. 기준 브랜치 `ALL_NEW1` @ `5b1eefc` 무렵.
시각 요약(팀 공유용): claude.ai 아티팩트 "클래스인 코리아 세일즈·운영 허브 진단"(별도 발행).

## 0. 한 줄 결론

**배선은 끝났다. 스위치 몇 개가 아직 꺼져 있다.** 리드부터 하드웨어까지 꿰는 뼈대(스파인)와 5단 핸드오프는 코드로 완성됐다. 남은 건 새로 만드는 게 아니라 켜는 것 — 운영 캐논 "만들지 말고 켜라"([classin-operating-canon-2026-07-02.md](classin-operating-canon-2026-07-02.md))가 지금 시스템의 정확한 상태다.

---

## 1. 왜 이 어드민이 팀의 허브가 되는가 (코드 근거)

| 기둥 | 근거 | 파일 |
|------|------|------|
| **하나의 고객, 하나의 키** | `normalizedAccountKey`가 리드·CRM·REV 원장·HW 출고를 같은 키로 묶고, `account_master`가 생애 매출(REV 기준)을 TS 합성 | [lib/branch/account-key.ts](../../lib/branch/account-key.ts):16, [lib/repositories/account-master.ts](../../lib/repositories/account-master.ts) |
| **한 번 입력하면 흐른다** | 리드 전환 1클릭→고객·딜 자동 생성→"견적 만들기"가 딜 프리필→수락 시 CRM 할일 자동 생성 | [convert-v2/route.ts](../../app/api/admin/leads/[id]/convert-v2/route.ts):215, [quotes/page.tsx](../../app/admin/quotes/page.tsx):143, [accept/route.ts](../../app/api/share/quote/[token]/accept/route.ts):32 |
| **열면 할 일이 줄 서 있다** | 3소스 규칙기반 우선순위 큐 + Overview 운영 스트립(커버리지·골든타임 임계값 색 경고) | [lib/crm/priority.ts](../../lib/crm/priority.ts), [app/admin/overview/page.tsx](../../app/admin/overview/page.tsx):848 |
| **사람마다 다른 화면** | 6역할 분화(지사장은 보되 목표설정 불가), API·nav 정합성을 회귀 테스트로 매 커밋 고정, 파트너 UI째 분리 | [lib/admin-auth.ts](../../lib/admin-auth.ts):51, [tests/admin/crm-role-matrix.test.ts](../../tests/admin/crm-role-matrix.test.ts) |
| **숫자를 믿을 수 있다** | 통화 3종($오더/¥REV/₩딜) 물리 분리·합산 금지 + 확정매출 단일 캐논으로 화면 간 숫자 일치(회귀 테스트로 잠금) | [lib/crm/money-format.ts](../../lib/crm/money-format.ts), [lib/branch/computations/rev-confirmed.ts](../../lib/branch/computations/rev-confirmed.ts) |

이 일관성("자동은 제안·매칭·초안까지, 확정은 사람이 원클릭")이 5개 핸드오프 전부에서 관철된다 — 여러 세션이 순차 작업한 저장소치고 이례적으로 잘 지켜졌다.

---

## 2. 페르소나별 사용 시나리오 (하루 동선)

- **세일즈 담당자** — 아침 큐(미응답 리드 상단) → 통화·전환 1클릭 → 견적 프리필 작성·발송 → 고객 수락(할일 자동) → **[끊김] 계약 전환 버튼이 없다.**
- **운영·재고 담당자** — Overview 스트립 → 위치맵·예상출고 FIFO 미리보기 → 출고 기록(판매 시 CRM 오더 확인 게이트) → **[끊김] 출고↔매출 대사가 진단만, 딥링크 없음.**
- **매출 검수자** — REV 매트릭스(고객×월) → 확도 태깅(예정/고확도/확정, 수기) → 입력 큐 체크→적용 게이트(사람) → 주간 마감 자동 스냅샷(금 23:30 KST).
- **팀장·대표** — Overview 핵심지표 → KPI 병목 매트릭스 → 이상치 담당자 클릭 → REV 렌즈 드릴다운 / 커버리지 밴드(매칭률 낮으면 매출 누락).

자동/수동 경계·딥링크 지도 상세는 3개 트랙 보고 원문 참조(세일즈 §3~4, 운영 §7).

---

## 3. 아쉬운 점 & 디벨롭 (우선순위)

### 지금 당장 걸림 (치명)

1. **견적 수락 → 계약 전환 버튼이 UI에 없다.** 유일 트리거 [QuoteEditor.tsx](../../components/portal/crud/QuoteEditor.tsx)가 어디서도 import되지 않는 고아. 세일즈 사이클 최고 모멘텀이 끊김. → 도달 가능한 화면(딜 워크스페이스·견적 목록)에 전환 버튼 배선(API [convert/route.ts](../../app/api/portal/quotes/[id]/convert/route.ts)는 이미 동작).
2. **`crm_tasks` 마이그레이션 미적용(작성 후 13일).** 견적 수락·계약 서명 할일이 fail-soft로 조용히 안 쌓일 수 있음 — 핸드오프 신경계가 꺼져 있을 수 있다. → 마이그레이션 적용을 릴리스 체크리스트로 승격 + 큐 적재 스모크 1건.
3. **계약 셀프서명 비가동 + 계약서 탭 레거시.** [share/contract/[token]/page.tsx](../../app/share/contract/[token]/page.tsx):105에 "서명 UI 곧 활성화" 문구가 고객에게 노출. → V2 계약 흐름으로 교체 또는 문구 정리+redirect 스텁.

### 곧 걸림 (주의)

- **견적/계약 채번 V1·V2 중복 위험** — 두 테이블이 각자 `count+1`. → 시퀀스 RPC 통합.
- **딜 3분할 FK 없음** — `crm_deals` vs Portal `deals` vs REV 시트 딜. → 읽기 뷰부터.
- **알림 push가 핵심 핸드오프에 미연결** — 6채널 인프라([lib/notifications/emit-event.ts](../../lib/notifications/emit-event.ts))는 성숙한데 견적 수락·계약 서명엔 미호출. → 배선만 추가.
- **CRM ↔ 메시징 구독자 단절** — 리드를 이메일에 태우려면 수기 재입력.
- **출고↔매출 대사 존재성만** — 금액 대조 없음(환율정책 대기) + 그레인 마이그레이션 대기.
- **CRM 홈 숫자 vs 매출장부 원천 상이** — 외부 CRM 오더 vs REV 캐논, 구분 라벨 필요.

### 있으면 좋음

- 모바일 워크벤치(매출장부·하드웨어 데스크톱 전용) → 조회부터 카드뷰
- 카카오·SMS 실전 가동(현재 이메일만)
- 대형 파일 계속 분해 + `import/no-cycle` eslint 가드
- 딜 파이프라인 수동 조정(현재 읽기전용 칸반)

---

## 4. 다음 3개 스위치 (만들지 말고 켜라)

셋 다 새 기능이 아니라 이미 놓인 배선 점화 — 저비용·고효과:

1. **신경계 켜기** — `crm_tasks` 마이그레이션 적용(코드 완료, 적용만).
2. **세일즈 루프 닫기** — 견적 수락 화면에 계약 전환 버튼 배선(API·stage 전진 완료).
3. **종 울리기** — 견적 수락·계약 서명에 `emit-event` 연결(6채널 인프라 완비).

---

## 5. 이 브리프 이후 저장소 진행 (병행 세션)

이 진단 시점 직후 병행 세션이 결정 대기 항목 일부를 해소: 확정매출 캐논 확립(`f63c976`), HW 재고 SSOT 원장 전환(`c7ead7c`), HW↔REV 대사 신설(`20178db`), 부모↔자식 순환 참조 제거(`5b1eefc`). 위 "곧 걸림"의 그레인·대사 항목은 관련 마이그레이션 운영 적용으로 자동 해소 예정.
