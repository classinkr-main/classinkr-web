"use client";

import { motion } from "framer-motion";
import { Crosshair, ZoomIn, PenLine, Users } from "lucide-react";

const capabilities = [
  { icon: Crosshair, label: "교사 자동 추적" },
  { icon: ZoomIn, label: "자동 줌·프레이밍" },
  { icon: PenLine, label: "판서 중심 화면" },
  { icon: Users, label: "교실·원격 동시 대응" },
  { icon: Crosshair, label: "수업 영상 자동 저장" },
  { icon: ZoomIn, label: "복습 링크 빠른 공유" },
];

// Student dot positions (scattered in lower portion of classroom)
const studentDots = [
  { cx: 80, cy: 280 },
  { cx: 130, cy: 290 },
  { cx: 180, cy: 275 },
  { cx: 230, cy: 285 },
  { cx: 280, cy: 270 },
  { cx: 330, cy: 280 },
  { cx: 90, cy: 320 },
  { cx: 150, cy: 330 },
  { cx: 210, cy: 315 },
  { cx: 270, cy: 325 },
  { cx: 310, cy: 310 },
  { cx: 110, cy: 360 },
  { cx: 170, cy: 370 },
  { cx: 240, cy: 355 },
  { cx: 300, cy: 365 },
];

// Camera position: center of the board
const CAM_CX = 200;
const CAM_CY = 60;

export default function AICameraSection() {
  return (
    <section className="bg-[#0D1A12] text-white py-24 md:py-32 px-6 overflow-hidden relative">
      <div className="max-w-7xl mx-auto grid lg:grid-cols-2 gap-16 items-center">
        {/* Left copy */}
        <div>
          <p
            className="text-xs font-semibold uppercase tracking-[0.2em] text-[#6EE7B7]"
          >
            BUILT-IN AI TRACKING
          </p>

          <h2
            className="text-4xl md:text-5xl lg:text-6xl mt-4 leading-tight"
            style={{ letterSpacing: "-1.5px" }}
          >
            설명은 지나가도,
            <br />
            수업은 남습니다.
          </h2>

          <p className="text-lg text-white/70 mt-6 leading-relaxed">
            보드 상단 4K AI 카메라가 교사를 자동으로 추적해 수업 전체를 기록합니다.
            별도 장비나 보조 인력 없이도, 복습 가능한 수업이 자연스럽게 완성됩니다.
          </p>

          <ul className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {capabilities.map(({ icon: Icon, label }) => (
              <li key={label} className="flex items-center gap-2.5">
                <Icon className="w-4 h-4 text-[#6EE7B7] shrink-0" />
                <span className="text-sm text-white/85">{label}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Right visualization */}
        <div className="aspect-square rounded-3xl bg-white/[0.03] border border-white/10 p-8 flex items-center justify-center">
          <ClassroomTopView />
        </div>
      </div>
    </section>
  );
}

function ClassroomTopView() {
  // Teacher moves left → right → left, offset around horizontal center
  const teacherX = {
    x: [CAM_CX - 50, CAM_CX + 50, CAM_CX - 50],
  };

  // Fan angle follows teacher: rotate -15° → +15° → -15°
  const fanRotate = {
    rotate: [-15, 15, -15],
  };

  const transition = {
    duration: 6,
    repeat: Infinity,
    ease: "easeInOut" as const,
  };

  return (
    <svg
      viewBox="0 0 400 420"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="w-full h-full"
      aria-label="강의실 탑뷰 — AI 카메라 추적 시각화"
    >
      {/* Glow filter for camera dot */}
      <defs>
        <filter id="camGlow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="4" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="teacherGlow" x="-80%" y="-80%" width="360%" height="360%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Classroom outline */}
      <rect
        x="20"
        y="20"
        width="360"
        height="380"
        rx="4"
        stroke="rgba(255,255,255,0.2)"
        strokeWidth="1.5"
      />

      {/* Board — top, 60% width, centered */}
      <rect
        x="80"
        y="36"
        width="240"
        height="44"
        rx="4"
        fill="#084734"
        stroke="rgba(255,255,255,0.15)"
        strokeWidth="1"
      />
      <text x="200" y="62" textAnchor="middle" className="text-white/40" style={{ fontSize: 10, fill: "rgba(255,255,255,0.4)" }}>
        BOARD
      </text>

      {/* Camera dot on board center */}
      <circle
        cx={CAM_CX}
        cy={CAM_CY}
        r="6"
        fill="#6EE7B7"
        filter="url(#camGlow)"
      />
      <text
        x={CAM_CX + 10}
        y={CAM_CY + 4}
        style={{ fontSize: 10, fill: "rgba(255,255,255,0.4)" }}
      >
        4K CAM
      </text>

      {/* FOV fan — rotates with teacher */}
      <motion.g
        style={{ originX: `${CAM_CX}px`, originY: `${CAM_CY}px` }}
        animate={fanRotate}
        transition={transition}
      >
        {/* Fan polygon: origin at camera, spreads downward ~70deg wide */}
        <polygon
          points={`${CAM_CX},${CAM_CY} ${CAM_CX - 120},${CAM_CY + 200} ${CAM_CX + 120},${CAM_CY + 200}`}
          fill="rgba(110,231,183,0.10)"
          stroke="rgba(110,231,183,0.35)"
          strokeWidth="1"
        />
      </motion.g>

      {/* Teacher dot — moves left to right */}
      <motion.g animate={teacherX} transition={transition}>
        <circle
          cx="0"
          cy="160"
          r="9"
          fill="#6EE7B7"
          filter="url(#teacherGlow)"
          opacity="0.95"
        />
        <text
          x="0"
          y="178"
          textAnchor="middle"
          style={{ fontSize: 10, fill: "rgba(255,255,255,0.5)" }}
        >
          강사
        </text>
      </motion.g>

      {/* Student dots */}
      {studentDots.map((dot, i) => (
        <circle
          key={i}
          cx={dot.cx}
          cy={dot.cy}
          r="5"
          fill="rgba(255,255,255,0.25)"
        />
      ))}

      {/* Students label */}
      <text
        x="200"
        y="395"
        textAnchor="middle"
        style={{ fontSize: 10, fill: "rgba(255,255,255,0.35)" }}
      >
        수강생
      </text>
    </svg>
  );
}
