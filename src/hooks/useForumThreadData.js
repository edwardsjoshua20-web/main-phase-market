import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  getAuthenticatedForumUser,
  getForumPostById,
  incrementForumPostView,
  listForumReplies
} from '@/services/community/forumService';

export function useForumThreadData(postId) {
  const [user, setUser] = useState(null);

  useEffect(() => {
    getAuthenticatedForumUser().then(setUser);
  }, []);

  const { data: post, isLoading: postLoading } = useQuery({
    queryKey: ['forum-post', postId],
    queryFn: async () => {
      const currentPost = await getForumPostById(postId);
      if (currentPost) {
        incrementForumPostView(currentPost).catch(() => {});
      }
      return currentPost;
    },
    enabled: !!postId
  });

  const { data: replies = [], isLoading: repliesLoading } = useQuery({
    queryKey: ['forum-replies', postId],
    queryFn: () => listForumReplies(postId),
    enabled: !!postId,
    refetchInterval: 15000
  });

  const sortedReplies = useMemo(() => [...replies].sort((a, b) => {
    if (a.is_accepted_answer && !b.is_accepted_answer) return -1;
    if (!a.is_accepted_answer && b.is_accepted_answer) return 1;
    return new Date(a.created_date) - new Date(b.created_date);
  }), [replies]);

  return {
    user,
    post,
    replies,
    sortedReplies,
    postLoading,
    repliesLoading
  };
}
