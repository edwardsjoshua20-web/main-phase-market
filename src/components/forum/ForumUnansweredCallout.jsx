import { Link } from 'react-router-dom';
import { HelpCircle, ChevronRight } from 'lucide-react';

export default function ForumUnansweredCallout({ items }) {
  if (!items.length) return null;

  return (
    <div className="border border-[#d6dfeb] bg-[#fbfdff] px-5 py-5">
      <div className="flex items-center gap-2 text-sm font-bold text-[#172033]">
        <HelpCircle className="h-4 w-4 text-[#22324d]" />
        Unanswered Questions
      </div>
      <div className="mt-3 space-y-2">
        {items.map((item) => (
          <Link
            key={item.id}
            to={`/ForumThread?id=${item.id}`}
            className="flex items-start justify-between gap-3 border-b border-[#e3eaf3] px-3 py-3 transition-colors hover:bg-[#f7fafe]"
          >
            <div>
              <div className="text-sm font-semibold leading-6 text-[#172033]">{item.title}</div>
              <div className="mt-1 text-[11px] font-bold uppercase tracking-[0.18em] text-[#7a8799]">
                {item.category_label} / {item.game_label}
              </div>
            </div>
            <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-[#7a8799]" />
          </Link>
        ))}
      </div>
    </div>
  );
}
