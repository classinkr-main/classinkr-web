# 총판 정산 — 총판용 견적서와 미수금

기준 시점: 2026-10-23
범위: `/admin/quotes` 견적 상세의 총판 정산 영역, `총판 미수금` 탭, `/share/distributor-quote/[token]`

## 1. 돈의 흐름

- 회사가 하드웨어를 먼저 사 두고, 고객 결제는 회사가 한 번에 받는다.
- 그중 하드웨어 물량(AI Suite 포함)은 하드웨어 총판이 회사로 다시 입금한다.
  예: 고객 견적 630만원 → 총판이 회사로 530~550만원 입금.
- 이전 방식(총판이 먼저 사 두고 회사는 문서만 발행)과 반대 방향이므로, 견적마다 "총판에게서 받을 돈"을 미수금으로 추적한다.

## 2. 총판용 견적서

- 고객 견적서와 같은 양식(`QuoteDocumentPreview`)이고 금액만 다르다. 수신처는 총판, 참조란은 고객사다.
- 기본 대상 품목: `itemType=hardware` + AI Suite(`online-suite-monthly`). 설치·교육 등은 기본 제외이고 줄마다 포함 여부를 바꿀 수 있다.
- 총판 단가는 견적마다 직접 입력하거나 **총판 단가 템플릿**(품목 코드 × 최소 구매 대수 → 단가)으로 채운 뒤 고객별로 덮어쓴다.
- 고객 단가·고객 합계는 총판 문서에 싣지 않는다.

## 3. 발행 시점

| 설정 | 동작 |
| --- | --- |
| 고객 동의 시 자동 발행 | 고객이 공유 링크에서 "이 견적으로 진행"을 누르면 자동 발행·발송 |
| 설치 완료 시 발행 | 견적 상세에서 "설치 완료 → 총판 견적서 발행"을 누르면 발행·발송 |
| 직접 발행 | "지금 발행"을 누를 때만 |

- 발행 = 공유 토큰 생성 + 총판 이메일 발송(이메일이 있고 자동 발송이 켜져 있을 때) + 운영 알림.
- 총판 금액을 저장한 뒤 고객 견적 버전이 바뀌었거나 총판 단가가 비어 있으면 자동 발행하지 않고
  `review_required_reason`과 재확인 알림을 남긴다. 금액을 다시 저장하면 해소된다.
- 이메일 실패는 발행을 되돌리지 않는다. 화면에서 링크를 복사해 전달하거나 메일을 다시 보낸다.
- 발행 후에는 금액을 고치지 않는다. 바꾸려면 정산을 취소(입금 기록이 없을 때만)하고 다시 설정한다.

## 4. 미수금

- 상태: 발행 전 → 입금 대기 → 일부 입금 → 입금 완료(또는 취소).
- 입금은 견적 상세의 총판 정산 영역에서 금액·입금일로 기록한다. 부분 입금은 누적된다.
- `총판 미수금` 탭은 받을 금액, 기한 경과 금액, 건별 남은 금액을 보여 주고 행을 누르면 해당 견적으로 이동한다.

## 5. 코드 위치

- 규칙(순수): `lib/distributor-settlements.ts`
- 저장소: `lib/repositories/distributor-settlements.ts`
- 발행 서비스: `lib/server/distributor-settlement-issue.ts`(고객 동의 훅: `app/api/share/quote/[token]/accept/route.ts`)
- API: `app/api/admin/quotes/[id]/distributor-settlement/**`, `app/api/admin/distributor-receivables`, `app/api/admin/distributor-price-templates/**`
- 마이그레이션: [20261023_distributor_settlements.sql](../../supabase/migrations/20261023_distributor_settlements.sql)
