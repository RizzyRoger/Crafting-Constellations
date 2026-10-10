// Two people share one id for their connection and their private thread
export const pairIdOf = (a: string, b: string) => [a, b].sort().join('_')

export const otherInPair = (pairId: string, me: string) => pairId.split('_').find((uid) => uid !== me) ?? ''
