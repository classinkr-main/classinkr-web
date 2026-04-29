"use client"

import Image from "next/image"
import { useRef } from "react"
import { motion, useScroll, useTransform } from "framer-motion"

export default function BigBackdropImage() {
  const sectionRef = useRef<HTMLElement>(null)

  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start end", "end start"],
  })

  // 스크롤에 따라 이미지 scale 1.1 → 1.0 (패럴랙스 효과)
  const imageScale = useTransform(scrollYProgress, [0, 1], [1.1, 1.0])

  const fadeUpVariants = {
    hidden: { opacity: 0, y: 28 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.75, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] },
    },
  }

  const labelVariants = {
    hidden: { opacity: 0, y: 16 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] },
    },
  }

  const bodyVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.7, delay: 0.2, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] },
    },
  }

  return (
    <section
      ref={sectionRef}
      className="relative h-[90vh] md:h-[100vh] w-full overflow-hidden bg-black"
    >
      {/* 패럴랙스 이미지 */}
      <motion.div
        className="absolute inset-0 w-full h-full"
        style={{ scale: imageScale }}
      >
        <Image
          src="/images/product/hw/board/board-bezel-detail.png"
          alt="ClassIn Board 베젤 클로즈업"
          fill
          className="object-cover"
        />
      </motion.div>

      {/* 그라데이션 오버레이 — 모바일에서 더 강하게 */}
      <div
        className="
          absolute inset-0
          bg-gradient-to-tr from-black/85 via-black/40 to-transparent
          md:from-black/80
        "
      />

      {/* 카피 영역 — 좌하단 고정 */}
      <div className="absolute bottom-12 left-6 right-6 max-w-2xl md:bottom-20 md:left-16 md:right-auto">
        {/* 라벨 */}
        <motion.p
          variants={labelVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          className="text-xs tracking-[0.2em] text-[#6EE7B7] font-semibold uppercase"
        >
          INDUSTRIAL DESIGN
        </motion.p>

        {/* 헤딩 */}
        <motion.h2
          variants={fadeUpVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          className="text-3xl md:text-5xl lg:text-6xl leading-tight text-white mt-4"
          style={{ letterSpacing: "-1.5px" }}
        >
          베젤은 얇아지고,
          <br />
          몰입은 깊어집니다.
        </motion.h2>

        {/* 본문 */}
        <motion.p
          variants={bodyVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          className="text-base md:text-lg text-white/80 mt-5 max-w-xl"
        >
          8mm 슬림 베젤과 매트 알루미늄 마감으로 오직 수업에만 집중할 수 있도록 만들었습니다.
        </motion.p>
      </div>
    </section>
  )
}
