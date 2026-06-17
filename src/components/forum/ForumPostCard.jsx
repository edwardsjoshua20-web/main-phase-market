import { Link } from 'react-router-dom';
import { MessageSquare, Pin, CheckCircle, Clock, ChevronRight } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

const CATEGORY_META = {
  rules_qa: { label: 'Rules', color: 'border-[#cdd8e8] bg-[#eef3f9] text-[#3d5d86]' },
  deckbuilding: { label: 'Deckbuilding', color: 'border-[#d8d5e8] bg-[#f2f0f9] text-[#5d5a86]' },
  card_identification: { label: 'Card Help', color: 'border-[#e8dcc8] bg-[#f7f2ea] text-[#8a6532]' },
  general: { label: 'General', color: 'border-[#d8dee8] bg-[#f6f8fb] text-[#52617a]' }
};

const GAME_META = {
  magic: { label: 'Magic', color: 'text-[#5b6f8f]' },
  pokemon: { label: 'Pokemon', color: 'text-[#4f7fa9]' },
  yugioh: { label: 'Yu-Gi-Oh!', color: 'text-[#746497]' },
  lorcana: { label: 'Lorcana', color: 'text-[#5d79a3]' },
  onepiece: { label: 'One Piece', color: 'text-[#9a6a61]' },
  flesh_and_blood: { label: 'Flesh & Blood', color: 'text-[#9b6767]' },
  general: { label: 'General', color: 'text-[#52617a]' }
};

export default function ForumPostCard({ post }) {
  const cat = CATEGORY_META[post.category] || CATEGORY_META.general;
  const gmeta = post.game ? (GAME_META[post.game] || GAME_META.general) : null;
  const timeAgo = post.last_reply_at || post.created_date
    ? formatDistanceToNow(new Date(post.last_reply_at || post.created_date), { addSuffix: true })
    : '';

  return (
    <Link
      to={`/ForumThread?id=${post.id}`}
      className="group grid gap-4 border border-[#d6dfeb] bg-[#fbfdff] px-4 py-4 transition-colors hover:border-[#c2cfdf] hover:bg-white md:grid-cols-[minmax(0,1fr)_8.5rem]"
    >
      <div className="min-w-0">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {post.is_pinned && <Pin className="h-3.5 w-3.5 shrink-0 text-[#22324d]" />}
          {post.is_solved && <CheckCircle className="h-3.5 w-3.5 shrink-0 text-[#4f7a5e]" />}
          {post.is_pinned && (
            <span className="border border-[#c7d2e3] bg-[#e9eef6] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-[#22324d]">
              Pinned
            </span>
          )}
          <span className={`border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] ${cat.color}`}>
            {cat.label}
          </span>
          {gmeta && (
            <span className={`text-[11px] font-bold uppercase tracking-[0.18em] ${gmeta.color}`}>
              {gmeta.label}
            </span>
          )}
          {(post.tags || []).slice(0, 2).map((tag) => (
            <span key={tag} className="px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#66758a]">
              #{tag}
            </span>
          ))}
        </div>

        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="line-clamp-2 text-[1rem] font-black leading-snug text-[#1d2738] transition-colors group-hover:text-[#22324d]">
              {post.title}
            </h3>
            <p className="mt-2 line-clamp-2 text-sm leading-6 text-[#5d6b7f]">{post.content}</p>
          </div>
          <ChevronRight className="mt-0.5 hidden h-4 w-4 shrink-0 text-[#7a8799] transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-[#22324d] md:block" />
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#7a8799]">
          <span className="font-semibold uppercase tracking-[0.16em] text-[#44556d]">{post.author_name}</span>
          <span className="flex items-center gap-1 uppercase tracking-[0.12em]">
            <Clock className="h-3 w-3" />
            {timeAgo}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 border-t border-[#e3eaf3] pt-3 md:block md:min-w-[8.5rem] md:border-l md:border-t-0 md:pl-4 md:pt-0">
        <div className="px-3 py-1 text-right md:mb-3">
          <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#7a8799]">Replies</div>
          <div className="mt-1 flex items-center justify-end gap-1 text-lg font-black text-[#172033]">
            <MessageSquare className="h-3.5 w-3.5 text-[#22324d]" />
            {post.reply_count || 0}
          </div>
        </div>
        <div className="px-3 py-1 text-right">
          <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#7a8799]">Activity</div>
          <div className="mt-1 text-sm font-bold text-[#44556d]">{timeAgo || 'New'}</div>
        </div>
      </div>
    </Link>
  );
}
