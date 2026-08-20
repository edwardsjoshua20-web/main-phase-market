import { backend } from '@/services/backend';

export const SHIPPING_FULFILLMENT_ENTITY = 'ShippingFulfillmentConfig';
export const SHIPPING_FULFILLMENT_CONFIG_ID = 'shipping-fulfillment-config-v1';

export const DEFAULT_SHIPPING_FULFILLMENT_CONFIG = {
  id: SHIPPING_FULFILLMENT_CONFIG_ID,
  version: 1,
  updatedBy: null,
  supplyNotes: 'Sleeves are already owned in large quantity. BCW 3x4 top loaders: 100 on hand.',
  shippingTiers: [
    {
      id: 'economy-letter',
      name: 'Economy Letter',
      customerCharge: 1.99,
      postageCost: 0.82,
      packagingCost: 0.18,
      handlingCost: 0.12,
      policy: '$1.99 S&H for cheap cards. LetterTrack is optional, not true package tracking.',
    },
    {
      id: 'protected-letter',
      name: 'Protected Letter',
      customerCharge: 2.49,
      postageCost: 1.11,
      packagingCost: 0.38,
      handlingCost: 0.18,
      policy: '$2.49–$2.99 S&H when the card needs more rigid protection.',
    },
    {
      id: 'tracked-package',
      name: 'Tracked Package',
      customerCharge: 4.99,
      postageCost: 4.25,
      packagingCost: 0.55,
      handlingCost: 0.35,
      policy: 'Use for orders that need real USPS package tracking.',
    },
    {
      id: 'high-value',
      name: 'High Value',
      customerCharge: 7.99,
      postageCost: 5.65,
      packagingCost: 0.95,
      handlingCost: 0.65,
      policy: 'Use for high-value orders requiring sturdier packaging and safer handling.',
    },
  ],
  letterTrack: {
    cost: 0.32,
    customerAddOn: 0.49,
    note: 'LetterTrack starter-tier cost is $0.32 per transaction. The $0.49 customer add-on is the configured business charge, not the supplier cost.',
  },
  paymentFee: {
    percent: 2.9,
    fixed: 0.3,
  },
  breakEven: {
    startupSupplyCost: 85,
    averageCardSale: 3,
    averageShippingCharge: 1.99,
    averageFulfillmentCost: 1.08,
    averageCardsPerOrder: 1,
  },
  promotionNote: 'Placeholder only: Spend $20 on eligible singles → $2 low-value-card credit. Do not wire checkout yet.',
  supplies: [
    {
      id: 'team-bags',
      name: 'Card Capsule Standard Size Team Bags',
      category: 'Packaging',
      imageUrl: 'https://cardcapsule.com/cdn/shop/files/TeamBags1.jpg?v=1761599679',
      sourceName: 'Card Capsule',
      sourceUrl: 'https://cardcapsule.com/products/standard-size-team-bags',
      expectedPurchasePrice: 2.59,
      packQuantity: 100,
      quantityOnHand: 0,
      lowStockThreshold: 25,
      notes: '100-count resealable team bags for protecting singles inside letter/package mailers.',
    },
    {
      id: 'plain-envelopes',
      name: 'Staples Gummed #6 3/4 Business Envelopes',
      category: 'Packaging',
      imageUrl: 'https://i5.walmartimages.com/asr/72c2e14d-ba8e-4c71-b2ea-03d2005fe872.723e5fab1da96932979777bd562f4c64.jpeg?odnBg=FFFFFF&odnHeight=768&odnWidth=768',
      sourceName: 'Walmart / Staples',
      sourceUrl: 'https://www.walmart.com/ip/2842957623',
      expectedPurchasePrice: 25.15,
      packQuantity: 1000,
      quantityOnHand: 0,
      lowStockThreshold: 30,
      notes: 'Preferred bulk #6 3/4 white business envelope listing; sold as 1000/carton.',
    },
    {
      id: 'thermal-labels',
      name: 'MUNBYN 2x1 white thermal address labels',
      category: 'Labels',
      imageUrl: 'https://munbyn.com/cdn/shop/files/ITL-21-PT-WH.jpg?v=1770877523',
      sourceName: 'MUNBYN',
      sourceUrl: 'https://munbyn.com/products/munbyn-white-2x1-inch-thermal-sticker-labels-1000-labels-1-roll',
      expectedPurchasePrice: 9.99,
      packQuantity: 1000,
      quantityOnHand: 0,
      lowStockThreshold: 75,
      notes: '2x1 direct thermal address/barcode labels; no ink required.',
    },
    {
      id: 'package-labels-4x6',
      name: 'DuraFast 4x6 direct thermal package labels',
      category: 'Labels',
      imageUrl: 'https://cdn11.bigcommerce.com/s-971xibeh/products/4060/images/25658/137598__85743.1759773345.500.750.jpg?c=2',
      sourceName: 'DuraFast Label Company',
      sourceUrl: 'https://www.durafastlabel.com/labels-direct-thermal/direct-thermal-4-x-6-labels-500-roll-1-core-5-od/',
      expectedPurchasePrice: 9,
      packQuantity: 500,
      quantityOnHand: 0,
      lowStockThreshold: 75,
      notes: 'Direct 500-count 4x6 thermal package label roll; no ink required.',
    },
    {
      id: 'forever-stamps',
      name: 'USPS U.S. Flag 2026 Forever stamps',
      category: 'Postage',
      imageUrl: 'https://www.usps.com/ecp/asset/images/130104-L0.jpg',
      sourceName: 'USPS',
      sourceUrl: 'https://store.usps.com/store/product/buy-stamps/us-flag-2026-stamps-S_130104',
      expectedPurchasePrice: 16.4,
      packQuantity: 20,
      quantityOnHand: 0,
      lowStockThreshold: 20,
      notes: 'Primary first-ounce stamp supply for letter shipments; current denomination is $0.82.',
    },
    {
      id: 'additional-ounce',
      name: 'USPS School Bus additional-ounce stamps',
      category: 'Postage',
      imageUrl: 'https://www.usps.com/ecp/asset/images/122404-L0.jpg',
      sourceName: 'USPS',
      sourceUrl: 'https://store.usps.com/store/product/school-bus-stamps-S_122404',
      expectedPurchasePrice: 5.8,
      packQuantity: 20,
      quantityOnHand: 0,
      lowStockThreshold: 20,
      notes: 'Use when a protected letter exceeds base letter assumptions; current denomination is $0.29.',
    },
    {
      id: 'lettertrack-credits',
      name: 'LetterTrack first-class mail tracking credits',
      category: 'Tracking add-on',
      imageUrl: 'https://dvow0vltefbxy.cloudfront.net/assets/landing/carriers/lettertrack-ae07f914d2fe9005fa03929154c0fcf1c7628113477dcc14f91cf3bb7decac25.png',
      sourceName: 'LetterTrack',
      sourceUrl: 'https://www.letter-track.com/pricing-firstclassmailtracking.html',
      expectedPurchasePrice: 16,
      packQuantity: 50,
      quantityOnHand: 0,
      lowStockThreshold: 25,
      notes: 'Starter tier: 50 transactions at $0.32 each. Optional customer add-on remains configured at $0.49.',
    },
    {
      id: 'bcw-top-loaders',
      name: 'BCW 3x4 Topload Card Holder - Standard (100 CT. Pack)',
      category: 'Protection',
      imageUrl: 'https://i5.walmartimages.com/seo/BCW-3X4-TOPLOAD-CARD-HOLDER-STANDARD-100-CT-PACK_295245bd-1679-4091-b00e-8c0acfc1989f.a3a4b7d8137fbd28bfbd40d2b0fa3e00.jpeg',
      sourceName: 'BCW',
      sourceUrl: 'https://www.bcwsupplies.com/3x4-topload-card-holder-standard-100-ct-pack',
      expectedPurchasePrice: 14.99,
      packQuantity: 100,
      quantityOnHand: 100,
      lowStockThreshold: 25,
      notes: 'Existing on-hand count from launch setup preserved at 100.',
    },
    {
      id: 'knaon-y41bt',
      name: 'KNAON Y41BT Bluetooth Thermal Label Printer - White',
      category: 'Equipment',
      imageUrl: 'https://knaon.com/cdn/shop/files/knaon-y41bt-white-bluetooth-thermal-shipping-label-printer.jpg?v=1782877398',
      sourceName: 'KNAON',
      sourceUrl: 'https://knaon.com/products/y41bt-bluetooth-thermal-label-printer-white',
      expectedPurchasePrice: 43.9,
      packQuantity: 1,
      quantityOnHand: 0,
      lowStockThreshold: 1,
      notes: 'Recommended budget Bluetooth direct-thermal printer; no ink.',
    },
  ],
};

