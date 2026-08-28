import type { ReactNode, SVGProps } from "react"

/**
 * /product/sw "30+ 수업 도구" 타일 전용 아이콘 세트.
 *
 * 계약: 24×24 viewBox · stroke 1.6 · round cap/join · currentColor.
 * 채움은 의미를 가르는 액센트(바둑돌·주사위 눈 등)에만 쓰고, 도형 수는 아이콘당 6개 이하로 묶는다.
 * 20px 안에서 뭉개지지 않게 하려는 제약이다.
 *
 * 범용 lucide 아이콘으로는 도구가 서로 구분되지 않았다 —
 * 보조 칠판/바둑 칠판이 같은 Layout, 그룹 토론/실시간 채팅이 같은 MessageSquare였고
 * 다방향 브라우저는 화살표 하나였다. 도구별 실물을 그린 전용 세트로 대체한다.
 */

type IconProps = SVGProps<SVGSVGElement>

const Glyph = ({ children, ...props }: IconProps & { children: ReactNode }) => (
    <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        focusable="false"
        {...props}
    >
        {children}
    </svg>
)

const solid = { fill: "currentColor", stroke: "none" } as const

/* ── 진행·순서 ─────────────────────────────────────────────── */

export const TimerGlyph = (p: IconProps) => (
    <Glyph {...p}>
        <path d="M7 3h10M7 21h10" />
        <path d="M8.2 3v3.3c0 1.7 1.3 2.8 2.5 3.7.8.6.8 1.4 0 2-1.2.9-2.5 2-2.5 3.7V21" />
        <path d="M15.8 3v3.3c0 1.7-1.3 2.8-2.5 3.7-.8.6-.8 1.4 0 2 1.2.9 2.5 2 2.5 3.7V21" />
        <circle cx="12" cy="16.4" r="1" {...solid} />
    </Glyph>
)

export const StopwatchGlyph = (p: IconProps) => (
    <Glyph {...p}>
        <circle cx="12" cy="13.6" r="7.4" />
        <path d="M10 2.6h4M12 2.6v3.6" />
        <path d="m18.7 6.9 1.5-1.5" />
        <path d="M12 13.6V10m0 3.6 2.7 1.9" />
    </Glyph>
)

export const DiceGlyph = (p: IconProps) => (
    <Glyph {...p}>
        <rect x="3.4" y="3.4" width="17.2" height="17.2" rx="3.6" />
        <circle cx="8.3" cy="8.3" r="1.15" {...solid} />
        <circle cx="15.7" cy="8.3" r="1.15" {...solid} />
        <circle cx="12" cy="12" r="1.15" {...solid} />
        <circle cx="8.3" cy="15.7" r="1.15" {...solid} />
        <circle cx="15.7" cy="15.7" r="1.15" {...solid} />
    </Glyph>
)

export const RandomPickGlyph = (p: IconProps) => (
    <Glyph {...p}>
        <path d="M2.8 6.6h3.4c1.5 0 2.5.9 3.3 2l3.9 6c.8 1.1 1.8 2 3.3 2h3" />
        <path d="M2.8 17.4h3.4c1.5 0 2.5-.9 3.3-2l3.9-6c.8-1.1 1.8-2 3.3-2h3" />
        <path d="m17.6 3.6 2.8 3-2.8 3M17.6 14.4l2.8 3-2.8 3" />
    </Glyph>
)

export const TrophyRankGlyph = (p: IconProps) => (
    <Glyph {...p}>
        <rect x="3.2" y="14.6" width="5.4" height="6" rx="1.1" />
        <rect x="9.3" y="8.6" width="5.4" height="12" rx="1.1" />
        <rect x="15.4" y="16.4" width="5.4" height="4.2" rx="1.1" />
        <circle cx="12" cy="4.8" r="2.4" />
        <path d="m10.6 6.9-.8 1.7M13.4 6.9l.8 1.7" />
        </Glyph>
)

/* ── 판서·화면 ─────────────────────────────────────────────── */

export const SubBoardGlyph = (p: IconProps) => (
    <Glyph {...p}>
        <rect x="2.4" y="4.6" width="13" height="10.4" rx="2" />
        <path d="M5.4 8.2h7M5.4 11.2h4.6" />
        <path d="M7.2 15v3.8M10.6 15v3.8" />
        <rect x="16.8" y="10.4" width="4.8" height="4.8" rx="1.4" />
        </Glyph>
)

export const PersonalBoardGlyph = (p: IconProps) => (
    <Glyph {...p}>
        <rect x="2.4" y="3.4" width="10.6" height="17.2" rx="2.2" />
        <path d="M5.4 7.8h4.6M5.4 11h3" />
        <path d="M21.2 10.6a1.3 1.3 0 0 0-1.8 0l-5.6 5.6-.9 2.7 2.7-.9 5.6-5.6a1.3 1.3 0 0 0 0-1.8z" />
        </Glyph>
)

