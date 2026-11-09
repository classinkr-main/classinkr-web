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

  it("does not read a word inside another word as a different topic (round 19)", () => {
    // "그리고"의 '그리'는 화면 공유 위에 그리기가 아니다.
    expect(
      find("I wanted to show a Netflix scene ㅎㅎ 근데 screen share 하면 students only see black screen ㅋㅋ 그리고 Netflix 수업에서 보여주는 거 copyright OK예요?")
    ).toBe("netflix-screen-share-black-drm-copyright")
    // 'iPad'의 'ip'는 IP 주소가 아니고, '로그인 ID'의 '로그'는 크래시 로그가 아니다.
    const mdm = "지난주 이 채팅에서 'iPad 앱은 MDM의 Managed App Configuration으로 기관 정보와 로그인 ID를 미리 넣어 배포할 수 있다'는 답을 받았습니다."
    expect(find(mdm)).toBe("ipad-mdm-appconfig-prior-answer")
    // 웹 라이브 시청자 채팅을 통째로 끄는 질문은 도배 대응 답이 아니다.
    expect(find("링크로 중계하는 기능(웹 라이브 맞죠?)에서 시청자 채팅을 막고 싶습니다.")).not.toBe("web-live-viewer-chat-spam-controls")
  })

  it("keeps round-19 answers from catching neighbouring questions (fact-check)", () => {
    // '자동'만으로 자동 채점 질문을, '탈퇴'만으로 본인 계정 탈퇴 질문을 받지 않는다.
    expect(find("숙제 제출하면 자동으로 채점되나요?")).not.toBe("homework-draft-auto-submit-deadline")
    expect(find("탈퇴하면 제 정보 다 지워져요?")).not.toBe("former-students-data-retention-law")
    // 다운로드를 막고 싶다는 관리 질문, 녹화 중에 걸어 다니는 질문, 수업 녹음이 끊긴 질문은 각 답이 아니다.
    expect(find("강사들이 녹화본을 다운로드 못 하게 제한하고 싶어요")).not.toBe("recording-download-limit-exceeded")
    expect(find("녹화할 때 강사가 걸어 다니면 카메라가 auto로 따라가나요?")).not.toBe("what-does-recording-geolda-mean")
    expect(find("지난번 수업 녹음된 부분이 중간에 끊겨서 안 들려요")).not.toBe("voice-homework-length-limit-prior-answer")
    // 학원 교실 두 곳의 빈 화면은 기관 중복이 아니고, 수업 중 작은 카메라 창은 다시보기 PIP가 아니다.
    expect(find("학원 교실 두 개에서 칠판 화면이 빈 화면으로 나와요")).not.toBe("duplicate-academy-org-empty-one")
    expect(find("수업 중에 선생님 영상이 작은 창으로만 보여요 크게 보려면?")).not.toBe("replay-picture-in-picture-pip")
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
