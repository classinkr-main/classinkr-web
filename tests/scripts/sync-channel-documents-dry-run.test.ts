import { afterEach, describe, expect, it, vi } from "vitest"

// scripts/sync-channel-documents.ts 를 --dry-run 으로 끝까지 돌려 연결을 본다 — 채널 API 는 가짜 fetch, DB 는 부르지 않는다.
// .env.local 은 읽지 않게 막고(existsSync false), DB 클라이언트를 만들면 시험이 실패한다. 글은 모두 샘플이다.

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>()
  return { ...actual, existsSync: () => false }
})
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => {
    throw new Error("dry-run 시험에서 DB 클라이언트를 만들면 안 된다")
  },
}))

const DOCUMENT_API = "https://document-api.channel.io/open/v1/spaces/$me/articles"

function paragraph(text: string) {
  return { type: "paragraph", content: [{ type: "text", attrs: { text } }] }
}

function heading(text: string, level = 2) {
  return { type: "heading", attrs: { level }, content: [{ type: "text", attrs: { text } }] }
}

const ARTICLES: Record<string, Record<string, unknown>> = {
  "9001": {
    id: "9001",
    state: "published",
    title: "수업 녹화 켜기(샘플)",
    body: [
      heading("녹화 켜기"),
      paragraph("수업 설정 화면에서 녹화 항목을 켭니다. 교사 계정으로 로그인합니다."),
      heading("게시 전 확인(내부용)"),
      paragraph("샘플내부점검문장 — 이 줄은 공개 본문에 들어가면 안 됩니다."),
      heading("녹화 파일 보기"),
      paragraph("녹화 목록에서 파일을 봅니다."),
    ],
  },
  "9002": {
    id: "9002",
    state: "draft",
    title: "칠판 PDF 올리기(샘플 초안)",
    body: [paragraph("칠판 도구의 파일 올리기를 눌러 PDF를 고릅니다. 올린 PDF는 페이지로 넘깁니다.")],
  },
}

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } })
}

async function runDryRun(extraArgs: string[]) {
  const logs: string[] = []
  const push = (...parts: unknown[]) => logs.push(parts.map(String).join(" "))
  vi.spyOn(console, "log").mockImplementation(push)
  vi.spyOn(console, "warn").mockImplementation(push)
  vi.spyOn(console, "error").mockImplementation(push)
  // 실제 실행처럼 그 자리에서 멈추게 던진다(모듈 머리의 인자 검사가 멈추면 import 가 실패한다).
  vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
    push(`exit ${code}`)
    throw new Error(`process.exit(${code})`)
  }) as typeof process.exit)
  const fetched: string[] = []
  vi.stubGlobal("fetch", async (input: string | URL) => {
    const url = new URL(String(input))
    fetched.push(url.pathname)
    if (!url.href.startsWith(DOCUMENT_API)) throw new Error(`시험에서 부르면 안 되는 주소: ${url.host}`)
    const id = url.pathname.split("/").at(-1) ?? ""
    if (id === "articles") return jsonResponse({ articles: Object.values(ARTICLES).map(({ id: articleId, state, title }) => ({ id: articleId, state, title })) })
    const article = ARTICLES[id]
    if (!article) return new Response("not found", { status: 404 })
    return jsonResponse({ article })
  })
  vi.stubEnv("CHANNEL_DOCS_ACCESS", "dummy-access")
  vi.stubEnv("CHANNEL_DOCS_ACCESS_SECRET", "dummy-secret")
  const argv = process.argv
  process.argv = [argv[0], "sync-channel-documents.ts", "--dry-run", "--dump", ...extraArgs]
  try {
    vi.resetModules()
    await import("../../scripts/sync-channel-documents").catch((error: unknown) => push(String(error)))
    await vi.waitFor(
      () => {
        if (!logs.some((line) => /Supabase write skipped|^exit /.test(line))) throw new Error("not finished")
      },
      { timeout: 5_000, interval: 20 }
    )
  } finally {
    process.argv = argv
  }
  return { output: logs.join("\n"), fetched }
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe("채널톡 동기화 dry-run", () => {
  it("기본은 published 만 — 초안은 받지도 않고, published 글의 내부 블록은 빼고 경고한다", async () => {
    const { output, fetched } = await runDryRun([])
    expect(output).toContain("selected 1 (published only)")
    expect(fetched.some((path) => path.endsWith("/9002"))).toBe(false)
    expect(output).toMatch(/- 9001: 수업 녹화 켜기\(샘플\) \(\d+ chars, unlisted\)/)
    expect(output).toMatch(/warning 9001: 내부 블록 1개/)
    expect(output).toContain("녹화 목록에서 파일을 봅니다.")
    expect(output).not.toContain("샘플내부점검문장")
  })

  it("--include-drafts 면 초안도 넣되 internal·noindex", async () => {
    const { output } = await runDryRun(["--include-drafts", "--public"])
    expect(output).toContain("selected 2 (drafts included as internal)")
    expect(output).toMatch(/- 9001: [^\n]*public\)/)
    expect(output).toMatch(/- 9002: [^\n]*internal, noindex\)/)
    expect(output).not.toContain("샘플내부점검문장")
  })

  it("--ids 로 초안을 집어도 --include-drafts 가 없으면 넣지 않는다", async () => {
    const { output } = await runDryRun(["--ids", "9002"])
    expect(output).toMatch(/skipped 9002 \(채널 상태 draft/)
    expect(output).toContain("fetched 0 document(s)")
  })

  it("--include-drafts 와 --published-only 를 같이 주면 받기 전에 멈춘다", async () => {
    const { output, fetched } = await runDryRun(["--include-drafts", "--published-only"])
    expect(output).toContain("exit 1")
    expect(fetched).toEqual([])
  })
})
