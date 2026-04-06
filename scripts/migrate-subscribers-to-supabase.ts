/**
 * 뉴스레터 구독자 마이그레이션 스크립트
 * data/subscribers.json → Supabase newsletter_subscribers 테이블
 *
 * ─── 시드 스크립트란? ────────────────────────────────────────────
 * "시드(seed)"는 농사에서 씨앗을 뿌리는 것처럼, 빈 DB에 초기 데이터를
 * 심는 작업을 말합니다. 이 스크립트처럼 기존 데이터를 한 번에 이전할
 * 때도 같은 의미로 씁니다.
 *
 * 원칙 1. 멱등성(idempotency): 같은 스크립트를 몇 번 돌려도 결과가
 *         동일해야 합니다. → upsert 사용, 중복 이메일은 skip.
 * 원칙 2. 비파괴: 원본 JSON 파일을 수정/삭제하지 않습니다.
 *         마이그레이션 완료 확인 후 직접 제거.
 * 원칙 3. 로그: 성공/실패/스킵 건수를 출력해 검증 가능하게.
 * ────────────────────────────────────────────────────────────────
 *
 * 사용법:
 *   SUPABASE_URL=xxx SUPABASE_SERVICE_ROLE_KEY=yyy npx tsx scripts/migrate-subscribers-to-supabase.ts
 *
 * 환경변수가 .env.local에 있으면:
 *   npx dotenv -e .env.local -- npx tsx scripts/migrate-subscribers-to-supabase.ts
 */

import fs from "fs"
import path from "path"
import { createClient } from "@supabase/supabase-js"

// ─── 환경변수 확인 ───────────────────────────────────────────────

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("❌ 환경변수를 설정해주세요:")
  console.error("   NEXT_PUBLIC_SUPABASE_URL")
  console.error("   SUPABASE_SERVICE_ROLE_KEY")
  process.exit(1)
}

// ─── Supabase admin 클라이언트 ───────────────────────────────────

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// ─── JSON 구독자 타입 (marketing-types.ts 기준) ──────────────────

interface LegacySubscriber {
  id: number
  email: string
  name: string
  org?: string
  role?: string
  size?: string
  phone?: string
  tags: string[]
  status: "active" | "unsubscribed"
  source?: string
  optInAt?: string
  unsubscribedAt?: string
  createdAt: string
  updatedAt: string
}

// ─── 메인 ───────────────────────────────────────────────────────

async function main() {
  const jsonPath = path.join(process.cwd(), "data", "subscribers.json")

  if (!fs.existsSync(jsonPath)) {
    console.log("ℹ️  data/subscribers.json 없음 — 마이그레이션할 데이터가 없습니다.")
    process.exit(0)
  }

  const raw = fs.readFileSync(jsonPath, "utf-8")
  const subscribers: LegacySubscriber[] = JSON.parse(raw)

  console.log(`📋 총 ${subscribers.length}명 구독자 마이그레이션 시작...\n`)

  let success = 0
  let skipped = 0
  let failed = 0

  for (const sub of subscribers) {
    try {
      const { error } = await supabase
        .from("newsletter_subscribers")
        .upsert(
          {
            email: sub.email.toLowerCase(),
            name: sub.name,
            tags: sub.tags ?? [],
            source: sub.source ?? "newsletter",
            status: sub.status,
            opt_in_at: sub.optInAt ?? sub.createdAt,
            unsubscribed_at: sub.unsubscribedAt ?? null,
            created_at: sub.createdAt,
            updated_at: sub.updatedAt,
          },
          { onConflict: "email", ignoreDuplicates: false }
        )

      if (error) {
        console.error(`  ❌ FAIL  ${sub.email}: ${error.message}`)
        failed++
      } else {
        console.log(`  ✅ OK    ${sub.email} [${sub.status}]`)
        success++
      }
    } catch (err) {
      console.error(`  ❌ FAIL  ${sub.email}:`, err)
      failed++
    }
  }

  console.log("\n─── 결과 ───────────────────────────────────")
  console.log(`  성공:   ${success}건`)
  console.log(`  스킵:   ${skipped}건`)
  console.log(`  실패:   ${failed}건`)
  console.log(`  합계:   ${subscribers.length}건`)
  console.log("────────────────────────────────────────────")

  if (failed === 0) {
    console.log("\n🎉 마이그레이션 완료!")
    console.log("   Supabase Dashboard → Table Editor → newsletter_subscribers 에서 확인")
    console.log("   확인 후 data/subscribers.json 제거 및 USE_SUPABASE_MARKETING=true 설정")
  } else {
    console.log("\n⚠️  일부 실패. 위 오류를 확인하고 재실행하세요.")
    process.exit(1)
  }
}

main().catch((err) => {
  console.error("스크립트 실행 오류:", err)
  process.exit(1)
})
