import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { backend } from '@/services/backend';
import { useQuery } from '@tanstack/react-query';
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  fallbackHeroReleases,
  getHeroCtas,
  getHeroImage,
  getHeroSupportLine,
} from '@/components/home/heroData';
import { getUpcomingHeroReleases } from '@/components/home/getUpcomingHeroReleases';

export default function HeroBanner() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [animating, setAnimating] = useState(false);
  const animatingRef = React.useRef(false);

  const { data: preorders = [] } = useQuery({
    queryKey: ['hero-preorders'],
    queryFn: async () => {
      try {
        const products = await backend.data.Product.filter({ is_preorder: true }, 'release_date', 20);
        return getUpcomingHeroReleases(products);
      } catch {
        return [];
      }
    },
    refetchInterval: 60000,
  });

  const releases = preorders.length > 0 ? preorders : fallbackHeroReleases;

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
      setCurrentIndex(prev => (prev + 1) % releases.length);
    }, 5000);
    return () => clearInterval(interval);
  }, [releases.length]);

  const goNext = () => goTo((currentIndex + 1) % releases.length);
  const goPrev = () => goTo((currentIndex - 1 + releases.length) % releases.length);

  const current = releases[currentIndex] || fallbackHeroReleases[0];
  const bannerImage = getHeroImage(current);
  const supportLine = getHeroSupportLine(current);
  const { singlesHref } = getHeroCtas(current);

  return (
    <section className="relative overflow-hidden w-full bg-slate-950" style={{ height: '248px' }}>
      <div className="absolute inset-0">
        <img
          src={bannerImage}
          alt={current.name}
          className="w-full h-full object-cover object-center"
        />
      </div>
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

            <Link to={singlesHref}>
              <Button size="default" className="bg-white text-slate-950 hover:bg-slate-100 font-bold shadow-lg rounded-xl px-5">
                Shop now
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </Link>
          </div>
        </div>

        {releases.length > 1 && (
          <div className="absolute bottom-4 left-4 flex items-center gap-2">
            <button onClick={goPrev} className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-black/20 text-white/70 hover:text-white hover:bg-white/10 transition-colors backdrop-blur-sm">
              <ChevronLeft className="w-4 h-4" />
            </button>
            {releases.map((_, idx) => (
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
