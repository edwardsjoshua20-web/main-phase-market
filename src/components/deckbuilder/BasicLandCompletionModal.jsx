import React, { useMemo, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { createBasicLandDistribution } from '@/lib/deckLandCompletion';

export default function BasicLandCompletionModal({ deck, targetSize, onConfirm, onClose }) {
  const totalCards = (deck.items || []).reduce((sum, item) => sum + (item.quantity || 1), 0);
  const slots = Math.max(0, targetSize - totalCards);
  const initialDistribution = useMemo(() => createBasicLandDistribution(deck, slots), [deck, slots]);
  const [distribution, setDistribution] = useState(initialDistribution);
  const [submitting, setSubmitting] = useState(false);
  const selectedTotal = Object.values(distribution).reduce((sum, quantity) => sum + (Number(quantity) || 0), 0);

  const submit = async () => {
    if (selectedTotal !== slots || submitting) return;
    setSubmitting(true);
    try {
      await onConfirm(distribution);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/80 p-4" onClick={onClose}>
      <div className="w-full max-w-md border border-slate-600 bg-slate-950 shadow-2xl" style={{ borderRadius: 5 }} onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
          <h2 className="text-sm font-bold text-white">Complete Mana Base</h2>
          <button type="button" onClick={onClose} aria-label="Close land completion" className="text-slate-400 hover:text-white"><X size={17} /></button>
        </div>
        <div className="space-y-3 px-4 py-4">
          <p className="text-sm text-slate-200">{slots} deck slots remain. Fill with basic lands?</p>
          <div className="space-y-1">
            {Object.entries(distribution).map(([name, quantity]) => (
              <label key={name} className="flex items-center justify-between gap-4 border-b border-slate-800 py-2 text-xs font-semibold text-slate-200 last:border-0">
                <span>{name}</span>
                <input
                  type="number"
                  min="0"
                  max={slots}
                  value={quantity}
                  onChange={(event) => setDistribution((current) => ({ ...current, [name]: Math.max(0, Number(event.target.value) || 0) }))}
                  className="h-8 w-20 border border-slate-700 bg-slate-900 px-2 text-right text-xs text-white outline-none focus:border-blue-500"
                  style={{ borderRadius: 3 }}
                />
              </label>
            ))}
          </div>
          <p className={`text-xs ${selectedTotal === slots ? 'text-slate-400' : 'text-amber-300'}`}>{selectedTotal} / {slots} slots assigned</p>
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-800 px-4 py-3">
          <button type="button" onClick={onClose} className="h-8 border border-slate-700 bg-slate-900 px-3 text-xs font-semibold text-slate-300" style={{ borderRadius: 3 }}>Decline</button>
          <button type="button" onClick={submit} disabled={selectedTotal !== slots || submitting} className="inline-flex h-8 items-center gap-1.5 bg-blue-700 px-3 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40" style={{ borderRadius: 3 }}>
            {submitting && <Loader2 size={13} className="animate-spin" />}
            Add {slots} Basic Lands
          </button>
        </div>
      </div>
    </div>
  );
}
