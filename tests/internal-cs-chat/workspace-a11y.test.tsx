import fs from "node:fs"
import path from "node:path"

import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

import ConversationSwitcher from "@/components/admin/cs-chat/components/ConversationSwitcher"
import ConversationTable from "@/components/admin/cs-chat/components/ConversationTable"
import ToolbarMoreMenu, { SHORTCUT_LIST } from "@/components/admin/cs-chat/components/ToolbarMoreMenu"
import WorkspaceHeader from "@/components/admin/cs-chat/components/WorkspaceHeader"
import {
  formatEvidenceMix,
  formatRelativeTime,
  formatTagLabel,
} from "@/components/admin/cs-chat/formatters"
import QueuePanel from "@/components/admin/cs-chat/panels/QueuePanel"
import type { InternalCsConversation } from "@/components/admin/cs-chat/types"

const NOW = Date.parse("2026-10-15T12:00:00Z")

function conversation(overrides: Partial<InternalCsConversation> = {}): InternalCsConversation {
  return {
    id: "conv-1",
    title: "카메라가 안 켜져요",
    status: "queue",
    priority: "normal",
    assignee_user_id: null,
    assignee_name: null,
    tags: ["area:camera", "bridge:channel-talk", "evidence:hq_pending"],
    customer_context: {},
    last_message_at: "2026-10-15T09:00:00Z",
    created_at: "2026-10-15T08:00:00Z",
    updated_at: "2026-10-15T09:00:00Z",
    archive_reason: null,
    ...overrides,
  }
}

describe("대기열 표(IC-22·IC-24·IC-26)", () => {
  it("행마다 키보드로 닿는 제목 버튼, 한글 태그, 상대 시각, 대기 경과, 보관 버튼을 둔다", () => {
    const html = renderToStaticMarkup(
      <ConversationTable
        conversations={[conversation()]}
        emptyLabel="없음"
        onSelect={vi.fn()}
        onRequestHq={vi.fn()}
        onArchive={vi.fn()}
        now={NOW}
      />
    )
    expect(html).toContain('aria-label="카메라가 안 켜져요 대화 열기"')
    expect(html).toContain("카메라 · 채널톡 연동 · 본사 확인 대기")
    expect(html).not.toContain("area:camera")
    expect(html).toContain("3시간 전")
    expect(html).toContain("대기 경과")
    expect(html).toContain('aria-label="카메라가 안 켜져요 보관"')
    expect(html).toContain("<caption")
  })

  it("종료된 상담에는 대기 경과를 비우고 보관 버튼을 그리지 않는다", () => {
    const html = renderToStaticMarkup(
      <ConversationTable
        conversations={[conversation({ status: "archived" })]}
        emptyLabel="없음"
        onSelect={vi.fn()}
        onArchive={vi.fn()}
        now={NOW}
      />
    )
    expect(html).not.toContain("보관</button>")
  })

  it("대기열 탭에 떠 있는 아카이브 버튼이 없고, 보관하면 되돌리기 띠가 뜬다", () => {
    const base = {
      conversations: [conversation()],
      filter: "all" as const,
      chipCounts: { all: 1, waiting: 1, progress: 0, closed: 0 },
      hqBusyId: null,
      onNewConversation: vi.fn(),
      onFilterChange: vi.fn(),
      onSelect: vi.fn(),
      onRequestHq: vi.fn(),
    }
    const idle = renderToStaticMarkup(<QueuePanel {...base} onArchive={vi.fn()} />)
    expect(idle).not.toContain("아카이브")
    expect(idle).not.toContain("archive-undo-band")
    expect(idle).toContain("정렬")
    expect(idle).toContain("오래 기다린 순")
    const archived = renderToStaticMarkup(
      <QueuePanel {...base} archivedBand={{ id: "conv-1", title: "카메라가 안 켜져요" }} onUndoArchive={vi.fn()} />
    )
    expect(archived).toContain('data-testid="archive-undo-band"')
    expect(archived).toContain("을 보관했어요")
    expect(archived).toContain("되돌리기")
  })
})

