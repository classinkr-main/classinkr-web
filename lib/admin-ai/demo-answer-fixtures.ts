// 시안 모드의 묻기 카드 자료 — 담당자·정책 답·링크.
//
// 전부 샘플이다. 실제 담당표·문서를 읽지 않고, 사람 이름은 한 명도 넣지 않는다(역할 이름만).
// 정책 답은 규정처럼 보이지 않게 "샘플"임을 문장 안에 적고, 확정이 아닌 상태("확인 필요")로 둔다 — 시안의 문장이
// 실제 규정으로 읽혀 고객에게 전달되는 일을 막는다. 링크는 링크 목록(links.ts)의 id 만 쓴다.
import type { AnswerCard, ContactCard, LinksCard } from "./types"

export const DEMO_CONTACT_CARD: ContactCard = {
  title: "카메라 화질 문제 · 담당",
  target: { label: "카메라 화질", meta: "본사 담당 · 샘플 담당표" },
  primary: { role: "카메라 담당(본사)", channel: "사내 메신저 본사 지원 방 · 샘플 값" },
  backup: { role: "본사 CS 1차(본사)", channel: "사내 메신저 본사 지원 방 · 샘플 값" },
  prepare: ["촬영한 영상 또는 화면 캡처", "교실 번호와 카메라 모델", "문제가 생긴 시각"],
  checkedAt: "2026-11-10",
  note: "샘플 담당표입니다 · 실제 담당자는 담당표가 정해지면 같은 모양으로 나옵니다",
}

export const DEMO_ANSWER_CARD: AnswerCard = {
  title: "견적 할인 승인 규칙",
  target: { label: "정책 질문", meta: "샘플 답 · 실제 규정 아님" },
  answer:
    "시안 예시 답입니다. 실제 모드에서는 이 자리에 근거 문서에서 찾은 한두 문장이 나옵니다. 이 문장은 실제 규정이 아닙니다.",
  confidence: "needs-check",
  sources: [
    {
      title: "견적 할인 승인 규칙(샘플 문서)",
      where: "샘플 항목",
      kind: "internal",
      status: "needs-check",
      externalUse: false,
      linkId: "admin:docs",
    },
    {
      title: "상담 사례 3건(샘플)",
      kind: "consultation",
      status: "needs-check",
      externalUse: false,
    },
  ],
  note: "확정이 아니거나 사내 문서·상담 사례가 근거에 섞이면 고객에게 그대로 말하지 않습니다",
}

export const DEMO_LINKS_CARD: LinksCard = {
  title: "가격표 · 견적 링크",
  target: { label: "가격표", meta: "링크 3개" },
  items: [
    { linkId: "public:pricing" },
    { linkId: "public:brochure" },
    // 묻기 카드에는 화면 링크만 둔다 — "새로 만들기" 동작 주소는 묻기 답이 쓰기 화면을 바로 열게 된다.
    { linkId: "admin:quotes" },
  ],
  note: "고객용만 고객에게 보냅니다 · 어드민 화면은 내부용입니다",
}
