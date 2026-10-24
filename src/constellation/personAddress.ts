// Where choosing someone from the rail search goes. On the chart already, it keeps the view
// that's open there, so picking someone from Groups or List doesn't jump back to Friends
export const personAddress = (here: { pathname: string; search: string }, person: string) => {
  const params = new URLSearchParams(here.pathname === '/constellation' ? here.search : '')
  params.set('person', person)
  return `/constellation?${params}`
}
