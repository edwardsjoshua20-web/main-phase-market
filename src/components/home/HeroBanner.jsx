import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import { ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react';
import { fallbackHomepageReleases } from '@/services/homepage/homepageReleaseFeed';

export default function HeroBanner({ releases = fallbackHomepageReleases }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [failedImageUrls, setFailedImageUrls] = useState({});
  const animatingRef = React.useRef(false);

  const safeReleases = releases.length > 0 ? releases : fallbackHomepageReleases;

  const goTo = (idx) => {
    if (animatingRef.current) return;
    animatingRef.current = true;
    setCurrentIndex(idx);
    setTimeout(() => {
      animatingRef.current = false;
    }, 400);
  };

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentIndex(prev => (prev + 1) % safeReleases.length);
    }, 5000);
    return () => clearInterval(interval);
  }, [safeReleases.length]);

  const goNext = () => goTo((currentIndex + 1) % safeReleases.length);
  const goPrev = () => goTo((currentIndex - 1 + safeReleases.length) % safeReleases.length);

  const current = safeReleases[currentIndex] || fallbackHomepageReleases[0];
  const bannerImage = current.heroImageUrl || null;
  const containedImage = [
    current.imageUrl,
    current.heroFallbackImageUrl,
    fallbackHomepageReleases[0].heroFallbackImageUrl
  ].find((url) => url && !failedImageUrls[url]);
  const supportLine = current.supportLine || current.gameLabel || 'Upcoming release';
  const ctaHref = current.ctaHref || current.links?.shopSearch || '/Shop';
  const ctaLabel = current.ctaLabel || 'View Set';
  const releaseStateLabel = current.releaseStateLabel || '';
  const fallbackInitials = String(current.gameLabel || current.game || 'TCG')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .map((word) => word[0])
    .join('')
    .toUpperCase();

  const markImageFailed = (url) => {
    if (!url) return;
    setFailedImageUrls((prev) => ({ ...prev, [url]: true }));
  };

  return (
    <section className="relative overflow-hidden w-full bg-slate-950" style={{ height: '248px' }}>
      {bannerImage ? (
        <div className="absolute inset-0">
          <img
            src={bannerImage}
            alt={current.name}
            className="w-full h-full object-cover object-center"
          />
        </div>
      ) : (
        <div className="absolute inset-0 bg-[linear-gradient(120deg,#020617_0%,#111827_48%,#1e293b_100%)]">
          <div className="absolute inset-y-0 right-0 w-[54%] bg-[radial-gradient(circle_at_68%_50%,rgba(148,163,184,0.24),transparent_52%)]" />
          <div className="absolute right-0 top-0 h-full w-[46%] bg-[linear-gradient(90deg,rgba(2,6,23,0)_0%,rgba(15,23,42,0.42)_42%,rgba(15,23,42,0.76)_100%)]" />
          {containedImage ? (
            <div className="absolute inset-y-3 right-8 hidden w-[38%] items-center justify-end md:flex">
              <img
                src={containedImage}
                alt=""
                aria-hidden="true"
                onError={() => markImageFailed(containedImage)}
                className="max-h-full max-w-full object-contain opacity-80 drop-shadow-[0_22px_42px_rgba(0,0,0,0.46)]"
              />
            </div>
          ) : (
            <div className="absolute right-12 top-1/2 hidden h-32 w-32 -translate-y-1/2 items-center justify-center rounded-full border border-white/10 bg-white/[0.08] text-3xl font-black tracking-wide text-white/40 md:flex">
              {fallbackInitials}
            </div>
          )}
        </div>
      )}
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(2,6,23,0.95)_0%,rgba(15,23,42,0.84)_38%,rgba(15,23,42,0.50)_65%,rgba(15,23,42,0.24)_100%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(2,6,23,0.10)_0%,rgba(2,6,23,0.34)_100%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_24%,rgba(255,255,255,0.12),transparent_22%)]" />

      <div className="relative z-10 h-full w-full px-4 py-4">
        <div className="h-full flex items-center">
          <div className="grid h-[204px] max-w-2xl grid-rows-[16px_74px_22px_36px_16px_24px] text-white">
            <div className="flex items-start">
              {releaseStateLabel && (
                <p className="text-[10px] font-semibold uppercase leading-none tracking-[0.22em] text-white/68">
                  {releaseStateLabel}
                </p>
              )}
            </div>
            <div className="flex items-start">
              <h1 className="max-w-3xl text-3xl font-bold leading-[0.96] tracking-tight text-balance md:text-4xl">
                {current.name}
              </h1>
            </div>
            <p className="max-w-xl text-sm text-white/86 md:text-base">
              {supportLine}
            </p>

            <div className="flex items-start">
              <Link to={ctaHref}>
                <Button size="sm" className="h-8 rounded-[4px] border border-white/18 bg-white/95 px-3.5 text-sm font-bold text-slate-950 shadow-[0_10px_22px_rgba(0,0,0,0.20)] hover:bg-white">
                  {ctaLabel}
                  <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                </Button>
              </Link>
            </div>

            <div aria-hidden="true" />

            {safeReleases.length > 1 && (
              <div className="flex items-end gap-3 text-white/68">
                <span className="min-w-[54px] text-[11px] font-semibold tabular-nums tracking-[0.18em]">
                  {String(currentIndex + 1).padStart(2, '0')} / {String(safeReleases.length).padStart(2, '0')}
                </span>
                <div className="flex items-center gap-1">
                  <button onClick={goPrev} className="flex h-6 w-6 items-center justify-center border border-white/12 bg-white/[0.04] text-white/62 transition-colors hover:border-white/24 hover:bg-white/[0.08] hover:text-white">
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button onClick={goNext} className="flex h-6 w-6 items-center justify-center border border-white/12 bg-white/[0.04] text-white/62 transition-colors hover:border-white/24 hover:bg-white/[0.08] hover:text-white">
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
