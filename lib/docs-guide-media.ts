/**
 * 문서센터 가이드 사진 매핑.
 *
 * 문서 본문(lib/docs.ts, lib/docs-troubleshooting.ts, CS 사용법 문서)은 그대로 두고,
 * 섹션 제목을 기준으로 실제 화면 사진을 덧붙인다. 사진 원본은 Figma 안내 화면 모음과
 * 공식 PDF 매뉴얼이며, 개인정보를 가린 뒤 public/docs/files/guides/ 아래 webp로 저장한다.
 * 어떤 원본의 어디를 잘랐는지는 scripts/docs-guide-shots/*.json 에 있다.
 */
import type { DocMedia } from "@/lib/docs"
import type { GuideMediaMap } from "@/lib/docs-guide-media/types"
import { ADMIN_GUIDE_MEDIA } from "@/lib/docs-guide-media/admin"
import { CS_USAGE_GUIDE_MEDIA } from "@/lib/docs-guide-media/cs-usage"
import { CS_USAGE_2_GUIDE_MEDIA } from "@/lib/docs-guide-media/cs-usage-2"
import { CS_USAGE_3_GUIDE_MEDIA } from "@/lib/docs-guide-media/cs-usage-3"
import { CS_USAGE_4_GUIDE_MEDIA } from "@/lib/docs-guide-media/cs-usage-4"
import { CS_USAGE_5_GUIDE_MEDIA } from "@/lib/docs-guide-media/cs-usage-5"
import { PRODUCT_GUIDE_MEDIA } from "@/lib/docs-guide-media/product"
import { PUBLIC_EXTRA_GUIDE_MEDIA } from "@/lib/docs-guide-media/public-extra"
import { START_GUIDE_MEDIA } from "@/lib/docs-guide-media/start"
import { STUDENT_GUIDE_MEDIA } from "@/lib/docs-guide-media/student"
import { TEACHER_GUIDE_MEDIA } from "@/lib/docs-guide-media/teacher"
import { TROUBLESHOOTING_GUIDE_MEDIA } from "@/lib/docs-guide-media/troubleshooting"
import { TROUBLESHOOTING_RECORDING_GUIDE_MEDIA } from "@/lib/docs-guide-media/troubleshooting-recording"

export type { GuideMediaMap }

const GROUPS: GuideMediaMap[] = [
  START_GUIDE_MEDIA,
  ADMIN_GUIDE_MEDIA,
  TEACHER_GUIDE_MEDIA,
  STUDENT_GUIDE_MEDIA,
  PRODUCT_GUIDE_MEDIA,
  TROUBLESHOOTING_GUIDE_MEDIA,
  TROUBLESHOOTING_RECORDING_GUIDE_MEDIA,
  CS_USAGE_GUIDE_MEDIA,
  CS_USAGE_2_GUIDE_MEDIA,
  CS_USAGE_3_GUIDE_MEDIA,
  CS_USAGE_4_GUIDE_MEDIA,
  CS_USAGE_5_GUIDE_MEDIA,
  PUBLIC_EXTRA_GUIDE_MEDIA,
]

function mergeGroups(groups: GuideMediaMap[]): GuideMediaMap {
  const merged: GuideMediaMap = {}
  for (const group of groups) {
    for (const [docKey, sections] of Object.entries(group)) {
      const target = (merged[docKey] ??= {})
      for (const [heading, media] of Object.entries(sections)) {
        target[heading] = [...(target[heading] ?? []), ...media]
      }
    }
  }
  return merged
}

export const DOC_GUIDE_MEDIA: GuideMediaMap = mergeGroups(GROUPS)

interface MediaTarget {
  slug: string
  category: string
  sections: { heading: string; media?: DocMedia[] }[]
}

/** 섹션 제목이 맞는 곳에 화면을 붙인다. 이미 붙은 같은 src 는 다시 붙이지 않는다. */
export function applyGuideMedia<T extends MediaTarget>(docs: T[]): T[] {
  return docs.map((doc) => {
    const sectionsMedia = DOC_GUIDE_MEDIA[`${doc.category}/${doc.slug}`]
    if (!sectionsMedia) return doc
    return {
      ...doc,
      sections: doc.sections.map((section) => {
        const extra = sectionsMedia[section.heading]
        if (!extra?.length) return section
        const existing = section.media ?? []
        const seen = new Set(existing.map((item) => item.src))
        return { ...section, media: [...existing, ...extra.filter((item) => !seen.has(item.src))] }
      }),
    }
  })
}
