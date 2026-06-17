import React from 'react';
import { backend } from '@/services/backend';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Play, Pause, RefreshCw, RotateCcw } from 'lucide-react';

const STATUS_STYLES = {
  active: 'bg-blue-900/50 text-blue-300 border-blue-700',
  paused: 'bg-yellow-900/50 text-yellow-300 border-yellow-700',
  completed: 'bg-green-900/50 text-green-300 border-green-700',
  failed: 'bg-red-900/50 text-red-300 border-red-700'
};

function StatCard({ label, value }) {
  return (
    <div className="bg-gray-800 border border-gray-700 rounded-xl p-4">
      <p className="text-gray-400 text-xs mb-1">{label}</p>
      <p className="text-white text-lg font-semibold break-words">{value ?? '—'}</p>
    </div>
  );
}

export default function MagicCardV2RebuildPanel() {
  const qc = useQueryClient();

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['magiccardv2-rebuild-panel'],
    queryFn: async () => {
      const [jobRows, rows] = await Promise.all([
        backend.data.MagicCardV2RebuildJob.filter({ job_key: 'magiccardv2_rebuild' }, '-created_date', 1),
        backend.data.MagicCardV2.list('-created_date', 60000)
      ]);
      const job = jobRows[0] || null;
      const totalRows = rows.length;
      const oracleIdCount = rows.filter(row => !!row.oracle_id).length;
      const imageNormalCount = rows.filter(row => !!row.image_normal).length;
      const oracleTextCount = rows.filter(row => !!row.oracle_text).length;
      const commanderCount = rows.filter(row => row.can_be_commander === true).length;
      const estimatedTotal = job?.estimated_total_target ?? null;
      const remainingRows = estimatedTotal != null ? Math.max(0, estimatedTotal - totalRows) : null;
      const estimatedPercent = estimatedTotal
        ? Math.min(100, Math.round((totalRows / estimatedTotal) * 100))
        : null;

      return {
        job,
        totalRows,
        oracleIdCount,
        imageNormalCount,
        oracleTextCount,
        commanderCount,
        estimatedTotal,
        remainingRows,
        estimatedPercent
      };
    },
    refetchInterval: 5000
  });

  const runAction = async (mode) => {
    await backend.actions.invoke('runMagicCardV2RebuildJob', { mode });
    qc.invalidateQueries({ queryKey: ['magiccardv2-rebuild-panel'] });
  };

  if (isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-yellow-400" /></div>;
  }

  const job = data?.job;
  const nextOffset = job?.next_resume_offset;
  const nextPage = job?.next_resume_page;

  return (
    <div className="max-w-6xl mx-auto px-6 py-8 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold text-white">MagicCardV2 Rebuild Job</h2>
          <p className="text-gray-400 text-sm">Background rebuild with checkpointed resume and low-pressure Scryfall fetching.</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge className={STATUS_STYLES[job?.status] || STATUS_STYLES.paused}>{job?.status || 'paused'}</Badge>
          {isFetching && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Uploaded cards" value={data?.totalRows?.toLocaleString()} />
        <StatCard label="Cards left to upload" value={data?.remainingRows != null ? data.remainingRows.toLocaleString() : 'Unknown'} />
        <StatCard label="Estimated total cards" value={data?.estimatedTotal != null ? data.estimatedTotal.toLocaleString() : 'Unknown'} />
        <StatCard label="More cards left" value={job?.has_more === true ? 'Yes' : job?.has_more === false ? 'No' : 'Unknown'} />
        <StatCard label="Cards with oracle ID" value={data?.oracleIdCount?.toLocaleString()} />
        <StatCard label="Cards with images" value={data?.imageNormalCount?.toLocaleString()} />
        <StatCard label="Cards with rules text" value={data?.oracleTextCount?.toLocaleString()} />
        <StatCard label="Cards marked as commanders" value={data?.commanderCount?.toLocaleString()} />
        <StatCard label="Last successful batch" value={job?.last_successful_batch?.toLocaleString()} />
        <StatCard label="Last successful run" value={job?.last_successful_run_time ? new Date(job.last_successful_run_time).toLocaleString() : '—'} />
        <StatCard label="Last error" value={job?.last_error || '—'} />
      </div>

      <div className="flex flex-wrap gap-3">
        <Button onClick={() => runAction('start')} className="bg-green-600 hover:bg-green-500 text-white"><Play className="w-4 h-4 mr-2" />Start</Button>
        <Button onClick={() => runAction('pause')} variant="outline" className="border-gray-600 text-gray-300 hover:bg-gray-800"><Pause className="w-4 h-4 mr-2" />Pause</Button>
        <Button onClick={() => runAction('resume')} variant="outline" className="border-gray-600 text-gray-300 hover:bg-gray-800"><Play className="w-4 h-4 mr-2" />Resume</Button>
        <Button onClick={() => runAction('retry_failed')} variant="outline" className="border-gray-600 text-gray-300 hover:bg-gray-800"><RotateCcw className="w-4 h-4 mr-2" />Retry last failed batch</Button>
        <Button onClick={() => qc.invalidateQueries({ queryKey: ['magiccardv2-rebuild-panel'] })} variant="outline" className="border-gray-600 text-gray-300 hover:bg-gray-800"><RefreshCw className="w-4 h-4 mr-2" />Refresh status</Button>
      </div>
    </div>
  );
}


