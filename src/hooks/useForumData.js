import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getAuthenticatedForumUser, listForumPosts } from '@/services/community/forumService';

export function useForumData({ game, category, sort, search }) {
  const [user, setUser] = useState(null);

  useEffect(() => {
    getAuthenticatedForumUser().then(setUser);
  }, []);

  const { data: posts = [], isLoading } = useQuery({
    queryKey: ['forum-posts', game, category, sort],
    queryFn: () => listForumPosts({ game, category, sort }),
    refetchInterval: 30000
  });

  const filtered = useMemo(() => posts.filter((post) => (
    !search
      || post.title?.toLowerCase().includes(search.toLowerCase())
      || post.content?.toLowerCase().includes(search.toLowerCase())
      || (post.tags || []).some((tag) => tag.toLowerCase().includes(search.toLowerCase()))
  )), [posts, search]);

  const pinned = useMemo(() => filtered.filter((post) => post.is_pinned).slice(0, 3), [filtered]);
  const feed = useMemo(() => filtered.filter((post) => !post.is_pinned), [filtered]);
  const unanswered = useMemo(() => filtered
    .filter((post) => ['rules_qa', 'card_identification'].includes(post.category) && (post.reply_count || 0) === 0)
    .slice(0, 5)
    .map((post) => ({
      ...post,
      category_label: post.category === 'rules_qa' ? 'Rules' : 'Card Help',
      game_label:
        post.game === 'magic' ? 'Magic'
          : post.game === 'pokemon' ? 'Pokemon'
            : post.game === 'yugioh' ? 'Yu-Gi-Oh!'
              : post.game === 'lorcana' ? 'Lorcana'
                : post.game === 'onepiece' ? 'One Piece'
                  : post.game === 'flesh_and_blood' ? 'Flesh & Blood'
                    : 'General'
    })), [filtered]);

  return {
    user,
    posts,
    filtered,
    pinned,
    feed,
    unanswered,
    isLoading
  };
}
