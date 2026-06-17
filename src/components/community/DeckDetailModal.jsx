import React, { useState, useEffect } from 'react';
import { backend } from '@/services/backend';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Heart, MessageSquare, Eye, Send, X, Swords, User, LogIn } from 'lucide-react';
import { toast } from 'sonner';

export default function DeckDetailModal({ deck, user, onClose, onLike }) {
  const [comment, setComment] = useState('');
  const queryClient = useQueryClient();
  const liked = user && deck.liked_by?.includes(user.email);

  // Increment view count on open
  useEffect(() => {
    backend.data.CommunityDeck.update(deck.id, { views: (deck.views || 0) + 1 }).catch(() => {});
  }, [deck.id]);

  const { data: comments = [] } = useQuery({
    queryKey: ['deckComments', deck.id],
    queryFn: () => backend.data.DeckComment.filter({ deck_id: deck.id }, '-created_date', 50),
  });

  const addCommentMutation = useMutation({
    mutationFn: async () => {
      if (!user) { toast.error('Sign in to comment'); return; }
      if (!comment.trim()) return;
      await backend.data.DeckComment.create({
        deck_id: deck.id,
        user_email: user.email,
        user_name: user.full_name,
        user_avatar: user.avatar_url || null,
        content: comment.trim(),
      });
    },
    onSuccess: () => {
      setComment('');
      queryClient.invalidateQueries(['deckComments', deck.id]);
    },
  });

  const cardCount = deck.items?.reduce((s, i) => s + (i.quantity || 1), 0) || 0;

  // Group cards by type for display
  const grouped = {};
  (deck.items || []).forEach(item => {
    const type = item.type || item.product_type || 'Other';
    if (!grouped[type]) grouped[type] = [];
    grouped[type].push(item);
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col p-0">
        {/* Header */}
        <div className="relative bg-gradient-to-br from-gray-900 to-gray-800 text-white p-6">
          {deck.commander_image && (
            <img src={deck.commander_image} alt="" className="absolute inset-0 w-full h-full object-cover object-top opacity-20" />
          )}
          <div className="relative flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <Badge className="bg-yellow-400 text-gray-900 border-0 mb-2">{deck.format || 'Commander'}</Badge>
              <h2 className="text-2xl font-bold text-white mb-1">{deck.title}</h2>
              {deck.commander_name && <p className="text-yellow-400 font-medium text-sm mb-1">⚔️ {deck.commander_name}</p>}
              <p className="text-gray-400 text-sm">by {deck.user_name || deck.user_email?.split('@')[0]}</p>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-white p-1 shrink-0">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="relative flex items-center gap-4 mt-4">
            <button onClick={onLike} className={`flex items-center gap-1.5 text-sm font-semibold transition-colors ${liked ? 'text-red-400' : 'text-gray-300 hover:text-red-400'}`}>
              <Heart className={`w-4 h-4 ${liked ? 'fill-current' : ''}`} /> {deck.likes || 0}
            </button>
            <span className="flex items-center gap-1.5 text-sm text-gray-400"><Eye className="w-4 h-4" /> {deck.views || 0} views</span>
            <span className="flex items-center gap-1.5 text-sm text-gray-400"><MessageSquare className="w-4 h-4" /> {comments.length} comments</span>
            <span className="flex items-center gap-1.5 text-sm text-gray-400"><Swords className="w-4 h-4" /> {cardCount} cards</span>
          </div>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 grid grid-cols-1 md:grid-cols-2">
          {/* Decklist */}
          <div className="p-5 border-r border-gray-100">
            {deck.description && (
              <div className="mb-4 p-3 bg-gray-50 rounded-xl text-sm text-gray-600 italic">
                "{deck.description}"
              </div>
            )}
            {deck.tags?.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-4">
                {deck.tags.map(tag => (
                  <span key={tag} className="text-xs bg-blue-50 text-blue-600 border border-blue-200 px-2 py-0.5 rounded-full">{tag}</span>
                ))}
              </div>
            )}
            <h3 className="font-bold text-gray-900 mb-3 text-sm uppercase tracking-wide">Decklist ({cardCount} cards)</h3>
            {Object.keys(grouped).length === 0 ? (
              <p className="text-gray-400 text-sm">No cards listed.</p>
            ) : (
              <div className="space-y-3">
                {Object.entries(grouped).map(([type, cards]) => (
                  <div key={type}>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">{type} ({cards.reduce((s, c) => s + (c.quantity || 1), 0)})</p>
                    {cards.map((card, idx) => (
                      <div key={idx} className="flex items-center justify-between py-0.5 text-sm text-gray-700">
                        <span className="truncate">{card.product_name || card.card_name}</span>
                        <span className="text-gray-400 ml-2 shrink-0">×{card.quantity || 1}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Comments */}
          <div className="p-5 flex flex-col">
            <h3 className="font-bold text-gray-900 mb-3 text-sm uppercase tracking-wide">Discussion ({comments.length})</h3>

            <div className="flex-1 overflow-y-auto space-y-3 mb-4 max-h-64">
              {comments.length === 0 ? (
                <p className="text-gray-400 text-sm">No comments yet. Start the discussion!</p>
              ) : (
                comments.map(c => (
                  <div key={c.id} className="flex gap-2.5">
                    <div className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center shrink-0 overflow-hidden">
                      {c.user_avatar ? <img src={c.user_avatar} alt="" className="w-full h-full object-cover" /> : <User className="w-3.5 h-3.5 text-gray-500" />}
                    </div>
                    <div className="flex-1 bg-gray-50 rounded-xl px-3 py-2">
                      <p className="text-xs font-semibold text-gray-700 mb-0.5">{c.user_name || c.user_email?.split('@')[0]}</p>
                      <p className="text-sm text-gray-600">{c.content}</p>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Comment Input */}
            {user ? (
              <div className="flex gap-2 mt-auto">
                <Textarea
                  value={comment}
                  onChange={e => setComment(e.target.value)}
                  placeholder="Share your thoughts, ask about the strategy..."
                  rows={2}
                  className="flex-1 text-sm resize-none"
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addCommentMutation.mutate(); }}}
                />
                <Button onClick={() => addCommentMutation.mutate()} disabled={!comment.trim()} size="icon" className="bg-yellow-400 hover:bg-yellow-300 text-gray-900 self-end h-9 w-9 shrink-0">
                  <Send className="w-4 h-4" />
                </Button>
              </div>
            ) : (
              <Button onClick={() => backend.auth.redirectToLogin(window.location.href)} variant="outline" className="w-full text-sm">
                <LogIn className="w-4 h-4 mr-2" /> Sign in to comment
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}


