import { FirebaseError } from 'firebase/app'

interface ClaimSteps {
  // A fresh token's claims (AuthProvider's refreshClaims)
  refresh: () => Promise<{ admin: boolean }>
  // The first-moderator list (bootstrapAdmin), which refuses anyone not on it
  bootstrap: () => Promise<unknown>
}

// Someone another moderator made one holds a token that doesn't say so yet. A fresh one may,
// and only when it doesn't is the first-moderator list asked, which would refuse them
export const claimModerator = async ({ refresh, bootstrap }: ClaimSteps) => {
  if ((await refresh()).admin) return
  await bootstrap()
  await refresh()
}

// A moderator call the server turned away (requireAdmin asks Auth, so it knows the role was
// removed before the token here does). Other failures say nothing about the role
export const refusedAsModerator = (error: unknown) => error instanceof FirebaseError && error.code === 'functions/permission-denied'
