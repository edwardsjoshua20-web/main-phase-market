import React from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CalendarDays, ExternalLink, Layers, PackageSearch, ShoppingBag } from 'lucide-react';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import CardImage from '@/components/cards/CardImage';
import { resolveSetDetail } from '@/services/catalog/setDetailService';
import { createPageUrl } from '@/utils';

function formatDate(value) {
  if (!value) return '';
  try {
    const datePart = String(value).slice(0, 10);
    const [year, month, day] = datePart.split('-').map((part) => Number(part));
    if (year && month && day) {
      return format(new Date(year, month - 1, day), 'MMMM d, yyyy');
    }
    return format(new Date(value), 'MMMM d, yyyy');
  } catch {
    return '';
  }
}

function priceForListing(listing = {}) {
  const value = Number(listing.sell_price ?? listing.price ?? listing.display_price ?? 0);
  return Number.isFinite(value) && value > 0 ? value.toFixed(2) : '';
}

function FeaturedImage({ asset }) {
  const card = {
    name: asset.name,
    image_url: asset.imageUrl,
    game: asset.game
  };

  return (
    <div className="min-w-0">
      <div className="aspect-[63/88] overflow-hidden rounded-md border border-slate-200 bg-slate-100">
        <CardImage
          card={card}
          alt={asset.name}
          className="h-full w-full object-contain"
          fallbackClassName="flex h-full w-full items-center justify-center px-3 text-center text-xs font-semibold text-slate-500"
        />
      </div>
      <p className="mt-2 line-clamp-2 text-sm font-semibold text-slate-800">{asset.name}</p>
    </div>
  );
}

function CardListTile({ card }) {
  const price = card.listingSellPrice ? Number(card.listingSellPrice).toFixed(2) : '';
  const rarityLabel = Array.isArray(card.rarities) && card.rarities.length > 1
    ? `${card.rarities.length} rarities`
    : card.rarity || card.rarities?.[0] || '';

  return (
    <div className="min-w-0 border border-slate-200 bg-white p-3 shadow-sm">
      <div className="aspect-[63/88] overflow-hidden rounded-md border border-slate-200 bg-slate-100">
        <CardImage
          card={card}
          alt={card.name}
          className="h-full w-full object-contain"
          fallbackClassName="flex h-full w-full items-center justify-center px-3 text-center text-xs font-semibold text-slate-500"
        />
      </div>
      <div className="mt-3 space-y-1">
        <p className="line-clamp-2 text-sm font-bold leading-snug text-slate-950">{card.name}</p>
        <p className="text-xs font-semibold text-slate-500">
          {[card.collector_number, rarityLabel].filter(Boolean).join(' • ')}
        </p>
        <p className={`text-xs font-bold ${card.inStock ? 'text-emerald-700' : 'text-slate-500'}`}>
          {card.inStock ? `In stock${price ? ` • $${price}` : ''}` : 'Catalog card'}
        </p>
      </div>
    </div>
  );
}

