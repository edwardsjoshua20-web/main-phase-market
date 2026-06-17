import React, { useState } from 'react';
import { backend } from '@/services/backend';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import {
  Zap, Loader2, RefreshCw, Link,
  CheckCircle, Clock, Activity, Play
} from 'lucide-react';

export default function CommanderIngestionPanel() {
  const [urlBatch, setUrlBatch] = useState('');
  const [running, setRunning] = useState(false);
  const [lastResult, setLastResult] = useState(null);
  const qc = useQueryClient();

  const { data: recentJobs = [] } = useQuery({
    queryKey: ['pipeline-jobs'],
    queryFn: () => backend.data.ImportJob.filter(
      { triggered_by: { $ne: 'admin_manual' } }, '-created_date', 10
    ),
    refetchInterval: 4000
  });

  const { data: synergies = [] } = useQuery({
    queryKey: ['commander-synergies-count'],
    queryFn: () => backend.data.CommanderSynergy.list('-last_updated', 200)
  });

  const { data: deckRecords = [] } = useQuery({
    queryKey: ['deck-records-pipeline'],
    queryFn: () => backend.data.DeckRecord.filter(
      { is_duplicate: { $ne: true } }, '-created_date', 5000
    )
  });

  const runTopCommanders = async () => {
    setRunning(true);
    try {
      const res = await backend.actions.invoke('processBulkImport', {
        mode: 'top_commanders',
        triggered_by: 'admin_manual'
      });
      setLastResult(res.data);
      toast.success(`Pipeline complete: ${res.data?.success || 0} succeeded, ${res.data?.failed || 0} failed`);
      qc.invalidateQueries(['pipeline-jobs']);
      qc.invalidateQueries(['commander-synergies-count']);
    } catch (e) {
      toast.error('Pipeline failed: ' + e.message);
    } finally {
      setRunning(false);
    }
  };

  const runUrlBatch = async () => {
    const urls = urlBatch.split('\n').map(u => u.trim()).filter(u => u.startsWith('http'));
    if (!urls.length) { toast.error('No valid URLs found'); return; }
    setRunning(true);
    try {
      const res = await backend.actions.invoke('processBulkImport', {
        urls,
        triggered_by: 'admin_manual'
      });
      setLastResult(res.data);
      toast.success(`Queued ${urls.length} URLs: ${res.data?.success || 0} imported`);
      setUrlBatch('');
      qc.invalidateQueries(['pipeline-jobs']);
    } catch (e) {
      toast.error('Failed: ' + e.message);
    } finally {
      setRunning(false);
    }
  };

  const runStatsRebuild = async () => {
    setRunning(true);
    try {
      const res = await backend.actions.invoke('buildCommanderStats', { rebuild_all: true });
      toast.success(res.data?.message || 'Stats rebuilt');
      qc.invalidateQueries(['commander-synergies-count']);
    } catch (e) {
      toast.error('Rebuild failed: ' + e.message);
    } finally {
      setRunning(false);
    }
  };

  const staleCommanders = synergies.filter(s => {
    if (!s.last_updated) return true;
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    return new Date(s.last_updated) < sevenDaysAgo;
  });

  return (
    <div className="max-w-6xl mx-auto px-6 py-8 space-y-8">
      {/* System Status */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Decks Ingested', value: deckRecords.length.toLocaleString(), color: 'text-white' },
          { label: 'Commanders', value: synergies.length, color: 'text-yellow-400' },
          { label: 'Stale (>7d)', value: staleCommanders.length, color: staleCommanders.length > 5 ? 'text-red-400' : 'text-green-400' },
          { label: 'Unique Commanders in DB', value: new Set(deckRecords.map(d => d.commander_name_lower).filter(Boolean)).size, color: 'text-blue-400' }
        ].map(stat => (
          <div key={stat.label} className="bg-gray-800 border border-gray-700 rounded-xl p-4 text-center">
            <p className={`text-3xl font-bold ${stat.color}`}>{stat.value}</p>
            <p className="text-gray-400 text-xs mt-1">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Last Pipeline Result */}
      {lastResult && (
        <div className="bg-gray-800 border border-green-700/50 rounded-xl p-4">
          <p className="text-green-400 font-semibold text-sm mb-2 flex items-center gap-2">
            <CheckCircle className="w-4 h-4" /> Last Pipeline Run
          </p>
          <div className="flex flex-wrap gap-4 text-sm">
            <span className="text-green-300">✓ {lastResult.success || 0} succeeded</span>
            <span className="text-purple-300">⊘ {lastResult.duplicate || 0} duplicates</span>
            <span className="text-yellow-300">⚠ {lastResult.partial || 0} partial</span>
            <span className="text-red-300">✗ {lastResult.failed || 0} failed</span>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Automated Pipelines */}
        <div className="bg-gray-800 border border-gray-700 rounded-2xl p-6 space-y-4">
          <div>
            <h2 className="font-bold text-lg flex items-center gap-2">
              <Zap className="w-5 h-5 text-yellow-400" /> Automated Pipelines
            </h2>
            <p className="text-gray-400 text-sm mt-1">
              One click → fully automated: fetch → parse → normalize → deduplicate → store → rebuild stats.
            </p>
          </div>

          <div className="space-y-3">
            <div className="bg-gray-900 border border-gray-600 rounded-xl p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <p className="font-semibold text-white">Top Commanders (Continuous)</p>
                  <p className="text-gray-400 text-xs mt-0.5">
                    Automated pipeline ingests the 10 most popular commanders every 15 minutes using oracle_id join.
                  </p>
                </div>
                <Button onClick={runTopCommanders} disabled={running}
                  className="bg-yellow-500 hover:bg-yellow-400 text-gray-900 font-bold shrink-0">
                  {running ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Play className="w-4 h-4 mr-2" />}
                  Run Now
                </Button>
              </div>
              <div className="flex flex-wrap gap-1 mt-3">
                {['Atraxa', 'Edgar Markov', 'Meren', 'Krenko', 'Kaalia', 'Yuriko', 'The Ur-Dragon', '...+13 more'].map(c => (
                  <span key={c} className="text-xs bg-gray-700 text-gray-300 px-2 py-0.5 rounded-full">{c}</span>
                ))}
              </div>
            </div>

            <div className="bg-gray-900 border border-gray-600 rounded-xl p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <p className="font-semibold text-white">Rebuild All Stats</p>
                  <p className="text-gray-400 text-xs mt-0.5">
                    Recalculates synergy scores, inclusion rates, and confidence scores for every commander in DB.
                  </p>
                </div>
                <Button onClick={runStatsRebuild} disabled={running} variant="outline"
                  className="border-blue-600 text-blue-400 hover:bg-blue-900/30 font-bold shrink-0">
                  {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <><RefreshCw className="w-4 h-4 mr-1.5" />Rebuild</>}
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Bulk URL Ingestion */}
        <div className="bg-gray-800 border border-gray-700 rounded-2xl p-6 space-y-4">
          <div>
            <h2 className="font-bold text-lg flex items-center gap-2">
              <Link className="w-5 h-5 text-blue-400" /> Bulk Synergy URL Pipeline (Oracle Join)
            </h2>
            <p className="text-gray-400 text-sm mt-1">
              Paste JSON synergy file URLs (one per line). Data joins to MagicCard by oracle_id. No cards.json required.
            </p>
          </div>
        </div>
      </div>

      {/* Scheduled Jobs Info */}
      <div className="bg-gray-800 border border-gray-700 rounded-2xl p-6">
        <h2 className="font-bold text-lg flex items-center gap-2 mb-4">
          <Clock className="w-5 h-5 text-purple-400" /> Scheduled Automation
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[
            { name: 'Nightly Stats Rebuild', schedule: 'Every day at 2am', fn: 'runScheduledStatsRebuild', status: 'active' },
            { name: 'Weekly Commander Refresh', schedule: 'Every Monday at 3am', fn: 'runScheduledIngestion', status: 'active' }
          ].map(job => (
            <div key={job.name} className="bg-gray-900 border border-gray-700 rounded-xl p-4">
              <div className="flex items-center justify-between mb-1">
                <p className="font-semibold text-white text-sm">{job.name}</p>
                <Badge className="bg-green-900/50 text-green-300 border-green-700 text-xs">{job.status}</Badge>
              </div>
              <p className="text-gray-400 text-xs">{job.schedule}</p>
              <p className="text-gray-500 text-xs mt-1 font-mono">{job.fn}()</p>
            </div>
          ))}
        </div>
      </div>

      {/* Recent Pipeline Jobs */}
      <div className="bg-gray-800 border border-gray-700 rounded-2xl p-6">
        <h2 className="font-bold text-lg flex items-center gap-2 mb-4">
          <Activity className="w-5 h-5 text-green-400" /> Recent Pipeline Activity
        </h2>
        {recentJobs.length === 0 ? (
          <p className="text-gray-500 text-sm text-center py-6">No pipeline runs yet. Run a pipeline above.</p>
        ) : (
          <div className="space-y-2">
            {recentJobs.map(job => (
              <div key={job.id} className="flex items-center gap-4 px-4 py-3 bg-gray-900 rounded-xl">
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                  job.status === 'success' ? 'bg-green-400' :
                  job.status === 'running' ? 'bg-blue-400 animate-pulse' :
                  job.status === 'failed' ? 'bg-red-400' : 'bg-yellow-400'
                }`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-white text-sm font-medium">{job.job_type}</span>
                    <span className="text-gray-400 text-xs">{job.source}</span>
                    {job.commander_name && <span className="text-yellow-400 text-xs">{job.commander_name}</span>}
                  </div>
                  <div className="flex gap-3 text-xs text-gray-500 mt-0.5 flex-wrap">
                    {job.decks_processed > 0 && <span>✓ {job.decks_processed} processed</span>}
                    {job.decks_duplicate > 0 && <span>⊘ {job.decks_duplicate} dupes</span>}
                    {job.cards_unmatched > 0 && <span>⚠ {job.cards_unmatched} unmatched</span>}
                    <span>{new Date(job.created_date).toLocaleString()}</span>
                  </div>
                </div>
                <Badge className={`text-xs flex-shrink-0 ${
                  job.status === 'success' ? 'bg-green-900/50 text-green-300 border-green-700' :
                  job.status === 'running' ? 'bg-blue-900/50 text-blue-300 border-blue-700' :
                  job.status === 'failed' ? 'bg-red-900/50 text-red-300 border-red-700' :
                  'bg-yellow-900/50 text-yellow-300 border-yellow-700'
                }`}>{job.status}</Badge>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}


