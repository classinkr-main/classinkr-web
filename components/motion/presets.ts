/* ── Animation helpers (서버/클라이언트 공용 데이터) ─────────────── */
export const fadeUp = {
    initial: { opacity: 0, y: 30 },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true },
    transition: { duration: 0.6 },
}

export const stagger = (i: number) => ({
    ...fadeUp,
    transition: { duration: 0.5, delay: i * 0.12 },
})
