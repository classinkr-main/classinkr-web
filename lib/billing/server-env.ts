import "server-only"

function readServerEnv(name: string) {
  const value = process.env[name]?.trim()
  return value && value.length > 0 ? value : null
}

export function hasTossSecretKey() {
  return Boolean(readServerEnv("TOSS_SECRET_KEY"))
}

export function getTossSecretKey() {
  const secretKey = readServerEnv("TOSS_SECRET_KEY")

  if (!secretKey) {
    throw new Error("Missing Toss secret key. Set TOSS_SECRET_KEY.")
  }

  return secretKey
}
