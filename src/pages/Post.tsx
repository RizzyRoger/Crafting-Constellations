import { addDoc, collection, serverTimestamp } from 'firebase/firestore'
import { Link, useParams } from 'react-router-dom'
import { useMe } from '../auth/AuthProvider'
import { Composer } from '../components/Composer'
import { Item } from '../components/Item'
import { LikeButton } from '../components/LikeButton'
import { Quiet } from '../components/Quiet'
import { db } from '../lib/firebase'
import { useDocData, useLiveContent } from '../lib/live'
import type { Comment, Group, Post } from '../lib/types'

export const PostPage = () => {
  const { groupId = '', postId = '' } = useParams()
  const { uid } = useMe()
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

      <Item item={post.data} me={uid} blotSize={32} actions={post.data.status === 'published' && <LikeButton postPath={path} me={uid} count={post.data.likeCount} />}>
        {post.data.title && <h1 className="post__title" style={{ fontSize: 30 }}>{post.data.title}</h1>}
        <p className="voice">{post.data.body}</p>
      </Item>

      <section className="section" aria-labelledby="comments">
        <div className="section__head">
          <h2 id="comments">Comments</h2>
        </div>
        {comments.data.length === 0 && !comments.loading && <p className="empty">No comments yet.</p>}
        <ul className="ruled-list">
          {comments.data.map((c) => (
            <li key={c.id}>
              <Item item={c} me={uid} blotSize={22}>
                <p className="voice">{c.text}</p>
              </Item>
            </li>
          ))}
        </ul>
        {post.data.status === 'published' && <Composer label="Add a comment" submitLabel="Comment" rows={2} onSubmit={reply} />}
      </section>
    </div>
  )
}
