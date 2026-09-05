const HISTORY_LIMIT = 30;

export function createDeckHistoryEntry(label, undo, details = {}) {
  return {
    id: `deck-change-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    label,
    createdAt: new Date().toISOString(),
    undo,
    ...details,
  };
}

export function appendDeckHistory(history, entry) {
  return [entry, ...(Array.isArray(history) ? history : [])].slice(0, HISTORY_LIMIT);
}

export function removeDeckHistoryEntry(history, id) {
  return (Array.isArray(history) ? history : []).filter((entry) => entry.id !== id);
}
