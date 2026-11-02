/**
 * 20261028_blog_posts_content_updated_at.sql 소스 계약.
 *
 * 트리거가 메타 컬럼(상태·대표 글·발행일·휴지통 등)을 보면 토글만으로 content_updated_at 이 올라가
 * 이 마이그레이션의 목적(사이트맵·dateModified 거짓 신호 제거)이 무너진다. DB 없이 원문으로 잠근다.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import { SCHEMA_CONTRACT_MIGRATIONS, SCHEMA_PROBES } from "@/lib/db/schema-contract"

const FILE = "supabase/migrations/20261028_blog_posts_content_updated_at.sql"
const BASE_SCHEMA = "supabase/migrations/20260610_blog_posts_backfill_schema.sql"

function readSql(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.replace(/--.*$/, ""))
    .join("\n")
}

const sql = readSql(FILE)

function triggerFunctionBody(): string {
  const match = /create\s+or\s+replace\s+function\s+public\.blog_posts_touch_content_updated_at\(\)[\s\S]*?\$\$([\s\S]*?)\$\$/i.exec(sql)
  if (!match) throw new Error("trigger function not found")
  return match[1]
}

const CONTENT_COLUMNS = [
  "title",
  "slug",
  "excerpt",
  "content_markdown",
  "content_html",
  "category",
  "image_url",
  "hero_image_url",
  "seo_title",
  "seo_description",
  "benefit_items",
  "target_reader",
]

const META_COLUMNS = [
  "status",
  "featured",
  "published_at",
  "published_by",
  "deleted_at",
  "created_at",
  "updated_at",
  "related_post_ids",
  "page_layout",
  "lead_magnet_slug",
  "cta_text",
  "cta_url",
  "cta_style",
  "tags",
  "read_time",
  "author_user_id",
  "view_count",
]

describe("blog_posts content_updated_at migration", () => {
  it("adds the column idempotently, backfills only empty rows, and sets the default after the backfill", () => {
    const addAt = sql.search(/add\s+column\s+if\s+not\s+exists\s+content_updated_at\s+timestamptz\s*;/i)
    const backfillAt = sql.search(
      /update\s+public\.blog_posts\s+set\s+content_updated_at\s*=\s*coalesce\(\s*updated_at\s*,\s*published_at\s*,\s*created_at\s*\)\s+where\s+content_updated_at\s+is\s+null/i,
    )
    const defaultAt = sql.search(/alter\s+column\s+content_updated_at\s+set\s+default\s+now\(\)/i)

    expect(addAt).toBeGreaterThanOrEqual(0)
    expect(backfillAt).toBeGreaterThan(addAt)
    // 기본값을 먼저 걸면 기존 행이 적용 시각으로 채워져 백필이 무력해진다.
    expect(defaultAt).toBeGreaterThan(backfillAt)
    // ADD COLUMN 자체에 default 를 붙이지 않는다(같은 이유).
    expect(sql).not.toMatch(/add\s+column\s+if\s+not\s+exists\s+content_updated_at\s+timestamptz\s+default/i)
  })

  it("bumps content_updated_at only when a content column changes", () => {
    const body = triggerFunctionBody()
    const compared = [...body.matchAll(/new\.(\w+)\s+is\s+distinct\s+from\s+old\.(\w+)/gi)].map((match) => {
      expect(match[1]).toBe(match[2])
      return match[1]
    })

    expect(compared.sort()).toEqual([...CONTENT_COLUMNS].sort())
    expect(body).toMatch(/new\.content_updated_at\s*=\s*now\(\)/i)
  })

  it("never looks at meta columns such as status, featured, published_at or deleted_at", () => {
    const body = triggerFunctionBody()
    for (const column of META_COLUMNS) {
      expect(body, column).not.toMatch(new RegExp(`\\b(?:new|old)\\.${column}\\b`, "i"))
    }
  })

  it("compares only columns that exist on blog_posts", () => {
    const base = readSql(BASE_SCHEMA)
    for (const column of CONTENT_COLUMNS) {
      expect(base, column).toMatch(new RegExp(`^\\s+${column}\\s+\\w`, "m"))
    }
  })

  it("installs the trigger before update and leaves the internal updated_at trigger alone", () => {
    expect(sql).toMatch(/drop\s+trigger\s+if\s+exists\s+blog_posts_content_updated_at\s+on\s+public\.blog_posts/i)
    expect(sql).toMatch(
      /create\s+trigger\s+blog_posts_content_updated_at\s+before\s+update\s+on\s+public\.blog_posts\s+for\s+each\s+row\s+execute\s+function\s+public\.blog_posts_touch_content_updated_at\(\)/i,
    )
    expect(sql).not.toMatch(/drop\s+trigger\s+if\s+exists\s+blog_posts_updated_at\b/i)
    expect(sql).not.toMatch(/blog_posts_touch_updated_at/i)
  })

  it("is registered in the schema contract as a non-blocking column probe", () => {
    expect(SCHEMA_CONTRACT_MIGRATIONS).toContain(FILE)
    const probe = SCHEMA_PROBES.find((entry) => entry.migration === FILE)
    expect(probe).toMatchObject({ kind: "table", table: "blog_posts", severity: "warning" })
    if (probe?.kind !== "table") throw new Error("Missing table readiness probe")
    expect(probe.columns).toContain("content_updated_at")
  })
})
