export type RoleChange = 'make' | 'remove'

// Where focus goes as Review asks before a moderator role change, and as it stops asking. Opening
// takes it to the question, which is read out, and a second Enter there does nothing: left where it
// was, it sat on Yes and a second Enter removed the role unheard. Closing gives it back to the
// button that asked, rather than leaving it nowhere
export const roleFocus = (asking: RoleChange | null, asked: RoleChange | null): 'question' | RoleChange | null =>
  asking ? 'question' : asked
