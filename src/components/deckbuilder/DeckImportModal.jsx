import React, { useMemo, useState, useRef } from 'react';
import { X, Upload, FileText, Loader2, AlertCircle } from 'lucide-react';
import { getCardImageUrl, handleCardImageError } from '@/lib/cardImages';
import { searchOwner } from '@/services/search/searchOwner';
import { reconcileDeckImport } from '@/lib/deckImportReconciliation';

/**
 * Clean a card name by stripping common deck-export annotations:
 *   "Lightning Bolt (M11) 149 [tag]"  => "Lightning Bolt"
 *   "Authenticate (MM) 131 [Removal]" => "Authenticate"
 */
function cleanCardName(raw) {
  return raw
    .replace(/\s*\(.*?\)/g, '')      // remove (SET) codes
    .replace(/\s*\[.*?\]/g, '')      // remove [tags]
    .replace(/\s*\*[^*]*\*/g, '')    // remove *f* foil markers etc.
    .replace(/\s+[A-Z0-9]{2,8}-\d+[A-Z0-9-]*(?=\s|$)/g, '') // remove trailing set-number codes like ZNR-75 or ORI-56
    .replace(/\s+\d+\S*(\s|$)/g, ' ') // remove trailing collector numbers like "206" or "206a"
    .trim();
}

function normalizeCardKey(value) {
  return searchOwner.normalizeQuery(value);
}

function isSectionHeader(line) {
  return /^(commander|companion|sideboard|maybeboard|tokens|creatures|instants|sorceries|artifacts|enchantments|planeswalkers|lands|battles)\s*:?\s*(\(\d+\))?$/i.test(line);
}

function isExcludedSection(line) {
  return /^(sideboard|maybeboard|tokens|considering)\s*:?\s*(\(\d+\))?$/i.test(line);
}

function mergeParsedCards(cards) {
  const merged = new Map();

  for (const card of cards) {
    const key = normalizeCardKey(card.name);
    if (!key) continue;
    const existing = merged.get(key);
    if (existing) {
      existing.qty += card.qty;
    } else {
      merged.set(key, { ...card });
    }
  }

  return [...merged.values()];
}

/**
 * Parses a .txt deck list. Supports formats:
 *   4x Lightning Bolt
 *   4 Lightning Bolt
 *   4 Lightning Bolt (M11) 149
 *   Lightning Bolt x4
 *   Lightning Bolt
 */
function parseTxt(text) {
  const lines = text.split('\n');
  const cards = [];
  let skipSection = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      skipSection = false;
      continue;
    }
    if (line.startsWith('//') || line.startsWith('#')) continue; // comments
    if (isExcludedSection(line)) {
      skipSection = true;
      continue;
    }
    if (isSectionHeader(line)) {
      skipSection = false;
      continue;
    }
    if (skipSection) continue;
    // Try "4x Name ..." or "4 Name ..."
    let m = line.match(/^(\d+)[x\s]+(.+)$/i);
    if (m) { cards.push({ qty: parseInt(m[1]), name: cleanCardName(m[2]) }); continue; }
    // Try "Name x4"
    m = line.match(/^(.+)\s+x(\d+)$/i);
    if (m) { cards.push({ qty: parseInt(m[2]), name: cleanCardName(m[1]) }); continue; }
    // Just a name
    cards.push({ qty: 1, name: cleanCardName(line) });
  }
  return mergeParsedCards(cards);
}

/**
 * Parses a .csv deck list. Expects columns: name, quantity (in any order, header required).
 * Falls back to first col = name, second col = qty if no header found.
 */
function parseCsv(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length === 0) return [];
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
  const nameIdx = headers.findIndex(h => h.includes('name') || h === 'card');
  const qtyIdx = headers.findIndex(h => h.includes('qty') || h.includes('quantity') || h.includes('count') || h === '#');

  // If we found header columns, parse from line 1 onward
  if (nameIdx !== -1) {
    return lines.slice(1).map(line => {
      const cols = line.split(',').map(c => c.trim().replace(/^"|"$/g, ''));
      const name = cols[nameIdx] || '';
      const qty = qtyIdx !== -1 ? parseInt(cols[qtyIdx]) || 1 : 1;
      return name ? { qty, name } : null;
    }).filter(Boolean);
  }

  // No header — treat col 0 as name, col 1 as qty
  return lines.map(line => {
    const cols = line.split(',').map(c => c.trim().replace(/^"|"$/g, ''));
    const name = cols[0] || '';
    const qty = cols[1] ? parseInt(cols[1]) || 1 : 1;
    return name ? { qty, name } : null;
  }).filter(Boolean);
}

async function fetchCatalogCard(name, game) {
  const bestLocal = await searchOwner.resolveCanonicalCard(name, game, { includeInventory: false });

  if (bestLocal) {
    return {
      id: bestLocal.id,
      name: bestLocal.name,
      set_name: bestLocal.set_name,
      image_url: bestLocal.image_url || bestLocal.image_small || null,
      market_price: bestLocal.price || 0,
      type: bestLocal.type || bestLocal.type_line || '',
      product_type: bestLocal.game,
      oracle_id: bestLocal.oracle_id || '',
      set_code: bestLocal.set_code || '',
      mana_cost: bestLocal.mana_cost || '',
      cmc: bestLocal.cmc ?? 0,
    };
  }

  return null;
}

