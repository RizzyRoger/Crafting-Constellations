// Obsidian-style ego graph: you at the center, friends on the first ring,
// and each friend's own friends one step further out, so you can see who
// you might reach next.

export interface EgoTie {
  id: string
  uids: [string, string]
}

export interface EgoInput {
  width: number
  height: number
  me: string
  friendships: EgoTie[]
  pending: EgoTie[]
  blocked?: string[]
  sharedGroups: Record<string, number>
}

export type EgoRole = 'me' | 'direct' | 'extended'

export interface EgoNode {
  uid: string
  x: number
  y: number
  r: number
  role: EgoRole
}

export interface EgoEdge {
  id: string
  a: string
  b: string
  dashed: boolean
}

export interface EgoLayout {
  width: number
  height: number
  nodes: EgoNode[]
  edges: EgoEdge[]
}

const other = (uids: [string, string], uid: string) => (uids[0] === uid ? uids[1] : uids[0])

const radiusFor = (role: EgoRole, shared: number) => {
  if (role === 'me') return 9
  return 5 + Math.min(10, Math.sqrt(Math.max(0, shared)) * 4)
}

// Who sits around you: friends and pending requests on the first ring, each friend's own
// friends one step out, blocked people nowhere. The chart places them; the List view and
// the dots' labels name them
export interface EgoCircle {
  friends: Set<string>
  pending: Set<string>
  // A friend's friend, and the friends of yours they're tied to. They're drawn beside the first
  through: Map<string, string[]>
}

export const egoCircle = ({ me, friendships, pending, blocked = [] }: Pick<EgoInput, 'me' | 'friendships' | 'pending' | 'blocked'>): EgoCircle => {
  const blockedSet = new Set(blocked)
  const friendSet = new Set<string>()
  for (const tie of friendships) {
    if (!tie.uids.includes(me)) continue
    const uid = other(tie.uids, me)
    if (uid !== me && !blockedSet.has(uid)) friendSet.add(uid)
  }

  const pendingSet = new Set<string>()
  for (const tie of pending) {
    if (!tie.uids.includes(me)) continue
    const uid = other(tie.uids, me)
    if (uid !== me && !friendSet.has(uid) && !blockedSet.has(uid)) pendingSet.add(uid)
  }

  const direct = new Set([...friendSet, ...pendingSet])
  const through = new Map<string, string[]>()
  for (const tie of friendships) {
    const [a, b] = tie.uids
    const consider = (person: string, friend: string) => {
      if (person === me || direct.has(person) || blockedSet.has(person)) return
      if (!friendSet.has(friend) || through.get(person)?.includes(friend)) return
      through.set(person, [...(through.get(person) ?? []), friend])
    }
    consider(b, a)
    consider(a, b)
  }

  return { friends: friendSet, pending: pendingSet, through }
}

// No friend or request of yours for the chart to draw, however many other people are friends:
// the chart would be one dot, so the page welcomes you instead
export const chartIsEmpty = (input: Pick<EgoInput, 'me' | 'friendships' | 'pending' | 'blocked'>) => {
  const { friends, pending } = egoCircle(input)
  return friends.size === 0 && pending.size === 0
}

export const layoutEgo = ({ width, height, me, friendships, pending, blocked = [], sharedGroups }: EgoInput): EgoLayout => {
  const { friends: friendSet, pending: pendingSet, through } = egoCircle({ me, friendships, pending, blocked })
  const direct = new Set([...friendSet, ...pendingSet])

  const cx = width / 2
  const cy = height / 2
  const inner = Math.min(width, height) * 0.3
  const outer = Math.min(width, height) * 0.44
  const pos = new Map<string, { x: number; y: number }>()
  pos.set(me, { x: cx, y: cy })

  const ring = [...friendSet].sort().concat([...pendingSet].sort())
  const angleOf = new Map<string, number>()
  ring.forEach((uid, i) => {
    const angle = -Math.PI / 2 + (Math.PI * 2 * i) / ring.length
    angleOf.set(uid, angle)
    pos.set(uid, { x: cx + Math.cos(angle) * inner, y: cy + Math.sin(angle) * inner })
  })

  const byFriend = new Map<string, string[]>()
  for (const [uid, [friend]] of through) {
    const list = byFriend.get(friend) ?? []
    list.push(uid)
    byFriend.set(friend, list)
  }
  for (const [friend, list] of byFriend) {
    const base = angleOf.get(friend) ?? 0
    const sorted = [...list].sort()
    const span = Math.min(0.9, 0.38 * sorted.length)
    sorted.forEach((uid, i) => {
      const spread = sorted.length === 1 ? 0 : (i - (sorted.length - 1) / 2) * (span / sorted.length)
      const angle = base + spread
      pos.set(uid, { x: cx + Math.cos(angle) * outer, y: cy + Math.sin(angle) * outer })
    })
  }

  const roleOf = (uid: string): EgoRole => {
    if (uid === me) return 'me'
    if (direct.has(uid)) return 'direct'
    return 'extended'
  }

  const nodes: EgoNode[] = [...pos.entries()].map(([uid, p]) => {
    const role = roleOf(uid)
    return {
      uid,
      x: p.x,
      y: p.y,
      r: radiusFor(role, sharedGroups[uid] ?? 0),
      role,
    }
  })

  const placed = new Set(pos.keys())
  const edges: EgoEdge[] = []
  for (const tie of friendships) {
    const [a, b] = tie.uids
    if (placed.has(a) && placed.has(b)) edges.push({ id: tie.id, a, b, dashed: false })
  }
  for (const tie of pending) {
    const [a, b] = tie.uids
    if (placed.has(a) && placed.has(b)) edges.push({ id: tie.id, a, b, dashed: true })
  }

  return { width, height, nodes, edges }
}
