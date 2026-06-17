import { ThumbsUp, CheckCircle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

export default function ForumReplyItem({ reply, user, isPostAuthor, onAccept, onLike }) {
  const hasLiked = (reply.liked_by || []).includes(user?.email);

  return (
    <div className={`flex gap-4 border px-4 py-4 transition-colors ${
      reply.is_accepted_answer
        ? 'border-[#cdddcf] bg-[#f2f7f2]'
        : 'border-[#d6dfeb] bg-[#fbfdff]'
    }`}>
      <div className="shrink-0">
        <div className="flex h-10 w-10 items-center justify-center border border-[#d6dfeb] bg-[#f3f7fb] text-sm font-black text-[#1d2738]">
          {reply.author_name?.charAt(0)?.toUpperCase() || '?'}
        </div>
      </div>

      <div className="min-w-0 flex-1">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className="text-sm font-black uppercase tracking-[0.16em] text-[#1d2738]">{reply.author_name}</span>
          {reply.is_accepted_answer && (
            <span className="flex items-center gap-1 border border-[#cdddcf] bg-[#f2f7f2] px-2 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-[#4f7a5e]">
              <CheckCircle className="h-3 w-3" />
              Accepted Answer
            </span>
          )}
          <span className="ml-auto text-[11px] font-bold uppercase tracking-[0.18em] text-[#7a8799]">
            {reply.created_date ? formatDistanceToNow(new Date(reply.created_date), { addSuffix: true }) : ''}
          </span>
        </div>

        <p className="whitespace-pre-wrap text-sm leading-7 text-[#44556d]">{reply.content}</p>

        <div className="mt-4 flex items-center gap-4">
          <button
            onClick={() => onLike(reply)}
            className={`flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.18em] transition-colors ${
              hasLiked ? 'text-[#22324d]' : 'text-[#7a8799] hover:text-[#22324d]'
            }`}
          >
            <ThumbsUp className="h-3.5 w-3.5" />
            <span>{reply.likes || 0}</span>
          </button>
          {isPostAuthor && !reply.is_accepted_answer && (
            <button
              onClick={() => onAccept(reply)}
              className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.18em] text-[#7a8799] transition-colors hover:text-[#4f7a5e]"
            >
              <CheckCircle className="h-3.5 w-3.5" />
              Mark as Answer
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