export const GoBoardGlyph = (p: IconProps) => (
    <Glyph {...p}>
        <rect x="3" y="3" width="18" height="18" rx="2.4" />
        <path d="M9 3v18M15 3v18M3 9h18M3 15h18" strokeWidth={1} />
        <circle cx="9" cy="9" r="2.7" {...solid} />
        <circle cx="15" cy="15" r="2.4" />
    </Glyph>
)

export const ScreenShareGlyph = (p: IconProps) => (
    <Glyph {...p}>
        <rect x="2.6" y="4.4" width="18.8" height="12.4" rx="2.4" />
        <path d="M9.4 20.6h5.2M12 16.8v3.8" />
        <path d="M12 13.4V7.6m-2.6 2.6L12 7.6l2.6 2.6" />
    </Glyph>
)

export const VncGlyph = (p: IconProps) => (
    <Glyph {...p}>
        <rect x="2.6" y="4.4" width="18.8" height="12.4" rx="2.4" />
        <path d="M9.4 20.6h5.2M12 16.8v3.8" />
        <path d="m7.4 7.6 5.6 2.3-2.4.9-.9 2.4z" />
        <path d="M16.4 8.2a3 3 0 0 1 0 4.2M18.6 6.6a5.4 5.4 0 0 1 0 7.4" />
    </Glyph>
)

export const MirroringGlyph = (p: IconProps) => (
    <Glyph {...p}>
        <rect x="2.6" y="5.6" width="6.2" height="12.8" rx="1.8" />
        <path d="M4.8 16.2h1.8" />
        <rect x="14.2" y="7.2" width="7.2" height="7.2" rx="1.6" />
        <path d="M17.8 14.4v2.4M15.6 19.4h4.4" />
        <path d="M10.4 9.8a5 5 0 0 1 0 4.4M12.1 8.6a7.4 7.4 0 0 1 0 6.8" />
    </Glyph>
)

export const SubCameraGlyph = (p: IconProps) => (
    <Glyph {...p}>
        <rect x="2.2" y="7.4" width="13.6" height="10.4" rx="2.4" />
        <path d="M6.4 7.4 7.6 5.2h4.8l1.2 2.2" />
        <circle cx="9" cy="12.8" r="3.1" />
        <path d="M19 3.4v4.2M16.9 5.5h4.2" />
    </Glyph>
)

export const VideoGalleryGlyph = (p: IconProps) => (
    <Glyph {...p}>
        <rect x="2.8" y="4.2" width="8.4" height="7.2" rx="1.8" />
        <rect x="12.8" y="4.2" width="8.4" height="7.2" rx="1.8" />
        <rect x="2.8" y="12.6" width="8.4" height="7.2" rx="1.8" />
        <rect x="12.8" y="12.6" width="8.4" height="7.2" rx="1.8" />
        <path d="m5.9 6.2 2.9 1.6-2.9 1.6z" {...solid} />
    </Glyph>
)

/* ── 브라우저 ──────────────────────────────────────────────── */

export const BrowserGlyph = (p: IconProps) => (
    <Glyph {...p}>
        <rect x="2.8" y="4.4" width="18.4" height="15.2" rx="2.6" />
        <path d="M2.8 9.4h18.4" />
        <circle cx="6.1" cy="6.9" r=".85" {...solid} />
        <circle cx="8.9" cy="6.9" r=".85" {...solid} />
        <circle cx="11.7" cy="6.9" r=".85" {...solid} />
    </Glyph>
)

export const MultiBrowserGlyph = (p: IconProps) => (
    <Glyph {...p}>
        <rect x="6.4" y="6.4" width="11.2" height="11.2" rx="2" />
        <path d="M6.4 10h11.2" />
        <path d="M12 1.4 14.1 4.6h-4.2z" {...solid} />
        <path d="M12 22.6 9.9 19.4h4.2z" {...solid} />
        <path d="M1.4 12 4.6 9.9v4.2z" {...solid} />
        <path d="M22.6 12 19.4 14.1V9.9z" {...solid} />
        </Glyph>
)

/* ── 퀴즈·토론 ─────────────────────────────────────────────── */

export const QuizChoiceGlyph = (p: IconProps) => (
    <Glyph {...p}>
        <circle cx="5.4" cy="5.6" r="2.6" />
        <path d="m4.2 5.6 1 1 1.5-1.9" />
        <circle cx="5.4" cy="12" r="2.6" />
        <circle cx="5.4" cy="18.4" r="2.6" />
        <path d="M10.6 5.6h9.8M10.6 12h9.8M10.6 18.4h9.8" />
    </Glyph>
)

