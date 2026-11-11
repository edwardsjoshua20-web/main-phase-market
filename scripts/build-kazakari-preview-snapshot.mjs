import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

const DEFAULT_DB = 'D:\\Projects\\Penny-Hunter\\data\\phase-5-tracking-final.sqlite';
const DEFAULT_OUTPUT = path.resolve(process.cwd(), 'server', 'data', 'kazakari-preview.json');

function parseArgs(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    if (!argv[index].startsWith('--')) continue;
    const key = argv[index].slice(2);
    const next = argv[index + 1];
    values.set(key, next && !next.startsWith('--') ? (index += 1, next) : 'true');
  }
  return values;
}

function assertDPath(value, label) {
  const resolved = path.resolve(value);
  if (!/^D:\\/i.test(resolved)) throw new Error(`${label} must remain on D:.`);
  return resolved;
}

function asNumber(value) {
  return value === null || value === undefined ? null : Number(value);
}

function asBoolean(value) {
  return value === null || value === undefined ? null : Number(value) === 1;
}

function classification(currentPrice, discountPercent, registerConfirmed) {
  if (registerConfirmed && currentPrice === 0.01) return 'register-confirmed-penny-sale';
  if (currentPrice === 0.01) return 'provider-observed-penny-price';
  if (discountPercent === null) return 'insufficient-reference';
  if (discountPercent >= 90) return 'extreme-markdown';
  if (discountPercent >= 75) return 'major-markdown';
  if (discountPercent >= 50) return 'significant-markdown';
  if (discountPercent > 0) return 'price-reduction';
  return 'no-reduction';
}