const deepClone = (value) => JSON.parse(JSON.stringify(value));

const toNumber = (value, fallback = 0) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const calculateSupplyUnitCost = (price, quantity) => {
  const safeQuantity = Math.max(1, toNumber(quantity, 1));
  return Number((toNumber(price, 0) / safeQuantity).toFixed(4));
};

const createId = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `supply-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const preferNonBlank = (value, fallback = '') => {
  const text = String(value ?? '').trim();
  return text || String(fallback ?? '');
};

const normalizeSupply = (supply = {}, defaultSupply = {}) => {
  const expectedPurchasePrice = toNumber(supply.expectedPurchasePrice, defaultSupply.expectedPurchasePrice || 0);
  const packQuantity = Math.max(1, toNumber(supply.packQuantity, defaultSupply.packQuantity || 1));
  return {
    id: String(supply.id || defaultSupply.id || supply.name || createId()),
    name: preferNonBlank(supply.name, defaultSupply.name || 'Unnamed supply'),
    category: preferNonBlank(supply.category, defaultSupply.category || 'Supply'),
    imageUrl: preferNonBlank(supply.imageUrl, defaultSupply.imageUrl),
    sourceName: preferNonBlank(supply.sourceName, defaultSupply.sourceName),
    sourceUrl: preferNonBlank(supply.sourceUrl, defaultSupply.sourceUrl),
    expectedPurchasePrice,
    packQuantity,
    unitCost: calculateSupplyUnitCost(expectedPurchasePrice, packQuantity),
    quantityOnHand: Math.max(0, toNumber(supply.quantityOnHand, defaultSupply.quantityOnHand || 0)),
    lowStockThreshold: Math.max(0, toNumber(supply.lowStockThreshold, defaultSupply.lowStockThreshold || 0)),
    notes: preferNonBlank(supply.notes, defaultSupply.notes),
  };
};

export function normalizeShippingFulfillmentConfig(config = {}) {
  const defaults = deepClone(DEFAULT_SHIPPING_FULFILLMENT_CONFIG);
  const defaultSupplyById = new Map(defaults.supplies.map((supply) => [supply.id, supply]));
  const configSupplies = Array.isArray(config.supplies) ? config.supplies : [];
  const configSupplyById = new Map(configSupplies.map((supply) => [supply?.id, supply]));
  const normalizedDefaultSupplies = defaults.supplies.map((defaultSupply) => normalizeSupply(
    configSupplyById.get(defaultSupply.id) || defaultSupply,
    defaultSupply,
  ));
  const normalizedCustomSupplies = configSupplies
    .filter((supply) => supply?.id && !defaultSupplyById.has(supply.id))
    .map((supply) => normalizeSupply(supply));
  return {
    ...defaults,
    ...config,
    id: SHIPPING_FULFILLMENT_CONFIG_ID,
    version: 1,
    supplies: [...normalizedDefaultSupplies, ...normalizedCustomSupplies],
    shippingTiers: Array.isArray(config.shippingTiers) && config.shippingTiers.length
      ? config.shippingTiers.map((tier) => ({
          ...tier,
          customerCharge: toNumber(tier.customerCharge, 0),
          postageCost: toNumber(tier.postageCost, 0),
          packagingCost: toNumber(tier.packagingCost, 0),
          handlingCost: toNumber(tier.handlingCost, 0),
        }))
      : defaults.shippingTiers,
    letterTrack: {
      ...defaults.letterTrack,
      ...(config.letterTrack || {}),
      cost: toNumber(config.letterTrack?.cost, defaults.letterTrack.cost),
      customerAddOn: toNumber(config.letterTrack?.customerAddOn, defaults.letterTrack.customerAddOn),
    },
    paymentFee: {
      ...defaults.paymentFee,
      ...(config.paymentFee || {}),
      percent: toNumber(config.paymentFee?.percent, defaults.paymentFee.percent),
      fixed: toNumber(config.paymentFee?.fixed, defaults.paymentFee.fixed),
    },
    breakEven: {
      ...defaults.breakEven,
      ...(config.breakEven || {}),
      startupSupplyCost: toNumber(config.breakEven?.startupSupplyCost, defaults.breakEven.startupSupplyCost),
      averageCardSale: toNumber(config.breakEven?.averageCardSale, defaults.breakEven.averageCardSale),
      averageShippingCharge: toNumber(config.breakEven?.averageShippingCharge, defaults.breakEven.averageShippingCharge),
      averageFulfillmentCost: toNumber(config.breakEven?.averageFulfillmentCost, defaults.breakEven.averageFulfillmentCost),
      averageCardsPerOrder: Math.max(1, toNumber(config.breakEven?.averageCardsPerOrder, defaults.breakEven.averageCardsPerOrder)),
    },
  };
}

export async function getShippingFulfillmentConfig() {
  const rows = await backend.data[SHIPPING_FULFILLMENT_ENTITY].filter({
    id: SHIPPING_FULFILLMENT_CONFIG_ID,
  });
  const existing = Array.isArray(rows) ? rows[0] : null;
  return {
    ...normalizeShippingFulfillmentConfig(existing || DEFAULT_SHIPPING_FULFILLMENT_CONFIG),
    _persisted: Boolean(existing),
  };
}

export async function saveShippingFulfillmentConfig(config, user = null) {
  const normalized = normalizeShippingFulfillmentConfig({
    ...config,
    updatedBy: user?.email || config?.updatedBy || null,
    updatedAt: new Date().toISOString(),
  });
  const existing = await getShippingFulfillmentConfig();
  if (existing._persisted) {
    return backend.data[SHIPPING_FULFILLMENT_ENTITY].update(SHIPPING_FULFILLMENT_CONFIG_ID, normalized);
  }
  return backend.data[SHIPPING_FULFILLMENT_ENTITY].create(normalized);
}