export const QuizBuzzerGlyph = (p: IconProps) => (
    <Glyph {...p}>
        <path d="M4.4 16.4a7.6 7.6 0 0 1 15.2 0" />
        <rect x="2.2" y="16.4" width="19.6" height="3.6" rx="1.4" />
        <circle cx="12" cy="5.9" r="2" />
        <path d="M12 7.9v.9" />
        <path d="m6.6 5.2-1.4-1.4M17.4 5.2l1.4-1.4" />
    </Glyph>
)

export const GroupDiscussionGlyph = (p: IconProps) => (
    <Glyph {...p}>
        <rect x="10.6" y="2.8" width="10.8" height="8" rx="2.4" />
        <path d="M14.4 10.8v2.8l3-2.8" />
        <rect x="2.6" y="12" width="10.8" height="8" rx="2.4" />
        <path d="M9.6 20v2.8l-3-2.8" />
        <path d="M5.6 16h4.8" />
        </Glyph>
)

export const LiveChatGlyph = (p: IconProps) => (
    <Glyph {...p}>
        <path d="M4.6 3.6h14.8a2.6 2.6 0 0 1 2.6 2.6v8.4a2.6 2.6 0 0 1-2.6 2.6H10l-4.6 3.4v-3.4h-.8A2.6 2.6 0 0 1 2 14.6V6.2a2.6 2.6 0 0 1 2.6-2.6z" />
        <circle cx="8.4" cy="10.4" r="1.05" {...solid} />
        <circle cx="12" cy="10.4" r="1.05" {...solid} />
        <circle cx="15.6" cy="10.4" r="1.05" {...solid} />
    </Glyph>
)

export const CollaborationGlyph = (p: IconProps) => (
    <Glyph {...p}>
        <circle cx="12" cy="5.4" r="2.8" />
        <circle cx="5.2" cy="17" r="2.8" />
        <circle cx="18.8" cy="17" r="2.8" />
        <path d="M10.1 7.7 7.1 14.7M13.9 7.7l3 7M8 17h8" />
    </Glyph>
)

/* ── 실험·자료 ─────────────────────────────────────────────── */

export const LaserPointerGlyph = (p: IconProps) => (
    <Glyph {...p}>
        <path d="M4.1 19.9a2.4 2.4 0 0 1 0-3.4l6.5-6.5 3.4 3.4-6.5 6.5a2.4 2.4 0 0 1-3.4 0z" />
        <path d="m12.3 11.7 2.8-2.8" />
        <circle cx="17.6" cy="6.4" r="1.3" {...solid} />
        <path d="m20.2 4.6 1.4-1.4M19.7 9.3l1.7 1" />
    </Glyph>
)

export const MaterialLibraryGlyph = (p: IconProps) => (
    <Glyph {...p}>
        <rect x="3.2" y="5.4" width="3.6" height="12.4" rx=".9" />
        <rect x="7.8" y="5.4" width="3.6" height="12.4" rx=".9" />
        <path d="m12.4 17.8 2.9-11.4 3.3.9-2.9 11.4z" />
        <path d="M3.2 8.6h3.6M7.8 8.6h3.6" />
        <path d="M2.4 18.4h19.2" />
        </Glyph>
)

export const ChemistryGlyph = (p: IconProps) => (
    <Glyph {...p}>
        <path d="M9.4 3.2v5.4L4.2 17.8a2 2 0 0 0 1.7 3h12.2a2 2 0 0 0 1.7-3l-5.2-9.2V3.2" />
        <path d="M8.4 3.2h7.2" />
        <path d="M6.6 14.4h10.8" />
        <circle cx="10.4" cy="17.2" r="1.1" {...solid} />
        <circle cx="14" cy="18.6" r=".8" {...solid} />
    </Glyph>
)

export const PhysicsGlyph = (p: IconProps) => (
    <Glyph {...p}>
        <ellipse cx="12" cy="12" rx="9.6" ry="3.4" />
        <ellipse cx="12" cy="12" rx="9.6" ry="3.4" transform="rotate(60 12 12)" />
        <ellipse cx="12" cy="12" rx="9.6" ry="3.4" transform="rotate(-60 12 12)" />
        <circle cx="12" cy="12" r="1.5" {...solid} />
    </Glyph>
)

export const GeometryGlyph = (p: IconProps) => (
    <Glyph {...p}>
        <path d="M5 8.6 8.4 15.4H1.6z" />
        <circle cx="12" cy="12" r="3.4" />
        <rect x="16" y="8.6" width="6.8" height="6.8" rx="1" />
        </Glyph>
)

export const MeasureGlyph = (p: IconProps) => (
    <Glyph {...p}>
        <path d="M4.4 11.4a7.6 7.6 0 0 1 15.2 0" />
        <path d="M4.4 11.4h15.2" />
        <path d="M12 11.4V8.4" />
        <rect x="2.6" y="14.6" width="18.8" height="5" rx="1.3" />
        <path d="M7 14.6v2.2M12 14.6v2.6M17 14.6v2.2" />
        </Glyph>
)
