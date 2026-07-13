import type { ApiResponse } from "@/types"

/**
 * Generic SWR fetcher that unwraps our { data, error } API envelope.
 * Throws on API-level errors so SWR treats them as errors.
 */
export async function apiFetcher<T>(url: string): Promise<T> {
  const res = await fetch(url)
  let body: unknown

  try {
    body = await res.json()
  } catch {
    throw new Error(`Request failed (${res.status})`)
  }

  if (!isApiResponse<T>(body)) {
    throw new Error(res.ok ? "Invalid API response" : `Request failed (${res.status})`)
  }

  if (body.error) throw new Error(body.error)
  if (!res.ok) throw new Error(`Request failed (${res.status})`)
  return body.data
}

function isApiResponse<T>(value: unknown): value is ApiResponse<T> {
  return (
    typeof value === "object" &&
    value !== null &&
    "data" in value &&
    "error" in value &&
    ((value as { error: unknown }).error === null ||
      typeof (value as { error: unknown }).error === "string")
  )
}
