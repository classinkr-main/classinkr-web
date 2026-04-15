function readPublicEnv(name: string) {
  const value = process.env[name]?.trim()
  return value && value.length > 0 ? value : null
}

export function isSoftwareCheckoutEnabled() {
  return readPublicEnv("NEXT_PUBLIC_SW_CHECKOUT_ENABLED") === "true"
}

export function hasTossWidgetClientKey() {
  return Boolean(readPublicEnv("NEXT_PUBLIC_TOSS_WIDGET_CLIENT_KEY"))
}

export function getTossWidgetClientKey() {
  const clientKey = readPublicEnv("NEXT_PUBLIC_TOSS_WIDGET_CLIENT_KEY")

  if (!clientKey) {
    throw new Error(
      "Missing Toss widget client key. Set NEXT_PUBLIC_TOSS_WIDGET_CLIENT_KEY."
    )
  }

  return clientKey
}
