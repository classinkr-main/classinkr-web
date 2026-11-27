import { readFileSync, readdirSync } from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

import { answerTextHash } from "@/lib/chatbot/answer-index/hash"

/**
 * R3 b(카드 문체) 반박 검토: fixed 카드 글을 R1~R15 꼴로 다시 쓰면서 빠진 조작 사실을 되살렸는지 본다.
 * V-14·V-15 는 꼴만 보고 사실 보존은 보지 않아서, 다시 쓰기 전 글(24e6f4a4f)에 있던 버튼·경로·수치 가운데
 * 카드가 덮는다고 적은(covers) 것과 그 주제의 바로 할 일을 카드마다 적어 둔다.
 * 문구는 요체로 바뀌어도 되므로 버튼 이름·수치·화면 문구처럼 바뀌면 안 되는 토큰만 본다.
 */

const CARD_DIR = path.join(process.cwd(), "data/answer-index/cards")
const AUDIT_DIR = path.join(process.cwd(), "data/answer-index/audit")

type CardEntry = { id?: string; kind?: string; answer?: { text?: string; textHash?: string }; auditRef?: string }

function loadCards() {
  const byId = new Map<string, CardEntry>()
  for (const file of readdirSync(CARD_DIR)) {
    if (!file.endsWith(".json")) continue
    const entries = JSON.parse(readFileSync(path.join(CARD_DIR, file), "utf8")) as CardEntry[]
    for (const entry of entries) if (entry && typeof entry.id === "string") byId.set(entry.id, entry)
  }
  return byId
}

const REQUIRED: Record<string, string[]> = {
  // 이미 등록한 하위 계정의 권한 고치기·지우기와 권한 목록이 메뉴 묶음별이라는 설명
  "fixed:sub-account-admin": ["[편집]", "[삭제]", "메뉴 묶음별"],
  // 기관 전체 라이브 기본값을 바꾸는 곳(화면 이름 두 가지)
  "fixed:playback-no-permission": ["[일반 설정]", "'웹 생방송 다시 보기'", "'웹 라이브&플레이백'", "[수업 관리]에서는 [조작]"],
  // 판서만 지우는 버튼과 보호 잠금이 자동 삭제에서 빠진다는 것
  "fixed:storage-full-cleanup": ["[칠판 내용 및 수업자료 삭제하기]", "자동 삭제에서 빠"],
  // 010 의 맨 앞 0 을 빼고 10부터
  "fixed:classes-alone-in-room": ["010의 맨 앞 0을 빼고", "둘 다 맞을 수 있어요"],
  "fixed:class-not-exist": ["010의 맨 앞 0을 빼고"],
  // 강사 20분 전·학생 10분 전
  "fixed:teacher-link-not-opening": ["20분 전", "10분 전"],
  // 수업 중 장치 바꾸는 설정 창 왼쪽 메뉴
  "fixed:earphone-audio": ["[카메라]", "[마이크]"],
  // 캐시 지우는 곳
  "fixed:class-disconnect": ["[파일 전송]", "[캐시 파일]"],
  // 와이파이가 약할 때 조치
  "fixed:first-class-tips": ["핫스팟"],
  // 시험의 상호 열람 설정 위치
  "fixed:homework-peer-review-anonymous": ["[설정 더 보기]", "[숙제 내용, 성적 상호 열람 허용]"],
  // 녹화·스크린샷 지우는 곳
  "fixed:course-end-vs-delete": ["[스토리지]", "[수업 리소스]"],
  // 시험지 파일은 OMR 카드로
  "fixed:exam-per-question-points-partial-100": ["OMR 카드로 내는"],
  // 녹화 아이콘과 대량 작업(카드가 덮는다고 적은 것)
  "fixed:what-does-recording-geolda-mean": ["초록색", "[대량 작업]", "[학습 활동]"],
  // 클래스인 안에서 확인하는 데이터와 자동 발송을 나눔
  "fixed:parent-report-notice": ["권한 범위 안에서"],
  // 칠판 내용은 수업 화면 녹화에 남음
  "fixed:replay-black-screen": ["칠판 내용은 수업 화면 녹화에"],
  // 재설치 버튼 이름
  "fixed:board-app-white": ["[다운로드(64 bit)]", "[설치하기]"],
  "fixed:update-then-wont-open": ["[다운로드(64 bit)]", "Windows용", "[설치하기]"],
  // 고급 설정의 열람 항목
  "fixed:zoom-recording-import": ["저작권 보호 설정"],
  // 피드백을 남기는 두 방식
  "fixed:homework-feedback-hidden": ["피드백 항목에 코멘트"],
  // 다음 시험에서 정할 수 있는 설정
  "fixed:short-answer-case-punctuation-regrade": ["활동 종료 후 제출 허용", "답안과 설명 공개"],
  // 학번·태그는 선택 칸
  "fixed:student-import-partial": ["Student ID(학번)", "Tag(학생 태그)"],
  // 여러 강사를 한꺼번에 받을 때의 명단
  "fixed:teacher-two-academies": ["명단 하나로"],
  "fixed:chromebook-support": ["Android 10.0"],
}

describe("R3 rewritten fixed cards keep actionable facts", () => {
  const cards = loadCards()
  for (const [id, tokens] of Object.entries(REQUIRED)) {
    it(`${id} keeps ${tokens.join(", ")}`, () => {
      const card = cards.get(id)
      expect(card, id).toBeDefined()
      const text = card?.answer?.text ?? ""
      const missing = tokens.filter((token) => !text.includes(token))
      expect(missing, `${id} lost: ${missing.join(", ")}`).toEqual([])
    })
  }

  it("keeps the card text, its hash and the audit fix text in step for the restored cards", () => {
    const mismatched: string[] = []
    for (const id of Object.keys(REQUIRED)) {
      const card = cards.get(id)
      const text = card?.answer?.text ?? ""
      if (answerTextHash(text) !== card?.answer?.textHash) mismatched.push(`${id}: card hash`)
      const ref = card?.auditRef ?? ""
      const [file, answerId] = ref.replace(/^audit\//, "").split("#")
      if (!file || !answerId) continue
      const lines = readFileSync(path.join(AUDIT_DIR, file), "utf8").split("\n").filter(Boolean)
      const record = lines.map((line) => JSON.parse(line) as { answerId?: string; fix?: { text?: string; textHash?: string } }).find((r) => r.answerId === answerId)
      if (record?.fix?.text !== text) mismatched.push(`${id}: audit fix text`)
      if (record?.fix?.textHash !== card?.answer?.textHash) mismatched.push(`${id}: audit fix hash`)
    }
    expect(mismatched).toEqual([])
  })
})
