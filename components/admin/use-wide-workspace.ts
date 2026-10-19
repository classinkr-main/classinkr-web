"use client"

import { useSyncExternalStore } from "react"

const QUERY = "(min-width: 1280px)"
const serverSnapshot = () => false
const snapshot = () => window.matchMedia(QUERY).matches

function subscribe(onChange: () => void) {
  const media = window.matchMedia(QUERY)
  media.addEventListener("change", onChange)
  return () => media.removeEventListener("change", onChange)
}

/** Wide screens keep list and detail together; smaller screens retain the modal. */
export function useWideWorkspace() {
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot)
}
