import express from 'express';
import cors from 'cors';
import { URL } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import Stripe from 'stripe';
import {
  createEntity,
  deleteEntity,
  filterEntities,
  getEntityById,
  listEntities,
  normalizeEntityName,
  updateEntity
} from './entityStore.mjs';
import {
  createSupabaseEntityRecord,
  createSupabaseCardList,
  createSupabaseForumPost,
  createSupabaseForumReply,
  deleteSupabaseEntityRecord,
  getSupabaseUserProfileByEmail,
  deleteSupabaseCardList,
  deleteSupabaseForumPost,
  deleteSupabaseForumReply,
  getSupabaseCardListById,
  getSupabaseEntityRecordById,
  getSupabaseForumPostById,
  isSupabaseDeckBridgeConfigured,
  isSupabaseEntityStoreConfigured,
  isSupabaseForumBridgeConfigured,
  isSupabaseProfileBridgeConfigured,
  listSupabaseCardLists,
  listSupabaseEntityRecords,
  listSupabaseForumPosts,
  listSupabaseForumReplies,
  filterSupabaseEntityRecords,
  isSupabaseStorageConfigured,
  uploadSupabasePublicFile,
  updateSupabaseUserProfileByEmail,
  updateSupabaseEntityRecord,
  updateSupabaseCardList,
  updateSupabaseForumPost,
  updateSupabaseForumReply
} from './supabaseBridge.mjs';
import { getDbPath } from './db.mjs';
import { ensureMtgCommanderEngine, getMtgCommanderPage, refreshMtgCommanderEngine, searchMtgCommanderEngine, simulateMtgDeckGauntlet } from './mtgCommanderEngine.mjs';
import { importCommanderDeckText } from './mtgCommanderCorpus.mjs';
import { ensureFabSearchIndex, searchFabAdvancedIndex, searchFabIndex } from './fabSearchIndex.mjs';
import { ensureLorcanaSearchIndex, searchLorcanaAdvancedIndex, searchLorcanaIndex } from './lorcanaSearchIndex.mjs';
import { ensureMtgSearchIndex, searchMtgAdvancedIndex, searchMtgIndex } from './mtgSearchIndex.mjs';
import { ensureOnePieceSearchIndex, searchOnePieceAdvancedIndex, searchOnePieceIndex } from './onepieceSearchIndex.mjs';
import { ensurePokemonSearchIndex, searchPokemonAdvancedIndex, searchPokemonIndex } from './pokemonSearchIndex.mjs';
import { ensureStarWarsSearchIndex, searchStarWarsAdvancedIndex, searchStarWarsIndex } from './starwarsSearchIndex.mjs';
import { ensureYugiohSearchIndex, searchYugiohAdvancedIndex, searchYugiohIndex } from './yugiohSearchIndex.mjs';

const envFileValues = (() => {
  const parseEnvFile = (filePath) => {
    if (!fs.existsSync(filePath)) {
      return {};
    }

    return Object.fromEntries(
      fs.readFileSync(filePath, 'utf8')
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith('#') && line.includes('='))
        .map((line) => {
          const delimiterIndex = line.indexOf('=');
          const key = line.slice(0, delimiterIndex).trim();
          const value = line.slice(delimiterIndex + 1).trim().replace(/^['"]|['"]$/g, '');
          return [key, value];
        })
    );
  };

  return {
    ...parseEnvFile(path.join(process.cwd(), '.env.local')),
    ...parseEnvFile(path.join(process.cwd(), '.env'))
  };
})();

function getEnvValue(name) {
  return process.env[name] || envFileValues[name] || '';
}

const app = express();
const port = Number(process.env.PORT || process.env.LOCAL_API_PORT || 8787);
const host = process.env.LOCAL_API_HOST || '0.0.0.0';
const allowedOriginHosts = new Set(
  ['localhost', '127.0.0.1', ...(getEnvValue('ALLOWED_ORIGIN_HOSTS').split(',').map((value) => value.trim()).filter(Boolean))]
);
const mtgSearchDir = path.join(process.cwd(), 'public', 'data', 'mtg', 'search');
const mtgImageDir = path.join(process.cwd(), 'public', 'data', 'mtg', 'images');
const mtgSourcePath =
  process.env.MTG_SOURCE_PATH ||
  getEnvValue('MTG_SOURCE_PATH') ||
  path.join(process.cwd(), 'server', 'data', 'mtg', 'source', 'all_cards-latest.json');
let mtgRowsCache = null;
const mtgOraclePrintingsCache = new Map();

function getStripeClient() {
  const apiKey = getEnvValue('STRIPE_SECRET_KEY');
  if (!apiKey) {
    return null;
  }

  return new Stripe(apiKey);
}

async function getUSPSToken() {
  const consumerKey = getEnvValue('USPS_CONSUMER_KEY');
  const consumerSecret = getEnvValue('USPS_CONSUMER_SECRET');
  if (!consumerKey || !consumerSecret) {
    return null;
  }

  const response = await fetch('https://apis.usps.com/oauth2/v3/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      grant_type: 'client_credentials',
      client_id: consumerKey,
      client_secret: consumerSecret
    })
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `USPS token request failed: ${response.status}`);
  }

  const payload = await response.json();
  return payload?.access_token || null;
}

async function getUSPSRates(destinationZip, weightOz = 3) {
  const token = await getUSPSToken();
  if (!token) {
    return [];
  }

  const originZip = '40272';
  const mailClasses = [
    { id: 'USPS_GROUND_ADVANTAGE', label: 'USPS Ground Advantage', days: '2-5 business days' },
    { id: 'PRIORITY_MAIL', label: 'Priority Mail', days: '1-3 business days' },
    { id: 'PRIORITY_MAIL_EXPRESS', label: 'Priority Mail Express', days: '1-2 business days' }
  ];

  const rates = [];
  for (const mailClass of mailClasses) {
    try {
      const response = await fetch('https://apis.usps.com/prices/v3/base-rates/search', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Accept: 'application/json'
        },
        body: JSON.stringify({
          originZIPCode: originZip,
          destinationZIPCode: destinationZip,
          weight: Number(weightOz || 3) / 16,
          length: 9,
          width: 6,
          height: 1,
          mailClass: mailClass.id,
          processingCategory: mailClass.id === 'USPS_GROUND_ADVANTAGE' ? 'MACHINABLE' : 'NON_MACHINABLE',
          destinationEntryFacilityType: 'NONE',
          rateIndicator: 'SP',
          priceType: 'RETAIL'
        })
      });

      if (!response.ok) {
        continue;
      }

      const payload = await response.json();
      const price = payload?.rates?.[0]?.price ?? payload?.totalBasePrice ?? payload?.price;
      if (price != null) {
        rates.push({
          id: mailClass.id.toLowerCase(),
          name: mailClass.label,
          price: roundMoney(price),
          days: mailClass.days
        });
      }
    } catch {
      // Fall through to static fallback rates if USPS is unavailable.
    }
  }

  return rates;
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function fileExtensionFromMime(mimeType = '') {
  const normalized = String(mimeType || '').toLowerCase();
  if (normalized === 'image/png') return '.png';
  if (normalized === 'image/webp') return '.webp';
  if (normalized === 'image/gif') return '.gif';
  return '.jpg';
}

function decodeBase64Upload(data = '') {
  const match = String(data || '').match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    throw new Error('Invalid upload payload');
  }

  return {
    mimeType: match[1],
    buffer: Buffer.from(match[2], 'base64')
  };
}

function matchesEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

function buildOrderNumber() {
  const stamp = new Date().toISOString().replace(/\D/g, '').slice(2, 14);
  const suffix = crypto.randomBytes(2).toString('hex').toUpperCase();
  return `MPM-${stamp}-${suffix}`;
}

