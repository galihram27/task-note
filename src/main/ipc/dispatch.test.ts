import { describe, expect, it, vi } from 'vitest'
import { AppError } from '../errors'
import { dispatch, type IpcSender } from './dispatch'

const appUrls = {
  devServerUrl: 'http://localhost:5173',
  indexFileUrl: 'file:///C:/TaskNote/resources/app.asar/out/renderer/index.html',
}
const appSender: IpcSender = { frameUrl: 'http://localhost:5173/#/todo/manage', isMainFrame: true }

describe('dispatch', () => {
  it('returns the handler result for valid input from the app window', async () => {
    const handler = vi.fn(() => '/notes')
    const result = await dispatch('settings:get', appSender, { key: 'ui.lastRoute' }, handler, {
      appUrls,
    })
    expect(result).toEqual({ ok: true, data: '/notes' })
    expect(handler).toHaveBeenCalledWith({ key: 'ui.lastRoute' })
  })

  it('rejects invalid input with VALIDATION without calling the handler', async () => {
    const handler = vi.fn()
    const result = await dispatch(
      'settings:set',
      appSender,
      { key: 'ui.lastRoute', value: 42 },
      handler,
      { appUrls },
    )
    expect(result).toMatchObject({ ok: false, error: { code: 'VALIDATION' } })
    expect(result.ok ? '' : result.error.message).toContain('value')
    expect(handler).not.toHaveBeenCalled()
  })

  it('rejects unknown keys and extra properties', async () => {
    const handler = vi.fn()
    const wrongKey = await dispatch(
      'settings:set',
      appSender,
      { key: 'backup.dir', value: 'C:/' },
      handler,
      { appUrls },
    )
    const extraProp = await dispatch(
      'settings:get',
      appSender,
      { key: 'ui.lastRoute', admin: true },
      handler,
      { appUrls },
    )
    expect(wrongKey).toMatchObject({ ok: false, error: { code: 'VALIDATION' } })
    expect(extraProp).toMatchObject({ ok: false, error: { code: 'VALIDATION' } })
    expect(handler).not.toHaveBeenCalled()
  })

  it.each<[string, IpcSender]>([
    ['a remote site', { frameUrl: 'https://evil.example/', isMainFrame: true }],
    [
      'another local file',
      { frameUrl: 'file:///C:/Users/me/Downloads/page.html', isMainFrame: true },
    ],
    ['a subframe of the app', { frameUrl: 'http://localhost:5173/', isMainFrame: false }],
    ['a destroyed frame', { frameUrl: null, isMainFrame: true }],
  ])('rejects calls from %s with FORBIDDEN', async (_label, sender) => {
    const handler = vi.fn()
    const result = await dispatch('app:getInfo', sender, undefined, handler, { appUrls })
    expect(result).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } })
    expect(handler).not.toHaveBeenCalled()
  })

  it('passes AppError codes and messages through to the renderer', async () => {
    const result = await dispatch(
      'settings:get',
      appSender,
      { key: 'ui.lastRoute' },
      () => {
        throw new AppError('NOT_FOUND', 'Setting not found.')
      },
      { appUrls },
    )
    expect(result).toEqual({
      ok: false,
      error: { code: 'NOT_FOUND', message: 'Setting not found.' },
    })
  })

  it('hides unexpected error details behind INTERNAL and reports them', async () => {
    const onUnexpectedError = vi.fn()
    const result = await dispatch(
      'app:getInfo',
      appSender,
      undefined,
      async () => {
        throw new Error('SQLITE_CORRUPT: database disk image is malformed at C:/secret/path')
      },
      { appUrls, onUnexpectedError },
    )
    expect(result).toMatchObject({ ok: false, error: { code: 'INTERNAL' } })
    expect(result.ok ? '' : result.error.message).not.toContain('secret')
    expect(onUnexpectedError).toHaveBeenCalledOnce()
  })
})
