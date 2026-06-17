import React from 'react';
import { Link } from 'react-router-dom';
import { Store, Home, Swords, MessagesSquare } from 'lucide-react';

export default function MobileBottomNav({ 
  cartCount, 
  wishlistCount,
  onCartClick,
  onWishlistClick,
  currentPage
}) {
  void cartCount;
  void wishlistCount;
  void onCartClick;
  void onWishlistClick;

  const isActive = (page) => currentPage === page;

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-gray-700 bg-gradient-to-t from-black via-gray-900 to-gray-800 shadow-2xl shadow-black">
      <div className="grid h-16 grid-cols-4 items-stretch gap-0.5 px-1.5">
        <Link to="/MobileHome" className="flex h-full flex-col items-center justify-center gap-1 rounded-xl hover:bg-gray-800 transition-colors">
          <Home className={`h-5 w-5 ${isActive('Home') || isActive('MobileHome') ? 'text-white' : 'text-gray-400'}`} />
          <span className={`min-w-[2.5rem] text-center text-[11px] leading-none ${isActive('Home') || isActive('MobileHome') ? 'font-semibold text-white' : 'text-gray-400'}`}>Home</span>
        </Link>

        <Link to="/MobileShop" className="flex h-full flex-col items-center justify-center gap-1 rounded-xl hover:bg-gray-800 transition-colors">
          <Store className={`h-5 w-5 ${isActive('Shop') || isActive('MobileShop') ? 'text-white' : 'text-gray-400'}`} />
          <span className={`min-w-[2.5rem] text-center text-[11px] leading-none ${isActive('Shop') || isActive('MobileShop') ? 'font-semibold text-white' : 'text-gray-400'}`}>Shop</span>
        </Link>

        <Link to="/MobileDeckBuilder" className="flex h-full flex-col items-center justify-center gap-1 rounded-xl hover:bg-gray-800 transition-colors">
          <Swords className={`h-5 w-5 ${isActive('MobileDeckBuilder') ? 'text-white' : 'text-gray-400'}`} />
          <span className={`min-w-[2.5rem] text-center text-[11px] leading-none ${isActive('MobileDeckBuilder') ? 'font-semibold text-white' : 'text-gray-400'}`}>Decks</span>
        </Link>

        <Link to="/MobileForum" className="flex h-full flex-col items-center justify-center gap-1 rounded-xl hover:bg-gray-800 transition-colors">
          <MessagesSquare className={`h-5 w-5 ${isActive('MobileForum') || isActive('ForumThread') ? 'text-white' : 'text-gray-400'}`} />
          <span className={`min-w-[2.5rem] text-center text-[11px] leading-none ${isActive('MobileForum') || isActive('ForumThread') ? 'font-semibold text-white' : 'text-gray-400'}`}>Forum</span>
        </Link>
      </div>
    </nav>
  );
}
