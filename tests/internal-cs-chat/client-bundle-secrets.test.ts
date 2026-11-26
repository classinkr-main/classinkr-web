import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

import { afterAll, describe, expect, it } from "vitest"

import { HQ_DOMAIN_KEYS, HQ_DOMAINS } from "@/lib/internal-cs-chat/escalation-routing"

// .mjs 스크립트를 시험에서 그대로 부른다(allowJs 로 형을 추론하므로 아래에서 쓰는 꼴만 좁힌다).
import * as bundleCheck from "../../scripts/check-client-bundle-secrets.mjs"

type Violation = { kind: string; file: string; chain: string[]; needle?: string }
const { checkClientModuleGraph, collectSecretNeedles, runtimeImportSpecifiers } = bundleCheck as unknown as {
  checkClientModuleGraph: (options?: { root?: string; needles?: string[] }) => {
    entries: number
    reachable: number
    violations: Violation[]
  }
  collectSecretNeedles: (root?: string, sources?: string[]) => string[]
  runtimeImportSpecifiers: (text: string) => string[]
}

const ROOT = path.resolve(__dirname, "../..")
const CLIENT_FILES = [
  "components/admin/cs-chat/components/EscalationWhoBadge.tsx",
  "components/admin/cs-chat/components/CommunicationTabs.tsx",
  "components/admin/cs-chat/panels/HqPanel.tsx",
  "components/admin/cs-chat/panels/ChatPanel.tsx",
  "components/admin/cs-chat/formatters.ts",
]

const tmpRoots: string[] = []
afterAll(() => {
  for (const dir of tmpRoots) rmSync(dir, { recursive: true, force: true })
})

function fixture(files: Record<string, string>) {
  const root = mkdtempSync(path.join(tmpdir(), "bundle-secrets-"))
  tmpRoots.push(root)
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, rel)), { recursive: true })
    writeFileSync(path.join(root, rel), text)
  }
  return root
}

describe("server-only boundary for the HQ contact table (R2)", () => {
  it("the escalation module is server-only", () => {
    const text = readFileSync(path.join(ROOT, "lib/internal-cs-chat/escalation-routing.ts"), "utf8")
    expect(text.startsWith('import "server-only"')).toBe(true)
  })

  it.each(CLIENT_FILES)("%s does not import the server-only escalation module", (rel) => {
    const text = readFileSync(path.join(ROOT, rel), "utf8")
    expect(text).not.toMatch(/internal-cs-chat\/escalation-routing/)
  })

  it("reads its search strings from the server module, covering every mention in the table", () => {
    const needles = collectSecretNeedles(ROOT)
    expect(needles.length).toBeGreaterThan(10)
    for (const key of HQ_DOMAIN_KEYS) {
      for (const part of HQ_DOMAINS[key].wecomMention.split("@").map((item) => item.trim()).filter(Boolean)) {
        if (part === "小助手") continue
        expect(needles).toContain(part)
      }
    }
  })

  it("no client entry reaches a server-only module or a file holding the table's strings (module graph)", () => {
    const result = checkClientModuleGraph({ root: ROOT })
    expect(result.entries).toBeGreaterThan(0)
    expect(result.violations.map((violation) => `${violation.kind} ${violation.chain.join(" -> ")}`)).toEqual([])
  })
})

describe("check-client-bundle-secrets (module graph mode)", () => {
  const SECRET_MODULE = [
    'import "server-only"',
    "export const T = {",
    '  a: { primaryContact: "测试人 (Test Person)", wecomMention: "@测试人 @Test Person" },',
    "}",
  ].join("\n")

  it("flags a client file that imports a server-only module, with the import chain", () => {
    const root = fixture({
      "lib/secret.ts": SECRET_MODULE,
      "lib/helper.ts": 'import { T } from "./secret"\nexport const x = T',
      "components/Widget.tsx": '"use client"\nimport { x } from "@/lib/helper"\nexport default function W() { return x }',
    })
    const needles = collectSecretNeedles(root, ["lib/secret.ts"])
    expect(needles).toEqual(expect.arrayContaining(["Test Person"]))
    const result = checkClientModuleGraph({ root, needles })
    expect(result.violations).toContainEqual(
      expect.objectContaining({
        kind: "server-only-import",
        chain: ["components/Widget.tsx", "lib/helper.ts", "lib/secret.ts"],
      })
    )
  })

  it("flags a copied string even without server-only, and ignores type-only imports", () => {
    const root = fixture({
      "lib/secret.ts": SECRET_MODULE,
      "lib/copy.ts": 'export const who = "Test Person"',
      "lib/types.ts": "export interface Row { a: string }",
      "components/A.tsx": '"use client"\nimport type { T } from "@/lib/secret"\nimport { type Row } from "@/lib/types"\nexport const a = 1',
      "components/B.tsx": '"use client"\nimport { who } from "@/lib/copy"\nexport const b = who',
    })
    const needles = collectSecretNeedles(root, ["lib/secret.ts"])
    const result = checkClientModuleGraph({ root, needles })
    expect(result.violations).toEqual([
      expect.objectContaining({ kind: "secret-string", file: "lib/copy.ts", chain: ["components/B.tsx", "lib/copy.ts"] }),
    ])
  })

  it("keeps value imports and drops type-only ones", () => {
    const specs = runtimeImportSpecifiers(
      [
        'import type { A } from "./a"',
        'import { type B, type C } from "./b"',
        'import { type D, e } from "./d"',
        'import f, { type G } from "./f"',
        'import "./side-effect"',
        'export { h } from "./h"',
        'const lazy = () => import("./lazy")',
      ].join("\n")
    )
    expect(specs.sort()).toEqual(["./d", "./f", "./h", "./lazy", "./side-effect"])
  })
})
