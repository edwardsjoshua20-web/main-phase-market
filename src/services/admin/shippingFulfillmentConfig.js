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
      postageCost: 0.78,
      packagingCost: 0.18,
      handlingCost: 0.12,
      policy: '$1.99 S&H for cheap cards. LetterTrack is optional, not true package tracking.',
    },
    {
      id: 'protected-letter',
      name: 'Protected Letter',
      customerCharge: 2.49,
      postageCost: 1.02,
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
    note: 'LetterTrack is optional visibility for letters. It is not a replacement for true USPS package tracking.',
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
      name: 'Resealable team bags',
      category: 'Packaging',
      imageUrl: 'https://i5.walmartimages.com/seo/Max-Protection-Team-Bags-for-Trading-Cards-Resealable-3-3-8-x-4-1-4-Fits-25-Cards-or-120pt-Top-Loader-100ct-Acid-Free-Clear-Polypropylene_347ffae3-ea04-404f-990b-58918cd3bb7e.9252be653b3c07579ac64a8a11bcc2c1.jpeg?odnBg=FFFFFF&odnHeight=576&odnWidth=576',
      sourceName: 'Amazon',
      sourceUrl: 'https://www.amazon.com/s?k=resealable+team+bags+trading+cards',
      expectedPurchasePrice: 6.99,
      packQuantity: 100,
      quantityOnHand: 0,
      lowStockThreshold: 25,
      notes: 'Used to protect singles inside letter/package mailers.',
    },
    {
      id: 'plain-envelopes',
      name: 'Plain envelopes',
      category: 'Packaging',
      imageUrl: 'https://img.uline.com/is/image/uline/S-7801',
      sourceName: 'Amazon',
      sourceUrl: 'https://www.amazon.com/s?k=plain+white+envelopes',
      expectedPurchasePrice: 8.99,
      packQuantity: 100,
      quantityOnHand: 0,
      lowStockThreshold: 30,
      notes: 'Economy letter shipping base supply.',
    },
    {
      id: 'thermal-labels',
      name: '4x6 direct thermal labels',
      category: 'Labels',
      imageUrl: 'https://img.avery.com/web/products/labels/72782-04156-p04p',
      sourceName: 'Amazon',
      sourceUrl: 'https://www.amazon.com/s?k=4x6+direct+thermal+labels',
      expectedPurchasePrice: 12.99,
      packQuantity: 500,
      quantityOnHand: 0,
      lowStockThreshold: 75,
      notes: 'Direct thermal labels; no ink required.',
    },
    {
      id: 'forever-stamps',
      name: 'Forever stamps',
      category: 'Postage',
      imageUrl: 'https://www.usps.com/ecp/asset/images/130104-00_100x100.jpg',
      sourceName: 'USPS',
      sourceUrl: 'https://store.usps.com/store/results/stamps/_/N-9y93lv',
      expectedPurchasePrice: 14.6,
      packQuantity: 20,
      quantityOnHand: 0,
      lowStockThreshold: 20,
      notes: 'Primary stamp supply for letter shipments.',
    },
    {
      id: 'additional-ounce',
      name: 'Additional-ounce postage',
      category: 'Postage',
      imageUrl: 'https://www.usps.com/ecp/asset/images/122404-00_100x100.jpg',
      sourceName: 'USPS',
      sourceUrl: 'https://store.usps.com/store/results/stamps/_/N-9y93lv',
      expectedPurchasePrice: 5.6,
      packQuantity: 20,
      quantityOnHand: 0,
      lowStockThreshold: 20,
      notes: 'Use when a protected letter exceeds base letter assumptions.',
    },
    {
      id: 'lettertrack-credits',
      name: 'LetterTrack credits',
      category: 'Tracking add-on',
      imageUrl: 'https://dvow0vltefbxy.cloudfront.net/assets/landing/carriers/lettertrack-ae07f914d2fe9005fa03929154c0fcf1c7628113477dcc14f91cf3bb7decac25.png',
      sourceName: 'LetterTrack',
      sourceUrl: 'https://www.letter-track.com/',
      expectedPurchasePrice: 32,
      packQuantity: 100,
      quantityOnHand: 0,
      lowStockThreshold: 25,
      notes: 'Optional customer add-on. Not true USPS package tracking.',
    },
    {
      id: 'bcw-top-loaders',
      name: 'BCW 3x4 top loaders',
      category: 'Protection',
      imageUrl: 'https://i5.walmartimages.com/seo/BCW-3X4-TOPLOAD-CARD-HOLDER-STANDARD-100-CT-PACK_295245bd-1679-4091-b00e-8c0acfc1989f.a3a4b7d8137fbd28bfbd40d2b0fa3e00.jpeg',
      sourceName: 'BCW',
      sourceUrl: 'https://www.bcwsupplies.com/',
      expectedPurchasePrice: 7.99,
      packQuantity: 100,
      quantityOnHand: 100,
      lowStockThreshold: 25,
      notes: 'Existing on-hand count from launch setup.',
    },
    {
      id: 'knaon-y41bt',
      name: 'KNAON Y41BT thermal printer',
      category: 'Equipment',
      imageUrl: 'https://knaon.com/cdn/shop/files/knaon-y41bt-white-bluetooth-usb-c-thermal-label-printer-desktop.jpg?v=1783572759&width=1600',
      sourceName: 'Amazon',
      sourceUrl: 'https://www.amazon.com/s?k=KNAON+Y41BT+thermal+printer',
      expectedPurchasePrice: 79.99,
      packQuantity: 1,
      quantityOnHand: 0,
      lowStockThreshold: 1,
      notes: 'Recommended budget direct-thermal printer; no ink.',
    },
  ],
};

