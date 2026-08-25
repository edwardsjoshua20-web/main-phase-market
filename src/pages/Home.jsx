import React from 'react';
import HeroBanner from '@/components/home/HeroBanner';
import NewReleasesBar from '@/components/home/NewReleasesBar';
import GameTabs from '@/components/home/GameTabs';
import TrendingCards from '@/components/home/TrendingCards';
import CoreActionsSection from '@/components/home/CoreActionsSection';
import TrustStrip from '@/components/home/TrustStrip';
import { useHomepageContent } from '@/hooks/useHomepageContent';

export default function Home() {
  const { data: homepageContent } = useHomepageContent();

  return (
    <div className="w-full bg-white">
      <div className="hidden md:block">
        <HeroBanner releases={homepageContent?.heroReleases} />
      </div>

      <NewReleasesBar
        upcomingSets={homepageContent?.upcomingReleases || []}
        hasActivePreorders={(homepageContent?.sources?.products || 0) > 0}
      />

      <TrendingCards />
      <CoreActionsSection />
      <GameTabs />
      <TrustStrip />
    </div>
  );
}
