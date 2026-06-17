import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'csv-parse/sync';
import { replaceEntityRows, normalizeEntityName } from '../server/entityStore.mjs';

const [, , entityArg, csvPathArg] = process.argv;

if (!entityArg || !csvPathArg) {
  console.error('Usage: node scripts/import-local-csv.mjs <EntityName> <csvPath>');
  process.exit(1);
}

const entityName = normalizeEntityName(entityArg);
const csvPath = path.resolve(process.cwd(), csvPathArg);

if (!fs.existsSync(csvPath)) {
  console.error(`CSV not found: ${csvPath}`);
  process.exit(1);
}

const content = fs.readFileSync(csvPath, 'utf8');

if (!content.trim()) {
  replaceEntityRows(entityName, []);
  console.log(`Imported 0 rows into ${entityName} from empty CSV.`);
  process.exit(0);
}

const records = parse(content, {
  columns: true,
  skip_empty_lines: true,
  relax_column_count: true,
  bom: true
}).map((row) => {
  const normalized = {};

  for (const [key, value] of Object.entries(row)) {
    if (value === '') {
      normalized[key] = null;
      continue;
    }

    if (value === 'true') {
      normalized[key] = true;
      continue;
    }

    if (value === 'false') {
      normalized[key] = false;
      continue;
    }

    if (/^-?\d+(\.\d+)?$/.test(value) && !/^0\d+/.test(value)) {
      normalized[key] = Number(value);
      continue;
    }

    normalized[key] = value;
  }

  return normalized;
});

replaceEntityRows(entityName, records);
console.log(`Imported ${records.length} rows into ${entityName}.`);
