/**
 * 공유 카드(OG) 로고 빌더 — lib/og/template.tsx 가 싣는 먹 단색 락업을 공식 락업 래스터에서 만든다.
 *
 * 원본: public/images/logo_raw.png.png(새 마크 + Classin 워드마크, 원색). 둘레 흰 여백을 잘라 내고,
 * 알파(모양)는 그대로 둔 채 색만 먹(#111110, lib/design-tokens.ts 의 color.ink)으로 채운다. 손으로 다시 그리지 않는다.
 * 2026-11-06 운영자 결정(DESIGN.md §9 V22 C′). 원본 로고가 바뀌면 이 스크립트를 다시 돌린다.
 *
 * 사용법: node scripts/build-og-lockup.mjs
 */
import sharp from "sharp"

const SOURCE = "public/images/logo_raw.png.png"
const OUT = "assets/og/classin-lockup-ink.png"
const INK = [17, 17, 16]

const trimmed = await sharp(SOURCE).trim({ threshold: 10 }).png().toBuffer()
const { data, info } = await sharp(trimmed).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
for (let i = 0; i < data.length; i += 4) {
  data[i] = INK[0]
  data[i + 1] = INK[1]
  data[i + 2] = INK[2]
}
await sharp(data, { raw: info }).png({ compressionLevel: 9 }).toFile(OUT)
console.log(`${OUT} ${info.width}×${info.height}`)
