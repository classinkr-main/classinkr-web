export const TEASER_DWELL_THRESHOLD_MS = 120_000

export interface TeaserDecisionInput {
  dwellMs: number
  isEligible: boolean
  shown: boolean
  dismissed: boolean
  openedBefore: boolean
}

export function shouldShowTeaser(input: TeaserDecisionInput): boolean {
  return (
    input.isEligible &&
    !input.shown &&
    !input.dismissed &&
    !input.openedBefore &&
    input.dwellMs >= TEASER_DWELL_THRESHOLD_MS
  )
}