export default function SetDetail() {
  const { game, setSlug } = useParams();
  const { data: detail, isLoading } = useQuery({
    queryKey: ['set-detail', game, setSlug],
    queryFn: () => resolveSetDetail({ game, setSlug }),
    staleTime: 60_000
  });
  const [showAllCards, setShowAllCards] = React.useState(false);

  if (isLoading) {
    return (
      <main className="min-h-screen bg-slate-50">
        <div className="mx-auto flex min-h-[420px] w-full max-w-[1480px] items-center justify-center px-4">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-slate-900" />
        </div>
      </main>
    );
  }

  if (!detail) {
    return (
      <main className="min-h-screen bg-slate-50">
        <div className="mx-auto w-full max-w-[1180px] px-4 py-16">
          <p className="text-sm font-bold uppercase tracking-[0.18em] text-slate-500">Set not found</p>
          <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-950">We could not find that set.</h1>
          <Link to={createPageUrl('Shop')}>
            <Button className="mt-6 bg-slate-900 text-white hover:bg-slate-800">Back to Shop</Button>
          </Link>
        </div>
      </main>
    );
  }

  const releaseDate = formatDate(detail.releaseDate);
  const hasListings = detail.availability.activeListingCount > 0;
  const representativeImages = detail.representativeImages || [];
  const releaseStateLabel = detail.releaseStateLabel || '';
  const setCards = Array.isArray(detail.setCards) ? detail.setCards : [];
  const visibleCardLimit = 60;
  const visibleCards = showAllCards ? setCards : setCards.slice(0, visibleCardLimit);
  const hiddenCardCount = Math.max(0, setCards.length - visibleCards.length);

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <section className="relative overflow-hidden bg-slate-950 text-white">
        {detail.heroImageUrl && (
          <img
            src={detail.heroImageUrl}
            alt=""
            aria-hidden="true"
            className="absolute inset-0 h-full w-full object-cover opacity-54"
          />
        )}
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(2,6,23,0.98)_0%,rgba(15,23,42,0.88)_44%,rgba(15,23,42,0.45)_100%)]" />
        <div className="relative mx-auto grid w-full max-w-[1480px] gap-8 px-4 py-10 md:grid-cols-[minmax(0,1fr)_420px] md:items-center md:py-12">
          <div className="max-w-4xl">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="rounded bg-white/10 text-white hover:bg-white/10">{detail.gameLabel}</Badge>
              {detail.setCode && <Badge className="rounded bg-white/10 text-white hover:bg-white/10">{detail.setCode}</Badge>}
            </div>
            {releaseStateLabel && (
              <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.22em] text-white/70">
                {releaseStateLabel}
              </p>
            )}
            <h1 className="mt-3 max-w-4xl text-4xl font-black tracking-tight md:text-5xl">{detail.name}</h1>
            <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-sm text-white/82">
              {releaseDate && (
                <span className="inline-flex items-center gap-2">
                  <CalendarDays className="h-4 w-4" />
                  {releaseDate}
                </span>
              )}
              {detail.cardCatalog?.heroLabel && (
                <span className="inline-flex items-center gap-2">
                  <Layers className="h-4 w-4" />
                  {detail.cardCatalog.heroLabel}
                </span>
              )}
            </div>
            {detail.description && <p className="mt-5 max-w-3xl text-base leading-7 text-white/78">{detail.description}</p>}
          </div>

          {(detail.setImageUrl || detail.heroImageUrl) && (
            <div className="hidden justify-end md:flex">
              <div className="flex h-64 w-full max-w-sm items-center justify-center">
                <img
                  src={detail.setImageUrl || detail.heroImageUrl}
                  alt={detail.name}
                  className="max-h-full max-w-full object-contain drop-shadow-[0_22px_44px_rgba(0,0,0,0.46)]"
                />
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="mx-auto grid w-full max-w-[1480px] gap-6 px-4 py-8 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-8">
          <div className="border-b border-slate-200 pb-5">
            <h2 className="text-xl font-black tracking-tight text-slate-950">Set Information</h2>
            <div className="mt-4 grid gap-3 text-sm text-slate-700 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <p className="font-bold text-slate-950">Game</p>
                <p>{detail.gameLabel}</p>
              </div>
              {detail.setCode && (
                <div>
                  <p className="font-bold text-slate-950">Set Code</p>
                  <p>{detail.setCode}</p>
                </div>
              )}
              {releaseDate && (
                <div>
                  <p className="font-bold text-slate-950">Release Date</p>
                  <p>{releaseDate}</p>
                </div>
              )}
              {detail.cardCatalog?.expectedCount && (
                <div>
                  <p className="font-bold text-slate-950">Set Size</p>
                  <p>{detail.cardCatalog.setSizeLabel}</p>
                </div>
              )}
              {detail.cardCatalog?.knownCount > 0 && (
                <div>
                  <p className="font-bold text-slate-950">Known Cards</p>
                  <p>{detail.cardCatalog.knownLabel}</p>
                </div>
              )}
            </div>
          </div>

          {representativeImages.length > 0 && (
            <div>
              <h2 className="text-xl font-black tracking-tight text-slate-950">Set Gallery</h2>
              <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                {representativeImages.map((asset) => (
                  <FeaturedImage key={`${asset.name}:${asset.imageUrl}`} asset={{ ...asset, game: detail.game }} />
                ))}
              </div>
            </div>
          )}

          <div>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-xl font-black tracking-tight text-slate-950">Cards in This Set</h2>
                {setCards.length > 0 && (
                  <p className="mt-1 text-sm text-slate-600">
                    {detail.cardCatalog?.knownLabel}
                    {detail.cardCatalog?.printingLabel ? ` • ${detail.cardCatalog.printingLabel}` : ''}
                  </p>
                )}
              </div>
            </div>

            {setCards.length > 0 ? (
              <>
                <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                  {visibleCards.map((card) => (
                    <CardListTile key={card.searchIdentity || card.id} card={card} />
                  ))}
                </div>
                {hiddenCardCount > 0 && (
                  <Button
                    type="button"
                    variant="outline"
                    className="mt-5 rounded-md border-slate-300 text-slate-900 hover:bg-slate-100"
                    onClick={() => setShowAllCards(true)}
                  >
                    Show all {setCards.length} known cards
                  </Button>
                )}
              </>
            ) : (
              <p className="mt-2 text-sm text-slate-600">Card list not yet available.</p>
            )}
          </div>
        </div>

        <aside className="h-fit border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-slate-100 text-slate-700">
              {hasListings ? <ShoppingBag className="h-5 w-5" /> : <PackageSearch className="h-5 w-5" />}
            </div>
            <div>
              <h2 className="text-lg font-black tracking-tight text-slate-950">MainPhase Availability</h2>
              <p className="mt-1 text-sm text-slate-600">
                {hasListings
                  ? `${detail.availability.activeListingCount} active listing${detail.availability.activeListingCount === 1 ? '' : 's'} currently available.`
                  : 'No cards currently in stock.'}
              </p>
            </div>
          </div>

          {hasListings ? (
            <>
              <Link to={detail.shopSearchUrl}>
                <Button className="mt-5 w-full bg-slate-900 text-white hover:bg-slate-800">Shop Available Cards</Button>
              </Link>
              <div className="mt-5 space-y-3">
                {detail.availability.sampleListings.map((listing) => (
                  <div key={listing.id} className="border-t border-slate-100 pt-3">
                    <p className="line-clamp-1 text-sm font-bold text-slate-900">{listing.name || listing.product_name || listing.card_name}</p>
                    <p className="text-xs text-slate-500">
                      {[listing.set_code, priceForListing(listing) ? `$${priceForListing(listing)}` : ''].filter(Boolean).join(' • ')}
                    </p>
                  </div>
                ))}
              </div>
            </>
          ) : null}

          {(detail.productPageUrl || detail.cardDatabaseUrl) && (
            <div className="mt-5 space-y-2 border-t border-slate-100 pt-4">
              {detail.productPageUrl && (
                <a href={detail.productPageUrl} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-sm font-bold text-slate-800 hover:text-slate-950">
                  Product source <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}
              {detail.cardDatabaseUrl && (
                <a href={detail.cardDatabaseUrl} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-sm font-bold text-slate-800 hover:text-slate-950">
                  Card database <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}
            </div>
          )}
        </aside>
      </section>
    </main>
  );
}
