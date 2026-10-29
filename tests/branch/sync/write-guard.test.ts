// 2026-10-28 — 시트 동기화 쓰기 가드. 10/15~10/19 에 운영 크론(옛 캡처 코드)과 운영 밖 환경(로컬·Preview)의
// 수동 런(새 캡처 코드)이 같은 운영 DB의 활성 REV 임포트를 번갈아 덮었다. 운영 런타임이 아니면 명시 플래그
// 없이는 쓰지 않고, 쓸 때는 어느 환경·배포가 썼는지 남긴다. 순수 모듈이라 env 객체를 직접 넘겨 고정한다.
import { describe, expect, it } from "vitest"

import {
  BRANCH_SYNC_NONPROD_WRITE_FLAG,
  checkSyncWriteAllowed,
  describeSyncRuntime,
  isNonprodWriteFlagOn,
} from "@/lib/branch/sync/write-guard"

const PROD = {
  VERCEL_ENV: "production",
  VERCEL_DEPLOYMENT_ID: "dpl_prod1",
  VERCEL_GIT_COMMIT_SHA: "e28b23f0000000000000000000000000000000ab",
  VERCEL_REGION: "icn1",
}

describe("checkSyncWriteAllowed", () => {
  it("운영(VERCEL_ENV=production)은 허용하고 근거를 production 으로 남긴다", () => {
    const guard = checkSyncWriteAllowed(PROD)
    expect(guard.allowed).toBe(true)
    if (!guard.allowed) return
    expect(guard.runtime).toEqual({
      env: "production",
      deploymentId: "dpl_prod1",
      sha: PROD.VERCEL_GIT_COMMIT_SHA,
      region: "icn1",
      allowedBy: "production",
    })
  })

  it.each(["preview", "development"])("VERCEL_ENV=%s 는 플래그 없이 건너뛴다 — skipped 결과 계약", (env) => {
    const guard = checkSyncWriteAllowed({ VERCEL_ENV: env, VERCEL_DEPLOYMENT_ID: "dpl_pr" })
    expect(guard.allowed).toBe(false)
    if (guard.allowed) return
    expect(guard.outcome).toBe("skipped")
    expect(guard.outcomeReason).toContain("운영 환경이 아니라 동기화 쓰기를 건너뜁니다")
    expect(guard.outcomeReason).toContain(`환경: ${env}`)
    expect(guard.outcomeReason).toContain(BRANCH_SYNC_NONPROD_WRITE_FLAG)
    expect(guard.runtime.env).toBe(env)
  })

  it("VERCEL_ENV 가 없는 로컬(next dev·스크립트)도 건너뛰고 환경은 local 로 읽는다", () => {
    const guard = checkSyncWriteAllowed({})
    expect(guard.allowed).toBe(false)
    expect(guard.runtime.env).toBe("local")
    if (!guard.allowed) expect(guard.outcomeReason).toContain("환경: local")
  })

  it("빈 문자열 VERCEL_ENV 는 설정되지 않은 것과 같다", () => {
    expect(checkSyncWriteAllowed({ VERCEL_ENV: "  " }).allowed).toBe(false)
  })

  it("플래그가 있으면 비운영도 허용하고 근거를 nonprod-flag 로 남긴다 — 사후 추적용", () => {
    const guard = checkSyncWriteAllowed({ VERCEL_ENV: "preview", [BRANCH_SYNC_NONPROD_WRITE_FLAG]: "1" })
    expect(guard.allowed).toBe(true)
    if (guard.allowed) expect(guard.runtime.allowedBy).toBe("nonprod-flag")
    const local = checkSyncWriteAllowed({ [BRANCH_SYNC_NONPROD_WRITE_FLAG]: "true" })
    expect(local.allowed).toBe(true)
    if (local.allowed) expect(local.runtime).toMatchObject({ env: "local", allowedBy: "nonprod-flag" })
  })

  it.each(["0", "", "false", "no", " "])("플래그 값 %j 은 켜진 것이 아니다", (value) => {
    expect(isNonprodWriteFlagOn({ [BRANCH_SYNC_NONPROD_WRITE_FLAG]: value })).toBe(false)
    expect(checkSyncWriteAllowed({ VERCEL_ENV: "preview", [BRANCH_SYNC_NONPROD_WRITE_FLAG]: value }).allowed).toBe(false)
  })

  it("운영은 플래그가 없어도 허용한다 — 크론은 플래그를 모른다", () => {
    expect(checkSyncWriteAllowed({ VERCEL_ENV: "production" }).allowed).toBe(true)
  })

  it("건너뜀 사유에는 환경 이름과 플래그 이름만 들어간다 — 비밀값·URL 없음", () => {
    const guard = checkSyncWriteAllowed({
      VERCEL_ENV: "preview",
      SUPABASE_SECRET_KEY: "sb_secret_do_not_leak",
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      CRON_SECRET: "cron-do-not-leak",
    })
    expect(guard.allowed).toBe(false)
    if (guard.allowed) return
    expect(guard.outcomeReason).not.toMatch(/sb_secret|supabase\.co|cron-do-not-leak|https?:\/\//)
  })
})

describe("describeSyncRuntime", () => {
  it("배포 ID·커밋·리전을 그대로 싣고 빈 값은 null 로 둔다", () => {
    expect(describeSyncRuntime({ VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_SHA: " abc123 " })).toEqual({
      env: "preview",
      deploymentId: null,
      sha: "abc123",
      region: null,
    })
  })

  it("기록에 allowedBy 를 넣지 않는다 — 판정(checkSyncWriteAllowed)만 근거를 안다", () => {
    expect(describeSyncRuntime(PROD)).not.toHaveProperty("allowedBy")
  })
})
