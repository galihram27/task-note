import type { InvokeApi } from '@shared/ipc/api'
import type { ErrorCode, Result } from '@shared/ipc/result'

// Error dari main yang sudah dibuka dari Result. Dipakai TanStack Query sebagai error query.
export class ApiError extends Error {
  readonly code: ErrorCode

  constructor(code: ErrorCode, message: string) {
    super(message)
    this.name = 'ApiError'
    this.code = code
  }
}

type Unwrapped<T> = {
  readonly [D in keyof T]: {
    readonly [A in keyof T[D]]: T[D][A] extends (...args: infer P) => Promise<Result<infer R>>
      ? (...args: P) => Promise<R>
      : never
  }
}

async function unwrap<T>(promise: Promise<Result<T>>): Promise<T> {
  const result = await promise
  if (!result.ok) throw new ApiError(result.error.code, result.error.message)
  return result.data
}

// Bungkus setiap fungsi `window.api.domain.action` agar mengembalikan data langsung
// dan melempar ApiError bila gagal.
function createApi(raw: InvokeApi): Unwrapped<InvokeApi> {
  const wrapped: Record<string, Record<string, unknown>> = {}
  for (const [domain, actions] of Object.entries(raw)) {
    if (typeof actions !== 'object' || actions === null) continue
    const domainApi: Record<string, unknown> = {}
    for (const [action, fn] of Object.entries(actions as Record<string, unknown>)) {
      if (typeof fn !== 'function') continue
      domainApi[action] = (...args: unknown[]) =>
        unwrap((fn as (...a: unknown[]) => Promise<Result<unknown>>)(...args))
    }
    wrapped[domain] = domainApi
  }
  return wrapped as Unwrapped<InvokeApi>
}

export const api = createApi(window.api)
