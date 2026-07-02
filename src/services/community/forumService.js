import { backend } from '@/services/backend';

export async function getAuthenticatedForumUser() {
  const isAuthenticated = await backend.auth.isAuthenticated();
  if (!isAuthenticated) return null;
  return backend.auth.getCurrentUser();
}

export async function listForumPosts({ game = 'all', category = 'all', sort = 'latest' }) {
  const filter = {};
  if (game !== 'all') filter.game = game;
  if (category !== 'all') filter.category = category;
  return backend.data.ForumPost.filter(filter, sort === 'hot' ? '-likes' : '-created_date', 50);
}

export async function createForumThread({ form, user }) {
  return backend.data.ForumPost.create({
    ...form,
    author_email: user.email,
    author_name: user.full_name || user.email,
    view_count: 0,
    reply_count: 0,
    likes: 0,
    liked_by: []
  });
}

export async function getForumPostById(postId) {
  const posts = await backend.data.ForumPost.filter({ id: postId }, '-created_date', 1);
  return posts[0] || null;
}

export async function incrementForumPostView(post) {
  if (!post?.id) return;
  return backend.data.ForumPost.update(post.id, {
    view_count: Number(post.view_count || 0) + 1
  });
}

export async function listForumReplies(postId) {
  return backend.data.ForumReply.filter({ post_id: postId }, 'created_date', 200);
}

export async function createForumReply({ postId, replyText, user, post }) {
  await backend.data.ForumReply.create({
    post_id: postId,
    content: replyText,
    author_email: user.email,
    author_name: user.full_name || user.email,
    likes: 0,
    liked_by: [],
    is_accepted_answer: false
  });

  await backend.data.ForumPost.update(postId, {
    reply_count: Number(post?.reply_count || 0) + 1,
    last_reply_at: new Date().toISOString(),
    last_reply_by: user.full_name || user.email
  });
}

export async function toggleForumPostLike({ post, user }) {
  const liked = (post.liked_by || []).includes(user.email);
  const likedBy = liked
    ? post.liked_by.filter((email) => email !== user.email)
    : [...(post.liked_by || []), user.email];

  return backend.data.ForumPost.update(post.id, {
    likes: likedBy.length,
    liked_by: likedBy
  });
}

export async function toggleForumReplyLike({ reply, user }) {
  const liked = (reply.liked_by || []).includes(user.email);
  const likedBy = liked
    ? reply.liked_by.filter((email) => email !== user.email)
    : [...(reply.liked_by || []), user.email];

  return backend.data.ForumReply.update(reply.id, {
    likes: likedBy.length,
    liked_by: likedBy
  });
}

export async function acceptForumReply({ reply, replies, postId }) {
  for (const currentReply of replies) {
    if (currentReply.is_accepted_answer) {
      await backend.data.ForumReply.update(currentReply.id, { is_accepted_answer: false });
    }
  }

  await backend.data.ForumReply.update(reply.id, { is_accepted_answer: true });
  await backend.data.ForumPost.update(postId, { is_solved: true });
}
