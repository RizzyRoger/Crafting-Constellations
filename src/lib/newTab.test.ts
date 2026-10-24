import { describe, expect, it, vi } from 'vitest'
import { openInNewTab, type Tab } from './newTab'

const fakeTab = (): Tab & { replace: ReturnType<typeof vi.fn> } => {
  const replace = vi.fn()
  return { opener: 'the admin page', closed: false, close: vi.fn(), location: { replace }, replace }
}

describe('openInNewTab', () => {
  it('opens the tab during the click, before the file arrives', async () => {
    const tab = fakeTab()
    const open = vi.fn(() => tab)
    let arrive = (_url: string) => {}
    const result = openInNewTab(open, () => new Promise<string>((resolve) => (arrive = resolve)))

    // Nothing awaited yet: still inside the click
    expect(open).toHaveBeenCalledTimes(1)
    expect(tab.opener).toBeNull()
    expect(tab.replace).not.toHaveBeenCalled()

    arrive('blob:doc-1')
    await expect(result).resolves.toEqual({ opened: true, url: 'blob:doc-1' })
    expect(tab.replace).toHaveBeenCalledWith('blob:doc-1')
  })

  it('hands back the file as a link when the browser blocked the tab', async () => {
    await expect(openInNewTab(() => null, async () => 'blob:doc-1')).resolves.toEqual({ opened: false, url: 'blob:doc-1' })
  })

  it('hands back the file as a link when the tab was closed while it downloaded', async () => {
    const tab = fakeTab()
    const result = openInNewTab(
      () => tab,
      async () => {
        tab.closed = true
        return 'blob:doc-1'
      },
    )
    await expect(result).resolves.toEqual({ opened: false, url: 'blob:doc-1' })
    expect(tab.replace).not.toHaveBeenCalled()
  })

  it('closes the empty tab and passes the failure on when the download fails', async () => {
    const tab = fakeTab()
    const failure = Object.assign(new Error('denied'), { code: 'storage/unauthorized' })
    await expect(openInNewTab(() => tab, () => Promise.reject(failure))).rejects.toBe(failure)
    expect(tab.close).toHaveBeenCalledTimes(1)
    expect(tab.replace).not.toHaveBeenCalled()
  })

  it('passes the failure on even when there was no tab to close', async () => {
    const failure = new Error('offline')
    await expect(openInNewTab(() => null, () => Promise.reject(failure))).rejects.toBe(failure)
  })
})
