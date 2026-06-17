import React, { useState } from 'react';
import { backend } from '@/services/backend';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Activity, Loader2, RefreshCw, ChevronDown, ChevronUp, Trash2 } from 'lucide-react';

const STATUS_COLORS = {
  success: 'bg-green-900/50 text-green-300 border-green-700',
  running: 'bg-blue-900/50 text-blue-300 border-blue-700',
  failed: 'bg-red-900/50 text-red-300 border-red-700',
  partial: 'bg-yellow-900/50 text-yellow-300 border-yellow-700',
  queued: 'bg-gray-700 text-gray-300 border-gray-600',
  duplicate: 'bg-purple-900/50 text-purple-300 border-purple-700'
};

export default function ImportJobsPanel() {
  const [expanded, setExpanded] = useState(null);
  const qc = useQueryClient();

  const { data: jobs = [], isLoading } = useQuery({
    queryKey: ['import-jobs'],
    queryFn: () => backend.data.ImportJob.list('-created_date', 100),
    refetchInterval: 5000 // auto-refresh every 5s
  });

  const deleteJob = async (id) => {
    await backend.data.ImportJob.delete(id);
    qc.invalidateQueries(['import-jobs']);
  };

  const clearCompleted = async () => {
    const completed = jobs.filter(j => j.status === 'success');
    await Promise.all(completed.map(j => backend.data.ImportJob.delete(j.id)));
    qc.invalidateQueries(['import-jobs']);
    toast.success(`Cleared ${completed.length} completed jobs`);
  };

  const summary = {
    total: jobs.length,
    success: jobs.filter(j => j.status === 'success').length,
    failed: jobs.filter(j => j.status === 'failed').length,
    running: jobs.filter(j => j.status === 'running').length,
    partial: jobs.filter(j => j.status === 'partial').length,
  };

  return (
    <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">
      <div className="grid grid-cols-5 gap-3">
        {[['Total', summary.total, 'text-white'], ['Success', summary.success, 'text-green-400'],
          ['Failed', summary.failed, 'text-red-400'], ['Running', summary.running, 'text-blue-400'],
          ['Partial', summary.partial, 'text-yellow-400']].map(([label, val, color]) => (
          <div key={label} className="bg-gray-800 border border-gray-700 rounded-xl p-4 text-center">
            <p className={`text-2xl font-bold ${color}`}>{val}</p>
            <p className="text-gray-400 text-xs mt-1">{label}</p>
          </div>
        ))}
      </div>

      <div className="flex justify-between items-center">
        <h2 className="font-bold text-lg">Import Job History</h2>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => qc.invalidateQueries(['import-jobs'])}
            className="border-gray-600 text-gray-300 hover:bg-gray-700">
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Refresh
          </Button>
          {summary.success > 0 && (
            <Button size="sm" variant="outline" onClick={clearCompleted}
              className="border-gray-600 text-gray-300 hover:bg-gray-700">
              <Trash2 className="w-3.5 h-3.5 mr-1.5" /> Clear Completed
            </Button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-yellow-400" /></div>
      ) : jobs.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <Activity className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>No import jobs yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {jobs.map(job => (
            <div key={job.id} className="bg-gray-800 border border-gray-700 rounded-xl overflow-hidden">
              <div className="flex items-center gap-4 px-4 py-3">
                <Badge className={`text-xs ${STATUS_COLORS[job.status] || STATUS_COLORS.queued}`}>{job.status}</Badge>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 flex-wrap">
                    <p className="text-white text-sm font-medium">{job.job_type}</p>
                    <span className="text-gray-400 text-xs">{job.source}</span>
                    {job.commander_name && <span className="text-yellow-400 text-xs">{job.commander_name}</span>}
                  </div>
                  <div className="flex gap-4 text-xs text-gray-500 mt-0.5 flex-wrap">
                    {job.decks_processed > 0 && <span>✓ {job.decks_processed} decks</span>}
                    {job.decks_duplicate > 0 && <span>⊘ {job.decks_duplicate} dupes</span>}
                    {job.cards_unmatched > 0 && <span>⚠ {job.cards_unmatched} unmatched</span>}
                    {job.started_at && <span>{new Date(job.started_at).toLocaleString()}</span>}
                  </div>
                </div>
                <div className="flex gap-1 flex-shrink-0">
                  {job.error_log && (
                    <button onClick={() => setExpanded(expanded === job.id ? null : job.id)}
                      className="text-gray-500 hover:text-white p-1">
                      {expanded === job.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                  )}
                  <button onClick={() => deleteJob(job.id)} className="text-gray-500 hover:text-red-400 p-1">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              {expanded === job.id && job.error_log && (
                <div className="px-4 py-3 border-t border-gray-700 bg-red-900/20">
                  <p className="text-xs text-red-300 font-mono whitespace-pre-wrap">{job.error_log}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


