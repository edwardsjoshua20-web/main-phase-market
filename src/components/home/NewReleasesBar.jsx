import React from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { backend } from '@/services/backend';
import { useQuery } from '@tanstack/react-query';
import { Calendar, ChevronRight } from 'lucide-react';
import { format } from 'date-fns';
import HomepageContentShell from '@/components/layout/HomepageContentShell';

const gameColors = {
  magic: 'bg-purple-100 text-purple-700',
  pokemon: 'bg-yellow-100 text-yellow-700',
  yugioh: 'bg-blue-100 text-blue-700',
  other: 'bg-gray-100 text-gray-700',
};

const gameLabels = {
  magic: 'Magic',
  pokemon: 'Pokémon',
  yugioh: 'Yu-Gi-Oh!',
  other: 'other',
};

// Detect game label from product description for "other" games
function getGameLabel(set) {
  const desc = (set.description || '').toLowerCase();
  const name = (set.name || '').toLowerCase();
  if (desc.includes('lorcana') || name.includes('lorcana')) return { label: 'Lorcana', color: 'bg-pink-100 text-pink-700' };
  if (desc.includes('one piece') || name.includes('kami') || name.includes('adventure on')) return { label: 'One Piece', color: 'bg-red-100 text-red-700' };
  if (desc.includes('flesh and blood') || name.includes('silver age')) return { label: 'Flesh & Blood', color: 'bg-orange-100 text-orange-700' };
  if (set.game === 'magic') return { label: 'Magic', color: gameColors.magic };
  if (set.game === 'pokemon') return { label: 'Pokémon', color: gameColors.pokemon };
  if (set.game === 'yugioh') return { label: 'Yu-Gi-Oh!', color: gameColors.yugioh };
  return { label: set.game, color: gameColors.other };
}

export default function NewReleasesBar() {
  const { data: upcomingSets = [] } = useQuery({
    queryKey: ['upcoming-sets'],
    queryFn: async () => {
      try {
        const products = await backend.data.Product.filter({ is_preorder: true }, '-release_date', 10);
        const today = new Date();
        return products
          .filter(p => p.release_date && new Date(p.release_date) >= today)
          .sort((a, b) => new Date(a.release_date) - new Date(b.release_date))
          .slice(0, 6)
          .map(p => ({
            name: p.name,
            game: p.game || 'other',
            description: p.description || '',
            date: p.release_date
          }));
      } catch {
        return [];
      }
    },
    refetchInterval: 60000, // Refetch every minute to catch new releases
  });

  if (upcomingSets.length === 0) {
    return null;
  }

  return (
    <section className="bg-gray-100 border-y border-gray-200">
      <HomepageContentShell className="py-4">
        <div className="flex items-center gap-4 overflow-x-auto">
          <div className="flex items-center gap-2 shrink-0">
            <Calendar className="w-5 h-5 text-gray-700" />
            <span className="font-semibold text-gray-900">Upcoming Releases:</span>
          </div>
          <div className="flex gap-4">
            {upcomingSets.map((set, i) => {
              const { label, color } = getGameLabel(set);
              return <Link
                key={i}
                to={createPageUrl('Shop') + `?search=${encodeURIComponent(set.name)}`}
                className="flex items-center gap-2 px-3 py-1.5 bg-white rounded-full border border-gray-200 hover:border-gray-400 hover:shadow-sm transition-all whitespace-nowrap"
              >
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${color}`}>
                  {label}
                </span>
                <span className="text-sm font-medium text-gray-900">{set.name}</span>
                <span className="text-xs text-gray-500">
                  {format(new Date(set.date), 'MMM d')}
                </span>
              </Link>;
            })}
          </div>
          <Link 
            to={createPageUrl('Shop') + '?preorder=true'} 
            className="ml-auto flex items-center text-gray-700 hover:text-gray-900 text-sm font-medium shrink-0"
          >
            All Preorders
            <ChevronRight className="w-4 h-4" />
          </Link>
        </div>
      </HomepageContentShell>
    </section>
  );
}


