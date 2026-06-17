import { useState } from 'react';
import { backend } from '@/services/backend';
import { Button } from '@/components/ui/button';
import { Loader2, Play, RefreshCw, Database, Users, Layers } from 'lucide-react';

export default function ArchidektImportPanel() {
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [importing, setImporting] = useState(false);
  const [log, setLog] = useState([]);
  const [progress, setProgress] = useState(null);

  const addLog = (msg, type = 'info') => setLog(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev.slice(0, 99)]);

  const analyze = async () => {
    setAnalyzing(true);
    try {
      const res = await backend.actions.invoke('importArchidektData', { mode: 'analyze' });
      setAnalysis(res.data);
      addLog(`Analysis: ${res.data.total_decks} decks, ${res.data.total_commanders} commanders, ${res.data.total_cards_in_dict} cards`);
    } catch (e) { addLog(`Error: ${e.message}`, 'error'); }
    setAnalyzing(false);
  };

  const importCommanders = async () => {
    setImporting(true);
    addLog('Importing commanders from commanders.json...');
    try {
      const res = await backend.actions.invoke('importArchidektData', { mode: 'import_commanders' });
      addLog(`✓ Commanders imported: ${res.data.commanders_inserted} (from ${res.data.total_raw} raw, ${res.data.total_valid} valid UUIDs)`);
    } catch (e) { addLog(`Error: ${e.message}`, 'error'); }
    setImporting(false);
  };

  const importSynergy = async () => {
    setImporting(true);
    addLog('Importing synergy data (oracle_id join)...');
    let grandTotal = 0;
    for (let chunk = 1; chunk <= 4; chunk++) {
      let offset = 0;
      let chunkTotal = 0;
      addLog(`Starting chunk ${chunk}/4...`);
      while (true) {
        try {
          const fileUrl = `https://your-cdn.com/archidekt/batch_commander_synergy_chunk_${chunk}.json`; // Placeholder
          const res = await backend.actions.invoke('importSynergyWithOracleJoin', {
            file_url: fileUrl,
            entity_name: 'CommanderCardStat',
            offset,
            limit: 400,
            chunk_size: 25
          });
          const d = res.data;
          chunkTotal += d.imported;
          grandTotal += d.imported;
          setProgress({ label: `Chunk ${chunk}/4`, done: offset + d.imported, total: d.total_enriched });
          if (d.done || d.next_offset == null) break;
          offset = d.next_offset;
          await new Promise(r => setTimeout(r, 400));
        } catch (e) { addLog(`Error chunk ${chunk} offset ${offset}: ${e.message}`, 'error'); break; }
      }
      addLog(`✓ Chunk ${chunk}/4 complete: ${chunkTotal} rows joined & enriched`);
    }
    addLog(`✓ All synergy chunks done! Grand total: ${grandTotal} rows (oracle_id join, no card duplication)`);
    setImporting(false);
    setProgress(null);
  };

  const importSummary = async () => {
    setImporting(true);
    addLog('Importing summary.json...');
    try {
      const res = await backend.actions.invoke('importArchidektData', { mode: 'import_summary' });
      const s = res.data.summary;
      addLog(`✓ Summary imported: ${s.deck_count} decks, ${s.commander_count} commanders, ${s.card_count} cards, ${s.synergy_row_count} synergy rows`);
    } catch (e) { addLog(`Error: ${e.message}`, 'error'); }
    setImporting(false);
  };

  const pct = progress ? Math.round(((progress.done || 0) / (progress.total || 1)) * 100) : 0;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h2 className="text-xl font-bold text-white flex items-center gap-2 mb-1">
          <Database className="w-5 h-5 text-yellow-400" /> Archidekt Import (Oracle Join Mode)
        </h2>
        <p className="text-gray-400 text-sm">Import 925 commander decks, synergy stats from 4 chunks. Data joins to MagicCard by oracle_id—no cards.json needed, no duplicates.</p>
      </div>
      <div className="bg-gray-800 rounded-xl p-4 space-y-3">
        <h3 className="text-sm font-semibold text-white mb-2">Import Steps (run in order)</h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Button onClick={analyze} disabled={analyzing || importing} variant="outline"
            className="border-gray-600 text-gray-200 hover:bg-gray-700 justify-start gap-2">
            {analyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            1. Analyze Deck Files
          </Button>

          <Button onClick={importCommanders} disabled={importing}
            className="bg-blue-600 hover:bg-blue-500 text-white justify-start gap-2">
            {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Users className="w-4 h-4" />}
            2. Import Commanders
          </Button>

          <Button onClick={importSynergy} disabled={importing}
            className="bg-yellow-500 hover:bg-yellow-400 text-gray-900 font-bold justify-start gap-2">
            {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Layers className="w-4 h-4" />}
            3. Import Synergy (4 chunks, oracle join)
          </Button>

          <Button onClick={importSummary} disabled={importing}
            variant="outline" className="border-green-600 text-green-400 hover:bg-green-900/30 justify-start gap-2">
            {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            4. Log Import Summary
          </Button>
        </div>
        </div>

      {/* Analysis results */}
      {analysis && (
        <div className="bg-gray-800 rounded-xl p-4 space-y-3">
          <div className="grid grid-cols-3 gap-4 text-center">
            {[
              { label: 'Decks', value: analysis.total_decks },
              { label: 'Commanders', value: analysis.total_commanders },
              { label: 'Cards in Dict', value: analysis.total_cards_in_dict?.toLocaleString() },
            ].map(({ label, value }) => (
              <div key={label} className="bg-gray-700 rounded-lg p-3">
                <p className="text-xl font-bold text-yellow-400">{value}</p>
                <p className="text-xs text-gray-400 mt-0.5">{label}</p>
              </div>
            ))}
          </div>
          <div>
            <p className="text-xs text-gray-400 mb-2 font-semibold uppercase tracking-wide">Top Commanders</p>
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {(analysis.top_commanders || []).map(c => (
                <div key={c.oracle_id} className="flex items-center justify-between text-sm py-1 border-b border-gray-700">
                  <span className="text-white">{c.name}</span>
                  <div className="flex gap-3 text-gray-400 text-xs">
                    <span>{c.deck_count} decks</span>
                    <span>{c.unique_cards} unique cards</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Progress bar */}
      {progress && (
        <div className="bg-gray-800 rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-white font-semibold">{progress.label || 'Importing...'}</span>
            <span className="text-sm text-yellow-400">{progress.done}/{progress.total} ({pct}%)</span>
          </div>
          <div className="w-full bg-gray-700 rounded-full h-3">
            <div className="bg-yellow-500 h-3 rounded-full transition-all" style={{ width: `${pct}%` }} />
          </div>
        </div>
      )}

      {/* Log */}
      {log.length > 0 && (
        <div className="bg-gray-900 rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-2 uppercase tracking-wide">Activity Log</p>
          <div className="space-y-0.5 max-h-52 overflow-y-auto font-mono text-xs">
            {log.map((line, i) => (
              <p key={i} className={line.includes('Error') ? 'text-red-400' : line.includes('✓') ? 'text-green-400' : 'text-gray-300'}>
                {line}
              </p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}


