import { IntroVideoPlayer } from "@/components/introduction/IntroVideoPlayer"
import type { IntroVideo } from "@/lib/introduction/content"

import { ProofSection, ProofSectionHead } from "./ProofParts"
import { PROOF_SOURCE, PROOF_VIDEOS, type ProofVideoGroup } from "./proof-copy"

/**
 * 02 수업 영상 — 이 페이지의 먹 지면 한 곳(surface-ink 클래스, 토큰이 밝은 값으로 바뀐다).
 * 묶음마다 hair 한 줄 → 레일(1–3칸) 제목·편수·설명, 본문 칸(4–12) 영상.
 * 영상은 공용 IntroVideoPlayer — YouTube 는 누르면 그 자리에서 youtube-nocookie 로, mp4 는 포스터 → 재생.
 * 먹 위 채움 버튼·카드는 두지 않는다(재생 단추는 먹 면과 같은 sheet + hair).
 */
export function ProofVideos() {
  const { id, folio, kicker, title, lead, groups } = PROOF_VIDEOS
  return (
    <ProofSection id={id} surface="ink">
      <ProofSectionHead id={id} folio={folio} kicker={kicker} title={title} lead={lead} />

      {groups.map((group, index) => (
        <div
          key={group.id}
          className={
            index === 0
              ? "mt-12 border-t border-line-hair pt-8 md:mt-16 lg:grid lg:grid-cols-12 lg:gap-x-6"
              : "mt-14 border-t border-line-hair pt-8 md:mt-20 lg:grid lg:grid-cols-12 lg:gap-x-6"
          }
        >
          <div className="lg:col-span-3">
            <h3 className="text-h3 text-fg-ink">{group.title}</h3>
            <p className="mt-2 text-note text-fg-muted">{group.meta}</p>
            <p className="mt-4 max-w-measure text-body text-fg-body">{group.text}</p>
          </div>
          <div className="mt-8 lg:col-span-9 lg:mt-0">
            <GroupVideos group={group} />
          </div>
        </div>
      ))}
    </ProofSection>
  )
}

function GroupVideos({ group }: { group: ProofVideoGroup }) {
  if (group.layout === "mixed") {
    // 가로 영상은 64rem 이상에서 세로로 쌓고(3/7), 세로 영상 둘은 그 옆에 나란히(4/7). 휴대폰도 세로 영상은 두 단
    const landscape = group.videos.filter((video) => !isPortrait(video))
    const portrait = group.videos.filter(isPortrait)
    return (
      <div className="grid gap-10 lg:grid-cols-7 lg:gap-x-6">
        <div className="grid content-start gap-x-6 gap-y-10 sm:grid-cols-2 lg:col-span-3 lg:grid-cols-1">
          {landscape.map((video) => (
            <IntroVideoPlayer key={videoKey(video)} video={video} source={PROOF_SOURCE} />
          ))}
        </div>
        <div className="grid max-w-xl content-start grid-cols-2 gap-x-4 gap-y-10 sm:gap-x-6 lg:col-span-4 lg:max-w-none">
          {portrait.map((video) => (
            <IntroVideoPlayer key={videoKey(video)} video={video} source={PROOF_SOURCE} />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div
      className={
        group.layout === "trio"
          ? "grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3"
          : "grid gap-x-6 gap-y-10 sm:grid-cols-2"
      }
    >
      {group.videos.map((video) => (
        <IntroVideoPlayer key={videoKey(video)} video={video} source={PROOF_SOURCE} />
      ))}
    </div>
  )
}

function isPortrait(video: IntroVideo) {
  return video.kind === "file" && video.orientation === "portrait"
}

function videoKey(video: IntroVideo) {
  return video.kind === "youtube" ? video.youtubeId : video.video
}
