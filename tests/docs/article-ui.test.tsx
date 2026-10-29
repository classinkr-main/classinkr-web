import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { getDocsNavGroups } from "@/app/docs/_utils"
import { DocsArticle } from "@/components/docs/DocsArticle"
import { findPrevNextDocs } from "@/components/docs/DocsPrevNext"
import { DocsSectionMedia, getDocsMediaKind } from "@/components/docs/DocsSectionMedia"
import { docsCategories, getDocPath, listDocs, type DocMedia } from "@/lib/docs"

const image = (width: number, height: number, src = `/x-${width}x${height}.webp`): DocMedia => ({
  type: "image",
  src,
  alt: `${width}x${height} 화면`,
  caption: `${width}x${height} 설명`,
  width,
  height,
})

describe("문서 사진 배치", () => {
  it("크기로 휴대폰·작은 화면·긴 화면·가로 화면을 나눈다", () => {
    expect(getDocsMediaKind(image(560, 1088))).toBe("phone")
    expect(getDocsMediaKind(image(216, 462))).toBe("phone")
    expect(getDocsMediaKind(image(659, 460))).toBe("compact")
    expect(getDocsMediaKind(image(691, 844))).toBe("compact")
    expect(getDocsMediaKind(image(900, 1183))).toBe("compact")
    expect(getDocsMediaKind(image(1440, 4132))).toBe("long")
    expect(getDocsMediaKind(image(1440, 900))).toBe("wide")
    expect(getDocsMediaKind({ type: "image", src: "/x.webp", alt: "크기 모름" })).toBe("wide")
    expect(getDocsMediaKind({ type: "video", src: "/x.mp4", alt: "영상" })).toBe("video")
  })

  it("이어 나오는 휴대폰 화면 2장은 두 칸에 나란히 놓고, 모두 크게 보기로 열 수 있다", () => {
    const html = renderToStaticMarkup(
      <DocsSectionMedia media={[image(560, 1088, "/a.webp"), image(511, 1025, "/b.webp")]} />
    )
    expect(html).toContain("grid-cols-2")
    expect(html.match(/data-docs-zoom=""/g)).toHaveLength(2)
    expect(html).toContain('href="/a.webp"')
    expect(html).toContain("560x1088 설명")
  })

  it("첫 사진만 바로 받고 나머지는 스크롤할 때 받는다", () => {
    const media = [image(1440, 900, "/first.webp"), image(1440, 900, "/second.webp")]
    const eagerHtml = renderToStaticMarkup(<DocsSectionMedia media={media} eager />)
    expect(eagerHtml.match(/loading="eager"/g)).toHaveLength(1)
    expect(eagerHtml.match(/loading="lazy"/g)).toHaveLength(1)

    const lazyHtml = renderToStaticMarkup(<DocsSectionMedia media={media} />)
    expect(lazyHtml).not.toContain('loading="eager"')
  })

  it("아주 긴 전체 화면은 위쪽만 보여 주고 전체 보기를 안내한다", () => {
    const html = renderToStaticMarkup(<DocsSectionMedia media={[image(1440, 4132)]} />)
    expect(html).toContain("전체 화면 보기")
    expect(html).toContain("max-h-[420px]")
  })

  it("작은 사진은 원래 폭보다 키우지 않는다", () => {
    const html = renderToStaticMarkup(<DocsSectionMedia media={[image(354, 192)]} />)
    expect(html).toContain("max-width:356px")
  })

  it("영상은 크게 보기 링크 없이 재생기로 둔다", () => {
    const html = renderToStaticMarkup(
      <DocsSectionMedia media={[{ type: "video", src: "/v.mp4", alt: "시연 영상" }]} />
    )
    expect(html).toContain("<video")
    expect(html).not.toContain("data-docs-zoom")
  })
})

describe("이전·다음 문서", () => {
  const content = { categories: docsCategories, docs: listDocs() }

  it("사이드바와 같은 목록·순서로 같은 분류의 앞뒤 문서를 고른다", () => {
    const groups = getDocsNavGroups(undefined, content)
    const group = groups.find((item) => item.links.length >= 3)
    expect(group).toBeDefined()
    if (!group) return

    const middle = group.links[1]
    const result = findPrevNextDocs(getDocsNavGroups(middle.href, content))
    expect(result?.prev?.href).toBe(group.links[0].href)
    expect(result?.next?.href).toBe(group.links[2].href)
    expect(result?.position).toBe(2)
    expect(result?.total).toBe(group.links.length)

    const first = findPrevNextDocs(getDocsNavGroups(group.links[0].href, content))
    expect(first?.prev).toBeNull()
  })

  it("공개 목록에 없는 문서는 앞뒤 문서를 만들지 않는다", () => {
    const hidden = listDocs().find(
      (doc) => (doc.visibility ?? "public") !== "public" || doc.noindex
    )
    expect(hidden).toBeDefined()
    if (!hidden) return
    expect(findPrevNextDocs(getDocsNavGroups(getDocPath(hidden), content))).toBeNull()
  })
})

describe("단계 문장", () => {
  it("마크다운 링크는 링크로 그리고, 화면 버튼 이름 [ ] 는 그대로 둔다", () => {
    const html = renderToStaticMarkup(
      <DocsArticle
        title="문서"
        sections={[
          {
            id: "section-1",
            title: "업데이트",
            checklist: [
              {
                label:
                  "[업그레이드]를 누릅니다. 방법은 [앱이 멈출 때](/docs/start/app-update-cache-reinstall)에 있습니다.",
              },
            ],
          },
        ]}
      />
    )
    expect(html).toContain('href="/docs/start/app-update-cache-reinstall"')
    expect(html).toContain(">앱이 멈출 때</a>")
    expect(html).toContain("[업그레이드]를 누릅니다.")
    expect(html).not.toContain("](/docs/")
  })

  it("본문 렌더러가 막는 주소는 링크로 만들지 않고 글자 그대로 둔다", () => {
    const html = renderToStaticMarkup(
      <DocsArticle
        title="문서"
        sections={[
          {
            id: "section-1",
            title: "주소",
            checklist: [{ label: "[누르기](javascript:alert(1)) 와 **굵게**" }],
          },
        ]}
      />
    )
    expect(html).not.toContain("javascript:alert(1)\"")
    expect(html).not.toMatch(/href="javascript/)
    expect(html).toContain("[누르기](javascript:alert(1))")
    expect(html).toContain("<strong")
  })

  it("섹션 링크 복사 버튼은 켰을 때만 그린다", () => {
    const sections = [{ id: "section-1", title: "첫 섹션" }]
    expect(renderToStaticMarkup(<DocsArticle title="문서" sections={sections} />)).not.toContain(
      "섹션 링크 복사"
    )
    expect(
      renderToStaticMarkup(<DocsArticle title="문서" sections={sections} sectionLinks />)
    ).toContain("섹션 링크 복사")
  })
})
