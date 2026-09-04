import React, { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { ChevronRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import HomepageContentShell from '@/components/layout/HomepageContentShell';
import { inventoryOwner } from '@/services/inventory/inventoryOwner';
import { listingOwner } from '@/services/listing/listingOwner';
import { getCardImageUrl } from '@/lib/cardImages';
import CardImage from '@/components/cards/CardImage';
import { CardHoverPreview, CardTileSurface, useCardHoverPreview } from '@/components/cards/CardPresentation';

export default function TrendingCards() {
  const [trendingCards, setTrendingCards] = useState([]);
  const [failedImageKeys, setFailedImageKeys] = useState(() => new Set());
  const [loadingTrending, setLoadingTrending] = useState(true);
  const cardPreview = useCardHoverPreview();

  const { data: inventory = [] } = useQuery({
    queryKey: ["home-featured-singles"],
    queryFn: async () => {
      try {
        const cards = await listingOwner.filterCardListings({ status: "active" }, "-created_date", 1000);
        return cards.filter((card) => {
          const stock = inventoryOwner.getStockState(card);
          return listingOwner.isCustomerFacing(card) && stock.inStock && getCardImageUrl(card);
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
      .slice(0, 10);

    setTrendingCards(curated);
    setLoadingTrending(false);
  }, [inventory]);

  const cardKey = (card, idx) => `${card.id || card.listing_id || card.name}-${idx}`;

  const markImageFailed = (key) => {
    setFailedImageKeys((previous) => {
      const next = new Set(previous);
      next.add(key);
      return next;
    });
  };

  const visibleCards = trendingCards.filter((card, idx) => !failedImageKeys.has(cardKey(card, idx)));

  if (loadingTrending) {
    return (
      <section className="bg-white py-5">
        <HomepageContentShell className="flex justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-slate-500" />
        </HomepageContentShell>
      </section>
    );
  }

  if (visibleCards.length === 0) return null;

  return (
    <section className="bg-white py-4">
      <HomepageContentShell>
        <div className="mb-2.5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold tracking-tight text-slate-950">Featured Singles</h2>
          </div>

          <Link to={createPageUrl("Shop") + "?type=single_card"}>
            <Button variant="ghost" className="h-7 rounded-[4px] px-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 hover:text-slate-950">
              View all
              <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </Link>
        </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-10">
            {visibleCards.map((card, idx) => {
              const key = cardKey(card, idx);
              const stock = inventoryOwner.getStockState(card);
              return (
              <CardTileSurface
                as={Link}
                key={key}
                to={createPageUrl("Shop") + `?type=single_card&search=${encodeURIComponent(card.name)}`}
                tone="light"
                className="group rounded-[3px]"
              >
                <div className="h-[138px] bg-slate-100 sm:h-[146px] lg:h-[132px] xl:h-[142px]" onMouseEnter={() => cardPreview.showPreview(card)} onMouseLeave={cardPreview.hidePreview}>
                  <CardImage
                    card={card}
                    alt={card.name}
                    loading="lazy"
                    className="h-full w-full object-contain p-1.5 transition-transform duration-200 group-hover:scale-[1.02]"
                    onExhausted={() => markImageFailed(key)}
                  />
                </div>

                <div className="p-1.5">
                  <p className="min-h-[1.85rem] text-[0.72rem] font-semibold leading-[0.95rem] text-slate-950 line-clamp-2">{card.name}</p>
                  <div className="mt-1 flex items-end justify-between gap-2">
                    {typeof card.price === "number" ? (
                      <p className="text-sm font-bold text-slate-950">${card.price.toFixed(2)}</p>
                    ) : (
                      <p className="text-xs font-semibold text-slate-500">See price</p>
                    )}
                  </div>
                  <p className="mt-0.5 text-[0.66rem] font-semibold leading-3 text-emerald-700">
                    {stock.quantity > 0 ? `${stock.quantity} in stock` : 'In stock'}
                  </p>
                </div>
              </CardTileSurface>
            );
            })}
          </div>
      </HomepageContentShell>
      <CardHoverPreview card={cardPreview.card} price={cardPreview.card?.price} />
    </section>
  );
}
