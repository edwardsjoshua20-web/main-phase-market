import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'csv-parse/sync';

export const VALID_PRICING_SOURCES = new Set(['cardkingdom', 'tcgplayer', 'starcitygames']);
export const PRICING_SOURCE_OUTPUT_DIR = path.resolve(process.cwd(), 'public/data/site/pricing-sources');

function toNumber(value) {
  if (value == null || value === '') return null;
  const cleaned = String(value).replace(/[$,\s]/g, '');
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function firstDefined(row, keys) {
  for (const key of keys) {
    if (row?.[key] != null && row[key] !== '') return row[key];
  }
  return null;
}

function normalizeGame(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return '';
  if (raw === 'mtg' || raw.includes('magic')) return 'magic';
  if (raw.includes('pokemon')) return 'pokemon';
  if (raw.includes('yugioh') || raw.includes('yu-gi-oh')) return 'yugioh';
  if (raw.includes('one piece') || raw.includes('onepiece')) return 'onepiece';
  if (raw.includes('lorcana')) return 'lorcana';
  if (raw.includes('flesh') || raw === 'fab') return 'fab';
  if (raw.includes('star wars')) return 'starwars';
  return raw;
}

function normalizeFinish(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw || raw === 'normal' || raw === 'non-foil' || raw === 'nonfoil') return 'nonfoil';
  if (raw.includes('etched')) return 'etched';
  if (raw.includes('foil')) return 'foil';
  return raw;
}

function normalizeLanguage(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw || raw === 'en') return 'english';
  return raw;
}

function readJsonRecords(filePath) {
  const payload = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  return Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.results)
      ? payload.results
      : Array.isArray(payload?.items)
        ? payload.items
        : [];
}

function readCsvRecords(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  return parse(content, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    bom: true
  });
}

export function normalizePricingSourceName(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z]/g, '');
}

export function getPricingSourceConfig(sourceName) {
  const source = normalizePricingSourceName(sourceName);

  const base = {
    game: ['game', 'Game', 'tcg', 'TCG', 'Category', 'category', 'Product Line', 'productLine', 'product_line'],
    name: ['name', 'Name', 'card_name', 'Card Name', 'product_name', 'Product Name', 'productName'],
    set_code: ['set_code', 'Set Code', 'setCode', 'set', 'Set', 'set_id', 'Set ID', 'edition_code', 'Edition Code'],
    set_name: ['set_name', 'Set Name', 'setName', 'series', 'Series', 'Edition', 'edition'],
    card_number: ['card_number', 'Card Number', 'cardNumber', 'number', 'Number', 'Collector Number', 'collector_number', 'SKU'],
    finish: ['finish', 'Finish', 'printing', 'Printing', 'Foil', 'foil'],
    language: ['language', 'Language', 'lang', 'Lang'],
    oracle_id: ['oracle_id', 'Oracle ID', 'oracleId'],
    price: ['price', 'Price', 'market_price', 'Market Price', 'amount', 'Amount']
  };

  if (source === 'tcgplayer') {
    return {
      source,
      fields: {
        ...base,
        game: ['Product Line', 'productLine', 'product_line', 'Category', 'category', ...base.game],
        set_name: ['Set Name', 'setName', 'set_name', 'Set', 'set', ...base.set_name],
        price: ['Market Price', 'marketPrice', 'market_price', 'Price', 'price', ...base.price]
      }
    };
  }

  if (source === 'cardkingdom') {
    return {
      source,
      fields: {
        ...base,
        set_name: ['Edition', 'edition', 'Set Name', 'set_name', 'setName', 'Set', 'set', ...base.set_name],
        set_code: ['Edition Code', 'edition_code', 'Set Code', 'set_code', 'setCode', ...base.set_code],
        price: ['Sell Price', 'sell_price', 'Market Price', 'market_price', 'Price', 'price', ...base.price]
      }
    };
  }

  if (source === 'starcitygames') {
    return {
      source,
      fields: {
        ...base,
        set_name: ['Set Name', 'set_name', 'setName', 'Edition', 'edition', 'Set', 'set', ...base.set_name],
        set_code: ['Set Code', 'set_code', 'setCode', 'Edition Code', 'edition_code', ...base.set_code],
        price: ['Price', 'price', 'Market Price', 'market_price', 'Sale Price', 'sale_price', ...base.price]
      }
    };
  }

  return { source, fields: base };
}

export function readPricingSourceInput(inputPath) {
  const ext = path.extname(inputPath).toLowerCase();
  if (ext === '.json') return readJsonRecords(inputPath);
  if (ext === '.csv') return readCsvRecords(inputPath);
  throw new Error(`Unsupported input extension "${ext}". Use .csv or .json`);
}

export function normalizePricingSourceRecord(row, config) {
  return {
    game: normalizeGame(firstDefined(row, config.fields.game)),
    name: firstDefined(row, config.fields.name) || '',
    set_code: firstDefined(row, config.fields.set_code) || '',
    set_name: firstDefined(row, config.fields.set_name) || '',
    card_number: firstDefined(row, config.fields.card_number) || '',
    finish: normalizeFinish(firstDefined(row, config.fields.finish)),
    language: normalizeLanguage(firstDefined(row, config.fields.language)),
    oracle_id: firstDefined(row, config.fields.oracle_id) || null,
    price: toNumber(firstDefined(row, config.fields.price))
  };
}

export function writePricingSourceSnapshot(sourceName, normalizedRecords) {
  fs.mkdirSync(PRICING_SOURCE_OUTPUT_DIR, { recursive: true });
  const outputPath = path.join(PRICING_SOURCE_OUTPUT_DIR, `${sourceName}.json`);
  fs.writeFileSync(outputPath, JSON.stringify(normalizedRecords, null, 2));
  return outputPath;
}

export function importPricingSourceSnapshot(sourceName, inputPathArg) {
  const source = normalizePricingSourceName(sourceName);
  if (!VALID_PRICING_SOURCES.has(source)) {
    throw new Error(`Invalid pricing source "${sourceName}". Expected one of: ${[...VALID_PRICING_SOURCES].join(', ')}`);
  }

  const inputPath = path.resolve(process.cwd(), inputPathArg);
  if (!fs.existsSync(inputPath)) {
    throw new Error(`Input file not found: ${inputPath}`);
  }

  const config = getPricingSourceConfig(source);
  const rawRecords = readPricingSourceInput(inputPath);
  const normalizedRecords = rawRecords
    .map((row) => normalizePricingSourceRecord(row, config))
    .filter((row) => row.game && row.name && row.price != null);

  const outputPath = writePricingSourceSnapshot(source, normalizedRecords);

  return {
    source,
    input: inputPath,
    output: outputPath,
    imported: normalizedRecords.length
  };
}
