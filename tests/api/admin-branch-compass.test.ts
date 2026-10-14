import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), read: vi.fn() }));
vi.mock("@/lib/admin-auth", () => ({ verifyAdmin: mocks.auth, CRM_STAFF_ADMIN_API_ROLES: ["ADMIN", "BRANCH"] }));
vi.mock("@/lib/compass/kr-team", () => ({ readCompassKrTeam: mocks.read }));
import { GET } from "@/app/api/admin/branch/compass/route";
beforeEach(() => { vi.clearAllMocks(); mocks.auth.mockResolvedValue(undefined); mocks.read.mockResolvedValue({ state: "not_configured", snapshot: null }); });
afterEach(() => vi.useRealTimers());
describe("KR Team Compass 조회", () => {
  it("인증되지 않으면 원천을 읽지 않는다", async () => {
    mocks.auth.mockResolvedValue(NextResponse.json({ error: "Unauthorized" }, { status: 401 }));
    expect((await GET(new NextRequest("http://localhost/api?month=2026-10"))).status).toBe(401); expect(mocks.read).not.toHaveBeenCalled();
  });
  it("잘못된 월을 거부하고 정상 월은 캐시 없이 전달한다", async () => {
    expect((await GET(new NextRequest("http://localhost/api?month=2026-13"))).status).toBe(400); expect(mocks.read).not.toHaveBeenCalled();
    const response = await GET(new NextRequest("http://localhost/api?month=2026-10"));
    expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toContain("no-store"); expect(mocks.read).toHaveBeenCalledWith("2026-10");
  });
  it("KST 월 경계에서 평가 월을 고른다", async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-30T15:30:00Z"));
    await GET(new NextRequest("http://localhost/api")); expect(mocks.read).toHaveBeenCalledWith("2026-10");
  });
});
