import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isCompassKrTeamSnapshot } from "@/lib/compass/kr-team-contract";
import { snapshot } from "./kr-team.fixture";
import { readCompassKrTeam } from "@/lib/compass/kr-team";


beforeEach(() => { vi.stubEnv("COMPASS_BRIDGE_URL", "https://mkt.example.test"); vi.stubEnv("COMPASS_BRIDGE_TOKEN", "secret-test-value"); });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("원본 월별 평가표 계약", () => {
  it("수동 음수 조정과 미설정 목표를 있는 그대로 받는다", () => {
    const value = snapshot(); value.kpi.report.people[0].items[0].target = null;
    expect(isCompassKrTeamSnapshot(value, "2026-10")).toBe(true);
  });
  it("다른 월·다른 버전·누락 필드·유효하지 않은 숫자를 거부한다", () => {
    expect(isCompassKrTeamSnapshot(snapshot(), "2026-09")).toBe(false);
    expect(isCompassKrTeamSnapshot({ ...snapshot(), version: 2 }, "2026-10")).toBe(false);
    const bad = snapshot(); bad.kpi.report.people[0].items[0].actual = Number.NaN;
    expect(isCompassKrTeamSnapshot(bad, "2026-10")).toBe(false);
    const badProjection = snapshot(); badProjection.kpi.report.people[0].items[0].projected!.rate = Number.NaN;
    expect(isCompassKrTeamSnapshot(badProjection, "2026-10")).toBe(false);
    const oldSnapshot = snapshot(); delete oldSnapshot.kpi.report.people[0].items[0].manualBy;
    expect(isCompassKrTeamSnapshot(oldSnapshot, "2026-10")).toBe(true);
    expect(isCompassKrTeamSnapshot({ ...snapshot(), revenue: {} }, "2026-10")).toBe(false);
  });
});

describe("서버 간 읽기와 실패 상태", () => {
  it("전용 인증·기간·no-store·상한을 적용하고 값을 재계산하지 않는다", async () => {
    const data = snapshot(); const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(data)));
    vi.stubGlobal("fetch", fetcher);
    expect(await readCompassKrTeam("2026-10")).toEqual({ state: "ready", snapshot: data });
    const [url, options] = fetcher.mock.calls[0];
    expect(String(url)).toBe("https://mkt.example.test/api/cron/kr-team?month=2026-10");
    expect(options).toMatchObject({ cache: "no-store", redirect: "error", headers: { Authorization: "Bearer secret-test-value" } });
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });
  it("미설정은 조회하지 않으며 실패 응답은 빈 정상 데이터가 아니다", async () => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher); vi.stubEnv("COMPASS_BRIDGE_TOKEN", "");
    expect(await readCompassKrTeam("2026-10")).toEqual({ state: "not_configured", snapshot: null }); expect(fetcher).not.toHaveBeenCalled();
    vi.stubEnv("COMPASS_BRIDGE_TOKEN", "secret-test-value"); fetcher.mockResolvedValue(new Response("no", { status: 503 }));
    expect(await readCompassKrTeam("2026-10")).toEqual({ state: "unavailable", snapshot: null });
  });
  it("리다이렉트·유효하지 않은 계약·토큰을 포함한 예외를 화면에 전달하지 않는다", async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error("secret-test-value")); vi.stubGlobal("fetch", fetcher);
    const result = await readCompassKrTeam("2026-10"); expect(JSON.stringify(result)).not.toContain("secret-test-value");
    fetcher.mockResolvedValue(new Response(JSON.stringify({ ...snapshot(), month: "2026-09" })));
    expect((await readCompassKrTeam("2026-10")).state).toBe("unavailable");
    vi.stubEnv("COMPASS_BRIDGE_URL", "http://remote.example.test"); fetcher.mockClear();
    expect((await readCompassKrTeam("2026-10")).state).toBe("unavailable"); expect(fetcher).not.toHaveBeenCalled();
  });
});
