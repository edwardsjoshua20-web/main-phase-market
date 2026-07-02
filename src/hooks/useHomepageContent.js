import { useQuery } from '@tanstack/react-query';
import { getHomepageContent } from '@/services/homepage/homepageContentService';
import { fallbackHomepageReleases } from '@/services/homepage/homepageReleaseFeed';

export function useHomepageContent() {
  return useQuery({
    queryKey: ['homepage-content'],
    queryFn: getHomepageContent,
    staleTime: 60_000,
    refetchInterval: 60_000,
    initialData: {
      heroReleases: fallbackHomepageReleases,
      upcomingReleases: fallbackHomepageReleases.slice(0, 6),
      sources: { products: 0, manifest: 0 }
    }
  });
}
