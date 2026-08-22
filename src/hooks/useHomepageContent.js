import { useQuery } from '@tanstack/react-query';
import { getHomepageContent } from '@/services/homepage/homepageContentService';

export function useHomepageContent() {
  return useQuery({
    queryKey: ['homepage-content'],
    queryFn: getHomepageContent,
    staleTime: 60_000,
    refetchInterval: 60_000,
    placeholderData: {
      heroReleases: [],
      upcomingReleases: [],
      sources: { products: 0, manifest: 0 }
    }
  });
}
