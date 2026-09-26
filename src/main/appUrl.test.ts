import { describe, expect, it } from 'vitest'
import { isAppUrl, isExternalHttpUrl } from './appUrl'

const production = {
  indexFileUrl: 'file:///C:/Program%20Files/TaskNote/resources/app.asar/out/renderer/index.html',
}
const development = { ...production, devServerUrl: 'http://localhost:5173' }

describe('isAppUrl', () => {
  it('accepts the packaged index.html, including hash routes', () => {
    expect(isAppUrl(production.indexFileUrl, production)).toBe(true)
    expect(isAppUrl(`${production.indexFileUrl}#/notes`, production)).toBe(true)
  })

  it('rejects other files and remote sites', () => {
    expect(isAppUrl('file:///C:/Windows/System32/drivers/etc/hosts', production)).toBe(false)
    expect(isAppUrl('https://example.com', production)).toBe(false)
    expect(isAppUrl('not a url', production)).toBe(false)
  })

  it('accepts the dev server origin only in development', () => {
    expect(isAppUrl('http://localhost:5173/#/todo/manage', development)).toBe(true)
    expect(isAppUrl('http://localhost:5173/#/todo/manage', production)).toBe(false)
    expect(isAppUrl('http://localhost:9999/', development)).toBe(false)
  })
})

describe('isExternalHttpUrl', () => {
  it('allows only http and https', () => {
    expect(isExternalHttpUrl('https://example.com')).toBe(true)
    expect(isExternalHttpUrl('http://example.com')).toBe(true)
    expect(isExternalHttpUrl('file:///C:/secret.txt')).toBe(false)
    expect(isExternalHttpUrl('javascript:alert(1)')).toBe(false)
    expect(isExternalHttpUrl('mailto:someone@example.com')).toBe(false)
  })
})
