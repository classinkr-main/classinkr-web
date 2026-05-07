/**
 * seed-test-partner.mjs
 * 테스트용 파트너 계정 생성 (legacy 모드)
 *
 * 실행:
 *   node --env-file=.env.local scripts/seed-test-partner.mjs
 */

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SECRET_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("❌ NEXT_PUBLIC_SUPABASE_URL 또는 SUPABASE_SECRET_KEY 없음");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const TEST_EMAIL = process.env.TEST_PARTNER_EMAIL;
const TEST_PASSWORD = process.env.TEST_PARTNER_PASSWORD;

if (!TEST_EMAIL || !TEST_PASSWORD) {
  console.error("TEST_PARTNER_EMAIL and TEST_PARTNER_PASSWORD are required.");
  process.exit(1);
}

async function run() {
  console.log("🔧 테스트 파트너 계정 생성 시작...\n");

  // 1. Supabase Auth 유저 생성 (이미 있으면 조회)
  console.log("1) Auth 유저 생성:", TEST_EMAIL);
  const { data: createData, error: createError } =
    await supabase.auth.admin.createUser({
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
      email_confirm: true,
    });

  let userId;
  if (createError) {
    if (createError.message?.includes("already been registered")) {
      // 이미 있으면 목록에서 찾기
      const { data: listData } = await supabase.auth.admin.listUsers();
      const existing = listData?.users?.find((u) => u.email === TEST_EMAIL);
      if (!existing) {
        console.error("❌ 유저 조회 실패:", createError.message);
        process.exit(1);
      }
      userId = existing.id;
      console.log("   ✅ 기존 Auth 유저 사용:", userId);
    } else {
      console.error("❌ Auth 유저 생성 실패:", createError.message);
      process.exit(1);
    }
  } else {
    userId = createData.user.id;
    console.log("   ✅ Auth 유저 생성:", userId);
  }

  // 2. partners 테이블에 파트너사 생성 (이미 있으면 스킵)
  console.log("\n2) partners 테이블에 파트너사 생성");
  const { data: existingPartner } = await supabase
    .from("partners")
    .select("id")
    .eq("email", TEST_EMAIL)
    .maybeSingle();

  let partnerId;
  if (existingPartner) {
    partnerId = existingPartner.id;
    console.log("   ✅ 기존 파트너 사용:", partnerId);
  } else {
    const { data: partner, error: partnerError } = await supabase
      .from("partners")
      .insert({
        name: "(테스트) 클래스인 테크",
        contact_name: "테스트 대표",
        email: TEST_EMAIL,
        phone: "010-1234-5678",
        address: "서울시 강남구 테헤란로 123",
        business_number: "123-45-67890",
        status: "active",
      })
      .select("id")
      .single();

    if (partnerError) {
      console.error("❌ partners 삽입 실패:", partnerError.message);
      process.exit(1);
    }
    partnerId = partner.id;
    console.log("   ✅ 파트너사 생성:", partnerId);
  }

  // 3. partner_users 테이블에 유저 연결 (이미 있으면 스킵)
  console.log("\n3) partner_users 테이블에 유저 연결");
  const { data: existingPU } = await supabase
    .from("partner_users")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();

  if (existingPU) {
    console.log("   ✅ 이미 연결됨:", existingPU.id);
  } else {
    const { error: puError } = await supabase.from("partner_users").insert({
      user_id: userId,
      partner_id: partnerId,
      display_name: "테스트 대표",
      role: "admin",
      status: "active",
    });

    if (puError) {
      console.error("❌ partner_users 삽입 실패:", puError.message);
      process.exit(1);
    }
    console.log("   ✅ 유저 연결 완료");
  }

  console.log("\n🎉 완료!\n");
  console.log("┌─────────────────────────────────────────┐");
  console.log("│  파트너 포털 테스트 계정                 │");
  console.log("│  URL:  /partner/login                   │");
  console.log(`│  ID:   ${TEST_EMAIL.padEnd(33)}│`);
  console.log(`│  PW:   ${TEST_PASSWORD.padEnd(33)}│`);
  console.log("└─────────────────────────────────────────┘");
}

run().catch((e) => {
  console.error("❌ 예외:", e);
  process.exit(1);
});