function roundMoney(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function parseJsonSafely(value, fallback = null) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function normalizeExternalImageUrl(value) {
  const candidate = String(value || '').trim();
  if (!candidate) {
    return '';
  }

  try {
    const parsed = new URL(candidate);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.toString();
    }
  } catch {
    return '';
  }

  return '';
}

function normalizeCartItem(rawItem = {}) {
  const quantity = Math.max(1, Number(rawItem.quantity) || 1);
  const unitPrice = roundMoney(Math.max(Number(rawItem.price) || 0, 1));

  return {
    card_id: String(rawItem.card_id || '').trim(),
    card_name: String(rawItem.card_name || 'Item').trim() || 'Item',
    card_image: normalizeExternalImageUrl(rawItem.card_image),
    price: unitPrice,
    quantity
  };
}

function normalizeShippingInfo(rawShipping = {}) {
  return {
    name: String(rawShipping.name || '').trim(),
    email: String(rawShipping.email || '').trim().toLowerCase(),
    address: String(rawShipping.address || rawShipping.street || '').trim(),
    city: String(rawShipping.city || '').trim(),
    state: String(rawShipping.state || '').trim(),
    zip: String(rawShipping.zip || '').trim(),
    country: String(rawShipping.country || 'US').trim() || 'US'
  };
}

function validateCheckoutPayload(cartItems, shippingInfo) {
  if (!Array.isArray(cartItems) || cartItems.length === 0) {
    throw new Error('Your cart is empty.');
  }

  if (!shippingInfo.name || !shippingInfo.address || !shippingInfo.city || !shippingInfo.state || !shippingInfo.zip) {
    throw new Error('Shipping information is incomplete.');
  }

  if (!matchesEmail(shippingInfo.email)) {
    throw new Error('A valid email address is required.');
  }
}

function buildOrderFromCheckoutSession(session) {
  const shippingInfo = parseJsonSafely(session?.metadata?.shipping_info || '{}', {}) || {};
  const cartItems = parseJsonSafely(session?.metadata?.cart_items || '[]', []) || [];
  const normalizedItems = Array.isArray(cartItems) ? cartItems.map(normalizeCartItem) : [];
  const subtotal = roundMoney(normalizedItems.reduce((sum, item) => sum + (item.price * item.quantity), 0));
  const sessionTotal = roundMoney((Number(session?.amount_total) || 0) / 100);
  const shippingCost = roundMoney(Math.max(sessionTotal - subtotal, 0));

  return {
    stripe_session_id: session.id,
    stripe_payment_intent_id: String(session.payment_intent || '').trim() || null,
    order_number: buildOrderNumber(),
    customer_email: String(shippingInfo.email || '').trim().toLowerCase(),
    customer_name: String(shippingInfo.name || '').trim(),
    items: normalizedItems,
    subtotal,
    shipping_cost: shippingCost,
    total: sessionTotal,
    shipping_address: {
      street: String(shippingInfo.address || '').trim(),
      city: String(shippingInfo.city || '').trim(),
      state: String(shippingInfo.state || '').trim(),
      zip: String(shippingInfo.zip || '').trim(),
      country: String(shippingInfo.country || 'US').trim() || 'US'
    },
    status: 'confirmed'
  };
}

function decrementInventoryForOrder(order) {
  for (const item of Array.isArray(order?.items) ? order.items : []) {
    if (!item?.card_id) {
      continue;
    }

    const cardRecord = getEntityById('Card', item.card_id);
    if (cardRecord) {
      updateEntity('Card', item.card_id, {
        quantity: Math.max(0, Number(cardRecord.quantity || 0) - Number(item.quantity || 0))
      });
      continue;
    }

    const productRecord = getEntityById('Product', item.card_id);
    if (productRecord) {
      updateEntity('Product', item.card_id, {
        quantity: Math.max(0, Number(productRecord.quantity || 0) - Number(item.quantity || 0))
      });
    }
  }
}

async function sendOrderConfirmationEmail(order) {
  const resendApiKey = getEnvValue('RESEND_API_KEY');
  if (!resendApiKey || !order?.customer_email) {
    return { sent: false, skipped: true };
  }

  const itemsHtml = (Array.isArray(order.items) ? order.items : []).map((item) => `
    <tr>
      <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">${item.card_name}</td>
      <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: center;">${item.quantity}</td>
      <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: right;">$${roundMoney(item.price * item.quantity).toFixed(2)}</td>
    </tr>
  `).join('');

  const emailHtml = `
    <!DOCTYPE html>
    <html>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background: linear-gradient(135deg, #2563eb 0%, #1e40af 100%); padding: 30px; text-align: center; border-radius: 8px 8px 0 0;">
        <h1 style="color: white; margin: 0;">Order Confirmed!</h1>
      </div>
      <div style="background: white; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
        <p style="font-size: 16px; margin-bottom: 20px;">Hi ${order.customer_name || 'there'},</p>
        <p style="margin-bottom: 20px;">Thank you for your order! We've received your payment and are preparing your items for shipment.</p>
        <div style="background: #f9fafb; padding: 15px; border-radius: 6px; margin-bottom: 20px;">
          <strong>Order Number:</strong> ${order.order_number}
        </div>
        <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
          <thead>
            <tr style="background: #f9fafb;">
              <th style="padding: 12px; text-align: left; border-bottom: 2px solid #e5e7eb;">Item</th>
              <th style="padding: 12px; text-align: center; border-bottom: 2px solid #e5e7eb;">Qty</th>
              <th style="padding: 12px; text-align: right; border-bottom: 2px solid #e5e7eb;">Price</th>
            </tr>
          </thead>
          <tbody>${itemsHtml}</tbody>
        </table>
        <div style="text-align: right; padding-top: 15px; border-top: 2px solid #e5e7eb;">
          <p style="margin: 5px 0;"><strong>Subtotal:</strong> $${roundMoney(order.subtotal).toFixed(2)}</p>
          <p style="margin: 5px 0;"><strong>Shipping:</strong> $${roundMoney(order.shipping_cost).toFixed(2)}</p>
          <p style="font-size: 18px; margin: 10px 0 0 0; color: #2563eb;"><strong>Total:</strong> $${roundMoney(order.total).toFixed(2)}</p>
        </div>
      </div>
    </body>
    </html>
  `;

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: 'Main Phase Market <orders@mainphasemarket.com>',
      to: order.customer_email,
      subject: `Order Confirmation - ${order.order_number}`,
      html: emailHtml
    })
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.message || `Resend API error: ${response.status}`);
  }

  return {
    sent: true,
    emailId: payload?.id || null
  };
}

function findOrderByNumber(orderNumber, customerEmail = '') {
  const normalizedOrderNumber = String(orderNumber || '').trim().toLowerCase();
  const normalizedEmail = String(customerEmail || '').trim().toLowerCase();

  if (!normalizedOrderNumber) {
    return null;
  }

  const orders = listEntities('Order', { sort: '-created_date' });
  return orders.find((order) => {
    const sameOrderNumber = String(order?.order_number || '').trim().toLowerCase() === normalizedOrderNumber;
    if (!sameOrderNumber) {
      return false;
    }

    if (!normalizedEmail) {
      return true;
    }

    return String(order?.customer_email || '').trim().toLowerCase() === normalizedEmail;
  }) || null;
}

function buildTrackingPayload(order) {
  const events = Array.isArray(order?.tracking_events)
    ? order.tracking_events
        .map((event) => ({
          description: String(event?.description || event?.status || '').trim(),
          location: String(event?.location || '').trim(),
          timestamp: String(event?.timestamp || event?.date || '').trim()
        }))
        .filter((event) => event.description || event.location || event.timestamp)
    : [];

  if (!order?.tracking_number && events.length === 0) {
    return null;
  }

  return {
    tracking_number: order?.tracking_number || '',
    events
  };
}

