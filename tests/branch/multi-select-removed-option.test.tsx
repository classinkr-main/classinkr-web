import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import MultiSelect from "@/components/admin/branch/MultiSelect";

describe("자료에서 사라진 담당 선택은 숨기지 않고 해제할 수 있다", () => {
  it("담당자 이동 후 해당 팀의 행이 없어져도 저장된 필터를 표시하고 조작을 허용한다", () => {
    const html = renderToStaticMarkup(<MultiSelect label="담당" options={[]} selected={new Set(["이전 담당"])} onChange={() => {}} />);
    expect(html).toContain("이전 담당");
    expect(html).not.toContain('disabled=""');
  });
  it("자료와 선택이 모두 없을 때만 빈 필터를 비활성화한다", () => {
    const html = renderToStaticMarkup(<MultiSelect label="담당" options={[]} selected={new Set()} onChange={() => {}} />);
    expect(html).toContain("전체"); expect(html).toContain('disabled=""');
  });
  it("선택이 현재 자료에 없어도 다른 후보로 바꾸기 전 선택값을 그대로 보여준다", () => {
    const html = renderToStaticMarkup(<MultiSelect label="담당" options={["현재 담당"]} selected={new Set(["이전 담당"])} onChange={() => {}} />);
    expect(html).toContain("이전 담당"); expect(html).not.toContain('disabled=""');
  });
});
