// Opening something that has to be downloaded first in a new tab, kept apart so it can be unit tested.
// Browsers only let a page open a tab during the click itself, and a download can outlast that,
// so the tab opens first, before any await, and is given the file once it arrives.

// The parts of a window this uses
export interface Tab {
  opener: unknown
  closed: boolean
  close: () => void
  location: { replace: (url: string) => void }
}

// Call it straight from the click. opened: false means the browser kept the tab from opening
// (or it was closed while the file came): offer `url` as a link instead, which a click always opens
export const openInNewTab = async (open: () => Tab | null, load: () => Promise<string>) => {
  const tab = open()
  // Whatever loads in the tab can't reach back into this page
  if (tab) tab.opener = null
  try {
    const url = await load()
    if (!tab || tab.closed) return { opened: false, url }
    tab.location.replace(url)
    return { opened: true, url }
  } catch (error) {
    tab?.close()
    throw error
  }
}
