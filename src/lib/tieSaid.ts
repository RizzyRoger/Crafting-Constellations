// What a change to where two people stand did, said once it's through. Its button goes with the
// change (the row leaves, or swaps for another), so this is how it's heard
export type TieChange = 'request' | 'accept' | 'decline' | 'cancel' | 'disconnect' | 'block' | 'unblock'

export const tieSaid = (change: TieChange, name = 'them') =>
  ({
    request: `Request sent to ${name}.`,
    accept: `Connected with ${name}. You can write privately now.`,
    decline: `Request from ${name} set aside.`,
    cancel: `Request to ${name} cancelled.`,
    disconnect: `Disconnected from ${name}.`,
    block: `You blocked ${name}.`,
    unblock: `Unblocked ${name}.`,
  })[change]
