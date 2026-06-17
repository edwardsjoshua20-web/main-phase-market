import { Link } from 'react-router-dom';
import { BookOpen, ChevronRight } from 'lucide-react';

export default function ForumReferenceCard() {
  return (
    <Link
      to="/RulesReference"
      className="block border border-[#d6dfeb] bg-[#fbfdff] px-5 py-5 transition-colors hover:border-[#c7d2e3] hover:bg-white"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-bold text-[#172033]">
            <BookOpen className="h-4 w-4 text-[#22324d]" />
            Rules Reference
          </div>
          <div className="mt-2 text-sm leading-6 text-[#5d6b7f]">
            Open the reference center for timing, rulings, and clean answer checks without digging through old threads.
          </div>
        </div>
        <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-[#7a8799]" />
      </div>
    </Link>
  );
}
