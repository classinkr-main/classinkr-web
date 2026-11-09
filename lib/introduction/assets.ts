// 소개서(/introduction) 미디어 목록 — public/ 아래 실제 파일과 크기.
// Notion 원본을 웹용으로 바꾼 결과다: 사진 webp(가로 최대 1920), 영상 H.264 720p, PDF 원본.
// 파일을 바꾸면 width·height 를 같이 고친다(next/image 레이아웃 이동 방지).

export interface IntroAssetFile {
  src: string
  /** 사진·영상의 픽셀 크기. PDF 는 없다. */
  width?: number
  height?: number
  /** 영상 첫 화면(webp) */
  poster?: string
}

export const INTRO_ASSETS = {
  "case-dongincheon-math": { src: "/video/introduction/case-dongincheon-math.mp4", width: 406, height: 720, poster: "/images/introduction/case-dongincheon-math-poster.webp" },
  "case-dongincheon-science": { src: "/video/introduction/case-dongincheon-science.mp4", width: 406, height: 720, poster: "/images/introduction/case-dongincheon-science-poster.webp" },
  "case-quad-learning": { src: "/video/introduction/case-quad-learning.mp4", width: 1280, height: 720, poster: "/images/introduction/case-quad-learning-poster.webp" },
  "classin-ai-smart-classroom-proposal": { src: "/materials/introduction/classin-ai-smart-classroom-proposal.pdf" },
  "classin-introduction-251218": { src: "/materials/introduction/classin-introduction-251218.pdf" },
  "classin-x-hero": { src: "/images/introduction/classin-x-hero.webp", width: 1920, height: 1080 },
  "classin-x-overview": { src: "/images/introduction/classin-x-overview.webp", width: 1920, height: 1080 },
  "feature-ai": { src: "/images/introduction/feature-ai.webp", width: 1434, height: 796 },
  "feature-anywhere": { src: "/images/introduction/feature-anywhere.webp", width: 682, height: 512 },
  "feature-data": { src: "/images/introduction/feature-data.webp", width: 1253, height: 738 },
  "feature-manage": { src: "/images/introduction/feature-manage.webp", width: 1920, height: 1265 },
  "feature-materials": { src: "/images/introduction/feature-materials.webp", width: 586, height: 396 },
  "feature-teach": { src: "/images/introduction/feature-teach.webp", width: 1165, height: 676 },
  "hero-banner": { src: "/images/introduction/hero-banner.webp", width: 1280, height: 444 },
  "hw-design-1": { src: "/images/introduction/hw-design-1.webp", width: 1834, height: 1402 },
  "hw-design-2": { src: "/images/introduction/hw-design-2.webp", width: 660, height: 460 },
  "hw-focus": { src: "/images/introduction/hw-focus.webp", width: 1558, height: 1495 },
  "hw-hybrid": { src: "/images/introduction/hw-hybrid.webp", width: 1920, height: 696 },
  "hw-touch": { src: "/images/introduction/hw-touch.webp", width: 1920, height: 1081 },
  "smart-hybrid-1": { src: "/images/introduction/smart-hybrid-1.webp", width: 1920, height: 1032 },
  "smart-hybrid-2": { src: "/images/introduction/smart-hybrid-2.webp", width: 1887, height: 1000 },
  "smart-lecture-1": { src: "/images/introduction/smart-lecture-1.webp", width: 1920, height: 1050 },
  "smart-lecture-2": { src: "/images/introduction/smart-lecture-2.webp", width: 1080, height: 607 },
  "smart-review-1": { src: "/images/introduction/smart-review-1.webp", width: 1747, height: 952 },
  "smart-review-2": { src: "/images/introduction/smart-review-2.webp", width: 1920, height: 1080 },
  "cases/acts-university-1": { src: "/images/introduction/cases/acts-university-1.webp", width: 1920, height: 1434 },
  "cases/acts-university-2": { src: "/images/introduction/cases/acts-university-2.webp", width: 1920, height: 1437 },
  "cases/acts-university-3": { src: "/images/introduction/cases/acts-university-3.webp", width: 1920, height: 1449 },
  "cases/bucheon-jungyul-1": { src: "/images/introduction/cases/bucheon-jungyul-1.webp", width: 1920, height: 1046 },
  "cases/bucheon-jungyul-2": { src: "/images/introduction/cases/bucheon-jungyul-2.webp", width: 1920, height: 1338 },
  "cases/bucheon-jungyul-3": { src: "/images/introduction/cases/bucheon-jungyul-3.webp", width: 1920, height: 1372 },
  "cases/bucheon-jungyul-4": { src: "/images/introduction/cases/bucheon-jungyul-4.webp", width: 1920, height: 1362 },
  "cases/bucheon-jungyul-5": { src: "/images/introduction/cases/bucheon-jungyul-5.webp", width: 1920, height: 1269 },
  "cases/bucheon-jungyul-video-1": { src: "/video/introduction/cases/bucheon-jungyul-video-1.mp4", width: 960, height: 540, poster: "/images/introduction/cases/bucheon-jungyul-video-1-poster.webp" },
  "cases/busan-gwasaram-1": { src: "/images/introduction/cases/busan-gwasaram-1.webp", width: 1920, height: 1100 },
  "cases/busan-gwasaram-2": { src: "/images/introduction/cases/busan-gwasaram-2.webp", width: 1920, height: 974 },
  "cases/busan-gwasaram-video-1": { src: "/video/introduction/cases/busan-gwasaram-video-1.mp4", width: 1280, height: 720, poster: "/images/introduction/cases/busan-gwasaram-video-1-poster.webp" },
  "cases/busan-yerim-1": { src: "/images/introduction/cases/busan-yerim-1.webp", width: 1388, height: 1275 },
  "cases/cheonan-jscan-1": { src: "/images/introduction/cases/cheonan-jscan-1.webp", width: 1182, height: 666 },
  "cases/cheongju-leemisook-korean-1": { src: "/images/introduction/cases/cheongju-leemisook-korean-1.webp", width: 1920, height: 1415 },
  "cases/cheongju-leemisook-korean-2": { src: "/images/introduction/cases/cheongju-leemisook-korean-2.webp", width: 1920, height: 1453 },
  "cases/cheongju-youngs-english-1": { src: "/images/introduction/cases/cheongju-youngs-english-1.webp", width: 1920, height: 1397 },
  "cases/dongincheon-jongro-m-1": { src: "/images/introduction/cases/dongincheon-jongro-m-1.webp", width: 1920, height: 1411 },
  "cases/dongincheon-jongro-m-2": { src: "/images/introduction/cases/dongincheon-jongro-m-2.webp", width: 1920, height: 1428 },
  "cases/gwanggyo-u2m-1": { src: "/images/introduction/cases/gwanggyo-u2m-1.webp", width: 1920, height: 1427 },
  "cases/icheon-aidabom-1": { src: "/images/introduction/cases/icheon-aidabom-1.webp", width: 1890, height: 848 },
  "cases/icheon-aidabom-2": { src: "/images/introduction/cases/icheon-aidabom-2.webp", width: 1877, height: 1371 },
  "cases/k1-sports-1": { src: "/images/introduction/cases/k1-sports-1.webp", width: 1917, height: 1078 },
  "cases/korea-digital-media-high-school-1": { src: "/images/introduction/cases/korea-digital-media-high-school-1.webp", width: 1920, height: 1440 },
  "cases/korea-digital-media-high-school-2": { src: "/images/introduction/cases/korea-digital-media-high-school-2.webp", width: 1920, height: 1440 },
  "cases/korea-digital-media-high-school-3": { src: "/images/introduction/cases/korea-digital-media-high-school-3.webp", width: 1920, height: 865 },
  "cases/korea-hakwon-university-1": { src: "/images/introduction/cases/korea-hakwon-university-1.webp", width: 1920, height: 1430 },
  "cases/korea-hakwon-university-2": { src: "/images/introduction/cases/korea-hakwon-university-2.webp", width: 1920, height: 1416 },
  "cases/korea-hakwon-university-3": { src: "/images/introduction/cases/korea-hakwon-university-3.webp", width: 1892, height: 1405 },
  "cases/korea-hakwon-university-4": { src: "/images/introduction/cases/korea-hakwon-university-4.webp", width: 1920, height: 1407 },
  "cases/national-university-of-singapore-1": { src: "/images/introduction/cases/national-university-of-singapore-1.webp", width: 1500, height: 1030 },
  "cases/peking-university-1": { src: "/images/introduction/cases/peking-university-1.webp", width: 1702, height: 1276 },
  "cases/pyo-criminal-science-lab-1": { src: "/images/introduction/cases/pyo-criminal-science-lab-1.webp", width: 1920, height: 1431 },
  "cases/pyo-criminal-science-lab-2": { src: "/images/introduction/cases/pyo-criminal-science-lab-2.webp", width: 1920, height: 1438 },
  "cases/suwon-mijiwon-1": { src: "/images/introduction/cases/suwon-mijiwon-1.webp", width: 1920, height: 1402 },
  "youtube/19f1al8hNk0": { src: "/images/introduction/youtube/19f1al8hNk0.webp", width: 1280, height: 720 },
  "youtube/X4zpJB-hymg": { src: "/images/introduction/youtube/X4zpJB-hymg.webp", width: 1280, height: 720 },
  "youtube/lz6XY-0Oj4A": { src: "/images/introduction/youtube/lz6XY-0Oj4A.webp", width: 1280, height: 720 },
  "youtube/rsqlml3GIm8": { src: "/images/introduction/youtube/rsqlml3GIm8.webp", width: 1280, height: 720 },
} as const satisfies Record<string, IntroAssetFile>

export type IntroAssetKey = keyof typeof INTRO_ASSETS

export interface ResolvedIntroAsset {
  src: string
  width: number
  height: number
  poster?: string
}

/** 사진·영상 자산. 크기가 없는 자산(PDF)은 1×1 로 돌려준다 — next/image 에 넘기지 않는다. */
export function getIntroAsset(key: IntroAssetKey): ResolvedIntroAsset {
  const file: IntroAssetFile = INTRO_ASSETS[key]
  return { src: file.src, width: file.width ?? 1, height: file.height ?? 1, poster: file.poster }
}