function buildLegacyPokemonActionRow(row) {
  return {
    id: row.id,
    name: row.name || '',
    number: row.card_number || '',
    rarity: row.rarity || '',
    hp: row.hp || '',
    supertype: row.supertype || '',
    types: Array.isArray(row.types) ? row.types : [],
    images: {
      small: row.image_small || row.image_url || null,
      large: row.image_url || row.image_small || null
    },
    set: {
      id: String(row.set_code || row.set_name || 'unk').toLowerCase(),
      name: row.set_name || 'Unknown Set',
      ptcgoCode: row.set_code || ''
    }
  };
}

function loadAllMtgRows() {
  if (mtgRowsCache) {
    return mtgRowsCache;
  }

  const files = fs.readdirSync(mtgSearchDir).filter((file) => file.endsWith('.json'));
  mtgRowsCache = files.flatMap((file) => {
    const filePath = path.join(mtgSearchDir, file);
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  });
  return mtgRowsCache;
}

function getPrimaryFace(card) {
  if (Array.isArray(card.card_faces) && card.card_faces.length > 0) {
    return card.card_faces[0];
  }

  return null;
}

function getImage(card, kind) {
  if (card.image_uris?.[kind]) {
    return card.image_uris[kind];
  }

  const primaryFace = getPrimaryFace(card);
  return primaryFace?.image_uris?.[kind] || null;
}

function getFileExtension(url, kind) {
  if (kind === 'png') return '.png';

  try {
    const pathname = new URL(url).pathname.toLowerCase();
    if (pathname.endsWith('.png')) return '.png';
  } catch {}

  return '.jpg';
}

function getMirroredImageUrl(cardId, kind, sourceUrl) {
  if (!sourceUrl) return null;

  const extension = getFileExtension(sourceUrl, kind);
  const prefix = String(cardId).slice(0, 2).toLowerCase();
  const diskPath = path.join(mtgImageDir, kind, prefix, `${cardId}${extension}`);

  if (!fs.existsSync(diskPath)) {
    return sourceUrl;
  }

  try {
    if (fs.statSync(diskPath).size === 0) {
      return sourceUrl;
    }
  } catch {
    return sourceUrl;
  }

  return `/data/mtg/images/${kind}/${prefix}/${cardId}${extension}`;
}

function mapDetailedMtgCard(card) {
  const primaryFace = getPrimaryFace(card);
  const typeLine = card.type_line || primaryFace?.type_line || '';
  const oracleText = card.oracle_text || primaryFace?.oracle_text || '';
  const manaCost = card.mana_cost || primaryFace?.mana_cost || '';
  const searchName = card.name || primaryFace?.name || '';
  const faceNames = Array.isArray(card.card_faces) ? card.card_faces.map((face) => face.name).filter(Boolean) : [];

  return {
    id: card.id,
    oracle_id: card.oracle_id || null,
    name: searchName,
    name_normalized: normalizeText(searchName),
    lang: card.lang || 'unknown',
    face_names: faceNames,
    released_at: card.released_at || null,
    set_code: String(card.set || '').toUpperCase(),
    set_name: card.set_name || '',
    set_type: card.set_type || '',
    collector_number: card.collector_number || '',
    rarity: card.rarity || '',
    mana_cost: manaCost,
    cmc: Number.isFinite(card.cmc) ? card.cmc : 0,
    type_line: typeLine,
    oracle_text: oracleText,
    power: card.power ?? primaryFace?.power ?? '',
    toughness: card.toughness ?? primaryFace?.toughness ?? '',
    loyalty: card.loyalty ?? primaryFace?.loyalty ?? '',
    colors: Array.isArray(card.colors) ? card.colors : [],
    color_identity: Array.isArray(card.color_identity) ? card.color_identity : [],
    keywords: Array.isArray(card.keywords) ? card.keywords : [],
    image_small: getMirroredImageUrl(card.id, 'small', getImage(card, 'small')),
    image_normal: getMirroredImageUrl(card.id, 'normal', getImage(card, 'normal')),
    image_art_crop: getMirroredImageUrl(card.id, 'art_crop', getImage(card, 'art_crop')),
    image_png: getMirroredImageUrl(card.id, 'png', getImage(card, 'png')),
    legal_commander: card.legalities?.commander === 'legal',
    can_be_commander: Boolean(String(typeLine).toLowerCase().includes('legendary creature') || String(oracleText).toLowerCase().includes('can be your commander')),
    finishes: Array.isArray(card.finishes) ? card.finishes : [],
    nonfoil: Boolean(card.nonfoil),
    foil: Boolean(card.foil),
    highres_image: Boolean(card.highres_image),
    prices: {
      usd: card.prices?.usd ?? null,
      usd_foil: card.prices?.usd_foil ?? null,
      usd_etched: card.prices?.usd_etched ?? null
    },
    search_text: normalizeText([
      searchName,
      ...faceNames,
      card.set_name,
      card.collector_number,
      typeLine,
      oracleText
    ].filter(Boolean).join(' ')),
    game: 'magic'
  };
}

async function loadDetailedMtgPrintingsByOracleId(oracleId) {
  if (!oracleId) return [];
  if (mtgOraclePrintingsCache.has(oracleId)) {
    return mtgOraclePrintingsCache.get(oracleId);
  }

  if (!fs.existsSync(mtgSourcePath)) {
    return [];
  }

  const decoder = new StringDecoder('utf8');
  const stream = fs.createReadStream(mtgSourcePath, { encoding: 'utf8', highWaterMark: 1024 * 1024 });
  const matches = [];

  let startedArray = false;
  let depth = 0;
  let inString = false;
  let escaping = false;
  let current = '';

  for await (const chunk of stream) {
    const text = decoder.write(Buffer.from(chunk));

    for (const char of text) {
      if (!startedArray) {
        if (char === '[') {
          startedArray = true;
        }
        continue;
      }

      if (depth === 0) {
        if (char === '{') {
          current = '{';
          depth = 1;
          inString = false;
          escaping = false;
        }
        continue;
      }

      current += char;

      if (inString) {
        if (escaping) {
          escaping = false;
        } else if (char === '\\') {
          escaping = true;
        } else if (char === '"') {
          inString = false;
        }
        continue;
      }

      if (char === '"') {
        inString = true;
        continue;
      }

      if (char === '{') {
        depth += 1;
        continue;
      }

      if (char === '}') {
        depth -= 1;
        if (depth === 0) {
          const card = JSON.parse(current);
          if (card?.oracle_id === oracleId) {
            matches.push(mapDetailedMtgCard(card));
          }
          current = '';
        }
      }
    }
  }

  decoder.end();
  mtgOraclePrintingsCache.set(oracleId, matches);
  return matches;
}

function isEnglish(row) {
  return String(row?.lang || '').toLowerCase() === 'en';
}

function toNumericValue(value) {
  if (value === null || value === undefined || value === '') return null;
  const match = String(value).match(/-?\d+(\.\d+)?/);
  if (!match) return null;
  const numeric = Number.parseFloat(match[0]);
  return Number.isFinite(numeric) ? numeric : null;
}

function compareNumeric(actualValue, op, expectedValue) {
  const actual = toNumericValue(actualValue);
  const expected = toNumericValue(expectedValue);
  if (actual === null || expected === null) return false;
  if (op === '=') return actual === expected;
  if (op === '>=') return actual >= expected;
  if (op === '<=') return actual <= expected;
  if (op === '>') return actual > expected;
  if (op === '<') return actual < expected;
  return false;
}

function matchesTextFilter(value, query) {
  if (!query) return true;
  return normalizeText(value).includes(normalizeText(query));
}

