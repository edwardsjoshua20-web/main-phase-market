import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { backend } from '@/services/backend';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BookOpen, ChevronRight, CreditCard, Layers3, LibraryBig, Search, ShieldCheck, Swords, UsersRound } from 'lucide-react';
import MobileHeader from '@/components/mobile/MobileHeader';
import MobileBottomNav from '@/components/mobile/MobileBottomNav';
import CartDrawer from '@/components/store/CartDrawer';
import WishlistDrawer from '@/components/store/WishlistDrawer';
import { getCardImageUrl, handleCardImageError } from '@/lib/cardImages';
import { searchAllGamesLocal } from '@/lib/localSearch';
import { inventoryOwner } from '@/services/inventory/inventoryOwner';
import { listingOwner } from '@/services/listing/listingOwner';
import { useCartOwner } from '@/hooks/useCartOwner';
import { useWishlistOwner } from '@/hooks/useWishlistOwner';

const GAME_LINKS = [
  {
    game: 'magic',
    label: 'Magic: The Gathering',
    logoSrc: 'https://commons.wikimedia.org/wiki/Special:Redirect/file/Magic_the_Gathering_2017.svg',
    logoClassName: 'max-h-[34px] max-w-[126px]',
  },
  {
    game: 'pokemon',
    label: 'Pokemon',
    logoSrc: 'https://commons.wikimedia.org/wiki/Special:Redirect/file/Pok%C3%A9mon_Trading_Card_Game_logo.svg',
    logoClassName: 'max-h-[38px] max-w-[118px]',
  },
  {
    game: 'yugioh',
    label: 'Yu-Gi-Oh!',
    logoSrc: 'https://commons.wikimedia.org/wiki/Special:Redirect/file/Yu-Gi-Oh!.png',
    logoClassName: 'max-h-[38px] max-w-[118px]',
  },
  {
    game: 'lorcana',
    label: 'Disney Lorcana',
    logoSrc: 'https://files.elfsightcdn.com/eafe4a4d-3436-495d-b748-5bdce62d911d/95be4c15-501c-4a8f-8c58-05f4f8a87527/Disney-Lorcana_TCG_Logo-transparent-780x470.webp',
    logoClassName: 'max-h-[36px] max-w-[122px]',
  },
  {
    game: 'flesh_and_blood',
    label: 'Flesh & Blood',
    logoSrc: 'https://uchroniesgames.fr/web/image/event.event/168/image_1024',
    logoClassName: 'max-h-[34px] max-w-[124px]',
  },
  {
    game: 'onepiece',
    label: 'One Piece',
    logoSrc: 'https://commons.wikimedia.org/wiki/Special:Redirect/file/One_piece_logo.svg',
    logoClassName: 'max-h-[36px] max-w-[120px]',
  },
  {
    game: 'starwars',
    label: 'Star Wars Unlimited',
    logoSrc: 'https://starwarsunlimited.com/_next/image?q=75&url=https%3A%2F%2Fcdn.starwarsunlimited.com%2FSWH_01_pressrelease_1920x1080_plain_27f07ee8bb.jpg&w=3840',
    logoClassName: 'max-h-[40px] max-w-[108px]',
  }
];

const TOOL_LINKS = [
  { title: 'Deck Builder', detail: 'Build and refine lists.', action: 'Start Building', href: '/AdvancedDeckBuilder', icon: Swords },
  { title: 'Commander Hub', detail: 'Find commanders and staples.', action: 'Explore Commander', href: '/CommanderHub', icon: LibraryBig },
  { title: 'Community Decks', detail: 'Browse player decklists.', action: 'Browse Decks', href: '/CommunityDecks', icon: UsersRound },
  { title: 'TCG Encyclopedia', detail: 'Review sets and card data.', action: 'View Releases', href: '/set/yugioh/magnificent-monsters', icon: BookOpen }
];

const TRUST_ITEMS = [
  { title: 'Secure Checkout', icon: CreditCard },
  { title: 'Catalog-Wide Search', icon: Search },
  { title: 'Multi-TCG Support', icon: Layers3 },
  { title: 'Deck & Player Tools', icon: ShieldCheck }
];

