import { addDoc, collection, serverTimestamp } from 'firebase/firestore'
import { Link, useParams } from 'react-router-dom'
import { useMe } from '../auth/AuthProvider'
import { Composer } from '../components/Composer'
import { ConfirmEmail } from '../components/ConfirmEmail'
import { Item } from '../components/Item'
import { LikeButton } from '../components/LikeButton'
import { MentionText } from '../components/MentionText'
import { Quiet } from '../components/Quiet'
import { db } from '../lib/firebase'
import { useDocData, useLiveContent, useQueryData } from '../lib/live'
import { findById, mineFrom, publishedFrom } from '../lib/lookup'
import { useGroupPeople } from '../lib/people'
import { isPlainId } from '../lib/routeIds'
import type { Comment, Group, Post } from '../lib/types'

export const PostPage = () => {
  const { groupId = '', postId = '' } = useParams()
  const { uid, claims } = useMe()
  const path = `groups/${groupId}/posts/${postId}`
  // Ids that can't name a document (an encoded '/') ask for nothing: doc() and startAt() throw on them
  const valid = isPlainId(groupId)
  const group = useDocData<Group>(valid ? `groups/${groupId}` : null)
  const membership = useDocData<{ uid: string }>(valid ? `groups/${groupId}/members/${uid}` : null)
  const member = Boolean(membership.data) && !membership.pending
  // Looked up as published or mine, not by its document: that's refused once someone
  // else's post is withdrawn or removed, and old notices and Back still open here
  const posts = `groups/${groupId}/posts`
  const open = member && isPlainId(postId)
  const published = useQueryData<Post>(open ? `post-published|${path}` : null, () => publishedFrom(db, posts, postId))
  const mine = useQueryData<Post>(open ? `post-mine|${path}|${uid}` : null, () => mineFrom(db, posts, postId, uid))
  const post = findById(mine.data, postId) ?? findById(published.data, postId)
  // Mine is found whatever became of it; withdrawn or removed, it's gone for everyone else
  const gone = post?.status === 'withdrawn' || post?.status === 'removed'
  const comments = useLiveContent<Comment>(post && !gone ? `${path}/comments` : null, uid, { direction: 'asc', max: 100 })
  const people = useGroupPeople(member ? groupId : null, uid)

  if (!valid) return <Quiet>This post isn’t available.</Quiet>
  if (membership.loading || published.loading || mine.loading) return <Quiet>Opening the post…</Quiet>
  if (!member) {
    return (
      <Quiet>
        Join the group to read its posts. <Link to={`/groups/${groupId}`}>Go to the group</Link>
      </Quiet>
    )
  }
  if (!post) {
    return (
      <Quiet>
        This post isn’t available. <Link to={`/groups/${groupId}`}>Back to the group</Link>
      </Quiet>
    )
  }
  if (gone) {
    return (
      <Quiet>
        {post.status === 'withdrawn'
          ? 'You withdrew this post.'
          : 'A moderator removed this post, because it didn’t fit the group’s guidelines.'}{' '}
        <Link to={`/groups/${groupId}`}>Back to the group</Link>
      </Quiet>
    )
  }

  const reply = async (text: string, _title: string | undefined, mentions: string[]) => {
    await addDoc(collection(db, `${path}/comments`), {
      authorUid: uid,
      text,
      ...(mentions.length > 0 ? { mentions } : {}),
      status: 'pending',
      createdAt: serverTimestamp(),
    })
  }

  return (
    <div className="stack reading" style={{ gap: 28 }}>
      <Link to={`/groups/${groupId}?tab=posts`} className="code">
        ← {group.data?.name ?? 'Group'}
      </Link>

      <Item
        item={post}
        me={uid}
        blotSize={32}
        variant="card"
        actions={
          post.status === 'published' && claims.emailVerified && (
            <>
              <LikeButton postPath={path} me={uid} count={post.likeCount} />
              <span className="mark" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="22" height="22">
                  <path d="M5 6.5h14v9H8l-3 3v-12z" />
                </svg>
              </span>
            </>
          )
        }
      >
        {post.title && <h1 className="post__title" style={{ fontSize: 30 }}>{post.title}</h1>}
        <MentionText text={post.body} mentioned={post.mentioned} me={uid} />
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
                <MentionText text={c.text} mentioned={c.mentioned} me={uid} />
              </Item>
            </li>
          ))}
        </ul>
        {post.status === 'published' &&
          (claims.emailVerified ? (
            <Composer shape="bar" label="Comment" submitLabel="Send" rows={1} people={people} onSubmit={reply} />
          ) : (
            <ConfirmEmail />
          ))}
      </section>
    </div>
  )
}