export function buildKazakariSnapshot({ databasePath = DEFAULT_DB, generatedAt = new Date().toISOString() } = {}) {
  const dbPath = assertDPath(databasePath, 'Kazakari source database');
  const nowMs = Date.parse(generatedAt);
  if (!Number.isFinite(nowMs)) throw new Error('generatedAt must be a valid ISO timestamp.');

  const database = new DatabaseSync(dbPath, { readOnly: true });
  try {
    const publicationRows = database.prepare(`
      SELECT id, retailer, adapter, external_id, publication_type, title, url,
        valid_from, valid_to, status, last_checked_at
      FROM tracked_publications
      WHERE status = 'active'
      ORDER BY valid_to, id
    `).all();

    const publications = publicationRows
      .filter((row) => row.valid_to === null || Date.parse(String(row.valid_to)) >= nowMs)
      .map((row) => ({
        id: Number(row.id),
        retailer: String(row.retailer),
        adapter: String(row.adapter),
        externalId: String(row.external_id),
        type: String(row.publication_type),
        title: row.title === null ? null : String(row.title),
        url: String(row.url),
        validFrom: row.valid_from === null ? null : String(row.valid_from),
        validTo: row.valid_to === null ? null : String(row.valid_to),
        status: 'active',
        lastCheckedAt: row.last_checked_at === null ? null : String(row.last_checked_at),
      }));

    const activeIds = publications.map((item) => item.id);
    const products = [];
    if (activeIds.length > 0) {
      const placeholders = activeIds.map(() => '?').join(',');
      const productColumns = new Set(database.prepare('PRAGMA table_info(products)').all().map((column) => String(column.name)));
      const metadataSelect = ['product_url', 'image_url', 'image_source_url', 'image_provenance', 'image_verified_at', 'description', 'reference_price', 'reference_price_source', 'reference_price_verified_at']
        .map((column) => productColumns.has(column) ? `p.${column}` : `NULL AS ${column}`)
        .join(', ');
      const rows = database.prepare(`
        WITH active_products AS (
          SELECT pp.product_identifier, pp.publication_id, pp.last_observation_id,
            pp.first_seen_at, pp.last_seen_at, pp.status
          FROM publication_products pp
          WHERE pp.publication_id IN (${placeholders}) AND pp.status = 'present'
        )
        SELECT o.*, ap.publication_id, ap.first_seen_at, ap.last_seen_at, ${metadataSelect}
        FROM active_products ap
        JOIN observations o ON o.id = ap.last_observation_id
        LEFT JOIN products p ON p.retailer = o.retailer AND p.product_identifier = o.product_identifier
        ORDER BY COALESCE(o.advertised_discount_percent, -1) DESC,
          COALESCE(o.current_price, 999999) ASC, o.product_name, o.product_identifier
      `).all(...activeIds);

      const historyStatement = database.prepare(`
        SELECT id, current_price, regular_price, reported_inventory, clearance_indicator,
          observation_timestamp, source, verification_status, price_scope,
          advertised_discount_percent, source_reliability, register_confirmed
        FROM observations
        WHERE retailer = ? AND product_identifier = ?
          AND COALESCE(store_identifier, '') = COALESCE(?, '')
        ORDER BY observation_timestamp ASC, id ASC
      `);

      const seenProducts = new Set();
      for (const row of rows) {
        const identity = `${row.retailer}\u0000${row.product_identifier}\u0000${row.store_identifier ?? ''}`;
        if (seenProducts.has(identity)) continue;
        seenProducts.add(identity);
        const currentPrice = asNumber(row.current_price);
        const regularPrice = asNumber(row.regular_price) ?? asNumber(row.reference_price);
        const advertisedPercent = asNumber(row.advertised_discount_percent);
        const computedPercent = regularPrice !== null && regularPrice > 0 && currentPrice !== null
          ? Number((((regularPrice - currentPrice) / regularPrice) * 100).toFixed(2))
          : advertisedPercent;
        const registerConfirmed = Number(row.register_confirmed) === 1;
        const history = historyStatement.all(row.retailer, row.product_identifier, row.store_identifier).map((item) => ({
          id: Number(item.id),
          currentPrice: asNumber(item.current_price),
          regularPrice: asNumber(item.regular_price),
          inventoryQuantity: asNumber(item.reported_inventory),
          clearanceFlag: asBoolean(item.clearance_indicator),
          observedAt: String(item.observation_timestamp),
          source: String(item.source),
          verificationStatus: String(item.verification_status),
          priceScope: item.price_scope === null ? null : String(item.price_scope),
          discountPercent: asNumber(item.advertised_discount_percent),
          sourceReliability: item.source_reliability === null ? null : String(item.source_reliability),
          registerConfirmed: Number(item.register_confirmed) === 1,
        }));

        products.push({
          observationId: Number(row.id),
          retailer: String(row.retailer),
          productId: String(row.product_identifier),
          sku: row.sku === null ? null : String(row.sku),
          upc: row.upc === null ? null : String(row.upc),
          productName: row.product_name === null ? null : String(row.product_name),
          category: row.category === null ? null : String(row.category),
          description: row.description === null ? null : String(row.description),
          productUrl: row.product_url === null ? null : String(row.product_url),
          imageUrl: row.image_url === null ? null : String(row.image_url),
          imageSourceUrl: row.image_source_url === null ? null : String(row.image_source_url),
          imageProvenance: row.image_provenance === null ? null : String(row.image_provenance),
          imageVerifiedAt: row.image_verified_at === null ? null : String(row.image_verified_at),
          referencePriceSource: row.reference_price_source === null ? null : String(row.reference_price_source),
          referencePriceVerifiedAt: row.reference_price_verified_at === null ? null : String(row.reference_price_verified_at),
          storeId: row.store_identifier === null ? null : String(row.store_identifier),
          zip: row.zip === null ? null : String(row.zip),
          currentPrice,
          regularPrice,
          discountPercent: computedPercent,
          discountBasis: regularPrice !== null ? 'reference-price' : advertisedPercent !== null ? 'source-advertised-percent' : 'none',
          classification: classification(currentPrice, computedPercent, registerConfirmed),
          inventoryQuantity: asNumber(row.reported_inventory),
          clearanceFlag: asBoolean(row.clearance_indicator),
          observedAt: String(row.observation_timestamp),
          source: String(row.source),
          verificationStatus: String(row.verification_status),
          priceScope: row.price_scope === null ? null : String(row.price_scope),
          sourceReliability: row.source_reliability === null ? null : String(row.source_reliability),
          registerConfirmed,
          publicationId: Number(row.publication_id),
          firstSeenAt: String(row.first_seen_at),
          lastSeenAt: String(row.last_seen_at),
          history,
        });
      }
    }

    const events = database.prepare(`
      SELECT e.id, e.observation_id, e.event_type, e.category, e.rank_score, e.detected_at,
        o.product_identifier, o.store_identifier, o.current_price, o.regular_price, o.source
      FROM discovery_events e
      JOIN observations o ON o.id = e.observation_id
      ORDER BY e.detected_at DESC, e.id DESC
      LIMIT 100
    `).all().map((row) => ({
      id: Number(row.id), observationId: Number(row.observation_id), eventType: String(row.event_type),
      category: String(row.category), rankScore: Number(row.rank_score), detectedAt: String(row.detected_at),
      productId: String(row.product_identifier), storeId: row.store_identifier === null ? null : String(row.store_identifier),
      currentPrice: asNumber(row.current_price), regularPrice: asNumber(row.regular_price), source: String(row.source),
    }));

    const watchRules = database.prepare('SELECT * FROM watch_rules ORDER BY id').all().map((row) => ({
      id: String(row.id), name: String(row.name), enabled: Number(row.enabled) === 1,
      retailer: row.retailer === null ? null : String(row.retailer), category: row.category === null ? null : String(row.category),
      storeId: row.store_identifier === null ? null : String(row.store_identifier), productId: row.product_identifier === null ? null : String(row.product_identifier),
      minimumDiscount: Number(row.minimum_discount), newlyDiscounted: Number(row.newly_discounted) === 1,
      priceDrops: Number(row.price_drops) === 1, endOfClearance: Number(row.end_of_clearance) === 1,
      createdAt: String(row.created_at),
    }));

    return {
      schemaVersion: 1,
      generatedAt,
      source: { databaseFile: path.basename(dbPath), kind: 'kazakari-sqlite-sanitized-export' },
      summary: {
        activePublications: publications.length,
        currentProducts: products.length,
        advertisedProducts: products.filter((item) => item.priceScope === 'advertised').length,
        storeSpecificProducts: products.filter((item) => item.priceScope === 'store-specific').length,
        qualifyingDeals: products.filter((item) => item.currentPrice === 0.01 || (item.discountPercent ?? -1) >= 50).length,
        pennyObservations: products.filter((item) => item.currentPrice === 0.01).length,
        verifiedProductImages: products.filter((item) => item.imageUrl && item.imageProvenance === 'official-circular-item').length,
        exactReferencePrices: products.filter((item) => item.regularPrice !== null).length,
      },
      publications,
      products,
      events,
      watchRules,
    };
  } finally {
    database.close();
  }
}

export function writeKazakariSnapshot(snapshot, outputPath = DEFAULT_OUTPUT) {
  const target = assertDPath(outputPath, 'Kazakari snapshot output');
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
  fs.renameSync(temporary, target);
  return target;
}

if (path.resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  const snapshot = buildKazakariSnapshot({
    databasePath: args.get('db') || DEFAULT_DB,
    generatedAt: args.get('now') || new Date().toISOString(),
  });
  const output = writeKazakariSnapshot(snapshot, args.get('output') || DEFAULT_OUTPUT);
  console.log(JSON.stringify({ output, summary: snapshot.summary }, null, 2));
}
