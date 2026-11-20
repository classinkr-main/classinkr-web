import "server-only"

import type { GoogleAuth } from "google-auth-library"

type GeminiConnection =
  | { provider: "developer"; apiKey: string }
  | { provider: "vertex"; project: string; location: string; email?: string; privateKey?: string; wifProvider?: string }

type VertexConnection = Extract<GeminiConnection, { provider: "vertex" }>
type GeminiOperation = "generateContent" | "streamGenerateContent" | "embedContent"

const VERTEX_SCOPE = "https://www.googleapis.com/auth/cloud-platform"
const VERTEX_WIF_PROVIDER_PATTERN = /^projects\/\d+\/locations\/global\/workloadIdentityPools\/[a-z0-9-]+\/providers\/[a-z0-9-]+$/

export function getChatbotGeminiConnection(): GeminiConnection | null {
  const provider = process.env.CHATBOT_GEMINI_PROVIDER?.trim() || "developer"
  if (provider === "developer") {
    const apiKey = process.env.GEMINI_API_KEY?.trim()
    return apiKey ? { provider, apiKey } : null
  }
  if (provider !== "vertex") return null

  const project = process.env.CHATBOT_VERTEX_PROJECT_ID?.trim() ?? ""
  const location = process.env.CHATBOT_VERTEX_LOCATION?.trim() || "global"
  const email = process.env.CHATBOT_VERTEX_SERVICE_ACCOUNT_EMAIL?.trim()
  const privateKey = process.env.CHATBOT_VERTEX_PRIVATE_KEY?.trim()
  const wifProvider = process.env.CHATBOT_VERTEX_WIF_PROVIDER?.trim()
  if (!/^[a-z0-9][a-z0-9-]{4,28}[a-z0-9]$/.test(project)) return null
  if (location !== "global" && !/^[a-z]+(?:-[a-z]+)+[0-9]+$/.test(location)) return null
  if (wifProvider && (privateKey || !VERTEX_WIF_PROVIDER_PATTERN.test(wifProvider))) return null
  if (Boolean(email) !== Boolean(privateKey || wifProvider)) return null
  if (wifProvider && !/^[a-z0-9-]+@[a-z0-9.-]+\.iam\.gserviceaccount\.com$/.test(email ?? "")) return null
  return { provider, project, location, email, privateKey, wifProvider }
}

let vertexAuth: { connection: VertexConnection; client: Promise<GoogleAuth> } | undefined

async function createVertexAuth({ project, email, privateKey, wifProvider }: VertexConnection) {
  const { GoogleAuth, JWT, ExternalAccountClient } = await import("google-auth-library")
  const scopes = [VERTEX_SCOPE]
  if (wifProvider && email) {
    const { getVercelOidcToken } = await import("@vercel/oidc")
    const authClient = ExternalAccountClient.fromJSON({
      type: "external_account",
      audience: `//iam.googleapis.com/${wifProvider}`,
      subject_token_type: "urn:ietf:params:oauth:token-type:jwt",
      token_url: "https://sts.googleapis.com/v1/token",
      service_account_impersonation_url: `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${email}:generateAccessToken`,
      subject_token_supplier: {
        getSubjectToken: () => getVercelOidcToken({ audience: `https://iam.googleapis.com/${wifProvider}` }),
      },
      scopes,
    })
    if (!authClient) throw new Error("Vertex workload identity configuration is invalid")
    return new GoogleAuth({ projectId: project, scopes, authClient })
  }

  const authClient = email && privateKey
    ? new JWT({ email, key: privateKey.replace(/\\n/g, "\n"), scopes })
    : undefined
  return new GoogleAuth({ projectId: project, scopes, authClient })
}

async function getVertexAccessToken(connection: VertexConnection) {
  const { project, email, privateKey, wifProvider } = connection
  const previous = vertexAuth?.connection
  if (
    !vertexAuth || previous?.project !== project || previous.email !== email ||
    previous.privateKey !== privateKey || previous.wifProvider !== wifProvider
  ) {
    vertexAuth = { connection, client: createVertexAuth(connection) }
  }
  const auth = await vertexAuth.client
  const token = await auth.getAccessToken()
  if (!token) throw new Error("Vertex access token unavailable")
  return token
}

// The request budget includes authentication, including the first token refresh on a cold start.
async function getVertexAccessTokenWithinBudget(connection: VertexConnection, signal: AbortSignal) {
  signal.throwIfAborted()
  let abort: () => void = () => {}
  const cancelled = new Promise<never>((_, reject) => {
    abort = () => reject(signal.reason)
    signal.addEventListener("abort", abort, { once: true })
  })
  try {
    return await Promise.race([getVertexAccessToken(connection), cancelled])
  } finally {
    signal.removeEventListener("abort", abort)
  }
}

export async function postChatbotGemini(
  connection: GeminiConnection,
  model: string,
  operation: GeminiOperation,
  body: string,
  signal: AbortSignal
) {
  const modelId = encodeURIComponent(model)
  const params = new URLSearchParams()
  if (operation === "streamGenerateContent") params.set("alt", "sse")
  const headers: Record<string, string> = { "Content-Type": "application/json" }
  let endpoint: string
  if (connection.provider === "vertex") {
    const { project, location, email } = connection
    const host = location === "global" ? "aiplatform.googleapis.com" : `${location}-aiplatform.googleapis.com`
    const method = operation === "embedContent" ? "predict" : operation
    endpoint = `https://${host}/v1/projects/${project}/locations/${location}/publishers/google/models/${modelId}:${method}`
    headers.Authorization = `Bearer ${await getVertexAccessTokenWithinBudget(connection, signal)}`
    if (!email) headers["x-goog-user-project"] = project
  } else {
    endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:${operation}`
    params.set("key", connection.apiKey)
  }

  const query = params.size ? `?${params}` : ""
  return fetch(`${endpoint}${query}`, { method: "POST", headers, body, signal })
}