export default function DeckImportModal({ game, currentItems = [], onImport, onClose }) {
  const [dragging, setDragging] = useState(false);
  const [status, setStatus] = useState('idle'); // idle | parsing | fetching | done | error
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [results, setResults] = useState([]); // { qty, name, card, error }
  const [errorMsg, setErrorMsg] = useState('');
  const fileRef = useRef();

  const processFile = async (file) => {
    setStatus('parsing');
    setResults([]);
    setErrorMsg('');

    const text = await file.text();
    let parsed = [];

    try {
      if (file.name.endsWith('.csv')) {
        parsed = parseCsv(text);
      } else {
        parsed = parseTxt(text);
      }
    } catch (e) {
      setErrorMsg('Could not parse file. Check the format and try again.');
      setStatus('error');
      return;
    }

    if (parsed.length === 0) {
      setErrorMsg('No cards found in the file.');
      setStatus('error');
      return;
    }

    setStatus('fetching');
    setProgress({ done: 0, total: parsed.length });

    const resolved = [];
    for (let i = 0; i < parsed.length; i++) {
      const { qty, name } = parsed[i];
      try {
        const card = await fetchCatalogCard(name, game);
        resolved.push({ qty, name, card, error: card ? null : 'Not found' });
      } catch (e) {
        resolved.push({ qty, name, card: null, error: 'Lookup failed' });
      }
      setProgress({ done: i + 1, total: parsed.length });
    }

    setResults(resolved);
    setStatus('done');
  };

  const handleFile = (file) => {
    if (!file) return;
    processFile(file);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    handleFile(e.dataTransfer.files[0]);
  };

  const reconciliation = useMemo(() => {
    return reconcileDeckImport(results, currentItems, normalizeCardKey);
  }, [currentItems, results]);

  const handleImport = () => {
    const items = reconciliation.willAdd.map((result) => {
      const source = result.existing || result.card;
      return {
        ...(result.existing || {}),
        product_id: source.product_id || source.id,
        product_name: source.product_name || source.name,
        product_image: getCardImageUrl(source),
        image_url: source.image_url || null,
        english_image_url: source.english_image_url || null,
        image_small: source.image_small || null,
        fallback_image_url: source.fallback_image_url || null,
        price: source.price || source.market_price || 0,
        product_type: source.product_type || source.game || game,
        type: source.type || source.type_line || '',
        quantity: result.missingQuantity,
        oracle_id: source.oracle_id || '',
        set_code: source.set_code || '',
        mana_cost: source.mana_cost || '',
        cmc: source.cmc ?? 0,
      };
    });
    onImport({ items, reconciliation });
  };

  const missingQuantity = reconciliation.willAdd.reduce((sum, result) => sum + result.missingQuantity, 0);

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={onClose}
    >
      <div
        style={{ background: '#111827', borderRadius: 12, border: '1px solid #374151', width: '100%', maxWidth: 520, maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 50px rgba(0,0,0,0.8)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid #374151' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Upload style={{ width: 16, height: 16, color: '#60a5fa' }} />
            <span style={{ color: '#fff', fontWeight: 700, fontSize: 15 }}>Import Deck</span>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', display: 'flex' }}>
            <X style={{ width: 18, height: 18 }} />
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 18 }}>
          {/* Format hint */}
          <div style={{ background: '#1f2937', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 12, color: '#9ca3af', lineHeight: 1.6 }}>
            <strong style={{ color: '#d1d5db' }}>Supported formats:</strong><br />
            <strong>.txt</strong> — one card per line: <code style={{ color: '#60a5fa' }}>4x Lightning Bolt</code> or <code style={{ color: '#60a5fa' }}>4 Lightning Bolt</code><br />
            <strong>.csv</strong> — columns: <code style={{ color: '#60a5fa' }}>name, quantity</code> (header row required)
          </div>

          {/* Drop zone */}
          {status === 'idle' && (
            <div
              onDragOver={e => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileRef.current.click()}
              style={{
                border: `2px dashed ${dragging ? '#3b82f6' : '#374151'}`,
                borderRadius: 10, padding: '32px 16px', textAlign: 'center',
                cursor: 'pointer', transition: 'all 0.15s',
                background: dragging ? 'rgba(59,130,246,0.05)' : 'transparent',
              }}
            >
              <FileText style={{ width: 36, height: 36, color: dragging ? '#3b82f6' : '#374151', margin: '0 auto 10px' }} />
              <p style={{ color: '#9ca3af', fontSize: 13, marginBottom: 6 }}>Drop your .txt or .csv file here</p>
              <p style={{ color: '#4b5563', fontSize: 12 }}>or click to browse</p>
              <input ref={fileRef} type="file" accept=".txt,.csv" style={{ display: 'none' }} onChange={e => handleFile(e.target.files[0])} />
            </div>
          )}

          {/* Fetching progress */}
          {(status === 'parsing' || status === 'fetching') && (
            <div style={{ textAlign: 'center', padding: '24px 0' }}>
              <Loader2 style={{ width: 32, height: 32, color: '#3b82f6', margin: '0 auto 12px', animation: 'spin 1s linear infinite' }} />
              <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
              <p style={{ color: '#9ca3af', fontSize: 13, marginBottom: 8 }}>
                {status === 'parsing' ? 'Parsing file…' : `Looking up cards… (${progress.done}/${progress.total})`}
              </p>
              {status === 'fetching' && (
                <div style={{ background: '#1f2937', borderRadius: 99, height: 6, width: '80%', margin: '0 auto', overflow: 'hidden' }}>
                  <div style={{ height: '100%', background: '#3b82f6', borderRadius: 99, transition: 'width 0.3s', width: `${(progress.done / progress.total) * 100}%` }} />
                </div>
              )}
            </div>
          )}

          {/* Error */}
          {status === 'error' && (
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', background: '#450a0a', borderRadius: 8, padding: '12px 14px', color: '#fca5a5', fontSize: 13 }}>
              <AlertCircle style={{ width: 16, height: 16, flexShrink: 0, marginTop: 1 }} />
              {errorMsg}
            </div>
          )}

          {/* Results */}
          {status === 'done' && (
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 6, marginBottom: 12 }}>
                {[
                  ['Already in Deck', reconciliation.already.length, '#94a3b8'],
                  ['Will Add', missingQuantity, '#34d399'],
                  ['Could Not Resolve', reconciliation.unresolved.length, '#f87171'],
                  ['Extra in Current Deck', reconciliation.extras.length, '#fbbf24'],
                ].map(([label, count, color]) => (
                  <div key={label} style={{ background: '#1f2937', borderRadius: 4, padding: '7px 9px', border: '1px solid #334155' }}>
                    <p style={{ color, fontSize: 10, fontWeight: 700, textTransform: 'uppercase' }}>{label}</p>
                    <p style={{ color: '#fff', fontSize: 14, fontWeight: 700 }}>{count}</p>
                  </div>
                ))}
              </div>

              <div style={{ maxHeight: 260, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
                {[...reconciliation.willAdd.map((item) => ({ ...item, previewStatus: `Will add ${item.missingQuantity}` })), ...reconciliation.already.map((item) => ({ ...item, previewStatus: 'Already satisfied' })), ...reconciliation.unresolved.map((item) => ({ ...item, previewStatus: 'Could not resolve' })), ...reconciliation.extras.map((item) => ({ name: item.product_name, card: item, qty: item.quantity || 1, previewStatus: 'Extra - unchanged' }))].map((r, i) => (
                  <div key={`${r.previewStatus}-${r.card?.id || r.card?.product_id || r.name}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px', borderRadius: 4, background: '#172033', border: '1px solid #2d3a50' }}>
                    {getCardImageUrl(r.card) && (
                      <img src={getCardImageUrl(r.card)} alt={r.card.name} onError={(event) => handleCardImageError(event, r.card)} style={{ width: 28, height: 39, borderRadius: 3, objectFit: 'cover', flexShrink: 0 }} />
                    )}
                    {!getCardImageUrl(r.card) && (
                      <div style={{ width: 28, height: 39, borderRadius: 3, background: '#1f2937', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <span style={{ fontSize: 14 }}>🃏</span>
                      </div>
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ color: r.card ? '#e2e8f0' : '#6b7280', fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {r.card ? r.card.name : r.name}
                      </p>
                      {r.card && <p style={{ color: '#4b5563', fontSize: 10 }}>{r.card.set_name}</p>}
                      <p style={{ color: r.previewStatus.startsWith('Will') ? '#34d399' : r.previewStatus.startsWith('Could') ? '#f87171' : '#94a3b8', fontSize: 10 }}>{r.previewStatus}</p>
                    </div>
                    <span style={{ color: '#60a5fa', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>x{r.qty}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 18px', borderTop: '1px solid #374151', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          {status === 'done' && (
            <>
              <button
                onClick={() => { setStatus('idle'); setResults([]); }}
                style={{ padding: '8px 16px', borderRadius: 6, border: '1px solid #374151', background: '#1f2937', color: '#9ca3af', fontSize: 12, cursor: 'pointer' }}
              >
                Try Another File
              </button>
              <button
                onClick={handleImport}
                disabled={missingQuantity === 0}
                style={{ padding: '8px 20px', borderRadius: 6, border: 'none', background: missingQuantity > 0 ? '#1d4ed8' : '#1f2937', color: missingQuantity > 0 ? '#fff' : '#4b5563', fontSize: 13, fontWeight: 700, cursor: missingQuantity > 0 ? 'pointer' : 'not-allowed' }}
              >
                Import Missing{missingQuantity > 0 ? ` (${missingQuantity})` : ''}
              </button>
            </>
          )}
          {(status === 'idle' || status === 'error') && (
            <button onClick={onClose} style={{ padding: '8px 16px', borderRadius: 6, border: '1px solid #374151', background: '#1f2937', color: '#9ca3af', fontSize: 12, cursor: 'pointer' }}>
              Cancel
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
