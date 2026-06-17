import React, { useState } from 'react';
import { backend } from '@/services/backend';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { BarChart3, Loader2, RefreshCw, ChevronDown, ChevronUp, Trash2 } from 'lucide-react';

export default function CommanderStatsPanel() {
  const [rebuilding, setRebuilding] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const qc = useQueryClient();

  const { data: synergies = [], isLoading } = useQuery({
    queryKey: ['commander-synergies'],
    queryFn: () => backend.data.CommanderSynergy.list('-last_updated', 200)
  });

  const { data: deckRecords = [] } = useQuery({
    queryKey: ['deck-records-count'],
    queryFn: () => backend.data.DeckRecord.filter({ is_duplicate: { $ne: true } }, '-created_date', 5000)
  });

  const totalDecks = deckRecords.length;
  const commanderSet = new Set(deckRecords.map(d => d.commander_name_lower).filter(Boolean));

  const rebuildSingle = async (commanderName) => {
    setRebuilding(commanderName);
    try {
      const res = await backend.actions.invoke('buildCommanderStats', { commander_name: commanderName });
      toast.success(`${commanderName}: stats rebuilt (${res.data?.results?.[0]?.unique_cards || 0} cards)`);
      qc.invalidateQueries(['commander-synergies']);
    } catch (e) {
      toast.error('Rebuild failed: ' + e.message);
    } finally {
      setRebuilding('');
    }
  };

  const rebuildAll = async () => {
    setRebuilding('ALL');
    try {
      const res = await backend.actions.invoke('buildCommanderStats', { rebuild_all: true });
      toast.success(res.data?.message || 'All stats rebuilt');
      qc.invalidateQueries(['commander-synergies']);
    } catch (e) {
      toast.error('Rebuild failed: ' + e.message);
    } finally {
      setRebuilding('');
    }
  };

  const deleteSynergy = async (id) => {
    await backend.data.CommanderSynergy.delete(id);
    qc.invalidateQueries(['commander-synergies']);
    toast.success('Deleted');
  };

  return (
    <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-5 text-center">
          <p className="text-3xl font-bold text-white">{totalDecks.toLocaleString()}</p>
          <p className="text-gray-400 text-sm mt-1">Total Decks Ingested</p>
        </div>
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-5 text-center">
          <p className="text-3xl font-bold text-yellow-400">{commanderSet.size}</p>
          <p className="text-gray-400 text-sm mt-1">Unique Commanders</p>
        </div>
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-5 text-center">
          <p className="text-3xl font-bold text-green-400">{synergies.length}</p>
          <p className="text-gray-400 text-sm mt-1">Stats Computed</p>
        </div>
      </div>

      <div className="flex justify-between items-center">
        <h2 className="font-bold text-lg">Commander Synergy Data</h2>
        <Button onClick={rebuildAll} disabled={!!rebuilding}
          className="bg-yellow-500 hover:bg-yellow-400 text-gray-900 font-bold">
          {rebuilding === 'ALL' ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Rebuilding...</> : <><RefreshCw className="w-4 h-4 mr-2" />Rebuild All Stats</>}
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-yellow-400" /></div>
      ) : synergies.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <BarChart3 className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>No synergy data yet. Ingest some decklists first, then rebuild stats.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {synergies.map(s => {
            const isExpanded = expandedId === s.id;
            const topCards = (() => { try { return JSON.parse(s.top_cards_json || '[]').slice(0, 5); } catch { return []; } })();
            return (
              <div key={s.id} className="bg-gray-800 border border-gray-700 rounded-xl overflow-hidden">
                <div className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-bold text-white text-sm leading-tight">{s.commander_name}</p>
                    <div className="flex gap-1 flex-shrink-0">
                      <button onClick={() => rebuildSingle(s.commander_name)} disabled={!!rebuilding}
                        title="Rebuild stats" className="text-gray-500 hover:text-yellow-400 p-1">
                        {rebuilding === s.commander_name ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                      </button>
                      <button onClick={() => deleteSynergy(s.id)} className="text-gray-500 hover:text-red-400 p-1">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    <Badge className="bg-green-900/50 text-green-300 border-green-700 text-xs">{(s.decks_analyzed || 0).toLocaleString()} decks</Badge>
                    <Badge className="bg-blue-900/50 text-blue-300 border-blue-700 text-xs">{s.synergy_patterns?.length || 0} categories</Badge>
                    <Badge className="bg-yellow-900/50 text-yellow-300 border-yellow-700 text-xs">{s.static_cards?.length || 0} staples</Badge>
                  </div>
                  {s.last_updated && <p className="text-gray-500 text-xs mt-2">{new Date(s.last_updated).toLocaleDateString()}</p>}
                </div>
                {topCards.length > 0 && (
                  <>
                    <button onClick={() => setExpandedId(isExpanded ? null : s.id)}
                      className="w-full flex items-center justify-between px-4 py-2 border-t border-gray-700 text-gray-400 hover:text-white text-xs hover:bg-gray-700 transition-colors">
                      <span>Top synergy cards</span>
                      {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>
                    {isExpanded && (
                      <div className="px-4 pb-4 space-y-1.5">
                        {topCards.map((c, i) => (
                          <div key={i} className="flex items-center justify-between text-xs">
                            <span className="text-gray-300 truncate">{c.card_name || c.name}</span>
                            <div className="flex gap-2 flex-shrink-0 ml-2">
                              <span className="text-blue-400">{Math.round((c.inclusion_rate || 0) * 100)}%</span>
                              <span className="text-yellow-400 font-bold">{(c.synergy_score > 0 ? '+' : '')}{((c.synergy_score || 0) * 100).toFixed(0)}⚡</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}