const deepClone = (value) => JSON.parse(JSON.stringify(value));

const toNumber = (value, fallback = 0) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const createId = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `supply-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const preferNonBlank = (value, fallback = '') => {
  const text = String(value ?? '').trim();
  return text || String(fallback ?? '');
};

const normalizeSupply = (supply = {}, defaultSupply = {}) => ({
  id: String(supply.id || defaultSupply.id || supply.name || createId()),
  name: preferNonBlank(supply.name, defaultSupply.name || 'Unnamed supply'),
  category: preferNonBlank(supply.category, defaultSupply.category || 'Supply'),
  imageUrl: preferNonBlank(supply.imageUrl, defaultSupply.imageUrl),
  sourceName: preferNonBlank(supply.sourceName, defaultSupply.sourceName),
  sourceUrl: preferNonBlank(supply.sourceUrl, defaultSupply.sourceUrl),
  expectedPurchasePrice: toNumber(supply.expectedPurchasePrice, defaultSupply.expectedPurchasePrice || 0),
  packQuantity: Math.max(1, toNumber(supply.packQuantity, defaultSupply.packQuantity || 1)),
  quantityOnHand: Math.max(0, toNumber(supply.quantityOnHand, defaultSupply.quantityOnHand || 0)),
  lowStockThreshold: Math.max(0, toNumber(supply.lowStockThreshold, defaultSupply.lowStockThreshold || 0)),
  notes: preferNonBlank(supply.notes, defaultSupply.notes),
});

export function normalizeShippingFulfillmentConfig(config = {}) {
  const defaults = deepClone(DEFAULT_SHIPPING_FULFILLMENT_CONFIG);
  const defaultSupplyById = new Map(defaults.supplies.map((supply) => [supply.id, supply]));
  return {
    ...defaults,
    ...config,
    id: SHIPPING_FULFILLMENT_CONFIG_ID,
    version: 1,
    supplies: Array.isArray(config.supplies)
      ? config.supplies.map((supply) => normalizeSupply(supply, defaultSupplyById.get(supply?.id) || {}))
      : defaults.supplies,
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
