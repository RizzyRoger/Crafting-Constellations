// An id read from the address. React Router decodes %2F, so /groups/a%2Fb asks for 'a/b':
// that builds no document path, or the wrong one, and doc() and startAt() throw where a reload
// can't help. Firestore never makes an id like that, so the page should say it isn't here
export const isPlainId = (id: string) => id !== '' && !id.includes('/')
