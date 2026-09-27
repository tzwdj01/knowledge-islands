const SESSION_KEY = 'knowledge-islands-ai-session-v1'

export function getAiSession(): string {
  try { return sessionStorage.getItem(SESSION_KEY) || '' } catch { return '' }
}

export function setAiSession(token: string): void {
  try { sessionStorage.setItem(SESSION_KEY, token) } catch { /* Private mode can disable session storage. */ }
}

export function clearAiSession(): void {
  try { sessionStorage.removeItem(SESSION_KEY) } catch { /* Nothing to clear. */ }
}

export async function aiRequest<T>(path: string, body?: unknown): Promise<T> {
  const token = getAiSession()
  const response = await fetch(`/api/ai/${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store',
  })
  const result = await response.json().catch(() => ({})) as T & { error?: string }
  if (response.status === 401) clearAiSession()
  if (!response.ok) throw new Error(result.error || 'AI 服务暂时不可用。')
  return result
}
