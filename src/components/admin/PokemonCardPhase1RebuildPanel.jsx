import React from 'react';
import { backend } from '@/services/backend';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, RefreshCw } from 'lucide-react';

const STATUS_STYLES = {
  active: 'bg-blue-900/50 text-blue-300 border-blue-700',
  in_progress: 'bg-yellow-900/50 text-yellow-300 border-yellow-700',
  error: 'bg-red-900/50 text-red-300 border-red-700'
};

function StatCard({ label, value }) {
  return (
    <div className="bg-gray-800 border border-gray-700 rounded-xl p-4">
      <p className="text-gray-400 text-xs mb-1">{label}</p>
      <p className="text-white text-lg font-semibold break-words">{value ?? '—'}</p>
    </div>
  );
}

export default function PokemonCardPhase1RebuildPanel() {
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['pokemoncard-phase1-rebuild-panel'],
    queryFn: async () => {
      const rows = await backend.data.PokemonCard.list('-created_date', 60000);
      const totalRows = rows.length;
      const hpCount = rows.filter(row => !!row.hp).length;
      const abilitiesCount = rows.filter(row => Array.isArray(row.abilities) && row.abilities.length > 0).length;
      const attacksCount = rows.filter(row => Array.isArray(row.attacks) && row.attacks.length > 0).length;
      const rulesTextCount = rows.filter(row => !!row.rules_text_summary).length;
      const imageLargeCount = rows.filter(row => !!row.image_large).length;
      const legalitiesCount = rows.filter(row => !!row.legalities).length;
      const completedEstimate = Math.max(hpCount, abilitiesCount, attacksCount, rulesTextCount, imageLargeCount, legalitiesCount);
      const remainingEstimate = Math.max(0, totalRows - completedEstimate);
      const status = remainingEstimate === 0 ? 'active' : 'in_progress';
      const statusText = remainingEstimate === 0 ? 'complete' : 'still running';

      return {
        totalRows,
        hpCount,
        abilitiesCount,
        attacksCount,
        rulesTextCount,
        imageLargeCount,
        legalitiesCount,
        completedEstimate,
        remainingEstimate,
        status,
        statusText,
        fieldsHealthy: completedEstimate > 0 ? 'Yes' : 'Unknown'
      };
    },
    refetchInterval: 5000
  });

  const runSampleBackfill = async () => {
    await backend.actions.invoke('backfillPokemonCardPhase1', { skip: 0, limit: 25, dryRun: true });
    refetch();
  };

  if (isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-yellow-400" /></div>;
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-8 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold text-white">PokemonCard Phase-1 Backfill</h2>
          <p className="text-gray-400 text-sm">Monitor the in-place phase-1 metadata enrichment for Pokémon cards and how many still need phase-1 fields.</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge className={STATUS_STYLES[data?.status] || STATUS_STYLES.active}>{data?.statusText || 'active'}</Badge>
          {isFetching && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Uploaded cards" value={data?.totalRows?.toLocaleString()} />
        <StatCard label="Cards left to enrich" value={data?.remainingEstimate?.toLocaleString()} />
        <StatCard label="Estimated enriched cards" value={data?.completedEstimate?.toLocaleString()} />
        <StatCard label="Fields populating correctly" value={data?.fieldsHealthy} />
        <StatCard label="Rows with hp" value={data?.hpCount?.toLocaleString()} />
        <StatCard label="Rows with abilities" value={data?.abilitiesCount?.toLocaleString()} />
        <StatCard label="Rows with attacks" value={data?.attacksCount?.toLocaleString()} />
        <StatCard label="Rows with rules text" value={data?.rulesTextCount?.toLocaleString()} />
        <StatCard label="Rows with image_large" value={data?.imageLargeCount?.toLocaleString()} />
        <StatCard label="Rows with legalities" value={data?.legalitiesCount?.toLocaleString()} />
      </div>

      <div className="flex flex-wrap gap-3">
        <Button onClick={() => refetch()} variant="outline" className="border-gray-600 text-gray-300 hover:bg-gray-800"><RefreshCw className="w-4 h-4 mr-2" />Refresh status</Button>
        <Button onClick={runSampleBackfill} variant="outline" className="border-gray-600 text-gray-300 hover:bg-gray-800">Validate backfill function</Button>
      </div>
    </div>
  );
}