function getCardColors(row) {
  const colors = Array.isArray(row?.colors) ? row.colors : [];
  return [...new Set(colors.map((color) => String(color || '').toUpperCase()).filter(Boolean))].sort();
}

function matchesColorFilter(row, filters) {
  const selectedColors = Array.isArray(filters.colors) ? filters.colors.filter(Boolean) : [];
  if (!selectedColors.length) return true;

  const rowColors = getCardColors(row);
  const normalizedRowColors = [...new Set(rowColors.map((color) => String(color || '').toUpperCase()).filter(Boolean))].sort();
  const normalizedSelectedColors = [...new Set(selectedColors.map((color) => String(color || '').toUpperCase()).filter(Boolean))].sort();
  const rowSet = new Set(normalizedRowColors);

  if (filters.colorMode === 'exactly') {
    if (normalizedRowColors.length !== normalizedSelectedColors.length) return false;
    return normalizedSelectedColors.every((color) => rowSet.has(color));
  }

  if (filters.colorMode === 'at_most') {
    return normalizedRowColors.every((color) => normalizedSelectedColors.includes(color));
  }

  return normalizedSelectedColors.every((color) => rowSet.has(color));
}

function compareColorPriority(a, b, filters) {
  const selectedColors = Array.isArray(filters?.colors) ? filters.colors.filter(Boolean).map((color) => String(color).toUpperCase()) : [];
  if (!selectedColors.length) return 0;

  const aColors = getCardColors(a);
  const bColors = getCardColors(b);
  const aExact = aColors.length === selectedColors.length && selectedColors.every((color) => aColors.includes(color));
  const bExact = bColors.length === selectedColors.length && selectedColors.every((color) => bColors.includes(color));

  if (aExact !== bExact) {
    return aExact ? -1 : 1;
  }

  if (aColors.length !== bColors.length) {
    return aColors.length - bColors.length;
  }

  return 0;
}

function hasImage(row) {
  return Boolean(row?.image_normal || row?.image_small);
}

function matchesMtgAdvancedFilters(row, filters) {
  if (!row || !hasImage(row)) return false;
  if (!matchesColorFilter(row, filters)) return false;
  if (!matchesTextFilter(row.name || '', filters.name)) return false;
  if (!matchesTextFilter(row.oracle_text || '', filters.oracleText)) return false;
  if (!matchesTextFilter(row.type_line || '', filters.typeLine)) return false;
  if (filters.set && !matchesTextFilter(`${row.set_code || ''} ${row.set_name || ''}`, filters.set)) return false;
  if (filters.rarity && String(row.rarity || '').toLowerCase() !== String(filters.rarity).toLowerCase()) return false;

  const keywords = Array.isArray(filters.keywords) ? filters.keywords.filter(Boolean) : [];
  if (keywords.length) {
    const haystack = normalizeText(`${row.oracle_text || ''} ${row.type_line || ''}`);
    if (!keywords.every((keyword) => haystack.includes(normalizeText(keyword)))) {
      return false;
    }
  }

  if (filters.cmc && !compareNumeric(row.cmc, filters.cmcOp || '=', filters.cmc)) return false;
  if (filters.power && !compareNumeric(row.power, filters.powerOp || '=', filters.power)) return false;
  if (filters.toughness && !compareNumeric(row.toughness, filters.toughnessOp || '=', filters.toughness)) return false;

  return true;
}

function compareMtgRows(a, b, filters = {}) {
  const colorCompare = compareColorPriority(a, b, filters);
  if (colorCompare !== 0) return colorCompare;

  if (isEnglish(a) !== isEnglish(b)) {
    return isEnglish(a) ? -1 : 1;
  }

  const releaseCompare = String(b.released_at || '').localeCompare(String(a.released_at || ''));
  if (releaseCompare !== 0) return releaseCompare;

  const setCompare = String(a.set_name || '').localeCompare(String(b.set_name || ''));
  if (setCompare !== 0) return setCompare;

  return String(a.collector_number || '').localeCompare(String(b.collector_number || ''), undefined, { numeric: true, sensitivity: 'base' });
}

function formatMtgResult(row) {
  return {
    id: row.id,
    oracle_id: row.oracle_id,
    name: row.name,
    raw_name: row.name,
    lang: row.lang || 'unknown',
    set_name: row.set_name || 'Unknown Set',
    set_code: row.set_code || 'UNK',
    card_number: row.collector_number || '',
    rarity: row.rarity || '',
    image_url: row.image_normal || row.image_small || null,
    raw_image_url: row.image_normal || row.image_small || null,
    english_image_url: null,
    image_small: row.image_small || row.image_normal || null,
    image_art_crop: row.image_art_crop || null,
    highres_image: Boolean(row.highres_image),
    has_localized_image: Boolean(row.image_normal || row.image_small),
    price: row.prices?.usd ? Number.parseFloat(row.prices.usd) : null,
    allPrices: {
      usd: row.prices?.usd ? Number.parseFloat(row.prices.usd) : null,
      usd_foil: row.prices?.usd_foil ? Number.parseFloat(row.prices.usd_foil) : null,
      usd_etched: row.prices?.usd_etched ? Number.parseFloat(row.prices.usd_etched) : null
    },
    allFinishes: row.finishes || [],
    type: row.type_line || '',
    mana_cost: row.mana_cost || '',
    cmc: row.cmc ?? 0,
    colors: row.colors || [],
    color_identity: row.color_identity || [],
    oracle_text: row.oracle_text || '',
    released_at: row.released_at || null,
    legal_commander: Boolean(row.legal_commander),
    can_be_commander: Boolean(row.can_be_commander),
    finishes: row.finishes || [],
    finish: 'nonfoil',
    finishLabel: 'Normal',
    game: 'magic'
  };
}

function sortLanguageCodes(languageCodes = []) {
  return [...new Set(languageCodes.map((code) => String(code || '').toUpperCase()).filter(Boolean))]
    .sort((a, b) => {
      if (a === 'EN' && b !== 'EN') return -1;
      if (b === 'EN' && a !== 'EN') return 1;
      return a.localeCompare(b);
    });
}

function buildGroupedMtgResults(rows) {
  const groups = new Map();

  for (const row of rows) {
    const groupKey = [
      row.oracle_id || row.name,
      row.set_code || row.set_name || 'UNK',
      row.collector_number || ''
    ].join('::');

    if (!groups.has(groupKey)) {
      groups.set(groupKey, []);
    }

    groups.get(groupKey).push(row);
  }

  return [...groups.entries()]
    .map(([groupKey, variants]) => {
      const sortedVariants = [...variants].sort((a, b) => {
        if (isEnglish(a) !== isEnglish(b)) {
          return isEnglish(a) ? -1 : 1;
        }

        return String(a.lang || '').localeCompare(String(b.lang || ''));
      });

      const primary = formatMtgResult(sortedVariants[0]);
      const languageCodes = sortLanguageCodes(sortedVariants.map((variant) => variant.lang));

      return {
        ...primary,
        groupKey,
        languageCodes,
        variantCount: languageCodes.length || 1
      };
    });
}

function isLoopbackAddress(address) {
  return ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(address || '');
}

function allowRemoteConnections() {
  return String(getEnvValue('ALLOW_REMOTE_CONNECTIONS') || '').trim().toLowerCase() === 'true';
}

function isAllowedOrigin(origin) {
  if (!origin) {
    return true;
  }

  try {
    const parsed = new URL(origin);
    return allowedOriginHosts.has(parsed.hostname);
  } catch {
    return false;
  }
}

app.use(cors({
  origin(origin, callback) {
    if (isAllowedOrigin(origin)) {
      callback(null, true);
      return;
    }

    callback(new Error('API origin is not allowed.'));
  }
}));

