import { describe, expect, it } from "vitest"

import { buildAssigneeResolver, type TeamRosterMember } from "@/lib/admin-calendar/people"

// data/team-calendars.json 의 실제 명부 일부 — 표기 변형을 실물로 검증하기 위함.
const ROSTER: TeamRosterMember[] = [
  { name: "박한", email: "han.park@classin.com" },
  { name: "신희성", email: "heesung.shin@classin.com" },
  { name: "정규성", email: "gyusung.jung@classin.com" },
  { name: "김민재", email: "minjae.kim@classin.com" },
  { name: "문준혁", email: "junhyuk.mun@classin.com" },
]

const resolve = buildAssigneeResolver(ROSTER)

describe("담당자 이름 정규화", () => {
  it("한글 캐논 이름은 그대로 통과한다", () => {
    expect(resolve("박한")).toBe("박한")
    expect(resolve("  정규성  ")).toBe("정규성")
  })

  it("쇼룸 ICS 의 이메일 표기를 캐논 이름으로 눕힌다", () => {
    expect(resolve("han.park@classin.com")).toBe("박한")
    expect(resolve("JUNHYUK.MUN@classin.com")).toBe("문준혁")
  })

  it("노션 people 의 로마자 표기를 캐논 이름으로 눕힌다", () => {
    // 실제 노션 워크스페이스에서 관측된 표기 3종.
    expect(resolve("GyusungJung")).toBe("정규성")
    expect(resolve("Heesung Shin")).toBe("신희성")
    expect(resolve("Minjae Kim")).toBe("김민재")
  })

  it("성-이름 순서가 뒤집혀도 같은 사람으로 본다", () => {
    // 소스마다 한국 이름의 라틴 표기 순서가 다르다 — 토큰을 정렬해 비교하는 이유.
    expect(resolve("Park Han")).toBe("박한")
    expect(resolve("Shin Heesung")).toBe("신희성")
  })

  it("명부에 없는 사람은 원문을 유지한다", () => {
    // 매칭 실패가 담당자를 지워버리면 일정의 책임자가 사라진다.
    expect(resolve("CHASUJIN")).toBe("CHASUJIN")
    expect(resolve("Moon_Class")).toBe("Moon_Class")
    expect(resolve("outside@partner.co.kr")).toBe("outside@partner.co.kr")
    expect(resolve("차수진")).toBe("차수진")
  })

  it("빈 값은 null 로 떨어진다", () => {
    expect(resolve("")).toBeNull()
    expect(resolve("   ")).toBeNull()
    expect(resolve(null)).toBeNull()
    expect(resolve(undefined)).toBeNull()
  })

  it("서로 다른 사람을 뭉개지 않는다", () => {
    // 김민재/문준혁은 토큰이 겹치지 않아야 한다 — 정렬 비교가 과하게 관대해지면 여기서 깨진다.
    expect(resolve("Minjae Kim")).not.toBe(resolve("Junhyuk Mun"))
    expect(resolve("Junhyuk Mun")).toBe("문준혁")
  })

  it("빈 명부에서는 아무것도 바꾸지 않는다", () => {
    const noop = buildAssigneeResolver([])
    expect(noop("GyusungJung")).toBe("GyusungJung")
    expect(noop("박한")).toBe("박한")
  })
})
