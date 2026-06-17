import React, { useState } from 'react';
import { backend } from '@/services/backend';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Zap, Loader2, Play, Square, RefreshCw, TrendingUp, Database, Clock, AlertTriangle, CheckCircle } from 'lucide-react';



export default function BootstrapIngestionPanel() {
  const [toggling, setToggling] = useState(false);
  const [manualRunning, setManualRunning] = useState(false);
  const qc = useQueryClient();

  // Fetch all continuous ingestion jobs (triggered_by: scheduled_continuous or admin_manual)
  const { data: bootstrapJobs = [], isLoading: jobsLoading } = useQuery({
    queryKey: ['bootstrap-jobs'],
    queryFn: () => backend.data.ImportJob.filter(
      { triggered_by: { $in: ['scheduled_continuous', 'admin_manual'] } },
      '-created_date',
      200
    ),
    refetchInterval: 10000
  });

  // Fetch deck records for total count
  const { data: deckRecords = [] } = useQuery({
    queryKey: ['deck-records-bootstrap'],
    queryFn: () => backend.data.DeckRecord.filter({ is_duplicate: { $ne: true } }, '-created_date', 9999),
    refetchInterval: 15000
  });

  // Aggregate stats across all bootstrap jobs
  const stats = bootstrapJobs.reduce((acc, job) => {
    acc.totalDecks += job.decks_processed || 0;
    acc.totalDuplicates += job.decks_duplicate || 0;
    acc.totalFailed += job.decks_failed || 0;
    acc.totalRuns += 1;
    if (job.status === 'success') acc.successfulRuns += 1;
    return acc;
  }, { totalDecks: 0, totalDuplicates: 0, totalFailed: 0, totalRuns: 0, successfulRuns: 0 });

  const lastJob = bootstrapJobs[0];
  const isRunning = lastJob?.status === 'running';

  const handleManualRun = async () => {
    setManualRunning(true);
    try {
      const res = await backend.actions.invoke('runContinuousIngestion', {});
      toast.success(`Manual run complete: ${res.data?.results?.success || 0} imported, ${res.data?.results?.duplicate || 0} dupes`);
      qc.invalidateQueries(['bootstrap-jobs']);
      qc.invalidateQueries(['deck-records-bootstrap']);
    } catch (e) {
      toast.error('Manual run failed: ' + e.message);
    } finally {
      setManualRunning(false);
    }
  };

  const uniqueCommandersCovered = new Set(
    deckRecords.map(d => d.commander_name_lower).filter(Boolean)
  ).size;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-orange-500/20 to-yellow-500/20 border border-orange-500/40 rounded-2xl p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Zap className="w-5 h-5 text-orange-400" />
              <h2 className="text-lg font-bold text-white">Bootstrap Ingestion Mode</h2>
              <Badge className="bg-orange-500/30 text-orange-300 border-orange-500/50 text-xs animate-pulse">
                ACTIVE — Every 15 min
              </Badge>
            </div>
            <p className="text-gray-400 text-sm max-w-2xl">
              Aggressive automated deck ingestion running every 15 minutes. Processes 10 commanders per cycle, 
              prioritizing new and low-coverage commanders using oracle_id join. Disable manually once you have enough data.
            </p>
          </div>
          <Button
            onClick={handleManualRun}
            disabled={manualRunning}
            className="bg-orange-500 hover:bg-orange-400 text-white font-bold shrink-0"
          >
            {manualRunning ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Play className="w-4 h-4 mr-2" />}
            Run Now
          </Button>
        </div>

        {/* Disable notice */}
        <div className="mt-4 flex items-center gap-2 text-xs text-gray-500 bg-gray-900/50 rounded-lg px-3 py-2">
          <Square className="w-3.5 h-3.5 text-gray-400 shrink-0" />
          To disable: go to Dashboard → Automations → "Continuous Deck Ingestion (Bootstrap Mode)" → toggle off
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        {[
          { label: 'Total Decks in DB', value: deckRecords.length.toLocaleString(), color: 'text-green-400', icon: Database },
          { label: 'Commanders Covered', value: uniqueCommandersCovered, color: 'text-blue-400', icon: TrendingUp },
          { label: 'Imported (Bootstrap)', value: stats.totalDecks.toLocaleString(), color: 'text-yellow-400', icon: CheckCircle },
          { label: 'Duplicates Skipped', value: stats.totalDuplicates.toLocaleString(), color: 'text-purple-400', icon: RefreshCw },
          { label: 'Failed', value: stats.totalFailed.toLocaleString(), color: stats.totalFailed > 10 ? 'text-red-400' : 'text-gray-400', icon: AlertTriangle },
          { label: 'Total Runs', value: stats.totalRuns, color: 'text-gray-300', icon: Clock },
        ].map(stat => {
          const Icon = stat.icon;
          return (
            <div key={stat.label} className="bg-gray-800 border border-gray-700 rounded-xl p-4 text-center">
              <Icon className={`w-4 h-4 ${stat.color} mx-auto mb-1`} />
              <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
              <p className="text-gray-500 text-xs mt-1 leading-tight">{stat.label}</p>
            </div>
          );
        })}
      </div>

      {/* Last run status */}
      {lastJob && (
        <div className={`border rounded-xl p-4 flex items-center gap-4 ${
          lastJob.status === 'success' ? 'bg-green-900/20 border-green-700/50' :
          lastJob.status === 'running' ? 'bg-blue-900/20 border-blue-700/50' :
          lastJob.status === 'failed' ? 'bg-red-900/20 border-red-700/50' :
          'bg-gray-800 border-gray-700'
        }`}>
          <div className={`w-3 h-3 rounded-full flex-shrink-0 ${
            lastJob.status === 'success' ? 'bg-green-400' :
            lastJob.status === 'running' ? 'bg-blue-400 animate-pulse' :
            lastJob.status === 'failed' ? 'bg-red-400' : 'bg-yellow-400'
          }`} />
          <div className="flex-1">
            <p className="text-white text-sm font-semibold">Last Run: {lastJob.status}</p>
            <div className="flex gap-4 text-xs text-gray-400 mt-0.5 flex-wrap">
              <span className="text-green-300">✓ {lastJob.decks_processed || 0} imported</span>
              <span className="text-purple-300">⊘ {lastJob.decks_duplicate || 0} duplicates</span>
              <span className="text-red-300">✗ {lastJob.decks_failed || 0} failed</span>
              <span>{new Date(lastJob.created_date).toLocaleString()}</span>
            </div>
          </div>
        </div>
      )}

      {/* Recent job history */}
      <div className="bg-gray-800 border border-gray-700 rounded-2xl p-6">
        <h3 className="font-bold text-white mb-4 flex items-center gap-2">
          <Clock className="w-4 h-4 text-gray-400" /> Recent Bootstrap Runs
        </h3>
        {jobsLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
          </div>
        ) : bootstrapJobs.length === 0 ? (
          <p className="text-gray-500 text-sm text-center py-6">
            No runs yet — first run will fire within 15 minutes.
          </p>
        ) : (
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {bootstrapJobs.slice(0, 50).map(job => (
              <div key={job.id} className="flex items-center gap-3 px-3 py-2.5 bg-gray-900 rounded-xl text-sm">
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                  job.status === 'success' ? 'bg-green-400' :
                  job.status === 'running' ? 'bg-blue-400 animate-pulse' :
                  job.status === 'failed' ? 'bg-red-400' : 'bg-yellow-400'
                }`} />
                <span className={`font-medium w-16 flex-shrink-0 ${
                  job.status === 'success' ? 'text-green-300' :
                  job.status === 'failed' ? 'text-red-300' : 'text-yellow-300'
                }`}>{job.status}</span>
                <span className="text-green-300 w-20 flex-shrink-0">+{job.decks_processed || 0} decks</span>
                <span className="text-purple-300 w-20 flex-shrink-0">{job.decks_duplicate || 0} dupes</span>
                <span className="text-gray-500 text-xs ml-auto">{new Date(job.created_date).toLocaleString()}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}


