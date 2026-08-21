import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { fallbackHomepageReleases } from '@/services/homepage/homepageReleaseFeed';

export default function HeroBanner({ releases = fallbackHomepageReleases }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [animating, setAnimating] = useState(false);
  const [failedImageUrls, setFailedImageUrls] = useState({});
  const animatingRef = React.useRef(false);

  const safeReleases = releases.length > 0 ? releases : fallbackHomepageReleases;

  const goTo = (idx) => {
    if (animatingRef.current) return;
    animatingRef.current = true;
    setAnimating(true);
    setCurrentIndex(idx);
    setTimeout(() => {
      animatingRef.current = false;
      setAnimating(false);
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

      <div className="relative z-10 h-full w-full px-4 py-5">
        <div className="h-full flex items-center">
          <div className={`text-white transition-opacity duration-400 ${animating ? 'opacity-0' : 'opacity-100'} max-w-2xl`}>
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight leading-[0.96] mb-2 text-balance max-w-3xl">
              {current.name}
            </h1>
            <p className="text-sm md:text-base text-white/86 mb-5 max-w-xl">
              {supportLine}
            </p>

            <Link to={ctaHref}>
              <Button size="default" className="bg-white text-slate-950 hover:bg-slate-100 font-bold shadow-lg rounded-xl px-5">
                {ctaLabel}
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </Link>
          </div>
        </div>

        {safeReleases.length > 1 && (
          <div className="absolute bottom-4 left-4 flex items-center gap-2">
            <button onClick={goPrev} className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-black/20 text-white/70 hover:text-white hover:bg-white/10 transition-colors backdrop-blur-sm">
              <ChevronLeft className="w-4 h-4" />
            </button>
            {safeReleases.map((_, idx) => (
              <button
                key={idx}
                onClick={() => goTo(idx)}
                className={`h-2 rounded-full transition-all duration-300 ${idx === currentIndex ? 'bg-white w-7' : 'bg-white/30 hover:bg-white/70 w-2'}`}
              />
            ))}
            <button onClick={goNext} className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-black/20 text-white/70 hover:text-white hover:bg-white/10 transition-colors backdrop-blur-sm">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
