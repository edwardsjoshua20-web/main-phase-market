import React from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import HomepageContentShell from '@/components/layout/HomepageContentShell';
import { getCatalogAssetUrl } from '@/config/publicAssetUrls';

const actions = [
  {
    title: 'Shop Singles',
    description: 'Track down staples, upgrades, and the card your list is still missing.',
    to: '/Shop?type=single_card',
    visual: 'single',
    image: getCatalogAssetUrl('mtg', 'images/normal/00/00014127-a9d2-4e01-ae79-2349e8989793.jpg'),
    tone: 'from-slate-950 via-slate-900 to-slate-800',
    glow: 'rgba(245, 158, 11, 0.18)',
  },
  {
    title: 'Build a Deck',
    description: 'Turn loose ideas into a sharper list with a cleaner brewing workflow.',
    to: '/AdvancedDeckBuilder',
    visual: 'stack',
    image: '/images/deck-builder-display.png',
    tone: 'from-slate-950 via-[#111c2f] to-slate-800',
    glow: 'rgba(59, 130, 246, 0.18)',
  },
  {
    title: 'Explore Commander Hub',
    description: 'Compare commanders, themes, and directions worth actually building around.',
    to: '/CommanderHub',
    visual: 'synergy',
    image: '/images/commander-synergy.png',
    tone: 'from-slate-950 via-[#1f1628] to-slate-800',
    glow: 'rgba(168, 85, 247, 0.18)',
  },
  {
    title: 'Browse Community Decks',
    description: 'See what players are refining, saving, and sleeving up across the platform.',
    to: '/CommunityDecks',
    visual: 'fan',
    image: '/images/community-decks-display.png',
    tone: 'from-slate-950 via-[#1a1c28] to-slate-800',
    glow: 'rgba(244, 63, 94, 0.16)',
  },
];

function ActionVisual({ action }) {
  const backgroundImage =
    action.image ||
    action.images?.[0] ||
    null;

  if (!backgroundImage) return null;

  if (action.visual === 'single') {
    return (
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <img
          src={backgroundImage}
          alt=""
          loading="lazy"
          className="absolute right-[-6%] top-[18%] h-[128%] max-w-none rotate-[12deg] object-contain opacity-80 transition-all duration-300 group-hover:scale-[1.03] group-hover:opacity-88"
        />
      </div>
    );
  }

  if (action.visual === 'stack') {
    return (
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <img
          src={backgroundImage}
          alt=""
          loading="lazy"
          className="absolute inset-0 h-full w-full object-cover object-[70%_50%] opacity-72 transition-all duration-300 group-hover:scale-[1.03] group-hover:opacity-82"
        />
      </div>
    );
  }

  if (action.visual === 'fan') {
    return (
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <img
          src={backgroundImage}
          alt=""
          loading="lazy"
          className="absolute inset-0 h-full w-full object-cover object-[72%_44%] opacity-70 transition-all duration-300 group-hover:scale-[1.03] group-hover:opacity-82"
        />
      </div>
    );
  }

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      <img
        src={backgroundImage}
        alt=""
        loading="lazy"
        className="absolute inset-0 h-full w-full object-cover object-center opacity-68 transition-all duration-300 group-hover:scale-[1.03] group-hover:opacity-78"
      />
    </div>
  );
}

export default function CoreActionsSection() {
  return (
    <section className="hidden md:block py-8 bg-white">
      <HomepageContentShell>
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          {actions.map((action) => (
            <Link
              key={action.title}
              to={action.to}
              className={`group relative overflow-hidden rounded-[1.35rem] border border-slate-700/70 bg-gradient-to-br ${action.tone} shadow-[0_12px_34px_rgba(2,6,23,0.28)] hover:shadow-[0_18px_40px_rgba(2,6,23,0.34)] hover:border-slate-600 hover:-translate-y-[1px] transition-all duration-250`}
            >
              <div
                className="absolute inset-0"
                style={{
                  background: `linear-gradient(90deg, rgba(2,6,23,0.98) 0%, rgba(8,15,29,0.94) 28%, rgba(12,20,35,0.74) 46%, rgba(15,23,42,0.38) 66%, rgba(15,23,42,0.14) 84%, rgba(15,23,42,0.04) 100%), radial-gradient(circle at 18% 18%, ${action.glow}, transparent 28%)`,
                }}
              />
              <ActionVisual action={action} />
              <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(2,6,23,0.99)_0%,rgba(2,6,23,0.94)_22%,rgba(2,6,23,0.82)_40%,rgba(2,6,23,0.56)_58%,rgba(2,6,23,0.24)_76%,rgba(2,6,23,0.08)_100%)] pointer-events-none" />

              <div className="relative flex min-h-[218px] flex-col justify-between px-5 py-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 max-w-[60%]">
                  <h3 className="text-[1.05rem] font-semibold tracking-tight text-slate-50 leading-tight">
                    {action.title}
                  </h3>
                  <p className="text-sm leading-5 text-slate-300 mt-2 pr-2 line-clamp-2">
                    {action.description}
                  </p>
                  </div>
                  <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-700 bg-slate-800/90 text-slate-300 group-hover:bg-slate-700 group-hover:text-white group-hover:border-slate-600 transition-colors">
                    <ChevronRight className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-0.5" />
                  </div>
                </div>

              </div>
            </Link>
          ))}
        </div>
      </HomepageContentShell>
    </section>
  );
}
