import React, { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { ChevronRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import HomepageContentShell from '@/components/layout/HomepageContentShell';
import { inventoryOwner } from '@/services/inventory/inventoryOwner';
import { listingOwner } from '@/services/listing/listingOwner';
import { getCardImageUrl, handleCardImageError } from '@/lib/cardImages';

export default function TrendingCards() {
  const [trendingCards, setTrendingCards] = useState([]);
  const [loadingTrending, setLoadingTrending] = useState(true);

  const { data: inventory = [] } = useQuery({
    queryKey: ["home-available-now-listings"],
    queryFn: async () => {
      try {
        const listings = await listingOwner.listStorefrontListings({
          sort: "-created_date",
          limit: 1000,
          includeProducts: true
        });
        return listings.filter((listing) => {
          const stock = inventoryOwner.getStockState(listing);
          return listingOwner.isCustomerFacing(listing) && (stock.inStock || listing.is_preorder) && getCardImageUrl(listing);
        });
      } catch {
        return [];
      }
    },
  });

  useEffect(() => {
    const curated = [...inventory]
      .sort((a, b) => {
        const featuredDelta = Number(Boolean(b.featured)) - Number(Boolean(a.featured));
        if (featuredDelta !== 0) return featuredDelta;
        const leftDate = new Date(a.created_date || a.updated_date || 0).getTime();
        const rightDate = new Date(b.created_date || b.updated_date || 0).getTime();
        if (leftDate !== rightDate) return rightDate - leftDate;
        return Number(b.price || 0) - Number(a.price || 0);
      })
      .slice(0, 8);

    setTrendingCards(curated);
    setLoadingTrending(false);
  }, [inventory]);

  const gameLabel = (game) => {
    const labels = {
      magic: "MTG",
      pokemon: "PKM",
      yugioh: "YGO",
      lorcana: "LOR",
      onepiece: "OP",
      flesh_and_blood: "FAB",
      starwars: "SWU",
    };

    return labels[game] || game?.toUpperCase();
  };

  const listingUrl = (listing) => {
    const type = listing.product_type || 'single_card';
    if (type === 'single_card') {
      return createPageUrl("Shop") + `?type=single_card&search=${encodeURIComponent(listing.name)}`;
    }
    return createPageUrl("Shop") + `?type=${encodeURIComponent(type)}&id=${encodeURIComponent(listing.id)}`;
  };

  if (loadingTrending) {
    return (
      <section className="bg-[#f4f7fb] py-8">
        <HomepageContentShell className="flex justify-center py-8">
          <Loader2 className="w-8 h-8 animate-spin text-yellow-400" />
        </HomepageContentShell>
      </section>
    );
  }

  return (
    <section className="bg-[#f4f7fb] py-8">
      <HomepageContentShell>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3 border-b border-slate-200 pb-3">
          <div>
            <p className="mb-1 text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-slate-500">Live Inventory</p>
            <h2 className="text-2xl font-semibold tracking-tight text-slate-950">Available Now</h2>
          </div>

          <Link to={createPageUrl("Shop") + "?type=single_card"}>
            <Button variant="ghost" className="h-8 rounded-[5px] px-2 text-sm font-semibold uppercase tracking-[0.12em] text-slate-700 hover:bg-slate-200 hover:text-slate-950">
              View Singles
              <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </Link>
        </div>

        {trendingCards.length > 0 ? (
          <div className="grid grid-cols-4 gap-3 lg:grid-cols-8">
            {trendingCards.map((card, idx) => (
              <Link
                key={`${card.id || card.name}-${idx}`}
                to={listingUrl(card)}
                className="group overflow-hidden rounded-[6px] border border-slate-200 bg-white shadow-[0_8px_20px_rgba(15,23,42,0.06)] transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-[0_14px_28px_rgba(15,23,42,0.12)]"
              >
                <div className="relative aspect-[3/4] bg-slate-100">
                  <img
                    src={getCardImageUrl(card)}
                    alt={card.name}
                    loading="lazy"
                    className="h-full w-full object-contain p-1.5 transition-transform duration-200 group-hover:scale-[1.035]"
                    onError={(event) => handleCardImageError(event, card, (image) => {
                      const fallback = image.parentElement?.querySelector('[data-card-image-fallback]');
                      fallback?.classList.remove('hidden');
                      fallback?.classList.add('flex');
                    })}
                  />
                  <div data-card-image-fallback className="hidden absolute inset-0 items-center justify-center px-3 text-center text-xs font-medium text-slate-400">
                    No image
                  </div>
                </div>

                <div className="p-2">
                  <p className="min-h-[2rem] text-xs font-medium leading-4 text-slate-950 line-clamp-2">{card.name}</p>
                  <div className="mt-1.5 flex items-center justify-between gap-2">
                    {typeof card.price === "number" ? (
                      <p className="text-sm font-bold text-slate-950">${card.price.toFixed(2)}</p>
                    ) : (
                      <p className="text-xs font-semibold text-slate-500">See price</p>
                    )}
                    <span className="text-[0.65rem] font-bold text-slate-500">
                      {gameLabel(card.game)}
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="rounded-[6px] border border-slate-200 bg-white px-4 py-5 text-sm text-slate-500">
            Fresh singles are being prepared for the storefront.
          </div>
        )}
      </HomepageContentShell>
    </section>
  );
}
