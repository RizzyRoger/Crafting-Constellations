import { addDoc, collection, serverTimestamp } from 'firebase/firestore'
import { Link, useParams } from 'react-router-dom'
import { useMe } from '../auth/AuthProvider'
import { Composer } from '../components/Composer'
import { ConfirmEmail } from '../components/ConfirmEmail'
import { Item } from '../components/Item'
import { LikeButton } from '../components/LikeButton'
import { Quiet } from '../components/Quiet'
import { db } from '../lib/firebase'
import { useDocData, useLiveContent } from '../lib/live'
import type { Comment, Group, Post } from '../lib/types'

export const PostPage = () => {
  const { groupId = '', postId = '' } = useParams()
  const { uid, claims } = useMe()
  const path = `groups/${groupId}/posts/${postId}`
  const group = useDocData<Group>(`groups/${groupId}`)
  const membership = useDocData<{ uid: string }>(`groups/${groupId}/members/${uid}`)
  const member = Boolean(membership.data) && !membership.pending
  const post = useDocData<Post>(member ? path : null)
  const comments = useLiveContent<Comment>(post.data ? `${path}/comments` : null, uid, { direction: 'asc', max: 100 })

  if (membership.loading || post.loading) return <Quiet>Opening the post…</Quiet>
  if (!member) {
    return (
      <Quiet>
        Join the group to read its posts. <Link to={`/groups/${groupId}`}>Go to the group</Link>
      </Quiet>
    )
  }
  if (!post.data || post.error) {
    return (
      <Quiet>
        This post isn’t available. <Link to={`/groups/${groupId}`}>Back to the group</Link>
      </Quiet>
    )
  }

  const reply = async (text: string) => {
    await addDoc(collection(db, `${path}/comments`), { authorUid: uid, text, status: 'pending', createdAt: serverTimestamp() })
  }

  return (
    <div className="stack" style={{ gap: 28, maxWidth: 760 }}>
      <Link to={`/groups/${groupId}?tab=posts`} className="code">
        ← {group.data?.name ?? 'Group'}
      </Link>

      <Item
        item={post.data}
        me={uid}
        blotSize={32}
        variant="card"
        actions={
          post.data.status === 'published' && claims.emailVerified && (
            <>
              <LikeButton postPath={path} me={uid} count={post.data.likeCount} />
              <span className="mark" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="22" height="22">
                  <path d="M5 6.5h14v9H8l-3 3v-12z" />
                </svg>
              </span>
            </>
          )
        }
      >
        {post.data.title && <h1 className="post__title" style={{ fontSize: 30 }}>{post.data.title}</h1>}
        <p className="voice">{post.data.body}</p>
      </Item>

      <section className="section comment-break" aria-labelledby="comments">
        <div className="section__head">
          <h2 id="comments">Comments</h2>
        </div>
        {comments.data.length === 0 && !comments.loading && <p className="empty">No comments yet.</p>}
        <ul className="post-list">
          {comments.data.map((c) => (
            <li key={c.id}>
              <Item item={c} me={uid} blotSize={36} variant="comment">
                <p className="voice">{c.text}</p>
              </Item>
            </li>
          ))}
        </ul>
        {post.data.status === 'published' &&
          (claims.emailVerified ? (
            <Composer shape="bar" label="Comment" submitLabel="Send" rows={1} onSubmit={reply} />
          ) : (
            <ConfirmEmail />
          ))}
      </section>
    </div>
  )
}