app.use((req, res, next) => {
  const remoteAddress = req.socket.remoteAddress;
  const origin = req.headers.origin;

  if (!allowRemoteConnections() && !isLoopbackAddress(remoteAddress)) {
    res.status(403).json({ error: 'API only accepts loopback connections until ALLOW_REMOTE_CONNECTIONS=true is set.' });
    return;
  }

  if (!isAllowedOrigin(origin)) {
    res.status(403).json({ error: 'API browser origin is not allowed.' });
    return;
  }

  next();
});

app.use(express.json({ limit: '25mb' }));

ensureMtgSearchIndex().catch((error) => {
  console.error('Failed to initialize MTG search index:', error);
});

ensureMtgCommanderEngine().catch((error) => {
  console.error('Failed to initialize MTG commander engine:', error);
});

ensurePokemonSearchIndex().catch((error) => {
  console.error('Failed to initialize Pokemon search index:', error);
});

ensureFabSearchIndex().catch((error) => {
  console.error('Failed to initialize FAB search index:', error);
});

ensureStarWarsSearchIndex().catch((error) => {
  console.error('Failed to initialize Star Wars search index:', error);
});

const localAdminUser = {
  id: 'local-admin',
  full_name: 'Local Admin',
  email: 'admin@localhost',
  role: 'admin'
};

app.get('/api/local/health', (_req, res) => {
  const systemHealthPath = path.join(process.cwd(), 'public', 'data', 'site', 'system-health.json');
  const systemHealth = fs.existsSync(systemHealthPath)
    ? parseJsonSafely(fs.readFileSync(systemHealthPath, 'utf8'), null)
    : null;

  res.json({
    ok: true,
    mode: 'local',
    dbPath: getDbPath(),
    systemHealth
  });
});

app.get('/api/local/app/public-settings', (_req, res) => {
  res.json({
    app_name: 'Main Phase Market',
    auth_required: false,
    backend_provider: 'local'
  });
});

app.get('/api/local/auth/is-authenticated', (_req, res) => {
  res.json({ authenticated: true });
});

app.get('/api/local/auth/me', (_req, res) => {
  if (!isSupabaseProfileBridgeConfigured()) {
    res.json(localAdminUser);
    return;
  }

  getSupabaseUserProfileByEmail(localAdminUser.email, localAdminUser)
    .then((profile) => {
      res.json({
        ...localAdminUser,
        ...profile
      });
    })
    .catch((error) => {
      console.error('Supabase auth me route failed:', error);
      res.status(500).json({ error: 'Failed to load current user profile' });
    });
});

