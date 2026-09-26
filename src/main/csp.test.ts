import { describe, expect, it } from 'vitest'
import { buildCsp } from './csp'

function directives(csp: string): Map<string, string[]> {
  return new Map(
    csp.split('; ').map((part) => {
      const [name = '', ...sources] = part.split(' ')
      return [name, sources]
    }),
  )
}

describe('buildCsp', () => {
  it('is strict in production', () => {
    const csp = directives(buildCsp('production'))
    expect(csp.get('default-src')).toEqual(["'none'"])
    expect(csp.get('script-src')).toEqual(["'self'"])
    expect(csp.get('connect-src')).toEqual(["'self'"])
    expect(csp.get('object-src')).toEqual(["'none'"])
    expect(buildCsp('production')).not.toContain('unsafe-eval')
    expect(buildCsp('production')).not.toMatch(/https?:/)
  })

  it('only relaxes what HMR needs in development', () => {
    const csp = directives(buildCsp('development'))
    expect(csp.get('script-src')).toEqual(["'self'", "'unsafe-inline'"])
    expect(csp.get('connect-src')).toContain('ws://localhost:*')
    expect(buildCsp('development')).not.toContain('unsafe-eval')
  })
})
