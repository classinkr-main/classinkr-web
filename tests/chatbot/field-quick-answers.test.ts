import { describe, expect, it } from "vitest"

import { findFieldQuickAnswer } from "@/lib/chatbot/quick-answers-field"

// 정해 둔 답은 질문을 소문자로 바꿔 판별한다(서비스와 같은 입력).
const find = (question: string) => findFieldQuickAnswer(question.toLowerCase())?.id ?? null

describe("field quick answers", () => {
  it("does not read a word inside another word as a different topic", () => {
    // "리스크"의 '리스'는 리스 계약이 아니다.
    expect(
      find("환율이 오르면 갱신 때 단가가 바뀔 수 있답니다. 우리가 환율 리스크까지 떠안는 겁니까? 3년 내내 원화 고정가로 묶을 수 있는지")
    ).toBe("contract-currency-exchange-rate")
    expect(find("칠판을 리스로 들이면 세금계산서는 누가 발행해요?")).toBe("board-lease-tax-invoice-subscription")
    // "handshake"의 'sha', "로그인"의 '로그'는 설치 파일 서명이나 크래시 로그가 아니다.
    expect(find("구형 Android 태블릿(Android 7.1.2)에서 로그인 단계에서 'SSL handshake failed' 오류가 뜹니다. iPad는 정상입니다.")).toBe(
      "android7-ssl-handshake-min-os"
    )
    // "프로그램"의 '램'은 칠판 메모리 사양 질문이 아니다.
    expect(find("칠판 페이지가 스무 장쯤 넘어가면 판서가 늦게 따라오고 몇 명은 튕겨요! 프로그램이 무거워지는 겁니까!")).toBe(
      "many-board-pages-lag-students-drop"
    )
  })

  it("does not read a word inside another word as a different topic (round 18)", () => {
    // 'blocked'의 locked는 계정 잠금이 아니다(실수로 내보낸 학생이 다시 들어올 수 있는지 묻는 말).
    expect(find("I wanted to put a student on stage, 근데 wrong button 눌러서 그 student가 class에서 나가졌어요!! Is she blocked forever??")).toBe(
      "student-removed-by-mistake-on-stage"
    )
    // "사전 검증"의 '사전'은 시험 부정행위 감지가 아니다.
    expect(
      find("체험 계정으로 동시 접속 약 60명 규모 테스트를 할 수 있는지, 테스트용 기기나 자동화 스크립트로 접속시키는 게 허용되는지, 사전 검증 절차가 있는지 궁금합니다.")
    ).toBe("trial-load-test-automation-tos")
    // 발표자 뽑기(랜덤 선택) 답은 시험 문항 섞기 질문을 받지 않는다. '선생님'의 '선'은 케이블이 아니다.
    expect(find("시험 문제 랜덤으로 학생마다 다르게 낼 수 있나요?")).not.toBe("random-student-picker-tool")
    expect(find("선생님이 칠판 펜 하나 사다 달래요 어디서 사요")).not.toBe("board-cable-too-short-which-to-buy")
    // 화면 안쪽 김서림은 칠판 청소 문제가 아니다("겉을 닦아도"가 있어도).
    expect(find("학원 칠판 화면 안쪽에 뿌옇게 김이 서려서 글씨가 안 보입니다! 겉을 아무리 닦아도 안 없어져요!")).toBe(
      "board-screen-fog-condensation-inside"
    )
  })

  it("keeps an admin's parent-account question apart from a parent's follow-up on an earlier bot answer", () => {
    // "원장님께서 하라고 하셨다"는 지난 챗봇 안내가 아니다.
    expect(
      find("원장님께서 학부모님들도 아이 수업 상황을 앱으로 보실 수 있게 해 드리라고 하셨습니다. 학생 계정에 학부모님 계정을 연결하는 기능이 따로 있는지 궁금합니다.")
    ).toBe("link-parent-account-to-student")
    expect(find("지난번에 여기서 학부모 계정을 아이 계정에 연결하면 된다고 하셨잖아요. 그런데 연결하는 곳을 아무리 찾아도 없어요.")).toBe(
      "parent-account-link-prior-answer"
    )
  })

  it("keeps a teacher's two-academy account question apart from a parent's", () => {
    expect(find("아이가 수학 학원이랑 영어 학원을 다니는데 아이 계정 하나로 두 학원 수업이 다 보이는 건지, 학원마다 계정을 따로 만들어야 하는지요")).toBe(
      "one-child-account-two-academies"
    )
    expect(find("제가 두 학원에서 동시에 강의하는데, 한 계정으로 두 기관 수업을 다 관리할 수 있는지 궁금합니다.")).not.toBe(
      "one-child-account-two-academies"
    )
  })
})