describe("표시 포맷", () => {
  it("태그를 한글로, 모르는 값은 접두사를 뗀다", () => {
    expect(formatTagLabel("internal_cs")).toBe("내부 CS")
    expect(formatTagLabel("area:billing")).toBe("결제·정산")
    expect(formatTagLabel("area:something_new")).toBe("something new")
    expect(formatTagLabel("bridge:channel-talk")).toBe("채널톡 연동")
    expect(formatTagLabel("plain")).toBe("plain")
  })

  it("상대 시각", () => {
    expect(formatRelativeTime("2026-10-15T11:59:50Z", NOW)).toBe("방금")
    expect(formatRelativeTime("2026-10-15T11:48:00Z", NOW)).toBe("12분 전")
    expect(formatRelativeTime("2026-10-15T09:00:00Z", NOW)).toBe("3시간 전")
    expect(formatRelativeTime("2026-10-11T12:00:00Z", NOW)).toBe("4일 전")
    expect(formatRelativeTime(null, NOW)).toBe("—")
    expect(formatRelativeTime("nope", NOW)).toBe("—")
  })

  it("근거 믹스는 합계 대신 비율을 적는다(loop-4)", () => {
    expect(formatEvidenceMix({ knowledge: 5, docs: 3, channel: 1, none: 1 })).toBe(
      "정본 5 (50%) · 문서 3 (30%) · 상담이관 1 (10%) · 근거없음 1 (10%)"
    )
    expect(formatEvidenceMix({ knowledge: 0, docs: 0, channel: 0, none: 0 })).toBeUndefined()
  })
})

describe("알림 띠·메뉴·스위처 접근성(IC-22·IC-23)", () => {
  const header = {
    loading: false,
    isPending: false,
    regressionPendingCount: 0,
    onRefresh: vi.fn(),
    onOpenTools: vi.fn(),
  }

  it("오류는 role=alert, 안내는 role=status 로 읽히고 닫기 버튼이 있다", () => {
    const html = renderToStaticMarkup(
      <WorkspaceHeader {...header} error="저장 실패" notice="저장했어요" onDismissError={vi.fn()} onDismissNotice={vi.fn()} />
    )
    expect(html).toMatch(/role="alert"[^>]*>.*저장 실패/)
    expect(html).toMatch(/role="status"[^>]*>.*저장했어요/)
    expect(html).toContain('aria-label="오류 알림 닫기"')
    expect(html).toContain('aria-label="안내 알림 닫기"')
    // 비어 있어도 영역은 떠 있다(변화를 읽기 위해).
    const empty = renderToStaticMarkup(<WorkspaceHeader {...header} error={null} notice={null} />)
    expect(empty).toContain('role="alert"')
    expect(empty).toContain('role="status"')
  })

  it("대화 탭에서는 제목 띠를 그리지 않는다(대화 영역 확보)", () => {
    const html = renderToStaticMarkup(<WorkspaceHeader {...header} compact error={null} notice={null} />)
    expect(html).not.toContain("<header")
    expect(html).toContain("CS 코파일럿")
  })

  it("더보기 메뉴는 단축키 목록을 갖고, 스위처는 listbox 키보드 규약을 쓴다", () => {
    expect(SHORTCUT_LIST.map((item) => item.keys)).toEqual(
      expect.arrayContaining(["Enter", "Shift + Enter", "Alt + Shift + N", "Esc", "?"])
    )
    const menu = renderToStaticMarkup(<ToolbarMoreMenu conversationTitle="제목" archived={false} onArchive={vi.fn()} />)
    expect(menu).toContain('aria-haspopup="menu"')
    expect(menu).toContain('aria-label="더보기"')
    const switcher = renderToStaticMarkup(
      <ConversationSwitcher label="제목" conversations={[conversation()]} selectedId="conv-1" onSelect={vi.fn()} />
    )
    expect(switcher).toContain('aria-haspopup="listbox"')
  })
})

describe("글자 크기·대비 규칙(IC-26)", () => {
  const root = path.resolve(__dirname, "../../components/admin/cs-chat")
  function collect(dir: string): string[] {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) return collect(full)
      return /\.tsx$/.test(entry.name) && entry.name !== "demo-data.ts" ? [full] : []
    })
  }
  const files = collect(root)

  it("읽는 글자에 가장 흐린 회색(#A39E98)을 쓰지 않는다", () => {
    const offenders = files.filter((file) => /text-\[#A39E98\]|placeholder:text-\[#A39E98\]/.test(fs.readFileSync(file, "utf8")))
    expect(offenders).toEqual([])
  })

  it("10px 미만 글자 클래스가 없다", () => {
    const offenders = files.filter((file) => /text-\[(?:[0-9]|9\.5|8\.5)px\]/.test(fs.readFileSync(file, "utf8")))
    expect(offenders).toEqual([])
  })
})
