import { addDoc, collection, serverTimestamp } from 'firebase/firestore'
import { useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useMe } from '../auth/AuthProvider'
import { Composer } from '../components/Composer'
import { ConfirmEmail } from '../components/ConfirmEmail'
import { HostNote } from '../components/HostNote'
import { Item } from '../components/Item'
import { LikeButton } from '../components/LikeButton'
import { MentionText } from '../components/MentionText'
import { PageHead } from '../components/PageHead'
import { Quiet } from '../components/Quiet'
import { Talk } from '../components/Talk'
import { describeError } from '../lib/callables'
import { db } from '../lib/firebase'
import { useDocData, useLiveContent } from '../lib/live'
import { useGroupPeople } from '../lib/people'
import { joinGroup, leaveGroup } from '../lib/social'
import type { Group as GroupDoc, Post, Profile } from '../lib/types'
import { HEAD_DESCENDING } from '../wash/strokes'

type Tab = 'talk' | 'posts'

const peopleHere = (count: number | undefined) => {
  const n = count ?? 0
  return n === 1 ? '1 person is here.' : `${n} people are here.`
}

const RoomHost = ({ description, count }: { description?: string; count?: number }) => (
  <>
    {description ? <p>{description}</p> : null}
    <p>{peopleHere(count)}</p>
  </>
)

const Posts = ({ group, me, verified, people }: { group: GroupDoc; me: string; verified: boolean; people: Profile[] }) => {
  const posts = useLiveContent<Post>(`groups/${group.id}/posts`, me, { max: 40 })
  const field = useRef<HTMLTextAreaElement>(null)

  const publish = async (body: string, title: string | undefined, mentions: string[]) => {
    await addDoc(collection(db, `groups/${group.id}/posts`), {
      authorUid: me,
      ...(title ? { title } : {}),
      body,
      ...(mentions.length > 0 ? { mentions } : {}),
      status: 'pending',
      createdAt: serverTimestamp(),
    })
  }

  const quiet = posts.data.length === 0 && !posts.loading

  return (
    <div className="stack" style={{ gap: 28 }}>
      {quiet && (
        <HostNote action={verified ? { label: 'Write the first note', onClick: () => field.current?.focus() } : undefined}>
          <RoomHost description={group.description} count={group.memberCount} />
        </HostNote>
      )}
      {verified ? (
        <Composer
          expandable
          label="Make a post"
          withTitle
          rows={4}
          max={4000}
          submitLabel="Send"
          people={people}
          textRef={field}
          onSubmit={publish}
        />
      ) : (
        <ConfirmEmail />
      )}
      {quiet ? null : (
        <ul className="post-list">
          {posts.data.map((p) => (
            <li key={p.id}>
              <Item
                item={p}
                me={me}
                variant="card"
                actions={
                  p.status === 'published' && verified && (
                    <>
                      <LikeButton postPath={p.path} me={me} count={p.likeCount} />
                      <Link to={`/groups/${group.id}/posts/${p.id}`} className="mark" aria-label={p.commentCount ? `${p.commentCount} comments` : 'Comment'}>
                        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
                          <path d="M5 6.5h14v9H8l-3 3v-12z" />
                        </svg>
                      </Link>
                    </>
                  )
                }
              >
                {p.title && (
                  <h3 className="post__title">
                    {p.status === 'published' ? <Link to={`/groups/${group.id}/posts/${p.id}`}>{p.title}</Link> : p.title}
                  </h3>
                )}
                <MentionText text={p.body.length > 600 ? `${p.body.slice(0, 600)}…` : p.body} mentioned={p.mentioned} me={me} />
              </Item>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export const Group = () => {
  const { groupId = '' } = useParams()
  const { uid, claims } = useMe()
  const [params, setParams] = useSearchParams()
  const tab: Tab = params.get('tab') === 'posts' ? 'posts' : 'talk'
  const group = useDocData<GroupDoc>(`groups/${groupId}`)
  const membership = useDocData<{ uid: string }>(`groups/${groupId}/members/${uid}`)
  const people = useGroupPeople(groupId, uid)
  const [leaving, setLeaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (group.loading || membership.loading) return <Quiet>Opening the group…</Quiet>
  if (!group.data) return <Quiet>This group isn’t here any more.</Quiet>

  // Member-only listeners open only once the server has the membership, and
  // close before it goes, so rules never see a reader they'd reject
  const member = Boolean(membership.data) && !membership.pending && !leaving
  const joining = Boolean(membership.data) && membership.pending

  const join = async () => {
    setError(null)
    try {
      await joinGroup(groupId, uid)
    } catch (e) {
      setError(describeError(e))
    }
  }

  const leave = async () => {
    setLeaving(true)
    setError(null)
    try {
      await new Promise((r) => setTimeout(r, 0))
      await leaveGroup(groupId, uid)
    } catch (e) {
      setError(describeError(e))
    } finally {
      setLeaving(false)
    }
  }

  return (
    <div className="pane">
      <PageHead
        title={group.data.name}
        kicker={`${group.data.constellationName} · ${group.data.memberCount ?? 0} ${group.data.memberCount === 1 ? 'person' : 'people'}`}
        lede={group.data.description}
        strokes={HEAD_DESCENDING}
        seed={groupId.length * 13}
      >
        <div className="row">
          {member ? (
            <button type="button" className="link-btn" onClick={() => void leave()}>
              Leave group
            </button>
          ) : joining ? (
            <span className="status-note">joining…</span>
          ) : (
            <button type="button" className="act act--wash" onClick={() => void join()}>
              Join this group
            </button>
          )}
        </div>
      </PageHead>

      {error && <p className="error">{error}</p>}

      {member ? (
        <>
          <div className="tabs" role="tablist" aria-label="Group">
            <button type="button" role="tab" aria-selected={tab === 'talk'} onClick={() => setParams({})}>
              Talk
            </button>
            <button type="button" role="tab" aria-selected={tab === 'posts'} onClick={() => setParams({ tab: 'posts' })}>
              Posts
            </button>
          </div>
          {tab === 'talk' ? (
            <Talk
              path={`groups/${groupId}/messages`}
              me={uid}
              verified={claims.emailVerified}
              people={people}
              host={<RoomHost description={group.data.description} count={group.data.memberCount} />}
            />
          ) : (
            <Posts group={group.data} me={uid} verified={claims.emailVerified} people={people} />
          )}
        </>
      ) : (
        <div className="host">
          <div className="host__copy">
            {group.data.description ? <p>{group.data.description}</p> : null}
            <p>Join to read and write here. You can leave any time.</p>
          </div>
        </div>
      )}
    </div>
  )
}