export default function MobileHome() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [user, setUser] = React.useState(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [wishlistOpen, setWishlistOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [failedImageKeys, setFailedImageKeys] = useState(() => new Set());
  const searchTimeoutRef = React.useRef(null);
  const cart = useCartOwner(user);
  const wishlist = useWishlistOwner(user);

  React.useEffect(() => {
    backend.auth.isAuthenticated().then(async (auth) => {
      if (auth) setUser(await backend.auth.getCurrentUser());
    });
  }, []);

  const cartItems = cart.items;
  const wishlistItems = wishlist.items;

  const { data: featuredCards = [] } = useQuery({
    queryKey: ['mobile-featured-singles'],
    queryFn: async () => {
      const cards = await listingOwner.filterCardListings({ status: 'active' }, '-created_date', 1000);
      return cards
        .filter((card) => (
          listingOwner.isCustomerFacing(card)
          && inventoryOwner.getStockState(card).inStock
          && getCardImageUrl(card)
        ))
        .sort((a, b) => {
          const featuredDelta = Number(Boolean(b.featured)) - Number(Boolean(a.featured));
          if (featuredDelta) return featuredDelta;

          const bTime = new Date(b.created_date || b.updated_date || 0).getTime();
          const aTime = new Date(a.created_date || a.updated_date || 0).getTime();
          if (bTime !== aTime) return bTime - aTime;

          return Number(b.price || 0) - Number(a.price || 0);
        })
        .slice(0, 8);
    }
  });

  const handleSearchChange = async (event) => {
    const value = event.target.value;
    setSearchQuery(value);
    if (!value.trim()) {
      setSearchResults([]);
      return;
    }
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(async () => {
      setSearching(true);
      const results = await searchAllGamesLocal(value, 10);
      setSearchResults(results);
      setSearching(false);
    }, 400);
  };

  const removeFromWishlistMutation = useMutation({
    mutationFn: (id) => wishlist.removeItem(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['wishlist'] })
  });

  const addToCartFromWishlistMutation = useMutation({
    mutationFn: async (item) => {
      await cart.addItem({
        card_id: item.product_id,
        card_name: item.product_name,
        card_image: item.product_image,
        price: item.price,
        product_type: item.product_type,
      }, 1);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['cart'] })
  });

  const markImageFailed = (key) => {
    setFailedImageKeys((current) => {
      const next = new Set(current);
      next.add(key);
      return next;
    });
  };

  const featuredItems = featuredCards
    .filter((card) => !failedImageKeys.has(card.id || card.card_id || card.name))
    .slice(0, 6);

  return (
    <div className="min-h-screen bg-white flex flex-col pb-16">
      <MobileHeader
        searchQuery={searchQuery}
        onSearchChange={handleSearchChange}
        onSearchSubmit={() => { if (searchQuery.trim()) navigate(`/MobileShop?search=${encodeURIComponent(searchQuery)}`); }}
        menuOpen={menuOpen}
        onMenuChange={setMenuOpen}
        user={user}
        onLogin={() => backend.auth.redirectToLogin(window.location.href)}
        onLogout={() => backend.auth.logout()}
        searchResults={searchResults}
        onResultClick={(result) => { setSearchQuery(''); setSearchResults([]); navigate(`/MobileShop?search=${encodeURIComponent(result.name)}&game=${result.game}`); }}
        onClearSearch={() => { setSearchQuery(''); setSearchResults([]); }}
        searching={searching}
      />

      <main className="flex-1 px-4 py-3 space-y-5">
        {featuredItems.length > 0 && (
          <section>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-950">Featured Singles</h2>
              <Link to="/MobileShop?type=single_card" className="flex items-center gap-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-700">
                View all <ChevronRight className="w-4 h-4" />
              </Link>
            </div>
            <div className="overflow-hidden border-y border-slate-200 bg-white">
              {featuredItems.map((card) => (
                <Link
                  key={card.id}
                  to={`/MobileShop?type=single_card&search=${encodeURIComponent(card.name)}`}
                  className="flex items-center gap-3 border-b border-slate-200 py-3 last:border-b-0 active:bg-slate-50"
                >
                  <div className="h-16 w-12 shrink-0 bg-slate-100">
                    <img
                      src={getCardImageUrl(card)}
                      alt={card.name}
                      className="h-full w-full object-contain p-1"
                      data-image-candidate-index="0"
                      onError={(event) => {
                        handleCardImageError(event, card);
                        markImageFailed(card.id || card.card_id || card.name);
                      }}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-1 text-sm font-semibold text-slate-900">{card.name}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-bold text-slate-950">${Number(card.price || 0).toFixed(2)}</p>
                    <p className="text-[11px] font-semibold text-emerald-700">{inventoryOwner.getStockState(card).quantity} in stock</p>
                    <ChevronRight className="ml-auto mt-1 h-4 w-4 text-slate-300" />
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        <section>
          <h2 className="mb-2 text-base font-bold text-slate-950">Main Phase Tools</h2>
          <div className="grid grid-cols-1 gap-2">
            {TOOL_LINKS.map(({ title, detail, action, href, icon: Icon }) => (
              <Link
                key={title}
                to={href}
                className="flex items-center gap-3 rounded-[3px] border border-slate-200 bg-[#08111f] px-3 py-3 text-white active:bg-slate-900"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center border border-white/15 bg-white/5">
                  <Icon className="h-4 w-4 text-slate-300" strokeWidth={1.8} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{title}</p>
                  <p className="text-xs text-slate-300">{detail}</p>
                </div>
                <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-300">{action}</span>
              </Link>
            ))}
          </div>
        </section>

        <section>
          <h2 className="mb-2 text-base font-bold text-slate-950">Shop by Game</h2>
          <div className="grid grid-cols-2 gap-2">
            {GAME_LINKS.map(({ game, logoSrc, logoClassName, label }) => (
              <Link
                key={game}
                to={`/MobileShop?game=${game}`}
                className="flex min-h-[72px] flex-col items-center justify-center rounded-[3px] border border-slate-200 bg-white px-2 text-center active:bg-slate-50"
              >
                <img src={logoSrc} alt={label} loading="lazy" className={`h-auto w-auto object-contain ${logoClassName}`} />
              </Link>
            ))}
          </div>
        </section>

        <section className="grid grid-cols-2 divide-x divide-y divide-slate-200 bg-white">
          {TRUST_ITEMS.map(({ title, icon: Icon }) => (
            <div key={title} className="flex items-center gap-2 px-3 py-3">
              <Icon className="h-4 w-4 shrink-0 text-slate-700" strokeWidth={1.8} />
              <span className="text-xs font-semibold text-slate-900">{title}</span>
            </div>
          ))}
        </section>
      </main>

      <footer className="bg-slate-900 px-4 py-4 text-white">
        <p className="text-slate-400 text-xs">© {new Date().getFullYear()} Main Phase Market. All rights reserved.</p>
        <p className="text-slate-500 text-xs mt-1">* Cards under $1 sold at $1 minimum.</p>
      </footer>

      <MobileBottomNav
        cartCount={cart.itemCount}
        wishlistCount={wishlist.count}
        onCartClick={() => setCartOpen(true)}
        onWishlistClick={() => setWishlistOpen(true)}
        currentPage="Home"
      />
      <CartDrawer open={cartOpen} onClose={() => setCartOpen(false)} items={cartItems} onUpdateQuantity={(id, qty) => cart.setQuantity(id, qty)} onRemove={(id) => cart.removeItem(id)} />
      <WishlistDrawer open={wishlistOpen} onClose={() => setWishlistOpen(false)} items={wishlistItems} onAddToCart={(item) => addToCartFromWishlistMutation.mutate(item)} onRemove={(id) => removeFromWishlistMutation.mutate(id)} user={user} />
    </div>
  );
}
