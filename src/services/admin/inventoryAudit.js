import { backend } from '@/services/backend';

const AUDIT_PAGE_SIZE = 5000;
const DELETE_CONCURRENCY = 5;

function normalizeGame(value) {
  return value || '(blank)';
}

function normalizeStatus(value) {
  return value || '(blank)';
}

async function loadCardInventoryRows({ onProgress } = {}) {
  onProgress?.({
    label: 'Loading card inventory rows...',
    count: 0,
    status: 'loading'
  });

  return backend.data.Card.list('-created_date', AUDIT_PAGE_SIZE);
}

async function deleteBatch(api, rows) {
  for (let index = 0; index < rows.length; index += DELETE_CONCURRENCY) {
    const chunk = rows.slice(index, index + DELETE_CONCURRENCY);
    await Promise.all(chunk.map((row) => api.delete(row.id)));
  }
}

export async function inspectCardInventory({ onProgress } = {}) {
  const rows = await loadCardInventoryRows({ onProgress });

  const byGame = new Map();
  const byStatus = new Map();

  rows.forEach((row) => {
    const game = normalizeGame(row.game);
    const status = normalizeStatus(row.status);
    byGame.set(game, (byGame.get(game) || 0) + 1);
    byStatus.set(status, (byStatus.get(status) || 0) + 1);
  });

  const sampleRows = rows.slice(0, 20).map((row) => ({
    id: row.id,
    name: row.name,
    game: normalizeGame(row.game),
    status: normalizeStatus(row.status),
    quantity: row.quantity || 0,
    set_name: row.set_name || '',
    sku: row.sku || ''
  }));

  const report = {
    totalRows: rows.length,
    byGame: Array.from(byGame.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([label, count]) => ({ label, count })),
    byStatus: Array.from(byStatus.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([label, count]) => ({ label, count })),
    sampleRows
  };

  onProgress?.({
    label: 'Inventory audit complete.',
    count: rows.length,
    status: 'done'
  });

  return report;
}

export async function purgeVisibleMagicInventoryRows({ onProgress } = {}) {
  let totalDeleted = 0;
  let rounds = 0;

  while (true) {
    const rows = await loadCardInventoryRows({
      onProgress: (progress) => onProgress?.({ ...progress, totalDeleted, rounds })
    });

    const magicRows = rows.filter((row) => row?.game === 'magic');
    if (!magicRows.length) {
      onProgress?.({
        label: 'Visible MTG inventory purge complete.',
        deleted: 0,
        totalDeleted,
        rounds,
        status: 'done'
      });
      break;
    }

    await deleteBatch(backend.data.Card, magicRows);
    totalDeleted += magicRows.length;
    rounds += 1;

    onProgress?.({
      label: `Deleted ${magicRows.length} visible MTG card rows in round ${rounds}.`,
      deleted: magicRows.length,
      totalDeleted,
      rounds,
      status: 'deleting'
    });

    if (rows.length < AUDIT_PAGE_SIZE) {
      break;
    }

    if (rounds > 50) {
      throw new Error('Visible MTG inventory purge guard tripped.');
    }
  }

  return {
    totalDeleted,
    rounds
  };
}

export async function diagnoseVisibleMagicInventoryDelete() {
  const rows = await backend.data.Card.list('-created_date', AUDIT_PAGE_SIZE);
  const target = rows.find((row) => row?.game === 'magic');

  if (!target) {
    return {
      found: false,
      message: 'No visible MTG card row was found in the audit source.'
    };
  }

  let deleteResult = null;
  let deleteError = null;

  try {
    deleteResult = await backend.data.Card.delete(target.id);
  } catch (error) {
    deleteError = error instanceof Error ? error.message : String(error);
  }

  const afterRows = await backend.data.Card.list('-created_date', AUDIT_PAGE_SIZE);
  const stillExists = afterRows.some((row) => row.id === target.id);

  return {
    found: true,
    target: {
      id: target.id,
      name: target.name,
      game: target.game,
      status: target.status,
      set_name: target.set_name,
      sku: target.sku
    },
    deleteResult,
    deleteError,
    stillExists,
    totalRowsAfter: afterRows.length
  };
}
