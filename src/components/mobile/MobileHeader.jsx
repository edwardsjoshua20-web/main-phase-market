import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Input } from '@/components/ui/input';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger
} from '@/components/ui/sheet';
import {
  Menu,
  Search,
  LogOut,
  LogIn,
  Swords,
  Store,
  Home,
  Star,
  SquareStack,
  MessagesSquare,
  Crown
} from 'lucide-react';
import { brandAssets } from '@/config/appAssets';

export default function MobileHeader({
  searchQuery,
  onSearchChange,
  onSearchSubmit,
  menuOpen,
  onMenuChange,
  user,
  onLogin,
  onLogout,
  searchResults,
  onResultClick,
  onClearSearch
}) {
  const navigate = useNavigate();

  const goTo = (path) => {
    onMenuChange(false);
    navigate(path);
  };

  return (
    <div className="sticky top-0 z-40 bg-gradient-to-br from-gray-900 via-gray-800 to-black border-b border-gray-700">
      <div className="grid h-14 grid-cols-[3.25rem_1fr_3.25rem] items-center px-4">
        <button onClick={() => goTo('/')} className="flex h-12 w-12 items-center justify-center overflow-visible self-center">
          <img
            src={brandAssets.logo}
            alt="Main Phase Market"
            className="h-11 w-11 translate-y-[2px] scale-[2.15] object-contain"
          />
        </button>

        <div />

        <Sheet open={menuOpen} onOpenChange={onMenuChange}>
          <SheetTrigger asChild>
            <button
              className="ml-auto flex h-12 w-12 items-center justify-center self-center rounded-xl text-gray-300 hover:bg-gray-700 hover:text-white"
              aria-label="Open menu"
            >
              <Menu className="h-8 w-8" strokeWidth={1.8} />
            </button>
          </SheetTrigger>

          <SheetContent side="right" className="bg-gray-900 border-gray-700 w-72 p-0 flex flex-col">
            <SheetHeader className="px-5 pt-6 pb-4 border-b border-gray-700 text-left">
              <SheetTitle className="text-white">
                {user ? user.full_name : 'Main Phase Market'}
              </SheetTitle>
              <SheetDescription className="text-gray-400">
                {user ? user.email : 'Shop cards, build decks, and jump into the community.'}
              </SheetDescription>
            </SheetHeader>

            <nav className="flex flex-col flex-1 overflow-y-auto px-4 pt-4 pb-6 gap-1">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-widest px-2 mb-2">Explore</p>
              <button onClick={() => goTo('/MobileHome')} className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-gray-200 hover:bg-gray-800 hover:text-white transition-colors text-left">
                <Home className="w-4 h-4" /> Home
              </button>
              <button onClick={() => goTo('/MobileShop')} className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-gray-200 hover:bg-gray-800 hover:text-white transition-colors text-left">
                <Store className="w-4 h-4" /> Shop
              </button>
              <button onClick={() => goTo('/MobileDeckBuilder')} className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-gray-200 hover:bg-gray-800 hover:text-white transition-colors text-left">
                <Swords className="w-4 h-4" /> Deck Builder
              </button>
              <button onClick={() => goTo('/MobileCommunityDecks')} className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-gray-200 hover:bg-gray-800 hover:text-white transition-colors text-left">
                <SquareStack className="w-4 h-4" /> Community Decks
              </button>
              <button onClick={() => goTo('/MobileForum')} className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-gray-200 hover:bg-gray-800 hover:text-white transition-colors text-left">
                <MessagesSquare className="w-4 h-4" /> Forum
              </button>

              <p className="text-xs font-bold text-gray-500 uppercase tracking-widest px-2 mt-4 mb-2">Utility</p>
              <button onClick={() => goTo('/MobileMember')} className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-yellow-300 hover:bg-gray-800 hover:text-yellow-200 transition-colors text-left">
                <Crown className="w-4 h-4" /> Members
              </button>

              {user?.role === 'admin' && (
                <>
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-widest px-2 mt-4 mb-2">Admin</p>
                  <button onClick={() => goTo('/AdminInventory')} className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-gray-200 hover:bg-gray-800 hover:text-white transition-colors text-left">
                    <Star className="w-4 h-4" /> Inventory
                  </button>
                </>
              )}

              <div className="mt-auto pt-4 border-t border-gray-700">
                {user ? (
                  <button onClick={onLogout} className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-red-400 hover:bg-gray-800 hover:text-red-300 transition-colors">
                    <LogOut className="w-4 h-4" /> Sign Out
                  </button>
                ) : (
                  <button onClick={onLogin} className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-blue-400 hover:bg-gray-800 hover:text-blue-300 transition-colors">
                    <LogIn className="w-4 h-4" /> Sign In
                  </button>
                )}
              </div>
            </nav>
          </SheetContent>
        </Sheet>
      </div>

      <div className="relative px-4 pb-2">
        <div className="relative flex items-center">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
          <Input
            placeholder="Search all TCG cards..."
            value={searchQuery}
            onChange={onSearchChange}
            onKeyDown={(event) => event.key === 'Enter' && onSearchSubmit?.()}
            className="h-11 w-full rounded-xl border border-gray-700 bg-gray-800 pl-10 pr-4 text-sm text-gray-100 placeholder:text-gray-500 focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {searchResults && searchResults.length > 0 && (
          <div className="absolute left-4 right-4 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-xl z-50 max-h-72 overflow-y-auto">
            {searchResults.map((result, index) => {
              const gameAbbrev = {
                magic: 'MTG',
                pokemon: 'PKM',
                yugioh: 'YGO',
                lorcana: 'LRC',
                onepiece: 'OP',
                flesh_and_blood: 'FAB',
                starwars: 'SWU'
              }[result.game] || result.game?.toUpperCase();

              return (
                <button
                  key={`${result.id}-${index}`}
                  onClick={() => {
                    onClearSearch?.();
                    onResultClick(result);
                  }}
                  className="w-full px-3 py-2.5 text-left border-b last:border-b-0 hover:bg-blue-50 transition-colors active:bg-blue-100"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-14 shrink-0 rounded border border-gray-200 bg-gray-100 overflow-hidden">
                      {result.image_url ? (
                        <img
                          src={result.image_url}
                          alt={result.name}
                          className="w-full h-full object-contain bg-white"
                          loading="lazy"
                          onError={(event) => {
                            event.currentTarget.style.display = 'none';
                            event.currentTarget.parentElement?.querySelector('[data-mobile-search-image-fallback]')?.classList.remove('hidden');
                          }}
                        />
                      ) : null}
                      <div
                        data-mobile-search-image-fallback
                        className={`${result.image_url ? 'hidden' : 'flex'} w-full h-full items-center justify-center text-[10px] text-gray-400`}
                      >
                        No Image
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium text-gray-900 flex-1 truncate">{result.name}</p>
                        {gameAbbrev && (
                          <span className="bg-white text-slate-800 px-1.5 py-0.5 text-xs font-bold rounded shrink-0">
                            {gameAbbrev}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5 truncate">
                        {result.game === 'magic' ? 'All printings' : (result.set_name || '')}
                      </p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
