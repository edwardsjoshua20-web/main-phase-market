import React, { useState, useRef } from 'react';
import { X, Upload, FileText, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { searchMtgCatalog } from '@/lib/mtgLocalCatalog';
import { getCardImageUrl, handleCardImageError } from '@/lib/cardImages';

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
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/gi, ' ')
    .trim()
    .toLowerCase();
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

async function fetchMagicCard(name) {
  const results = await searchMtgCatalog(name, 8);
  const targetKey = normalizeCardKey(name);
  const bestLocal = Array.isArray(results) ?
    results.find((result) => normalizeCardKey(result.name) === targetKey) ||
    results.find((result) => normalizeCardKey(result.name).startsWith(targetKey)) ||
    results[0] :
    null;

  if (bestLocal) {
    return {
      id: bestLocal.id,
      name: bestLocal.name,
      set_name: bestLocal.set_name,
      image_url: bestLocal.image_url || bestLocal.image_small || null,
      price: bestLocal.price || 0,
      type: bestLocal.type || bestLocal.type_line || '',
      product_type: 'magic',
      mana_cost: bestLocal.mana_cost || '',
      cmc: bestLocal.cmc ?? 0,
    };
  }

  try {
    const response = await fetch(`https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(name)}`);
    if (!response.ok) return null;
    const card = await response.json();
    if (!card?.id) return null;

    return {
      id: card.id,
      name: card.name,
      set_name: card.set_name,
      image_url: card.image_uris?.normal || card.card_faces?.[0]?.image_uris?.normal || null,
      price: card.prices?.usd ? parseFloat(card.prices.usd) : 0,
      type: card.type_line || '',
      product_type: 'magic',
      mana_cost: card.mana_cost || card.card_faces?.[0]?.mana_cost || '',
      cmc: card.cmc ?? 0,
    };
  } catch {
    return null;
  }
}

export default function DeckImportModal({ game, onImport, onClose }) {
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
        let card = null;
        if (game === 'magic') {
          card = await fetchMagicCard(name);
        }
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

  const handleImport = () => {
    const items = results
      .filter(r => r.card)
      .map(r => ({
        product_id: r.card.id,
        product_name: r.card.name,
        product_image: getCardImageUrl(r.card),
        image_url: r.card.image_url || null,
        english_image_url: r.card.english_image_url || null,
        image_small: r.card.image_small || null,
        fallback_image_url: r.card.fallback_image_url || null,
        price: r.card.price,
        product_type: r.card.product_type,
        type: r.card.type,
        quantity: r.qty,
        mana_cost: r.card.mana_cost || '',
        cmc: r.card.cmc ?? 0,
      }));
    onImport(items);
  };

  const successCount = results.filter(r => r.card).length;
  const failCount = results.filter(r => !r.card).length;

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
              <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
                <div style={{ flex: 1, background: '#052e16', borderRadius: 8, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <CheckCircle style={{ width: 14, height: 14, color: '#34d399' }} />
                  <span style={{ color: '#34d399', fontWeight: 700, fontSize: 13 }}>{successCount} found</span>
                </div>
                {failCount > 0 && (
                  <div style={{ flex: 1, background: '#450a0a', borderRadius: 8, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <AlertCircle style={{ width: 14, height: 14, color: '#f87171' }} />
                    <span style={{ color: '#f87171', fontWeight: 700, fontSize: 13 }}>{failCount} not found</span>
                  </div>
                )}
              </div>

              <div style={{ maxHeight: 260, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
                {results.map((r, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px', borderRadius: 6, background: r.card ? '#0f2937' : '#1c0a0a', border: `1px solid ${r.card ? '#164e63' : '#450a0a'}` }}>
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
                      {r.error && <p style={{ color: '#f87171', fontSize: 10 }}>{r.error}</p>}
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
                disabled={successCount === 0}
                style={{ padding: '8px 20px', borderRadius: 6, border: 'none', background: successCount > 0 ? '#1d4ed8' : '#1f2937', color: successCount > 0 ? '#fff' : '#4b5563', fontSize: 13, fontWeight: 700, cursor: successCount > 0 ? 'pointer' : 'not-allowed' }}
              >
                Import {successCount} Cards
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
