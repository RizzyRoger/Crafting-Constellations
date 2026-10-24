// Takes focus to an element that isn't otherwise focusable, for this one move. Left focusable, a
// click on its plain text would focus it too, and the next Tab would start from its top instead
// of from where the click was. So it stops being focusable once focus or a click moves on
export const focusForNow = (el: HTMLElement, options?: FocusOptions) => {
  const done = () => {
    el.removeAttribute('tabindex')
    el.removeEventListener('blur', done)
    el.removeEventListener('pointerdown', done)
  }
  el.tabIndex = -1
  el.focus(options)
  el.addEventListener('blur', done)
  el.addEventListener('pointerdown', done)
}

// The page itself, for focus whose place has gone with nothing nearer to take it: the shell's main,
// or the page's heading where there's no shell (the landing page, signing in)
export const pageStart = (page: Pick<Document, 'getElementById' | 'querySelector'>) => page.getElementById('main') ?? page.querySelector('h1')
