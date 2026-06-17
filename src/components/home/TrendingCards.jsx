import React, { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { ChevronRight, Loader2, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import HomepageContentShell from '@/components/layout/HomepageContentShell';
import { inventoryListings } from '@/services/inventoryListings';

export default function TrendingCards() {
  const [trendingCards, setTrendingCards] = useState([]);
  const [loadingTrending, setLoadingTrending] = useState(true);

  const { data: inventory = [] } = useQuery({
    queryKey: ["inventory"],
    queryFn: async () => {
      try {
        const cards = await inventoryListings.filter({ status: "active" }, "-price", 1000);
        return cards.filter((card) => Number(card.quantity || 0) > 0 && card.image_url);
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
        return Number(b.price || 0) - Number(a.price || 0);
      })
      .slice(0, 6);

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

  if (loadingTrending) {
    return (
      <section className="py-12 bg-gradient-to-br from-slate-950 via-slate-900 to-gray-800">
        <HomepageContentShell className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-yellow-400" />
        </HomepageContentShell>
      </section>
    );
  }

  return (
    <section className="py-12 bg-gradient-to-br from-slate-950 via-slate-900 to-gray-800">
      <HomepageContentShell>
        <div className="flex items-center justify-between mb-8 gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-yellow-400/15 flex items-center justify-center border border-yellow-400/25">
              <TrendingUp className="w-5 h-5 text-yellow-300" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-yellow-300 mb-2">Live demand</p>
              <h2 className="text-3xl font-bold tracking-tight text-white">Trending Now</h2>
              <p className="text-slate-300 text-sm mt-1.5">
                Most sought-after cards across the marketplace right now
              </p>
            </div>
          </div>

          <Link to={createPageUrl("Shop") + "?type=single_card"}>
            <Button variant="ghost" className="text-slate-300 hover:text-white hover:bg-white/10">
              View All
              <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </Link>
        </div>

        <div className="grid grid-cols-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {trendingCards.map((card, idx) => (
            <Link
              key={`${card.name}-${idx}`}
              to={createPageUrl("Shop") + `?type=single_card&search=${encodeURIComponent(card.name)}`}
              className="group bg-slate-900/70 border border-white/10 rounded-xl overflow-hidden hover:border-yellow-400/35 hover:shadow-[0_18px_38px_rgba(0,0,0,0.35)] transition-all duration-200"
            >
              <div className="aspect-[3/4] bg-slate-950/70">
                <img
                  src={card.image_url}
                  alt={card.name}
                  loading="lazy"
                  className="w-full h-full object-contain p-1 group-hover:scale-105 transition-transform"
                />
              </div>

              <div className="p-2">
                <p className="text-white text-xs font-medium line-clamp-2">{card.name}</p>
                <div className="flex justify-between mt-1">
                  {typeof card.price === "number" ? (
                    <p className="text-yellow-300 text-sm font-bold">${card.price.toFixed(2)}</p>
                  ) : (
                    <p className="text-yellow-300/70 text-xs">See price</p>
                  )}

                  <span className="text-slate-400 text-xs font-bold">
                    {gameLabel(card.game)}
                  </span>
                </div>
                <p className="text-emerald-300 text-xs mt-0.5">In Stock</p>
              </div>
            </Link>
          ))}
        </div>
      </HomepageContentShell>
    </section>
  );
}
