import React, { useState } from 'react';
import { backend } from '@/services/backend';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { AlertTriangle, Loader2, Check, X, Search } from 'lucide-react';

export default function UnmatchedCardsPanel() {
  const [resolving, setResolving] = useState(null);
  const [mapping, setMapping] = useState('');
  const [filter, setFilter] = useState('pending');
  const qc = useQueryClient();

  const { data: unmatched = [], isLoading } = useQuery({
    queryKey: ['unmatched-cards', filter],
    queryFn: () => backend.data.UnmatchedCard.filter(
      filter === 'all' ? {} : { status: filter }, '-created_date', 200
    )
  });

  const resolveCard = async (item) => {
    if (!mapping.trim()) return;
    // Find canonical card in MagicCard DB
    const results = await backend.data.MagicCard.filter({ name_lower: mapping.trim().toLowerCase() }, '-created_date', 1);
    if (!results?.length) { toast.error('Card not found in our database. Check the name.'); return; }
    const canonical = results[0];

    // Create source mapping
    await backend.data.SourceMapping.create({
      source_card_name: item.card_name_raw,
      source_card_name_lower: item.card_name_raw.toLowerCase(),
      canonical_card_name: canonical.name,
      canonical_card_id: canonical.id,
      source: 'global',
      reason: 'manual_admin_mapping'
    });

    // Mark resolved
    await backend.data.UnmatchedCard.update(item.id, {
      status: 'resolved',
      suggested_match: canonical.name,
      resolved_card_id: canonical.id,
      resolved_at: new Date().toISOString()
    });

    toast.success(`Mapped "${item.card_name_raw}" → "${canonical.name}"`);
    setResolving(null);
    setMapping('');
    qc.invalidateQueries(['unmatched-cards']);
  };

  const ignoreCard = async (id) => {
    await backend.data.UnmatchedCard.update(id, { status: 'ignored' });
    qc.invalidateQueries(['unmatched-cards']);
  };

  const summary = {
    pending: unmatched.filter(u => u.status === 'pending').length,
    resolved: unmatched.filter(u => u.status === 'resolved').length,
    ignored: unmatched.filter(u => u.status === 'ignored').length
  };

  return (
    <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
      <div className="grid grid-cols-3 gap-3">
        {[['Pending', summary.pending, 'text-yellow-400'], ['Resolved', summary.resolved, 'text-green-400'], ['Ignored', summary.ignored, 'text-gray-400']].map(([l, v, c]) => (
          <div key={l} className="bg-gray-800 border border-gray-700 rounded-xl p-4 text-center">
            <p className={`text-2xl font-bold ${c}`}>{v}</p>
            <p className="text-gray-400 text-xs mt-1">{l}</p>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <h2 className="font-bold text-lg flex-1">Unmatched Card Review Queue</h2>
        <div className="flex gap-1">
          {['pending', 'resolved', 'all'].map(s => (
            <button key={s} onClick={() => setFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${filter === s ? 'bg-yellow-500 text-gray-900' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}>
              {s}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-yellow-400" /></div>
      ) : unmatched.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <AlertTriangle className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>No unmatched cards {filter === 'pending' ? 'pending review' : ''}.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {unmatched.map(item => (
            <div key={item.id} className="bg-gray-800 border border-gray-700 rounded-xl overflow-hidden">
              <div className="flex items-center gap-4 px-4 py-3">
                <div className="flex-1">
                  <div className="flex items-center gap-3 flex-wrap">
                    <p className="text-white font-mono text-sm">"{item.card_name_raw}"</p>
                    <Badge className="bg-gray-700 text-gray-300 border-gray-600 text-xs">{item.frequency || 1}x in decks</Badge>
                    {item.commander_name && <span className="text-yellow-400 text-xs">{item.commander_name}</span>}
                    <Badge className={`text-xs ${item.status === 'resolved' ? 'bg-green-900/50 text-green-300 border-green-700' : item.status === 'ignored' ? 'bg-gray-700 text-gray-400' : 'bg-yellow-900/50 text-yellow-300 border-yellow-700'}`}>{item.status}</Badge>
                  </div>
                  {item.suggested_match && (
                    <p className="text-green-400 text-xs mt-1">→ Mapped to: {item.suggested_match}</p>
                  )}
                </div>
                {item.status === 'pending' && (
                  <div className="flex gap-1 flex-shrink-0">
                    <button onClick={() => setResolving(resolving === item.id ? null : item.id)}
                      className="p-1.5 bg-blue-600 hover:bg-blue-500 rounded-lg text-white" title="Map to canonical card">
                      <Search className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => ignoreCard(item.id)}
                      className="p-1.5 bg-gray-700 hover:bg-gray-600 rounded-lg text-gray-300" title="Ignore">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
              {resolving === item.id && (
                <div className="flex gap-3 px-4 py-3 border-t border-gray-700 bg-gray-900/50">
                  <input value={mapping} onChange={e => setMapping(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && resolveCard(item)}
                    placeholder="Type canonical card name from our database..."
                    className="flex-1 bg-gray-700 border border-gray-600 rounded-lg px-3 py-1.5 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-yellow-500" />
                  <Button size="sm" onClick={() => resolveCard(item)} className="bg-green-600 hover:bg-green-500 text-white font-bold">
                    <Check className="w-3.5 h-3.5 mr-1" /> Map
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


