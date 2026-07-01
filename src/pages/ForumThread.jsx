import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { backend } from '@/services/backend';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import ForumReplyItem from '@/components/forum/ForumReplyItem';
import ContentShellWide from '@/components/layout/ContentShellWide';
import {
  ArrowLeft,
  ThumbsUp,
  MessageSquare,
  Eye,
  Loader2,
  CheckCircle,
  Tag,
  Clock,
  Pin
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';

const CATEGORY_META = {
  rules_qa: { label: 'Rules', color: 'border-[#cdd8e8] bg-[#eef3f9] text-[#3d5d86]' },
  deckbuilding: { label: 'Deckbuilding', color: 'border-[#d8d5e8] bg-[#f2f0f9] text-[#5d5a86]' },
  card_identification: { label: 'Card Help', color: 'border-[#e8dcc8] bg-[#f7f2ea] text-[#8a6532]' },
  general: { label: 'General', color: 'border-[#d8dee8] bg-[#f6f8fb] text-[#52617a]' }
};

export default function ForumThread() {
  const params = new URLSearchParams(window.location.search);
  const postId = params.get('id');
  const qc = useQueryClient();
  const [user, setUser] = useState(null);
  const [replyText, setReplyText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    backend.auth.isAuthenticated().then(async (auth) => {
      if (auth) setUser(await backend.auth.getCurrentUser());
    });
  }, []);

  const { data: post, isLoading: postLoading } = useQuery({
    queryKey: ['forum-post', postId],
    queryFn: async () => {
      const posts = await backend.data.ForumPost.filter({ id: postId }, '-created_date', 1);
      const currentPost = posts[0];
      if (currentPost) {
        backend.data.ForumPost.update(currentPost.id, { view_count: (currentPost.view_count || 0) + 1 }).catch(() => {});
      }
      return currentPost;
    },
    enabled: !!postId
  });

  const { data: replies = [], isLoading: repliesLoading } = useQuery({
    queryKey: ['forum-replies', postId],
    queryFn: () => backend.data.ForumReply.filter({ post_id: postId }, 'created_date', 200),
    enabled: !!postId,
    refetchInterval: 15000
  });

  const handleReply = async () => {
    if (!replyText.trim() || !user) return;
    setSubmitting(true);
    try {
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
        reply_count: (post?.reply_count || 0) + 1,
        last_reply_at: new Date().toISOString(),
        last_reply_by: user.full_name || user.email
      });
      qc.invalidateQueries(['forum-replies', postId]);
      qc.invalidateQueries(['forum-post', postId]);
      setReplyText('');
      toast.success('Reply posted');
    } catch (error) {
      console.error('Forum reply failed:', error);
      toast.error(error?.message || 'Post reply failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleLikePost = async () => {
    if (!user || !post) return;
    const liked = (post.liked_by || []).includes(user.email);
    const likedBy = liked
      ? post.liked_by.filter((email) => email !== user.email)
      : [...(post.liked_by || []), user.email];
    await backend.data.ForumPost.update(post.id, { likes: likedBy.length, liked_by: likedBy });
    qc.invalidateQueries(['forum-post', postId]);
  };

  const handleLikeReply = async (reply) => {
    if (!user) return;
    const liked = (reply.liked_by || []).includes(user.email);
    const likedBy = liked
      ? reply.liked_by.filter((email) => email !== user.email)
      : [...(reply.liked_by || []), user.email];
    await backend.data.ForumReply.update(reply.id, { likes: likedBy.length, liked_by: likedBy });
    qc.invalidateQueries(['forum-replies', postId]);
  };

  const handleAcceptAnswer = async (reply) => {
    if (!post || user?.email !== post.author_email) return;
    for (const currentReply of replies) {
      if (currentReply.is_accepted_answer) {
        await backend.data.ForumReply.update(currentReply.id, { is_accepted_answer: false });
      }
    }
    await backend.data.ForumReply.update(reply.id, { is_accepted_answer: true });
    await backend.data.ForumPost.update(postId, { is_solved: true });
    qc.invalidateQueries(['forum-replies', postId]);
    qc.invalidateQueries(['forum-post', postId]);
  };

  if (postLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#edf3f8]">
        <Loader2 className="h-8 w-8 animate-spin text-[#22324d]" />
      </div>
    );
  }

  if (!post) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#edf3f8] px-4 text-center text-[#172033]">
        <p className="text-[#44556d]">This thread is not available.</p>
        <p className="text-sm text-[#7a8799]">Use the forum home to open a live discussion or a starter resource.</p>
        <Link to="/Forum" className="text-[#22324d] hover:underline">Back to Forum</Link>
      </div>
    );
  }

  const cat = CATEGORY_META[post.category] || CATEGORY_META.general;
  const isPostAuthor = user?.email === post.author_email;
  const hasLikedPost = (post.liked_by || []).includes(user?.email);
  const sortedReplies = [...replies].sort((a, b) => {
    if (a.is_accepted_answer && !b.is_accepted_answer) return -1;
    if (!a.is_accepted_answer && b.is_accepted_answer) return 1;
    return new Date(a.created_date) - new Date(b.created_date);
  });

  return (
    <div className="min-h-screen bg-[#edf3f8] text-[#172033]">
      <ContentShellWide className="py-6 md:py-8">
        <div className="mx-auto max-w-4xl">
          <Link to="/Forum" className="mb-6 inline-flex items-center gap-2 text-sm text-[#7a8799] transition-colors hover:text-[#172033]">
            <ArrowLeft className="h-4 w-4" />
            Back to Forum
          </Link>

          <div className="mb-6 border border-[#d6dfeb] bg-[#fbfdff] px-5 py-5 md:px-7 md:py-7">
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <span className={`border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] ${cat.color}`}>
                {cat.label}
              </span>
              {post.is_solved && (
                <span className="flex items-center gap-1 border border-[#cdddcf] bg-[#f2f7f2] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-[#4f7a5e]">
                  <CheckCircle className="h-3 w-3" />
                  Solved
                </span>
              )}
              {post.is_pinned && (
                <span className="flex items-center gap-1 border border-[#c7d2e3] bg-[#e9eef6] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-[#22324d]">
                  <Pin className="h-3 w-3" />
                  Pinned
                </span>
              )}
            </div>

            <h1 className="mb-5 text-2xl sm:text-3xl md:text-4xl font-black leading-tight text-[#172033] break-words">{post.title}</h1>

            <div className="mb-5 flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center border border-[#d6dfeb] bg-[#f3f7fb] text-sm font-black text-[#172033]">
                {post.author_name?.charAt(0)?.toUpperCase() || '?'}
              </div>
              <div>
                <p className="text-sm font-black uppercase tracking-[0.16em] text-[#172033]">{post.author_name}</p>
                <p className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-[0.18em] text-[#7a8799]">
                  <Clock className="h-3 w-3" />
                  {post.created_date ? formatDistanceToNow(new Date(post.created_date), { addSuffix: true }) : ''}
                </p>
              </div>
            </div>

            <p className="whitespace-pre-wrap text-[15px] leading-8 text-[#44556d]">{post.content}</p>

            {(post.tags || []).length > 0 && (
              <div className="mt-5 flex flex-wrap items-center gap-2">
                <Tag className="h-3.5 w-3.5 text-[#7a8799]" />
                {post.tags.map((tag) => (
                  <span key={tag} className="border border-[#d6dfeb] bg-[#f5f8fc] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-[#52617a]">
                    #{tag}
                  </span>
                ))}
              </div>
            )}

            <div className="mt-6 flex flex-wrap items-center gap-2 sm:gap-3 border-t border-[#e3eaf3] pt-4 text-sm text-[#52617a]">
              <button
                onClick={handleLikePost}
                disabled={!user}
                className={`flex items-center gap-1.5 border px-3 py-2 font-bold uppercase tracking-[0.16em] transition-colors ${
                  hasLikedPost ? 'border-[#c7d2e3] bg-[#e9eef6] text-[#22324d]' : 'border-[#d6dfeb] text-[#52617a] hover:border-[#c7d2e3] hover:text-[#22324d]'
                } disabled:cursor-default disabled:opacity-40`}
              >
                <ThumbsUp className="h-4 w-4" />
                {post.likes || 0}
              </button>
              <span className="flex items-center gap-1.5 border border-[#d6dfeb] px-3 py-2 font-bold uppercase tracking-[0.16em]">
                <MessageSquare className="h-4 w-4" />
                {post.reply_count || 0} replies
              </span>
              <span className="flex items-center gap-1.5 border border-[#d6dfeb] px-3 py-2 font-bold uppercase tracking-[0.16em]">
                <Eye className="h-4 w-4" />
                {post.view_count || 0} views
              </span>
            </div>
          </div>

          <div className="mb-6">
            {repliesLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-[#7a8799]" />
              </div>
            ) : sortedReplies.length === 0 ? (
              <div className="border border-[#d6dfeb] bg-[#fbfdff] px-5 py-8 text-center text-[#7a8799]">
                No replies yet. Be the first to respond.
              </div>
            ) : (
              <div className="space-y-3">
                <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.22em] text-[#7a8799]">
                  {sortedReplies.length} {sortedReplies.length === 1 ? 'Reply' : 'Replies'}
                </p>
                {sortedReplies.map((reply) => (
                  <ForumReplyItem
                    key={reply.id}
                    reply={reply}
                    user={user}
                    isPostAuthor={isPostAuthor}
                    onAccept={handleAcceptAnswer}
                    onLike={handleLikeReply}
                  />
                ))}
              </div>
            )}
          </div>

          {user ? (
            <div className="border border-[#d6dfeb] bg-[#fbfdff] px-5 py-5">
              <h3 className="mb-3 text-lg font-black text-[#172033]">Add Your Reply</h3>
              <textarea
                rows={4}
                placeholder="Share your knowledge, answer the question, or join the discussion..."
                value={replyText}
                onChange={(event) => setReplyText(event.target.value)}
                className="w-full resize-none border border-[#d6dfeb] bg-white px-4 py-3 text-sm text-[#172033] placeholder:text-[#7a8799] transition-colors focus:border-[#d9a441] focus:outline-none"
              />
              <div className="mt-3 flex justify-stretch sm:justify-end">
                <Button
                  onClick={handleReply}
                  disabled={submitting || !replyText.trim()}
                  className="w-full sm:w-auto bg-[#22324d] font-black text-white hover:bg-[#1a2740]"
                >
                  {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Post Reply
                </Button>
              </div>
            </div>
          ) : (
            <div className="border border-[#d6dfeb] bg-[#fbfdff] px-5 py-6 text-center">
              <p className="mb-3 text-[#5d6b7f]">Sign in to join the discussion</p>
              <Button onClick={() => backend.auth.redirectToLogin(window.location.href)} className="bg-[#22324d] font-black text-white hover:bg-[#1a2740]">
                Sign In
              </Button>
            </div>
          )}
        </div>
      </ContentShellWide>
    </div>
  );
}