app.patch('/api/local/auth/profile', async (req, res) => {
  if (!isSupabaseProfileBridgeConfigured()) {
    res.json({
      ...localAdminUser,
      ...(req.body || {})
    });
    return;
  }

  try {
    const profile = await updateSupabaseUserProfileByEmail(
      localAdminUser.email,
      {
        ...(req.body || {}),
        id: localAdminUser.id
      },
      localAdminUser
    );

    res.json({
      ...localAdminUser,
      ...profile
    });
  } catch (error) {
    console.error('Supabase auth profile update route failed:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

app.post('/api/local/mtg/search', async (req, res) => {
  try {
    await ensureMtgSearchIndex();
    const { query = '', limit = 100 } = req.body || {};
    res.json(searchMtgIndex(query, limit));
  } catch (error) {
    console.error('MTG search route failed:', error);
    res.status(500).json({ error: 'MTG search failed' });
  }
});

app.post('/api/local/mtg/commanders/search', async (req, res) => {
  try {
    await ensureMtgCommanderEngine();
    const { query = '', colors = [], limit = 120, minDeckCount = 0 } = req.body || {};
    res.json(searchMtgCommanderEngine(query, colors, limit, minDeckCount));
  } catch (error) {
    console.error('MTG commander search route failed:', error);
    res.status(500).json({ error: 'MTG commander search failed' });
  }
});

app.get('/api/local/mtg/commanders/:oracleId', async (req, res) => {
  try {
    await ensureMtgCommanderEngine();
    const payload = getMtgCommanderPage(req.params.oracleId, {
      theme: req.query.theme || '',
      mode: req.query.mode || 'commander'
    });
    if (!payload) {
      res.status(404).json({ error: 'Commander not found' });
      return;
    }
    res.json(payload);
  } catch (error) {
    console.error('MTG commander page route failed:', error);
    res.status(500).json({ error: 'MTG commander page failed' });
  }
});

app.post('/api/local/mtg/commanders/import-text', async (req, res) => {
  try {
    const { text = '', deckName = '', sourceUrl = '', refresh = false } = req.body || {};
    const result = await importCommanderDeckText(text, {
      deckName: String(deckName || '').trim() || 'Manual deck paste',
      sourceUrl: String(sourceUrl || '').trim() || null,
      label: String(deckName || '').trim() || 'Manual deck paste'
    });
    if (refresh) {
      await refreshMtgCommanderEngine();
    }
    res.json({
      ok: true,
      refreshed: Boolean(refresh),
      ...result
    });
  } catch (error) {
    console.error('MTG commander import-text route failed:', error);
    res.status(400).json({ error: error.message || 'Commander deck import failed' });
  }
});

app.post('/api/local/mtg/commanders/rebuild', async (_req, res) => {
  try {
    await refreshMtgCommanderEngine();
    res.json({ ok: true });
  } catch (error) {
    console.error('MTG commander rebuild route failed:', error);
    res.status(500).json({ error: 'Commander rebuild failed' });
  }
});

app.post('/api/local/mtg/commanders/simulate', async (req, res) => {
  try {
    await ensureMtgCommanderEngine();
    const deck = req.body?.deck || null;
    if (!deck || !Array.isArray(deck.items)) {
      res.status(400).json({ error: 'Deck payload is required for simulation' });
      return;
    }
    res.json(simulateMtgDeckGauntlet(deck));
  } catch (error) {
    console.error('MTG commander simulate route failed:', error);
    res.status(500).json({ error: error.message || 'Commander simulation failed' });
  }
});

app.post('/api/local/pokemon/search', async (req, res) => {
  try {
    await ensurePokemonSearchIndex();
    const { query = '', limit = 100 } = req.body || {};
    res.json(searchPokemonIndex(query, limit));
  } catch (error) {
    console.error('Pokemon search route failed:', error);
    res.status(500).json({ error: 'Pokemon search failed' });
  }
});

app.post('/api/local/fab/search', async (req, res) => {
  try {
    await ensureFabSearchIndex();
    const { query = '', limit = 100 } = req.body || {};
    res.json(searchFabIndex(query, limit));
  } catch (error) {
    console.error('FAB search route failed:', error);
    res.status(500).json({ error: 'FAB search failed' });
  }
});

app.post('/api/local/lorcana/search', async (req, res) => {
  try {
    await ensureLorcanaSearchIndex();
    const { query = '', limit = 100 } = req.body || {};
    res.json(searchLorcanaIndex(query, limit));
  } catch (error) {
    console.error('Lorcana search route failed:', error);
    res.status(500).json({ error: 'Lorcana search failed' });
  }
});

app.post('/api/local/onepiece/search', async (req, res) => {
  try {
    await ensureOnePieceSearchIndex();
    const { query = '', limit = 100 } = req.body || {};
    res.json(searchOnePieceIndex(query, limit));
  } catch (error) {
    console.error('One Piece search route failed:', error);
    res.status(500).json({ error: 'One Piece search failed' });
  }
});

app.post('/api/local/yugioh/search', async (req, res) => {
  try {
    await ensureYugiohSearchIndex();
    const { query = '', limit = 100 } = req.body || {};
    res.json(searchYugiohIndex(query, limit));
  } catch (error) {
    console.error('Yu-Gi-Oh search route failed:', error);
    res.status(500).json({ error: 'Yu-Gi-Oh search failed' });
  }
});

app.post('/api/local/starwars/search', async (req, res) => {
  try {
    await ensureStarWarsSearchIndex();
    const { query = '', limit = 100 } = req.body || {};
    res.json(searchStarWarsIndex(query, limit));
  } catch (error) {
    console.error('Star Wars search route failed:', error);
    res.status(500).json({ error: 'Star Wars search failed' });
  }
});

app.get('/api/local/mtg/printings/:oracleId', async (req, res) => {
  try {
    const rows = await loadDetailedMtgPrintingsByOracleId(req.params.oracleId);
    res.json(rows);
  } catch (error) {
    console.error('MTG printings route failed:', error);
    res.status(500).json({ error: 'MTG printings lookup failed' });
  }
});

app.post('/api/local/auth/logout', (_req, res) => {
  res.json({ success: true });
});

app.post('/api/local/auth/redirect-to-login', (_req, res) => {
  res.json({ success: true });
});

app.post('/api/local/files/upload', (req, res) => {
  try {
    const { filename = 'avatar', data = '' } = req.body || {};
    const { mimeType, buffer } = decodeBase64Upload(data);
    const extension = path.extname(String(filename || '')).toLowerCase() || fileExtensionFromMime(mimeType);
    const safeBase = path
      .basename(String(filename || 'avatar'), path.extname(String(filename || 'avatar')))
      .replace(/[^a-z0-9_-]+/gi, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'avatar';

    const storedName = `${Date.now()}-${safeBase}${extension}`;
    const storagePath = `uploads/avatars/${storedName}`;

    if (isSupabaseStorageConfigured()) {
      uploadSupabasePublicFile(storagePath, buffer, mimeType)
        .then(({ file_url }) => {
          res.json({
            file_url,
            mime_type: mimeType,
            size: buffer.length,
            storage: 'supabase'
          });
        })
        .catch((error) => {
          console.error('Supabase file upload failed:', error);
          res.status(500).json({ error: 'Supabase file upload failed' });
        });
      return;
    }

    const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'avatars');
    ensureDir(uploadDir);

    const diskPath = path.join(uploadDir, storedName);
    fs.writeFileSync(diskPath, buffer);

    res.json({
      file_url: `/uploads/avatars/${storedName}`,
      mime_type: mimeType,
      size: buffer.length,
      storage: 'local'
    });
  } catch (error) {
    console.error('Local file upload failed:', error);
    res.status(500).json({ error: 'Local file upload failed' });
  }
});

app.post('/api/local/actions/:name', async (req, res) => {
  const actionName = String(req.params.name || '').trim();
  const payload = req.body || {};

  try {
    if (actionName === 'searchPokemonCards') {
      await ensurePokemonSearchIndex();

      const query = String(payload.query || '').trim();
      const skip = Math.max(0, Number(payload.skip) || 0);
      const requestedLimit = Number(payload.pageSize ?? payload.limit) || 50;
      const safeLimit = Math.max(1, Math.min(requestedLimit, 100));
      const rows = query
        ? searchPokemonIndex(query, Math.min(skip + safeLimit, 500)).slice(skip, skip + safeLimit)
        : [];

      res.json({
        data: {
          data: rows.map(buildLegacyPokemonActionRow)
        }
      });
      return;
    }

    if (actionName === 'sendProductRequest') {
      const customerEmail = String(payload.customerEmail || '').trim().toLowerCase();
      if (!matchesEmail(customerEmail)) {
        res.status(400).send('A valid customer email is required.');
        return;
      }

      const record = createEntity('ProductRequest', {
        customer_email: customerEmail,
        product_name: String(payload.productName || '').trim(),
        set_name: String(payload.setName || '').trim(),
        card_number: String(payload.cardNumber || '').trim(),
        rarity: String(payload.rarity || '').trim(),
        request_type: String(payload.requestType || 'product').trim(),
        status: 'open'
      });

      res.json({
        data: {
          success: true,
          id: record.id
        }
      });
      return;
    }

    if (actionName === 'getOrderStatus') {
      const orderNumber = String(payload.order_number || '').trim();
      const customerEmail = String(payload.email || '').trim().toLowerCase();

      if (!orderNumber) {
        res.status(400).send('Order number is required.');
        return;
      }

      const order = findOrderByNumber(orderNumber, customerEmail);
      if (!order) {
        res.json({
          data: {
            error: customerEmail
              ? 'Order not found for that order number and email.'
              : 'Order not found.'
          }
        });
        return;
      }

      res.json({
        data: {
          order,
          tracking: buildTrackingPayload(order)
        }
      });
      return;
    }

    if (actionName === 'getShippingRates') {
      const destinationZip = String(payload.destinationZip || '').trim();
      if (destinationZip && !/^\d{5}$/.test(destinationZip)) {
        res.status(400).send('A valid 5-digit ZIP code is required.');
        return;
      }

      const uspsRates = destinationZip ? await getUSPSRates(destinationZip, payload.weightOz) : [];
      if (uspsRates.length > 0) {
        res.json({
          data: {
            rates: uspsRates,
            fallback: false
          }
        });
        return;
      }

      res.json({
        data: {
          rates: [
            {
              id: 'usps_ground_advantage',
              name: 'USPS Ground Advantage',
              price: 5.99,
              days: '3-7 business days'
            },
            {
              id: 'priority',
              name: 'Priority Mail',
              price: 12.99,
              days: '1-3 business days'
            },
            {
              id: 'express',
              name: 'Priority Mail Express',
              price: 29.99,
              days: '1-2 business days'
            }
          ],
          fallback: true
        }
      });
      return;
    }

    if (actionName === 'createCheckout') {
      const stripe = getStripeClient();
      if (!stripe) {
        res.status(500).send('STRIPE_SECRET_KEY is not configured for the local backend.');
        return;
      }

      const cartItems = Array.isArray(payload.cartItems) ? payload.cartItems.map(normalizeCartItem) : [];
      const shippingInfo = normalizeShippingInfo(payload.shippingInfo);
      validateCheckoutPayload(cartItems, shippingInfo);

      const shippingCost = roundMoney(Math.max(Number(payload.shippingCost) || 0, 0));
      const lineItems = cartItems.map((item) => ({
        price_data: {
          currency: 'usd',
          product_data: {
            name: item.card_name,
            images: item.card_image ? [item.card_image] : []
          },
          unit_amount: Math.round(item.price * 100)
        },
        quantity: item.quantity
      }));

      if (shippingCost > 0) {
        lineItems.push({
          price_data: {
            currency: 'usd',
            product_data: {
              name: 'Shipping'
            },
            unit_amount: Math.round(shippingCost * 100)
          },
          quantity: 1
        });
      }

      const publicAppUrl = String(getEnvValue('PUBLIC_APP_URL') || '').trim().replace(/\/+$/, '');
      const origin = publicAppUrl || req.headers.origin || `http://${req.headers.host || '127.0.0.1:5173'}`;
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: lineItems,
        mode: 'payment',
        success_url: `${origin}/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/checkout`,
        customer_email: shippingInfo.email,
        metadata: {
          shipping_info: JSON.stringify(shippingInfo),
          cart_items: JSON.stringify(cartItems),
          user_email: String(payload.userEmail || shippingInfo.email || '').trim().toLowerCase()
        }
      });

      res.json({
        data: {
          url: session.url
        }
      });
      return;
    }

    if (actionName === 'finalizeCheckoutSession') {
      const stripe = getStripeClient();
      if (!stripe) {
        res.status(500).send('STRIPE_SECRET_KEY is not configured for the local backend.');
        return;
      }

      const sessionId = String(payload.session_id || '').trim();
      if (!sessionId) {
        res.status(400).send('session_id is required.');
        return;
      }

      const existingOrder = isSupabaseEntityStoreConfigured()
        ? ((await filterSupabaseEntityRecords('Order', { stripe_session_id: sessionId }, { limit: 1 }))[0] || null)
        : (filterEntities('Order', { stripe_session_id: sessionId }, { limit: 1 })[0] || null);
      if (existingOrder) {
        res.json({
          data: {
            order: existingOrder,
            alreadyFinalized: true
          }
        });
        return;
      }

      const session = await stripe.checkout.sessions.retrieve(sessionId);
      if (!session || session.payment_status !== 'paid') {
        res.status(400).send('Stripe session is not paid yet.');
        return;
      }

      const orderPayload = buildOrderFromCheckoutSession(session);
      const order = isSupabaseEntityStoreConfigured()
        ? await createSupabaseEntityRecord('Order', orderPayload)
        : createEntity('Order', orderPayload);
      decrementInventoryForOrder(order);

      let email = null;
      try {
        email = await sendOrderConfirmationEmail(order);
      } catch (emailError) {
        console.warn('Order confirmation email failed:', emailError?.message || emailError);
      }

      res.json({
        data: {
          order,
          alreadyFinalized: false,
          email
        }
      });
      return;
    }

    res.status(501).send(`Local backend action "${actionName}" is not implemented.`);
  } catch (error) {
    console.error(`Local action "${actionName}" failed:`, error);
    res.status(500).send(error.message || `Local action "${actionName}" failed.`);
  }
});

app.get('/api/local/entities/:entity/list', (req, res) => {
  const entityName = normalizeEntityName(req.params.entity);
  const { sort = '-created_date', limit, skip } = req.query;

  if (entityName === 'CardList' && isSupabaseDeckBridgeConfigured()) {
    listSupabaseCardLists({}, String(sort), limit ? Number(limit) : undefined, skip ? Number(skip) : 0)
      .then((rows) => res.json(rows))
      .catch((error) => {
        console.error('Supabase CardList list route failed:', error);
        res.status(500).json({ error: error.message || 'Supabase CardList list failed' });
      });
    return;
  }

  if (entityName === 'ForumPost' && isSupabaseForumBridgeConfigured()) {
    listSupabaseForumPosts({}, String(sort), limit ? Number(limit) : undefined, skip ? Number(skip) : 0)
      .then((rows) => res.json(rows))
      .catch((error) => {
        console.error('Supabase ForumPost list route failed:', error);
        res.status(500).json({ error: error.message || 'Supabase ForumPost list failed' });
      });
    return;
  }

  if (entityName === 'ForumReply' && isSupabaseForumBridgeConfigured()) {
    listSupabaseForumReplies({}, String(sort), limit ? Number(limit) : undefined, skip ? Number(skip) : 0)
      .then((rows) => res.json(rows))
      .catch((error) => {
        console.error('Supabase ForumReply list route failed:', error);
        res.status(500).json({ error: error.message || 'Supabase ForumReply list failed' });
      });
    return;
  }

  if (isSupabaseEntityStoreConfigured()) {
    listSupabaseEntityRecords(entityName, {
      sort: String(sort),
      limit: limit ? Number(limit) : undefined,
      skip: skip ? Number(skip) : 0
    })
      .then((rows) => res.json(rows))
      .catch((error) => {
        console.error(`Supabase ${entityName} list route failed:`, error);
        res.status(500).json({ error: error.message || `Supabase ${entityName} list failed` });
      });
    return;
  }

  const rows = listEntities(entityName, {
    sort: String(sort),
    limit: limit ? Number(limit) : undefined,
    skip: skip ? Number(skip) : 0
  });

  res.json(rows);
});

app.post('/api/local/entities/:entity/filter', (req, res) => {
  const entityName = normalizeEntityName(req.params.entity);
  const { filter = {}, sort = '-created_date', limit, skip } = req.body || {};

  if (entityName === 'CardList' && isSupabaseDeckBridgeConfigured()) {
    listSupabaseCardLists(filter, sort, limit, skip)
      .then((rows) => res.json(rows))
      .catch((error) => {
        console.error('Supabase CardList filter route failed:', error);
        res.status(500).json({ error: error.message || 'Supabase CardList filter failed' });
      });
    return;
  }

  if (entityName === 'ForumPost' && isSupabaseForumBridgeConfigured()) {
    listSupabaseForumPosts(filter, sort, limit, skip)
      .then((rows) => res.json(rows))
      .catch((error) => {
        console.error('Supabase ForumPost filter route failed:', error);
        res.status(500).json({ error: error.message || 'Supabase ForumPost filter failed' });
      });
    return;
  }

  if (entityName === 'ForumReply' && isSupabaseForumBridgeConfigured()) {
    listSupabaseForumReplies(filter, sort, limit, skip)
      .then((rows) => res.json(rows))
      .catch((error) => {
        console.error('Supabase ForumReply filter route failed:', error);
        res.status(500).json({ error: error.message || 'Supabase ForumReply filter failed' });
      });
    return;
  }

  if (isSupabaseEntityStoreConfigured()) {
    filterSupabaseEntityRecords(entityName, filter, { sort, limit, skip })
      .then((rows) => res.json(rows))
      .catch((error) => {
        console.error(`Supabase ${entityName} filter route failed:`, error);
        res.status(500).json({ error: error.message || `Supabase ${entityName} filter failed` });
      });
    return;
  }

  const rows = filterEntities(entityName, filter, {
    sort,
    limit,
    skip
  });

  res.json(rows);
});

app.post('/api/local/mtg/advanced-search', async (req, res) => {
  try {
    await ensureMtgSearchIndex();
    const { filters = {}, limit = 100, page = 0 } = req.body || {};
    res.json(searchMtgAdvancedIndex(filters, page, limit));
  } catch (error) {
    console.error('MTG advanced search route failed:', error);
    res.status(500).json({ error: 'MTG advanced search failed' });
  }
});

app.post('/api/local/pokemon/advanced-search', async (req, res) => {
  try {
    await ensurePokemonSearchIndex();
    const { filters = {}, limit = 100, page = 0 } = req.body || {};
    res.json(searchPokemonAdvancedIndex(filters, page, limit));
  } catch (error) {
    console.error('Pokemon advanced search route failed:', error);
    res.status(500).json({ error: 'Pokemon advanced search failed' });
  }
});

app.post('/api/local/fab/advanced-search', async (req, res) => {
  try {
    await ensureFabSearchIndex();
    const { filters = {}, limit = 100, page = 0 } = req.body || {};
    res.json(searchFabAdvancedIndex(filters, page, limit));
  } catch (error) {
    console.error('FAB advanced search route failed:', error);
    res.status(500).json({ error: 'FAB advanced search failed' });
  }
});

app.post('/api/local/lorcana/advanced-search', async (req, res) => {
  try {
    await ensureLorcanaSearchIndex();
    const { filters = {}, limit = 100, page = 0 } = req.body || {};
    res.json(searchLorcanaAdvancedIndex(filters, page, limit));
  } catch (error) {
    console.error('Lorcana advanced search route failed:', error);
    res.status(500).json({ error: 'Lorcana advanced search failed' });
  }
});

app.post('/api/local/onepiece/advanced-search', async (req, res) => {
  try {
    await ensureOnePieceSearchIndex();
    const { filters = {}, limit = 100, page = 0 } = req.body || {};
    res.json(searchOnePieceAdvancedIndex(filters, page, limit));
  } catch (error) {
    console.error('One Piece advanced search route failed:', error);
    res.status(500).json({ error: 'One Piece advanced search failed' });
  }
});

app.post('/api/local/yugioh/advanced-search', async (req, res) => {
  try {
    await ensureYugiohSearchIndex();
    const { filters = {}, limit = 100, page = 0 } = req.body || {};
    res.json(searchYugiohAdvancedIndex(filters, page, limit));
  } catch (error) {
    console.error('Yu-Gi-Oh advanced search route failed:', error);
    res.status(500).json({ error: 'Yu-Gi-Oh advanced search failed' });
  }
});

app.post('/api/local/starwars/advanced-search', async (req, res) => {
  try {
    await ensureStarWarsSearchIndex();
    const { filters = {}, limit = 100, page = 0 } = req.body || {};
    res.json(searchStarWarsAdvancedIndex(filters, page, limit));
  } catch (error) {
    console.error('Star Wars advanced search route failed:', error);
    res.status(500).json({ error: 'Star Wars advanced search failed' });
  }
});

app.get('/api/local/entities/:entity/:id', (req, res) => {
  const entityName = normalizeEntityName(req.params.entity);

  if (entityName === 'CardList' && isSupabaseDeckBridgeConfigured()) {
    getSupabaseCardListById(req.params.id)
      .then((row) => {
        if (!row) {
          res.status(404).json({ error: 'Not found' });
          return;
        }
        res.json(row);
      })
      .catch((error) => {
        console.error('Supabase CardList get route failed:', error);
        res.status(500).json({ error: error.message || 'Supabase CardList get failed' });
      });
    return;
  }

  if (entityName === 'ForumPost' && isSupabaseForumBridgeConfigured()) {
    getSupabaseForumPostById(req.params.id)
      .then((row) => {
        if (!row) {
          res.status(404).json({ error: 'Not found' });
          return;
        }
        res.json(row);
      })
      .catch((error) => {
        console.error('Supabase ForumPost get route failed:', error);
        res.status(500).json({ error: error.message || 'Supabase ForumPost get failed' });
      });
    return;
  }

  if (isSupabaseEntityStoreConfigured()) {
    getSupabaseEntityRecordById(entityName, req.params.id)
      .then((row) => {
        if (!row) {
          res.status(404).json({ error: 'Not found' });
          return;
        }
        res.json(row);
      })
      .catch((error) => {
        console.error(`Supabase ${entityName} get route failed:`, error);
        res.status(500).json({ error: error.message || `Supabase ${entityName} get failed` });
      });
    return;
  }

  const row = getEntityById(entityName, req.params.id);

  if (!row) {
    res.status(404).json({ error: 'Not found' });
    return;
  }

  res.json(row);
});

app.post('/api/local/entities/:entity', (req, res) => {
  const entityName = normalizeEntityName(req.params.entity);

  if (entityName === 'CardList' && isSupabaseDeckBridgeConfigured()) {
    createSupabaseCardList(req.body || {})
      .then((row) => res.status(201).json(row))
      .catch((error) => {
        console.error('Supabase CardList create route failed:', error);
        res.status(500).json({ error: error.message || 'Supabase CardList create failed' });
      });
    return;
  }

  if (entityName === 'ForumPost' && isSupabaseForumBridgeConfigured()) {
    createSupabaseForumPost(req.body || {})
      .then((row) => res.status(201).json(row))
      .catch((error) => {
        console.error('Supabase ForumPost create route failed:', error);
        res.status(500).json({ error: error.message || 'Supabase ForumPost create failed' });
      });
    return;
  }

  if (entityName === 'ForumReply' && isSupabaseForumBridgeConfigured()) {
    createSupabaseForumReply(req.body || {})
      .then((row) => res.status(201).json(row))
      .catch((error) => {
        console.error('Supabase ForumReply create route failed:', error);
        res.status(500).json({ error: error.message || 'Supabase ForumReply create failed' });
      });
    return;
  }

  if (isSupabaseEntityStoreConfigured()) {
    createSupabaseEntityRecord(entityName, req.body || {})
      .then((row) => res.status(201).json(row))
      .catch((error) => {
        console.error(`Supabase ${entityName} create route failed:`, error);
        res.status(500).json({ error: error.message || `Supabase ${entityName} create failed` });
      });
    return;
  }

  const row = createEntity(entityName, req.body || {});
  res.status(201).json(row);
});

app.patch('/api/local/entities/:entity/:id', (req, res) => {
  const entityName = normalizeEntityName(req.params.entity);

  if (entityName === 'CardList' && isSupabaseDeckBridgeConfigured()) {
    updateSupabaseCardList(req.params.id, req.body || {})
      .then((row) => res.json(row))
      .catch((error) => {
        console.error('Supabase CardList update route failed:', error);
        const status = /not found/i.test(error.message || '') ? 404 : 500;
        res.status(status).json({ error: error.message || 'Supabase CardList update failed' });
      });
    return;
  }

  if (entityName === 'ForumPost' && isSupabaseForumBridgeConfigured()) {
    updateSupabaseForumPost(req.params.id, req.body || {})
      .then((row) => res.json(row))
      .catch((error) => {
        console.error('Supabase ForumPost update route failed:', error);
        const status = /not found/i.test(error.message || '') ? 404 : 500;
        res.status(status).json({ error: error.message || 'Supabase ForumPost update failed' });
      });
    return;
  }

  if (entityName === 'ForumReply' && isSupabaseForumBridgeConfigured()) {
    updateSupabaseForumReply(req.params.id, req.body || {})
      .then((row) => res.json(row))
      .catch((error) => {
        console.error('Supabase ForumReply update route failed:', error);
        const status = /not found/i.test(error.message || '') ? 404 : 500;
        res.status(status).json({ error: error.message || 'Supabase ForumReply update failed' });
      });
    return;
  }

  if (isSupabaseEntityStoreConfigured()) {
    updateSupabaseEntityRecord(entityName, req.params.id, req.body || {})
      .then((row) => res.json(row))
      .catch((error) => {
        console.error(`Supabase ${entityName} update route failed:`, error);
        const status = /not found/i.test(error.message || '') ? 404 : 500;
        res.status(status).json({ error: error.message || `Supabase ${entityName} update failed` });
      });
    return;
  }

  try {
    const row = updateEntity(entityName, req.params.id, req.body || {});
    res.json(row);
  } catch (error) {
    res.status(404).json({ error: error.message });
  }
});

app.delete('/api/local/entities/:entity/:id', (req, res) => {
  const entityName = normalizeEntityName(req.params.entity);

  if (entityName === 'CardList' && isSupabaseDeckBridgeConfigured()) {
    deleteSupabaseCardList(req.params.id)
      .then((result) => res.json(result))
      .catch((error) => {
        console.error('Supabase CardList delete route failed:', error);
        res.status(500).json({ error: error.message || 'Supabase CardList delete failed' });
      });
    return;
  }

  if (entityName === 'ForumPost' && isSupabaseForumBridgeConfigured()) {
    deleteSupabaseForumPost(req.params.id)
      .then((result) => res.json(result))
      .catch((error) => {
        console.error('Supabase ForumPost delete route failed:', error);
        res.status(500).json({ error: error.message || 'Supabase ForumPost delete failed' });
      });
    return;
  }

  if (entityName === 'ForumReply' && isSupabaseForumBridgeConfigured()) {
    deleteSupabaseForumReply(req.params.id)
      .then((result) => res.json(result))
      .catch((error) => {
        console.error('Supabase ForumReply delete route failed:', error);
        res.status(500).json({ error: error.message || 'Supabase ForumReply delete failed' });
      });
    return;
  }

  if (isSupabaseEntityStoreConfigured()) {
    deleteSupabaseEntityRecord(entityName, req.params.id)
      .then((result) => res.json(result))
      .catch((error) => {
        console.error(`Supabase ${entityName} delete route failed:`, error);
        res.status(500).json({ error: error.message || `Supabase ${entityName} delete failed` });
      });
    return;
  }

  res.json(deleteEntity(entityName, req.params.id));
});

app.listen(port, host, () => {
  console.log(`Local API listening on http://${host}:${port}`);
});
