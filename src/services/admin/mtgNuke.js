import { backend } from '@/services/backend';

const BATCH_SIZE = 200;
const DELETE_CONCURRENCY = 5;

const ENTITY_PLANS = [
  {
    entity: 'DeckCard',
    label: 'Deck ingestion cards',
    fetch(api, skip = 0) {
      return api.list('-created_date', BATCH_SIZE, skip);
    }
  },
  {
    entity: 'DeckRecord',
    label: 'Deck ingestion records',
    fetch(api, skip = 0) {
      return api.list('-created_date', BATCH_SIZE, skip);
    }
  },
  {
    entity: 'RawDecklist',
    label: 'Raw decklists',
    fetch(api, skip = 0) {
      return api.list('-created_date', BATCH_SIZE, skip);
    }
  },
  {
    entity: 'SourceMapping',
    label: 'Deck source mappings',
    fetch(api, skip = 0) {
      return api.list('-created_date', BATCH_SIZE, skip);
    }
  },
  {
    entity: 'UnmatchedCard',
    label: 'Unmatched MTG cards',
    fetch(api, skip = 0) {
      return api.list('-created_date', BATCH_SIZE, skip);
    }
  },
  {
    entity: 'CommanderCardStat',
    label: 'Commander card stats',
    fetch(api, skip = 0) {
      return api.list('-created_date', BATCH_SIZE, skip);
    }
  },
  {
    entity: 'CommanderSynergyCache',
    label: 'Commander synergy cache',
    fetch(api, skip = 0) {
      return api.list('-created_date', BATCH_SIZE, skip);
    }
  },
  {
    entity: 'CommanderSynergy',
    label: 'Commander synergy rows',
    fetch(api, skip = 0) {
      return api.list('-created_date', BATCH_SIZE, skip);
    }
  },
  {
    entity: 'Commander',
    label: 'Commander index',
    fetch(api, skip = 0) {
      return api.list('-created_date', BATCH_SIZE, skip);
    }
  },
  {
    entity: 'MagicCardV2RebuildJob',
    label: 'MagicCardV2 rebuild jobs',
    fetch(api, skip = 0) {
      return api.list('-created_date', BATCH_SIZE, skip);
    }
  },
  {
    entity: 'MagicCardV2',
    label: 'MagicCardV2 catalog',
    fetch(api, skip = 0) {
      return api.list('-created_date', BATCH_SIZE, skip);
    }
  },
  {
    entity: 'MagicCard',
    label: 'MagicCard catalog',
    fetch(api, skip = 0) {
      return api.list('-created_date', BATCH_SIZE, skip);
    }
  },
  {
    entity: 'Card',
    label: 'MTG singles inventory',
    noSkip: true,
    fetch(api) {
      return api.list('-created_date', BATCH_SIZE);
    },
    select(rows) {
      return rows.filter((row) => row?.game === 'magic');
    }
  },
  {
    entity: 'Product',
    label: 'MTG products',
    noSkip: true,
    fetch(api) {
      return api.list('-created_date', BATCH_SIZE);
    },
    select(rows) {
      return rows.filter((row) => row?.game === 'magic');
    }
  }
];

async function deleteBatch(api, rows) {
  for (let index = 0; index < rows.length; index += DELETE_CONCURRENCY) {
    const chunk = rows.slice(index, index + DELETE_CONCURRENCY);
    await Promise.all(chunk.map((row) => api.delete(row.id)));
  }
}

function getSelectedRows(plan, rows) {
  if (typeof plan.select === 'function') {
    return plan.select(rows || []);
  }

  return rows || [];
}

async function countRows(api, fetchRows) {
  let total = 0;
  let skip = 0;
  let guard = 0;

  while (true) {
    const rows = await fetchRows(api, skip);
    if (!rows?.length) {
      break;
    }

    total += rows.length;
    skip += rows.length;

    if (rows.length < BATCH_SIZE) {
      break;
    }

    guard += 1;
    if (guard > 1000) {
      throw new Error('MTG count guard tripped while scanning rows.');
    }
  }

  return total;
}

export async function inspectMtgData({ onProgress } = {}) {
  const report = [];
  let totalRows = 0;

  for (const plan of ENTITY_PLANS) {
    const api = backend.data[plan.entity];

    if (!api || typeof api.list !== 'function') {
      report.push({ ...plan, count: 0, skipped: true });
      onProgress?.({
        entity: plan.entity,
        label: plan.label,
        count: 0,
        totalRows,
        status: 'skipped'
      });
      continue;
    }

    const count = plan.noSkip
      ? getSelectedRows(plan, await plan.fetch(api)).length
      : await countRows(api, plan.fetch);
    totalRows += count;

    const item = { ...plan, count, skipped: false };
    report.push(item);
    onProgress?.({
      entity: plan.entity,
      label: plan.label,
      count,
      totalRows,
      status: 'completed'
    });
  }

  return {
    totalRows,
    report
  };
}

export async function purgeMtgData({ onProgress } = {}) {
  const report = [];
  let totalDeleted = 0;

  for (const plan of ENTITY_PLANS) {
    const api = backend.data[plan.entity];

    if (!api || typeof api.delete !== 'function') {
      report.push({ ...plan, deleted: 0, skipped: true });
      onProgress?.({
        entity: plan.entity,
        label: plan.label,
        deleted: 0,
        totalDeleted,
        status: 'skipped'
      });
      continue;
    }

    let deletedForEntity = 0;

    while (true) {
      const fetchedRows = await plan.fetch(api);
      const rows = getSelectedRows(plan, fetchedRows);
      if (!rows?.length) {
        break;
      }

      await deleteBatch(api, rows);
      deletedForEntity += rows.length;
      totalDeleted += rows.length;

      onProgress?.({
        entity: plan.entity,
        label: plan.label,
        deleted: deletedForEntity,
        totalDeleted,
        status: 'deleting'
      });
    }

    report.push({ ...plan, deleted: deletedForEntity, skipped: false });
    onProgress?.({
      entity: plan.entity,
      label: plan.label,
      deleted: deletedForEntity,
      totalDeleted,
      status: 'completed'
    });
  }

  return {
    totalDeleted,
    report
  };
}
