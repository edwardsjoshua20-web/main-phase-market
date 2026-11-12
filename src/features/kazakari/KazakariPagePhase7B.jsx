import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Bell, Camera, Check, ChevronDown, ChevronUp, Download, Flame, History, ImageOff,
  Loader2, LockKeyhole, Menu, PackageSearch, Plus, RefreshCw, Search, ShieldCheck,
  SlidersHorizontal, Smartphone, Tag, Trash2, X,
} from 'lucide-react';
import { useAppAuth } from '@/lib/AppAuthContext';
import { kazakariApi } from './kazakariApi';
import './kazakari-phase7b.css';

const money = (value) => value == null ? 'Not available' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
const titleCase = (value) => String(value || 'unknown').replaceAll('-', ' ').replace(/\b\w/g, (character) => character.toUpperCase());
const savings = (product) => product.regularPrice != null && product.currentPrice != null && product.regularPrice > product.currentPrice ? Number((product.regularPrice - product.currentPrice).toFixed(2)) : null;
const observedAt = (product) => Number.isFinite(Date.parse(product.observedAt)) ? Date.parse(product.observedAt) : 0;
const dataQuality = (product) => [product.productName, product.imageUrl, product.currentPrice != null, product.discountPercent != null, product.regularPrice != null].filter(Boolean).length;
const hotDealComparator = (left, right) => {
  const comparisons = [
    Number(right.currentPrice === .01) - Number(left.currentPrice === .01),
    (right.discountPercent ?? -1) - (left.discountPercent ?? -1),
    (savings(right) ?? -1) - (savings(left) ?? -1),
    observedAt(right) - observedAt(left),
    dataQuality(right) - dataQuality(left),
  ];
  return comparisons.find((value) => value !== 0) ?? String(left.productId).localeCompare(String(right.productId), undefined, { numeric: true });
};
const scopeLabel = (product) => product.priceScope === 'store-specific' ? 'Store price' : 'Advertised price';
const broadCategory = (value) => { const category = String(value || '').toLowerCase(); if (/tool|drill|saw|workwear/.test(category)) return 'Tools'; if (/floor|tile|carpet|rug/.test(category)) return 'Flooring'; if (/appliance|refrigerator|washer|dryer|range|dishwasher/.test(category)) return 'Appliances'; if (/electronic|audio|television|smart home/.test(category)) return 'Electronics'; if (/toy|game|playset/.test(category)) return 'Toys & Games'; if (/clothing|apparel|shoe|jacket/.test(category)) return 'Clothing'; if (/seasonal|holiday|christmas|halloween/.test(category)) return 'Seasonal'; if (/garden|outdoor|patio|lawn|plant|grill/.test(category)) return 'Home & Garden'; if (/furniture|cabinet|storage|shelving|decor/.test(category)) return 'Furniture'; if (/building|lumber|ladder|door|window|roof|concrete|hardware|plumbing|bath/.test(category)) return 'Building Materials'; return 'Other'; };
const categoryOptions = ['All Products', 'Tools', 'Home & Garden', 'Electronics', 'Appliances', 'Flooring', 'Building Materials', 'Furniture', 'Toys & Games', 'Clothing', 'Seasonal', 'Other'];
const stateNames = { AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming' };
const stateLabel = (code) => code === 'ALL' ? 'All States' : stateNames[code] || code;
const reportDate = (value) => Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'Date unavailable';
const pennyCategory = (lead) => broadCategory(`${lead.category || ''} ${lead.productName || ''}`);
const evidenceLabels = { 'register-confirmed': 'Register confirmed', 'retailer-price-observed': 'Retailer price observed', 'multiple-community-reports': 'Multiple community reports', 'single-community-report': 'Single community report', 'needs-verification': 'Needs verification' };
const compactEvidenceLabels = { 'register-confirmed': 'Confirmed', 'retailer-price-observed': 'Observed', 'multiple-community-reports': 'Reported', 'single-community-report': 'Reported', 'needs-verification': 'Verify' };
const freshnessLabels = { 'recently-reported': 'Recently reported', 'older-report': 'Older report', 'historical-report': 'Historical penny report' };
const predictionLabels = { 'scheduled-transition': 'Upcoming list', 'strong-candidate': 'Strong candidate', 'worth-watching': 'Worth watching', 'early-signal': 'Early signal' };
const initialPennyState = () => {
  if (typeof window === 'undefined') return 'KY';
  const saved = window.localStorage.getItem('kazakari.penny.savedState');
  const session = window.sessionStorage.getItem('kazakari.penny.state');
  return saved || session || 'KY';
};
const isAndroidRuntime = () => typeof window !== 'undefined' && typeof window.KazakariAndroid?.getAppInfo === 'function';
const retailerLabels = { 'home-depot': 'Home Depot', lowes: "Lowe's", walmart: 'Walmart', 'dollar-general': 'Dollar General', menards: 'Menards' };
const cleanBarcode = (value) => String(value || '').replace(/\D/g, '').slice(0, 14);

function barcodeMatches(snapshot, barcode) {
  const exact = cleanBarcode(barcode); if (!/^\d{8,14}$/.test(exact)) return [];
  const candidates = [
    ...(snapshot?.products || []).map((item) => ({ ...item, evidence: item.priceScope === 'store-specific' ? 'Store observation' : 'Advertised catalog' })),
    ...(snapshot?.phase9?.currentPennies || []).map((item) => ({ ...item, currentPrice: item.reportedPrice, observedAt: item.lastObservedAt, evidence: evidenceLabels[item.verification?.evidenceLabel] || 'Community report' })),
    ...(snapshot?.phase11?.advancePennyItems || []).map((item) => ({ ...item, upc: item.productIdentifier, productId: item.productIdentifier, currentPrice: item.reportedPrice, observedAt: item.expectedTransitionDate, evidence: item.status === 'upcoming-penny-list' ? 'Upcoming list' : 'Reported penny list' })),
    ...(snapshot?.phase12?.observations || []).map((item) => ({ ...item, upc: item.productCode, productId: item.productCode, currentPrice: item.observedPrice, observedAt: item.observedDate, storeId: item.storeId, evidence: item.evidenceClassification })),
  ];
  const seen = new Set();
  return candidates.filter((item) => [item.upc, item.sku, item.productId, item.productIdentifier].some((value) => cleanBarcode(value) === exact)).filter((item) => { const key = `${item.retailer}:${item.productId || item.upc}:${item.storeId || ''}:${item.observedAt || ''}:${item.currentPrice ?? ''}`; if (seen.has(key)) return false; seen.add(key); return true; }).slice(0, 30);
}

function nativeAppInfo() {
  if (!isAndroidRuntime()) return null;
  try { return JSON.parse(window.KazakariAndroid.getAppInfo()); } catch { return null; }
}

function NoIndexMetadata() {
  useEffect(() => { const previousTitle = document.title; document.title = 'Kazakari'; let robots = document.querySelector('meta[name="robots"]'); const created = !robots; if (!robots) { robots = document.createElement('meta'); robots.name = 'robots'; document.head.appendChild(robots); } const previous = robots.content; robots.content = 'noindex, nofollow, noarchive, nosnippet'; return () => { document.title = previousTitle; if (created) robots.remove(); else robots.content = previous; }; }, []);
  return null;
}

function AccessState({ authenticated, unauthorized, onSignIn }) {
  return <main className="kz-access"><NoIndexMetadata /><div className="kz-access-card"><div className="kz-mark">K</div><LockKeyhole /><h1>{unauthorized ? 'Kazakari access is restricted' : 'Sign in to Kazakari'}</h1><p>{unauthorized ? 'This account is not authorized.' : 'Use your Main Phase Market account to continue.'}</p>{!authenticated && <button className="kz-primary" onClick={onSignIn}>Sign in securely</button>}</div></main>;
}

function ProductImage({ product, detail = false }) {
  const [failed, setFailed] = useState(false);
  if (!product.imageUrl || failed) return <div className={`kz-image-fallback ${detail ? 'is-detail' : ''}`}><ImageOff /><span>Image unavailable</span></div>;
  return <img className={detail ? 'kz-detail-image' : 'kz-product-image'} src={product.imageUrl} alt={product.productName || `Product ${product.productId}`} loading="lazy" decoding="async" onError={() => setFailed(true)} />;
}

function PriceBlock({ product, detail = false }) {
  const saved = savings(product);
  return <div className={`kz-price ${detail ? 'is-detail' : ''}`}><div className="kz-price-main"><strong>{money(product.currentPrice)}</strong>{product.regularPrice != null && <del>{money(product.regularPrice)}</del>}</div>{detail && <div className="kz-deal-line">{product.discountPercent != null && <b>{Math.round(product.discountPercent)}% off</b>}{saved != null && <span>Save {money(saved)}</span>}</div>}</div>;
}

function DiscountOverlay({ product }) {
  const saved = savings(product);
  if (product.discountPercent == null) return null;
  return <div className={`kz-discount-overlay kazakari-discount-overlay ${product.discountPercent >= 90 ? 'is-extreme' : ''}`}><strong>{Math.round(product.discountPercent)}% OFF</strong>{saved != null && <span>Save {money(saved)}</span>}</div>;
}

function ProductTitle({ title }) {
  const titleRef = useRef(null);
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);
  useLayoutEffect(() => {
    const node = titleRef.current;
    if (!node || expanded) return undefined;
    const measure = () => setOverflowing(node.scrollHeight > node.clientHeight + 1);
    measure();
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null;
    observer?.observe(node);
    return () => observer?.disconnect();
  }, [title, expanded]);
  return <div className="kz-title-row"><h3 ref={titleRef} className={expanded ? 'is-expanded' : ''} data-testid="product-title">{title}</h3>{(overflowing || expanded) && <button className="kz-title-toggle" onClick={(event) => { event.stopPropagation(); setExpanded((value) => !value); }} aria-label={expanded ? 'Collapse product title' : 'Expand product title'} aria-expanded={expanded}>{expanded ? <ChevronUp /> : <ChevronDown />}</button>}</div>;
}

function ProductItem({ product, onOpen, onWatch }) {
  const title = product.productName || `Product ${product.productId}`;
  return <article className="kz-product">
    <button className="kz-image-action" onClick={() => onOpen(product)} aria-label={`View ${title}`}><div className="kz-image-wrap kazakari-product-image"><ProductImage product={product} /><DiscountOverlay product={product} /></div></button>
    <div className="kz-product-copy"><div className="kz-title-action" role="button" tabIndex="0" onClick={() => onOpen(product)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') onOpen(product); }}><ProductTitle title={title} /></div><span className="kz-retailer">Home Depot</span><button className="kz-price-action" onClick={() => onOpen(product)} aria-label={`View ${title} pricing`}><PriceBlock product={product} /></button></div>
    <button className="kz-watch-icon" onClick={() => onWatch(product)} aria-label={`Watch ${title}`}><Bell /></button>
  </article>;
}

function PennyLeadItem({ lead, onWatch, onOpen, selectedState }) {
  const watchProduct = lead.matchedProductId ? { retailer: lead.retailer || 'home-depot', productId: lead.matchedProductId, productName: lead.productName, category: null } : null;
  const nationwideReportCount = Number(lead.reportCount || 0);
  const stateReportCount = selectedState === 'ALL' ? null : Number(lead.states?.[selectedState] || 0);
  const coverage = selectedState === 'ALL'
    ? `Nationwide: ${nationwideReportCount} report${nationwideReportCount === 1 ? '' : 's'} · ${Object.keys(lead.states || {}).length} states`
    : `${stateLabel(selectedState)}: ${stateReportCount} report${stateReportCount === 1 ? '' : 's'} · Nationwide: ${nationwideReportCount}`;
  const evidence = compactEvidenceLabels[lead.verification?.evidenceLabel] || 'Reported';
  const freshness = freshnessLabels[lead.verification?.freshness] || null;
  return <article className="kz-product kz-penny-lead">
    <button className="kz-image-action" onClick={() => onOpen(lead)} aria-label={`View evidence for ${lead.productName}`}><div className="kz-image-wrap kazakari-product-image"><ProductImage product={{ ...lead, productId: lead.productId || lead.sku }} /><div className={`kz-penny-evidence-badge ${lead.verification?.evidenceLabel === 'needs-verification' ? 'is-caution' : ''}`}>{evidence}</div></div></button>
    <div className="kz-product-copy"><div className="kz-title-action" role="button" tabIndex="0" onClick={() => onOpen(lead)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') onOpen(lead); }}><ProductTitle title={lead.productName} /></div><span className="kz-retailer">{titleCase(lead.retailer || 'home-depot')}{lead.upc ? ` · ${lead.retailer === 'dollar-general' ? 'UPC/SKU' : 'UPC'} ${lead.upc}` : ''}</span><button className="kz-price-action" onClick={() => onOpen(lead)} aria-label={`View ${lead.productName} report details`}><div className="kz-price"><div className="kz-price-main"><strong>$0.01 reported</strong>{lead.referencePrice != null && <del>{money(lead.referencePrice)}</del>}</div></div><span className="kz-lead-evidence">{freshness ? `${freshness} · ` : ''}{coverage} · {reportDate(lead.lastObservedAt)}</span></button></div>
    {watchProduct && <button className="kz-watch-icon" onClick={() => onWatch(watchProduct)} aria-label={`Watch ${lead.productName}`}><Bell /></button>}
  </article>;
}

function PennyPredictionItem({ prediction, onOpen, onWatch }) {
  const product = { retailer: prediction.retailer, productId: prediction.productId, productName: prediction.productName, category: prediction.category };
  const signal = predictionLabels[prediction.strength] || 'Early signal';
  return <article className="kz-product kz-prediction">
    <button className="kz-image-action" onClick={() => onOpen(prediction)} aria-label={`View prediction for ${prediction.productName}`}><div className="kz-image-wrap kazakari-product-image"><ProductImage product={prediction} /><div className="kz-penny-evidence-badge is-prediction">{signal}</div></div></button>
    <div className="kz-product-copy"><div className="kz-title-action" role="button" tabIndex="0" onClick={() => onOpen(prediction)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') onOpen(prediction); }}><ProductTitle title={prediction.productName || `Product ${prediction.productId}`} /></div><span className="kz-retailer">{titleCase(prediction.retailer)}</span><button className="kz-price-action" onClick={() => onOpen(prediction)} aria-label={`View ${prediction.productName} prediction details`}><div className="kz-price"><div className="kz-price-main"><strong>{money(prediction.currentPrice)}</strong>{prediction.regularPrice != null && <del>{money(prediction.regularPrice)}</del>}</div></div><span className="kz-lead-evidence">{prediction.mostRecentPriceChange == null ? 'No observed price change yet' : `${prediction.mostRecentPriceChange < 0 ? '' : '+'}${money(prediction.mostRecentPriceChange)} latest change`} · {reportDate(prediction.lastObservedAt)}</span>{prediction.reasons?.[0] && <span className="kz-prediction-reason">{prediction.reasons[0]}</span>}</button></div>
    <button className="kz-watch-icon" onClick={() => onWatch(product)} aria-label={`Watch ${prediction.productName}`}><Bell /></button>
  </article>;
}

function PennyLeadDetail({ lead, onClose, onWatch }) {
  if (!lead) return null;
  const watchProduct = lead.matchedProductId ? { retailer: lead.retailer || 'home-depot', productId: lead.matchedProductId, productName: lead.productName, category: null } : null;
  const states = Object.entries(lead.states || {}).sort((left, right) => Number(right[1]) - Number(left[1]));
  const verification = lead.verification || {};
  return <div className="kz-drawer-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="kz-drawer" role="dialog" aria-modal="true" aria-labelledby="kz-penny-detail-title"><div className="kz-drawer-head"><button onClick={onClose} aria-label="Close penny report details"><X /></button><strong>Penny Find details</strong></div><ProductImage product={{ ...lead, productId: lead.productId || lead.sku || lead.upc }} detail /><div className="kz-drawer-body"><span className="kz-retailer">{titleCase(lead.retailer || 'home-depot')}{lead.upc ? ` · ${lead.retailer === 'dollar-general' ? 'UPC/SKU' : 'UPC'} ${lead.upc}` : lead.sku ? ` · SKU ${lead.sku}` : ''}</span><h2 id="kz-penny-detail-title">{lead.productName}</h2><div className="kz-price is-detail"><div className="kz-price-main"><strong>$0.01 reported</strong>{lead.referencePrice != null && <del>{money(lead.referencePrice)}</del>}</div></div><dl className="kz-facts"><div><dt>Evidence</dt><dd>{evidenceLabels[verification.evidenceLabel] || 'Community-reported penny'}</dd></div><div><dt>Freshness</dt><dd>{freshnessLabels[verification.freshness] || 'Not classified'}</dd></div><div><dt>First report</dt><dd>{lead.firstReportedAt ? reportDate(lead.firstReportedAt) : 'Not supplied'}</dd></div><div><dt>Most recent</dt><dd>{reportDate(lead.lastObservedAt)}</dd></div><div><dt>Reports</dt><dd>{lead.reportCount} from {lead.sourceCount || 1} source stream{Number(lead.sourceCount || 1) === 1 ? '' : 's'}</dd></div><div><dt>Reported states</dt><dd>{states.length ? states.map(([code, count]) => `${stateLabel(code)} (${count})`).join(', ') : 'Not supplied'}</dd></div><div><dt>Identifiers</dt><dd>{verification.exactIdentifiers?.join(' · ') || 'Not supplied'}</dd></div><div><dt>Identity check</dt><dd>{titleCase(verification.identityVerification || 'requires-verification')}</dd></div><div><dt>Reference price</dt><dd>{lead.referencePrice == null ? 'Not supplied' : `${money(lead.referencePrice)} reported by community source; not independently verified`}</dd></div><div><dt>Store</dt><dd>{lead.relevantStore || 'No store ID supplied'}</dd></div></dl>{verification.questionableReasons?.length > 0 && <details className="kz-more-details"><summary>Verification limitations</summary><ul className="kz-verification-list">{verification.questionableReasons.map((reason) => <li key={reason}>{reason}</li>)}</ul></details>}<div className="kz-evidence-note"><ShieldCheck /><p>Community list evidence does not guarantee a one-cent price or local availability at a specific store.</p></div>{lead.sourceUrl && <a className="kz-primary kz-full" href={lead.sourceUrl} target="_blank" rel="noreferrer">View source evidence</a>}{watchProduct && <button className="kz-secondary kz-full" onClick={() => onWatch(watchProduct)}><Bell /> Watch this product</button>}</div></section></div>;
}

function PennyPredictionDetail({ prediction, onClose, onWatch }) {
  if (!prediction) return null;
  const product = { retailer: prediction.retailer, productId: prediction.productId, productName: prediction.productName, category: prediction.category };
  return <div className="kz-drawer-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="kz-drawer" role="dialog" aria-modal="true" aria-labelledby="kz-prediction-detail-title"><div className="kz-drawer-head"><button onClick={onClose} aria-label="Close prediction details"><X /></button><strong>Penny Prediction details</strong></div><ProductImage product={prediction} detail /><div className="kz-drawer-body"><span className="kz-retailer">{titleCase(prediction.retailer)} · Item #{prediction.productId}</span><h2 id="kz-prediction-detail-title">{prediction.productName || `Product ${prediction.productId}`}</h2><div className="kz-price is-detail"><div className="kz-price-main"><strong>{money(prediction.currentPrice)}</strong>{prediction.regularPrice != null && <del>{money(prediction.regularPrice)}</del>}</div></div><strong className="kz-prediction-strength">{predictionLabels[prediction.strength] || 'Early signal'}</strong><ul className="kz-verification-list">{(prediction.reasons || []).map((reason) => <li key={reason}>{reason}</li>)}</ul><dl className="kz-facts"><div><dt>Latest observation</dt><dd>{reportDate(prediction.lastObservedAt)}</dd></div><div><dt>Latest price change</dt><dd>{prediction.mostRecentPriceChange == null ? 'No earlier observed selling price' : money(prediction.mostRecentPriceChange)}</dd></div><div><dt>Estimated window</dt><dd>{prediction.estimatedTransitionWindow || 'Insufficient evidence for a transition window'}</dd></div><div><dt>Location scope</dt><dd>{prediction.storeId ? `Store ${prediction.storeId}` : 'National advertised observation; no local store claim'}</dd></div></dl><div className="kz-evidence-note"><ShieldCheck /><p>This is an explainable monitoring signal, not an observed penny price or a prediction probability.</p></div><button className="kz-primary kz-full" onClick={() => onWatch(product)}><Bell /> Watch this product</button></div></section></div>;
}

function FilterControls({ retailer, setRetailer, category, setCategory, minimumDiscount, setMinimumDiscount, maximumPrice, setMaximumPrice, sort, setSort }) {
  return <><label>Retailer<select value={retailer} onChange={(event) => setRetailer(event.target.value)}><option value="all">All retailers</option><option value="home-depot">Home Depot</option></select></label><label>Category<select value={category} onChange={(event) => setCategory(event.target.value)}>{categoryOptions.map((item) => <option key={item}>{item}</option>)}</select></label><label>Minimum discount<select value={minimumDiscount} onChange={(event) => setMinimumDiscount(Number(event.target.value))}><option value="0">Any discount</option><option value="50">50% or more</option><option value="75">75% or more</option><option value="90">90% or more</option></select></label><label>Maximum price<input type="number" inputMode="decimal" min="0" step="0.01" value={maximumPrice} onChange={(event) => setMaximumPrice(event.target.value)} placeholder="No maximum" /></label><label>Sort<select value={sort} onChange={(event) => setSort(event.target.value)}><option value="best">Best Deals</option><option value="discount">Biggest Discount</option><option value="price-low">Lowest Price</option><option value="price-high">Highest Price</option><option value="recent">Recently Updated</option><option value="savings">Biggest Savings</option></select></label></>;
}

function FilterSheet({ open, onClose, onClear, controls }) {
  useEffect(() => { if (!open) return undefined; const closeOnEscape = (event) => { if (event.key === 'Escape') onClose(); }; document.addEventListener('keydown', closeOnEscape); return () => document.removeEventListener('keydown', closeOnEscape); }, [open, onClose]);
  if (!open) return null;
  return <div className="kz-sheet-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="kz-filter-sheet" role="dialog" aria-modal="true" aria-labelledby="kz-filter-title"><div className="kz-sheet-head"><h2 id="kz-filter-title">Filter &amp; Sort</h2><button onClick={onClose} aria-label="Close filters"><X /></button></div><div className="kz-sheet-fields"><FilterControls {...controls} /></div><div className="kz-sheet-actions"><button className="kz-secondary" onClick={onClear}>Clear</button><button className="kz-primary" onClick={onClose}><Check /> Show results</button></div></section></div>;
}

function PennyFilterControls({ state, setState, states, sort, setSort, category, setCategory, categories, retailer, setRetailer, retailers, evidence, setEvidence, freshness, setFreshness }) {
  return <><label>State<select value={state} onChange={(event) => setState(event.target.value)}><option value="ALL">All States</option>{states.map((code) => <option key={code} value={code}>{stateLabel(code)}</option>)}</select></label><label>Sort<select value={sort} onChange={(event) => setSort(event.target.value)}><option value="best">Best current evidence</option><option value="recent">Most recently reported</option><option value="reports">Most reports</option></select></label><label>Category<select value={category} onChange={(event) => setCategory(event.target.value)}><option value="All Products">All Products</option>{categories.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>{retailers.length > 1 && <label>Retailer<select value={retailer} onChange={(event) => setRetailer(event.target.value)}><option value="all">All retailers</option>{retailers.map((item) => <option key={item} value={item}>{titleCase(item)}</option>)}</select></label>}<label>Evidence<select value={evidence} onChange={(event) => setEvidence(event.target.value)}><option value="all">All evidence</option>{Object.entries(evidenceLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>Report age<select value={freshness} onChange={(event) => setFreshness(event.target.value)}><option value="all">Recent and historical</option>{Object.entries(freshnessLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></>;
}

function PredictionFilterControls({ state, setState, states, sort, setSort, category, setCategory, categories, retailer, setRetailer, retailers }) {
  return <><label>State<select value={state} onChange={(event) => setState(event.target.value)}><option value="ALL">All States</option>{states.map((code) => <option key={code} value={code}>{stateLabel(code)}</option>)}</select></label><label>Sort<select value={sort} onChange={(event) => setSort(event.target.value)}><option value="strength">Strongest candidate</option><option value="recent">Most recent price change</option></select></label><label>Category<select value={category} onChange={(event) => setCategory(event.target.value)}><option value="All Products">All Products</option>{categories.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>{retailers.length > 1 && <label>Retailer<select value={retailer} onChange={(event) => setRetailer(event.target.value)}><option value="all">All retailers</option>{retailers.map((item) => <option key={item} value={item}>{titleCase(item)}</option>)}</select></label>}</>;
}

function PennyFilterSheet({ open, onClose, onClear, controls, prediction = false }) {
  useEffect(() => { if (!open) return undefined; const closeOnEscape = (event) => { if (event.key === 'Escape') onClose(); }; document.addEventListener('keydown', closeOnEscape); return () => document.removeEventListener('keydown', closeOnEscape); }, [open, onClose]);
  if (!open) return null;
  return <div className="kz-sheet-backdrop kz-penny-sheet-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="kz-filter-sheet" role="dialog" aria-modal="true" aria-labelledby="kz-penny-filter-title"><div className="kz-sheet-head"><h2 id="kz-penny-filter-title">Filter &amp; Sort</h2><button onClick={onClose} aria-label="Close penny filters"><X /></button></div><div className="kz-sheet-fields">{prediction ? <PredictionFilterControls {...controls} /> : <PennyFilterControls {...controls} />}</div><div className="kz-sheet-actions"><button className="kz-secondary" onClick={onClear}>Reset to Kentucky</button><button className="kz-primary" onClick={onClose}><Check /> Show results</button></div></section></div>;
}

function ScannerSheet({ open, onClose, snapshot }) {
  const [barcode, setBarcode] = useState(''); const [familyObservations, setFamilyObservations] = useState([]); const [preferredStores, setPreferredStores] = useState([]);
  const [retailer, setRetailer] = useState('home-depot'); const [storeId, setStoreId] = useState(''); const [storeZip, setStoreZip] = useState(''); const [storeAddress, setStoreAddress] = useState('');
  const [productName, setProductName] = useState(''); const [observedPrice, setObservedPrice] = useState(''); const [method, setMethod] = useState('retailer-app'); const [availability, setAvailability] = useState('unknown');
  const [observedAtValue, setObservedAtValue] = useState(() => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0,16)); const [evidenceFile, setEvidenceFile] = useState(null); const [notes, setNotes] = useState(''); const [rememberStore, setRememberStore] = useState(true);
  const [status, setStatus] = useState(''); const [saving, setSaving] = useState(false); const [storeSaving, setStoreSaving] = useState(false);
  const matches = useMemo(() => barcodeMatches(snapshot, barcode), [snapshot, barcode]);
  useEffect(() => { if (!open) return undefined; kazakariApi.preferredStores().then(setPreferredStores).catch(() => setPreferredStores([])); const handler = (event) => { const value = cleanBarcode(event.detail?.barcode); if (value) { setBarcode(value); setStatus(`Scanned ${value}`); } }; const statusHandler = (event) => { if (event.detail?.message) setStatus(event.detail.message); }; window.addEventListener('kazakari:barcode-scan', handler); window.addEventListener('kazakari:barcode-scan-status', statusHandler); return () => { window.removeEventListener('kazakari:barcode-scan', handler); window.removeEventListener('kazakari:barcode-scan-status', statusHandler); }; }, [open]);
  useEffect(() => { if (!open || !/^\d{8,14}$/.test(barcode)) { setFamilyObservations([]); return; } let active = true; kazakariApi.priceObservations(barcode).then((items) => { if (active) setFamilyObservations(items); }).catch(() => { if (active) setFamilyObservations([]); }); return () => { active = false; }; }, [open, barcode]);
  useEffect(() => { const first = matches[0]; if (!first) return; setProductName((current) => current || first.productName || ''); if (first.retailer && retailerLabels[first.retailer]) setRetailer(first.retailer); }, [matches]);
  if (!open) return null;
  const startScan = () => { setStatus(''); if (typeof window.KazakariScanner?.scanBarcode === 'function') window.KazakariScanner.scanBarcode(); else setStatus('Camera scanning is available in the installed Android app. Enter the barcode below on the website.'); };
  const chooseStore = (value) => { const store = preferredStores.find((item) => item.id === value); if (!store) return; setRetailer(store.retailer); setStoreId(store.storeId); setStoreZip(store.zip || ''); setStoreAddress(store.address || ''); };
  const saveStore = async () => { if (!storeId.trim()) { setStatus('Enter the real store number before saving it.'); return; } setStoreSaving(true); setStatus(''); try { await kazakariApi.savePreferredStore({ retailer, storeId: storeId.trim(), zip: storeZip.trim(), address: storeAddress.trim() }); setPreferredStores(await kazakariApi.preferredStores()); setStatus(`${retailerLabels[retailer]} store ${storeId.trim()} saved.`); } catch (error) { setStatus(error.message); } finally { setStoreSaving(false); } };
  const submit = async (event) => { event.preventDefault(); setStatus(''); const upc = cleanBarcode(barcode); if (!/^\d{8,14}$/.test(upc)) { setStatus('Enter or scan a valid 8–14 digit UPC/EAN.'); return; } if (!storeId.trim() || !Number.isFinite(Number(observedPrice)) || Number(observedPrice) < 0) { setStatus('Store number and observed price are required.'); return; } setSaving(true); try {
    const evidencePath = evidenceFile ? await kazakariApi.uploadPriceEvidence(evidenceFile) : null;
    const registerConfirmed = method === 'register-receipt' && Boolean(evidencePath);
    const evidenceTier = registerConfirmed ? 'tier-1-register-confirmed' : method === 'retailer-app' ? 'tier-2-retailer-app-observed' : 'tier-3-reported-watchlist';
    const priceType = registerConfirmed ? 'register-price' : method === 'retailer-app' ? 'retailer-app-price' : method === 'shelf-tag' ? 'shelf-tag-price' : 'customer-reported-price';
    const match = matches[0] || {};
    const created = await kazakariApi.createPriceObservation({ retailer, productId: match.productId || null, upc, productName: productName || match.productName || null, category: match.category || null, imageUrl: match.imageUrl || null, productUrl: match.productUrl || null, storeId: storeId.trim(), storeZip: storeZip.trim(), storeAddress: storeAddress.trim(), observedPrice: Number(observedPrice), priceType, evidenceTier, evidenceMethod: method, availabilityStatus: availability, observedAt: new Date(observedAtValue).toISOString(), evidencePath, notes });
    if (rememberStore) { await kazakariApi.savePreferredStore({ retailer, storeId: storeId.trim(), zip: storeZip.trim(), address: storeAddress.trim() }); setPreferredStores(await kazakariApi.preferredStores()); }
    setFamilyObservations((items) => [created, ...items]); setStatus(registerConfirmed ? 'Saved as receipt-backed register evidence.' : method === 'retailer-app' ? 'Saved as a retailer-app observation.' : 'Saved as a reported observation.'); setObservedPrice(''); setEvidenceFile(null); setNotes('');
  } catch (error) { setStatus(error.message); } finally { setSaving(false); } };
  return <div className="kz-sheet-backdrop kz-scanner-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="kz-filter-sheet kz-scanner-sheet" role="dialog" aria-modal="true" aria-labelledby="kz-scanner-title"><div className="kz-sheet-head"><h2 id="kz-scanner-title">Scan &amp; verify</h2><button onClick={onClose} aria-label="Close scanner"><X /></button></div><div className="kz-scanner-actions"><button className="kz-primary" onClick={startScan}><Camera /> Scan barcode</button><label>UPC or EAN<input value={barcode} inputMode="numeric" autoComplete="off" onChange={(event) => setBarcode(cleanBarcode(event.target.value))} placeholder="Enter 8–14 digits" /></label></div>
    {matches.length > 0 && <section className="kz-scan-results"><h3>Exact matches</h3>{matches.slice(0,5).map((item,index) => <article key={`${item.productId || item.upc}-${index}`}><strong>{item.productName || `Product ${barcode}`}</strong><span>{retailerLabels[item.retailer] || titleCase(item.retailer)} · {item.evidence}</span><small>{item.currentPrice == null ? 'No price in this evidence' : money(item.currentPrice)}{item.storeId ? ` · Store ${item.storeId}` : ' · No store ID'}</small></article>)}</section>}
    {/^\d{8,14}$/.test(barcode) && matches.length === 0 && <p className="kz-empty-copy">No exact match is saved yet. You can still record what you observed.</p>}
    {familyObservations.length > 0 && <details className="kz-more-details"><summary>Family observations ({familyObservations.length})</summary>{familyObservations.map((item) => <div className="kz-scan-history" key={item.id}><strong>{money(item.observedPrice)}</strong><span>{retailerLabels[item.retailer]} · Store {item.storeId}</span><small>{new Date(item.observedAt).toLocaleString()} · {titleCase(item.evidenceTier)}</small></div>)}</details>}
    {storeId.trim() && <button type="button" className="kz-secondary kz-save-store" onClick={saveStore} disabled={storeSaving}>{storeSaving ? <Loader2 className="kz-spin" /> : <Check />} Save {retailerLabels[retailer]} store {storeId.trim()}</button>}
    <form className="kz-sheet-fields kz-observation-form" onSubmit={submit}><h3>Record what you observed</h3>{preferredStores.length > 0 && <label>Saved store<select defaultValue="" onChange={(event) => chooseStore(event.target.value)}><option value="">Choose a saved store</option>{preferredStores.map((store) => <option key={store.id} value={store.id}>{retailerLabels[store.retailer]} · {store.storeId}{store.zip ? ` · ${store.zip}` : ''}</option>)}</select></label>}<label>Retailer<select value={retailer} onChange={(event) => setRetailer(event.target.value)}>{Object.entries(retailerLabels).map(([value,label]) => <option value={value} key={value}>{label}</option>)}</select></label><label>Product name<input value={productName} onChange={(event) => setProductName(event.target.value)} placeholder="Exact name if known" /></label><label>Store number<input value={storeId} onChange={(event) => setStoreId(event.target.value)} placeholder="Required — do not guess" /></label><label>Store ZIP<input value={storeZip} inputMode="numeric" onChange={(event) => setStoreZip(event.target.value)} placeholder="Optional" /></label><label>Store address<input value={storeAddress} onChange={(event) => setStoreAddress(event.target.value)} placeholder="Optional" /></label><label>Observed price<input type="number" inputMode="decimal" min="0" step="0.01" value={observedPrice} onChange={(event) => setObservedPrice(event.target.value)} placeholder="0.01" /></label><label>How was the price observed?<select value={method} onChange={(event) => setMethod(event.target.value)}><option value="retailer-app">Retailer app with this store selected</option><option value="register-receipt">Register or receipt</option><option value="shelf-tag">Shelf or clearance tag</option><option value="manual-report">Other manual report</option></select></label><label>Availability<select value={availability} onChange={(event) => setAvailability(event.target.value)}><option value="unknown">Unknown</option><option value="in-stock">Seen in stock</option><option value="limited">Limited quantity seen</option><option value="out-of-stock">Out of stock</option></select></label><label>Observed time<input type="datetime-local" value={observedAtValue} onChange={(event) => setObservedAtValue(event.target.value)} /></label><label>Receipt or tag photo<input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={(event) => setEvidenceFile(event.target.files?.[0] || null)} /></label><label>Notes<input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Aisle, tag details, or limitations" /></label><label className="kz-check"><input type="checkbox" checked={rememberStore} onChange={(event) => setRememberStore(event.target.checked)} /> Remember this store</label><div className="kz-evidence-note"><ShieldCheck /><p>A register observation is Tier 1 only when a receipt or price photo is attached. Retailer-app prices are Tier 2. Other submissions remain reported evidence.</p></div><button className="kz-primary" disabled={saving}>{saving ? <Loader2 className="kz-spin" /> : <Check />} Save immutable observation</button>{status && <p className="kz-scanner-status" role="status">{status}</p>}</form></section></div>;
}

function ProductDetail({ product, publication, onClose, onWatch }) {
  if (!product) return null;
  return <div className="kz-drawer-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="kz-drawer" role="dialog" aria-modal="true" aria-labelledby="kz-detail-title"><div className="kz-drawer-head"><button onClick={onClose} aria-label="Close product details"><X /></button><strong>Product details</strong></div><ProductImage product={product} detail /><div className="kz-drawer-body"><span className="kz-retailer">Home Depot · Item #{product.productId}</span><h2 id="kz-detail-title">{product.productName || `Product ${product.productId}`}</h2><PriceBlock product={product} detail />{product.description && <p className="kz-description">{product.description}</p>}<section className="kz-history"><h3><History /> Price history</h3>{product.history?.length ? product.history.map((item) => <div className="kz-history-row" key={item.id}><span>{new Date(item.observedAt).toLocaleDateString()}</span><strong>{money(item.currentPrice)}</strong><em>{item.discountPercent == null ? 'No exact reference' : `${Math.round(item.discountPercent)}% off`}</em></div>) : <p className="kz-empty-copy">No earlier price observations yet.</p>}</section><details className="kz-more-details"><summary>More details</summary><div className="kz-evidence-note"><ShieldCheck /><p>{product.priceScope === 'store-specific' ? `Observed for store ${product.storeId}.` : 'Advertised publication price; verify your local store before traveling.'}</p></div>{product.regularPrice == null && product.discountPercent != null && <p className="kz-reference-note">The source advertised this discount but did not provide an exact original price.</p>}<dl className="kz-facts"><div><dt>Price type</dt><dd>{scopeLabel(product)}</dd></div><div><dt>Original price</dt><dd>{product.regularPrice == null ? 'Not supplied by source' : money(product.regularPrice)}</dd></div><div><dt>Inventory</dt><dd>{product.inventoryQuantity ?? 'Not reported'}</dd></div><div><dt>Category</dt><dd>{broadCategory(product.category)}<small>{product.category && product.category !== broadCategory(product.category) ? product.category : ''}</small></dd></div><div><dt>Observed</dt><dd>{new Date(product.observedAt).toLocaleString()}</dd></div><div><dt>Evidence</dt><dd>{titleCase(product.verificationStatus)}</dd></div><div><dt>Source</dt><dd>{titleCase(product.sourceReliability)}</dd></div></dl>{publication && <p className="kz-publication">Publication valid through {publication.validTo ? new Date(publication.validTo).toLocaleDateString() : 'an unspecified date'}.</p>}</details><button className="kz-primary kz-full" onClick={() => onWatch(product)}><Bell /> Watch this product</button></div></section></div>;
}

function WatchPanel({ watches, onCreate, onDelete, creating, prefill, clearPrefill }) {
  const [category, setCategory] = useState('All Products'); const [retailer, setRetailer] = useState('home-depot'); const [minimumDiscount, setMinimumDiscount] = useState(50);
  useEffect(() => { if (prefill) { setCategory(broadCategory(prefill.category)); setRetailer(prefill.retailer); } }, [prefill]);
  const submit = async (event) => { event.preventDefault(); const productName = prefill?.productName || prefill?.productId; const name = productName ? `Watch ${productName}` : `${category} ${minimumDiscount}%+`; await onCreate({ name, retailer: retailer || null, category: productName || category === 'All Products' ? null : category, productId: prefill?.productId || null, storeId: null, minimumDiscount: Number(minimumDiscount), enabled: true, newlyDiscounted: true, priceDrops: true, endOfClearance: true }); clearPrefill(); };
  return <div className="kz-watch-layout"><section className="kz-watch-create"><h2>{prefill ? 'Watch this product' : 'Create a watch'}</h2>{prefill && <p className="kz-watch-product">{prefill.productName || prefill.productId}<button onClick={clearPrefill}><X /></button></p>}<form onSubmit={submit} className="kz-watch-form">{!prefill && <label>Category<select value={category} onChange={(event) => setCategory(event.target.value)}>{categoryOptions.map((item) => <option key={item}>{item}</option>)}</select></label>}<label>Retailer<select value={retailer} onChange={(event) => setRetailer(event.target.value)}><option value="home-depot">Home Depot</option><option value="">Any retailer</option></select></label><label>Show deals at<select value={minimumDiscount} onChange={(event) => setMinimumDiscount(event.target.value)}><option value="50">50% off</option><option value="75">75% off</option><option value="90">90% off</option></select></label><button className="kz-primary" disabled={creating}>{creating ? <Loader2 className="kz-spin" /> : <Plus />} Add watch</button></form><small>Saved watches appear here. Push notifications are not active yet.</small></section><section className="kz-watch-list"><h2>Your watches</h2>{watches.length === 0 && <p className="kz-empty-copy">You are not watching anything yet.</p>}{watches.map((watch) => <article key={watch.id}><div><strong>{watch.name}</strong><span>{watch.productId ? `Product ${watch.productId}` : watch.category || 'All products'} · {watch.minimumDiscount}%+</span></div><button onClick={() => onDelete(watch.id)} aria-label={`Remove ${watch.name}`}><Trash2 /></button></article>)}</section></div>;
}

function Empty({ title, copy, action }) { return <div className="kz-state"><PackageSearch /><strong>{title}</strong><span>{copy}</span>{action}</div>; }

function WebsiteDownload({ release, loading, error, downloading, onDownload }) {
  if (loading) return <div className="kz-web-download"><Loader2 className="kz-spin" /><span>Checking Android version…</span></div>;
  if (!release) return error ? <div className="kz-web-download is-unavailable"><Smartphone /><span>{error}</span></div> : null;
  return <div className="kz-web-download"><Smartphone /><span><strong>Android app</strong> · v{release.versionName}</span><button onClick={onDownload} disabled={downloading}>{downloading ? <Loader2 className="kz-spin" /> : <Download />} Download</button></div>;
}

function AppMenu({ open, onClose, appInfo, onCheckUpdates }) {
  if (!open) return null;
  return <div className="kz-menu-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="kz-app-menu" role="dialog" aria-modal="true" aria-labelledby="kz-app-menu-title"><div className="kz-sheet-head"><h2 id="kz-app-menu-title">Kazakari</h2><button onClick={onClose} aria-label="Close app menu"><X /></button></div><button className="kz-menu-item" onClick={onCheckUpdates}><RefreshCw /><span><strong>Check for updates</strong><small>Installed version {appInfo?.versionName || 'unknown'}</small></span></button></section></div>;
}

function UpdateDialog({ state, onClose, onInstall }) {
  if (!state?.open) return null;
  const available = state.status === 'available';
  const busy = ['checking', 'downloading', 'verifying'].includes(state.status);
  const title = available ? 'Kazakari update available' : state.status === 'current' ? "You're up to date" : state.status === 'error' ? 'Update could not finish' : state.status === 'permission' ? 'Allow app updates' : state.status === 'installer' ? 'Ready to install' : 'Checking for updates';
  return <div className="kz-dialog-backdrop"><section className="kz-update-dialog" role="dialog" aria-modal="true" aria-labelledby="kz-update-title"><div className="kz-update-icon">{busy ? <Loader2 className="kz-spin" /> : <Smartphone />}</div><h2 id="kz-update-title">{title}</h2>{available && <strong className="kz-update-version">Version {state.release.versionName}</strong>}<p>{state.message || (available ? state.release.notes : 'Kazakari is checking the protected release manifest.')}</p><div className="kz-dialog-actions">{available && <button className="kz-primary" onClick={onInstall}>Update Now</button>}<button className="kz-secondary" onClick={onClose} disabled={busy}>{available ? 'Later' : 'Close'}</button></div></section></div>;
}

export default function KazakariPagePhase7B() {
  const { isAuthenticated, navigateToLogin } = useAppAuth();
  const androidApp = isAndroidRuntime();
  const developmentPreview = import.meta.env.DEV && new URLSearchParams(window.location.search).get('preview') === 'phase7b';
  const appInfo = useMemo(() => nativeAppInfo(), [androidApp]);
  const [snapshot, setSnapshot] = useState(null); const [watches, setWatches] = useState([]); const [loading, setLoading] = useState(true); const [refreshing, setRefreshing] = useState(false); const [lastRefresh, setLastRefresh] = useState(null); const [refreshMessage, setRefreshMessage] = useState(''); const [error, setError] = useState(null); const [tab, setTab] = useState('hot');
  const [pennyView, setPennyView] = useState('current');
  const [pennyReportView, setPennyReportView] = useState('recent');
  const [queries, setQueries] = useState({ hot: '', pennyCurrent: '', pennyPredictions: '', discover: '', watches: '' }); const queryKey = tab === 'penny' ? (pennyView === 'current' ? 'pennyCurrent' : 'pennyPredictions') : tab; const query = queries[queryKey] || ''; const setQuery = (value) => setQueries((current) => ({ ...current, [queryKey]: value }));
  const [retailer, setRetailer] = useState('all'); const [category, setCategory] = useState('All Products'); const [minimumDiscount, setMinimumDiscount] = useState(0); const [maximumPrice, setMaximumPrice] = useState(''); const [sort, setSort] = useState('recent'); const [visibleCount, setVisibleCount] = useState(40); const [visiblePennyCount, setVisiblePennyCount] = useState(40); const [filtersOpen, setFiltersOpen] = useState(false); const [pennyFiltersOpen, setPennyFiltersOpen] = useState(false); const [pennyState, setPennyState] = useState(initialPennyState); const [pennySort, setPennySort] = useState('best'); const [pennyCategoryFilter, setPennyCategoryFilter] = useState('All Products'); const [pennyRetailer, setPennyRetailer] = useState('all'); const [pennyEvidence, setPennyEvidence] = useState('all'); const [pennyFreshness, setPennyFreshness] = useState('all'); const [predictionSort, setPredictionSort] = useState('strength'); const [predictionCategory, setPredictionCategory] = useState('All Products'); const [predictionRetailer, setPredictionRetailer] = useState('all'); const [scannerOpen, setScannerOpen] = useState(false); const [selected, setSelected] = useState(null); const [selectedPennyLead, setSelectedPennyLead] = useState(null); const [selectedPrediction, setSelectedPrediction] = useState(null); const [watchPrefill, setWatchPrefill] = useState(null); const [creatingWatch, setCreatingWatch] = useState(false); const [menuOpen, setMenuOpen] = useState(false); const [updateState, setUpdateState] = useState(null);
  const [androidRelease, setAndroidRelease] = useState(null); const [releaseLoading, setReleaseLoading] = useState(false); const [releaseError, setReleaseError] = useState(''); const [downloading, setDownloading] = useState(false);
  const [hotRetailer, setHotRetailer] = useState('home-depot');
  const pullStart = useRef(null);

  const loadData = useCallback(async (manual = false) => {
    if (!isAuthenticated && !developmentPreview) { setLoading(false); return; }
    if (manual) setRefreshing(true); else setLoading(true);
    try {
      const [nextSnapshot, nextWatches] = developmentPreview
        ? await Promise.all([fetch('/__kazakari_phase7b_snapshot', { cache: 'no-store' }).then((response) => response.json()), Promise.resolve([])])
        : await Promise.all([kazakariApi.snapshot({ fresh: true }), kazakariApi.watches({ fresh: true })]);
      setSnapshot(nextSnapshot); setWatches(nextWatches); setError(null); setLastRefresh(new Date());
      if (manual) setRefreshMessage('Latest saved product data loaded.');
    } catch (nextError) {
      if (!manual) setError({ status: nextError.status, message: nextError.message });
      setRefreshMessage(manual ? `Refresh failed: ${nextError.message}` : '');
    } finally { setLoading(false); setRefreshing(false); }
  }, [isAuthenticated, developmentPreview]);

  useEffect(() => { loadData(false); }, [loadData]);
  useEffect(() => { window.sessionStorage.setItem('kazakari.penny.state', pennyState); }, [pennyState]);
  useEffect(() => { if (!refreshMessage) return undefined; const timer = setTimeout(() => setRefreshMessage(''), 4500); return () => clearTimeout(timer); }, [refreshMessage]);
  useEffect(() => { if (!isAuthenticated || androidApp) return undefined; let current = true; setReleaseLoading(true); kazakariApi.androidRelease().then((release) => { if (current) { setAndroidRelease(release); setReleaseError(''); } }).catch((nextError) => { if (current) setReleaseError(nextError.status === 404 ? 'Android release not available yet.' : nextError.message); }).finally(() => { if (current) setReleaseLoading(false); }); return () => { current = false; }; }, [isAuthenticated, androidApp]);

  const checkForUpdates = useCallback(async (manual = true) => {
    if (!androidApp || !appInfo) return;
    setMenuOpen(false);
    if (manual) setUpdateState({ open: true, status: 'checking' });
    try {
      const release = await kazakariApi.androidRelease();
      if (Number(release.versionCode) > Number(appInfo.versionCode)) setUpdateState({ open: true, status: 'available', release });
      else if (manual) setUpdateState({ open: true, status: 'current', release, message: `Version ${appInfo.versionName} is the latest release.` });
    } catch (nextError) { if (manual) setUpdateState({ open: true, status: 'error', message: nextError.message }); }
  }, [androidApp, appInfo]);

  useEffect(() => { if (isAuthenticated && androidApp) checkForUpdates(false); }, [isAuthenticated, androidApp, checkForUpdates]);
  useEffect(() => {
    const handleUpdateStatus = (event) => { const detail = event.detail || {}; const states = { downloading: 'downloading', verifying: 'verifying', 'permission-required': 'permission', 'installer-launched': 'installer', error: 'error' }; setUpdateState((current) => ({ ...(current || {}), open: true, status: states[detail.status] || detail.status, message: detail.message || current?.message })); };
    window.addEventListener('kazakari:update-status', handleUpdateStatus);
    return () => window.removeEventListener('kazakari:update-status', handleUpdateStatus);
  }, []);
  useEffect(() => { window.__kazakariHandleNativeBack = () => { if (selectedPrediction) { setSelectedPrediction(null); return true; } if (selectedPennyLead) { setSelectedPennyLead(null); return true; } if (selected) { setSelected(null); return true; } if (scannerOpen) { setScannerOpen(false); return true; } if (pennyFiltersOpen) { setPennyFiltersOpen(false); return true; } if (filtersOpen) { setFiltersOpen(false); return true; } if (menuOpen) { setMenuOpen(false); return true; } if (updateState?.open) { setUpdateState(null); return true; } if (watchPrefill) { setWatchPrefill(null); return true; } if (tab !== 'hot') { setTab('hot'); return true; } return false; }; return () => { delete window.__kazakariHandleNativeBack; }; }, [selectedPrediction, selectedPennyLead, selected, scannerOpen, pennyFiltersOpen, filtersOpen, menuOpen, updateState, watchPrefill, tab]);

  const installUpdate = async () => {
    if (!androidApp || !updateState?.release) return;
    setUpdateState((current) => ({ ...current, status: 'downloading', message: 'Downloading the protected update…' }));
    try { const release = await kazakariApi.androidDownload(); window.KazakariAndroid.downloadAndInstall(release.signedUrl, release.sha256, Number(release.versionCode)); } catch (nextError) { setUpdateState((current) => ({ ...current, status: 'error', message: nextError.message })); }
  };

  const sortCatalog = (products) => products.sort((left, right) => { if (sort === 'price-low') return (left.currentPrice ?? Infinity) - (right.currentPrice ?? Infinity); if (sort === 'price-high') return (right.currentPrice ?? -1) - (left.currentPrice ?? -1); if (sort === 'savings') return (savings(right) ?? -1) - (savings(left) ?? -1); if (sort === 'discount') return (right.discountPercent ?? -1) - (left.discountPercent ?? -1); if (sort === 'best') return hotDealComparator(left, right); return observedAt(right) - observedAt(left) || String(left.productId).localeCompare(String(right.productId), undefined, { numeric: true }); });
  const filtered = useMemo(() => { const normalizedQuery = queries.discover.trim().toLowerCase(); const max = maximumPrice === '' ? null : Number(maximumPrice); return sortCatalog((snapshot?.products || []).filter((product) => { const searchable = `${product.productName || ''} ${product.productId} ${product.sku || ''}`.toLowerCase(); const discountMatches = Number(minimumDiscount) <= 0 || product.currentPrice === .01 || (product.discountPercent ?? -1) >= Number(minimumDiscount); return (!normalizedQuery || searchable.includes(normalizedQuery)) && (retailer === 'all' || product.retailer === retailer) && (category === 'All Products' || broadCategory(product.category) === category) && discountMatches && (max === null || (product.currentPrice != null && product.currentPrice <= max)); })); }, [snapshot, queries.discover, retailer, category, minimumDiscount, maximumPrice, sort]);
  const hotDeals = useMemo(() => { const normalizedQuery = queries.hot.trim().toLowerCase(); return (snapshot?.products || []).filter((product) => product.retailer === hotRetailer).filter((product) => product.currentPrice === .01 || (product.discountPercent ?? -1) >= 50).filter((product) => !normalizedQuery || `${product.productName || ''} ${product.productId} ${product.sku || ''}`.toLowerCase().includes(normalizedQuery)).sort(hotDealComparator); }, [snapshot, queries.hot, hotRetailer]);
  const visibleCatalog = useMemo(() => filtered.slice(0, visibleCount), [filtered, visibleCount]);
  const pennyMetadata = useMemo(() => {
    const leads = snapshot?.phase9?.currentPennies || snapshot?.phase8?.pennyReports || [];
    const predictions = snapshot?.phase9?.pennyPredictions || [];
    return {
      states: [...new Set([...leads.flatMap((lead) => Object.keys(lead.states || {})), ...predictions.flatMap((item) => item.states || [])])].sort((left, right) => stateLabel(left).localeCompare(stateLabel(right))),
      currentCategories: [...new Set(leads.map(pennyCategory))].sort(),
      currentRetailers: [...new Set(leads.map((lead) => lead.retailer || 'home-depot'))].sort(),
      predictionCategories: [...new Set(predictions.map((item) => broadCategory(item.category || item.productName)))].sort(),
      predictionRetailers: [...new Set(predictions.map((item) => item.retailer))].sort(),
    };
  }, [snapshot]);
  const currentPennies = useMemo(() => {
    const normalizedQuery = queries.pennyCurrent.trim().toLowerCase();
    const evidenceWeight = { 'register-confirmed': 5, 'retailer-price-observed': 4, 'multiple-community-reports': 3, 'single-community-report': 2, 'needs-verification': 1 };
    const freshnessWeight = { 'recently-reported': 3, 'older-report': 2, 'historical-report': 1 };
    return (snapshot?.phase9?.currentPennies || snapshot?.phase8?.pennyReports || [])
      .filter((lead) => pennyState === 'ALL' || Number(lead.states?.[pennyState] || 0) > 0)
      .filter((lead) => pennyReportView === 'all' || lead.verification?.freshness === 'recently-reported')
      .filter((lead) => pennyCategoryFilter === 'All Products' || pennyCategory(lead) === pennyCategoryFilter)
      .filter((lead) => pennyRetailer === 'all' || (lead.retailer || 'home-depot') === pennyRetailer)
      .filter((lead) => pennyEvidence === 'all' || lead.verification?.evidenceLabel === pennyEvidence)
      .filter((lead) => pennyFreshness === 'all' || lead.verification?.freshness === pennyFreshness)
      .filter((lead) => !normalizedQuery || `${lead.productName || ''} ${lead.productId || ''} ${lead.sku || ''} ${lead.upc || ''} ${lead.modelNumber || ''}`.toLowerCase().includes(normalizedQuery))
      .sort((left, right) => {
        if (pennySort === 'reports') return Number(pennyState === 'ALL' ? right.reportCount : right.states?.[pennyState] || 0) - Number(pennyState === 'ALL' ? left.reportCount : left.states?.[pennyState] || 0) || Date.parse(right.lastObservedAt || 0) - Date.parse(left.lastObservedAt || 0);
        if (pennySort === 'recent') return Date.parse(right.lastObservedAt || 0) - Date.parse(left.lastObservedAt || 0) || Number(right.reportCount || 0) - Number(left.reportCount || 0);
        return (freshnessWeight[right.verification?.freshness] || 0) - (freshnessWeight[left.verification?.freshness] || 0) || (evidenceWeight[right.verification?.evidenceLabel] || 0) - (evidenceWeight[left.verification?.evidenceLabel] || 0) || Number(right.reportCount || 0) - Number(left.reportCount || 0);
      });
  }, [snapshot, queries.pennyCurrent, pennyState, pennyReportView, pennySort, pennyCategoryFilter, pennyRetailer, pennyEvidence, pennyFreshness]);
  const pennyPredictions = useMemo(() => {
    const normalizedQuery = queries.pennyPredictions.trim().toLowerCase();
    const strengthWeight = { 'strong-candidate': 3, 'worth-watching': 2, 'early-signal': 1 };
    return (snapshot?.phase9?.pennyPredictions || [])
      .filter((item) => pennyState === 'ALL' || (item.states || []).includes(pennyState))
      .filter((item) => predictionCategory === 'All Products' || broadCategory(item.category || item.productName) === predictionCategory)
      .filter((item) => predictionRetailer === 'all' || item.retailer === predictionRetailer)
      .filter((item) => !normalizedQuery || `${item.productName || ''} ${item.productId || ''}`.toLowerCase().includes(normalizedQuery))
      .sort((left, right) => predictionSort === 'recent' ? Date.parse(right.lastObservedAt || 0) - Date.parse(left.lastObservedAt || 0) : (strengthWeight[right.strength] || 0) - (strengthWeight[left.strength] || 0) || Date.parse(right.lastObservedAt || 0) - Date.parse(left.lastObservedAt || 0));
  }, [snapshot, queries.pennyPredictions, pennyState, predictionSort, predictionCategory, predictionRetailer]);
  useEffect(() => { setVisibleCount(40); }, [queries.discover, retailer, category, minimumDiscount, maximumPrice, sort]);
  useEffect(() => { setVisiblePennyCount(40); }, [queries.pennyCurrent, pennyState, pennyReportView, pennySort, pennyCategoryFilter, pennyRetailer, pennyEvidence, pennyFreshness]);
  const publicationFor = (product) => snapshot?.publications?.find((item) => item.id === product?.publicationId) || null;
  const startWatch = (product) => { setSelected(null); setSelectedPennyLead(null); setSelectedPrediction(null); setWatchPrefill(product); setTab('watches'); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const createWatch = async (rule) => { setCreatingWatch(true); try { const created = await kazakariApi.createWatch(rule); setWatches((current) => [...current, created]); } finally { setCreatingWatch(false); } };
  const deleteWatch = async (id) => { await kazakariApi.deleteWatch(id); setWatches((current) => current.filter((item) => item.id !== id)); };
  const clearFilters = () => { setQueries((current) => ({ ...current, discover: '' })); setRetailer('all'); setCategory('All Products'); setMinimumDiscount(0); setMaximumPrice(''); setSort('recent'); setVisibleCount(40); };
  const clearCurrentPennyFilters = () => { setPennyState('KY'); setPennyReportView('recent'); setPennySort('best'); setPennyCategoryFilter('All Products'); setPennyRetailer('all'); setPennyEvidence('all'); setPennyFreshness('all'); setVisiblePennyCount(40); };
  const clearPredictionFilters = () => { setPennyState('KY'); setPredictionSort('strength'); setPredictionCategory('All Products'); setPredictionRetailer('all'); };
  const changeTab = (nextTab) => { setQueries((current) => ({ ...current, [nextTab]: '' })); if (nextTab === 'discover') clearFilters(); setTab(nextTab); setFiltersOpen(false); setPennyFiltersOpen(false); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const downloadAndroid = async () => { setDownloading(true); try { const release = await kazakariApi.androidDownload(); if (!release?.signedUrl) throw new Error('The private download link was not returned.'); window.location.assign(release.signedUrl); } catch (nextError) { setReleaseError(nextError.message); } finally { setDownloading(false); } };
  const filterControls = { retailer, setRetailer, category, setCategory, minimumDiscount, setMinimumDiscount, maximumPrice, setMaximumPrice, sort, setSort };
  const pennyFilterControls = pennyView === 'current'
    ? { state: pennyState, setState: setPennyState, states: pennyMetadata.states, sort: pennySort, setSort: setPennySort, category: pennyCategoryFilter, setCategory: setPennyCategoryFilter, categories: pennyMetadata.currentCategories, retailer: pennyRetailer, setRetailer: setPennyRetailer, retailers: pennyMetadata.currentRetailers, evidence: pennyEvidence, setEvidence: setPennyEvidence, freshness: pennyFreshness, setFreshness: setPennyFreshness }
    : { state: pennyState, setState: setPennyState, states: pennyMetadata.states, sort: predictionSort, setSort: setPredictionSort, category: predictionCategory, setCategory: setPredictionCategory, categories: pennyMetadata.predictionCategories, retailer: predictionRetailer, setRetailer: setPredictionRetailer, retailers: pennyMetadata.predictionRetailers };
  const touchStart = (event) => { if (androidApp && window.scrollY <= 0 && !refreshing) pullStart.current = event.touches[0]?.clientY ?? null; };
  const touchEnd = (event) => { if (pullStart.current == null) return; const end = event.changedTouches[0]?.clientY ?? pullStart.current; if (end - pullStart.current >= 80) loadData(true); pullStart.current = null; };

  if (!isAuthenticated && !developmentPreview) return <AccessState authenticated={false} onSignIn={() => navigateToLogin('/private/kazakari?source=android')} />;
  if (error?.status === 403) return <AccessState authenticated unauthorized />;

  return <div className="kz-app"><NoIndexMetadata />
    <header className="kz-header"><div className="kz-brand"><div className="kz-mark">K</div><strong>Kazakari</strong></div><div className="kz-header-actions"><button className="kz-refresh" onClick={() => loadData(true)} disabled={refreshing} aria-label="Refresh product data">{refreshing ? <Loader2 className="kz-spin" /> : <RefreshCw />}</button>{androidApp && <button className="kz-menu-button" onClick={() => setMenuOpen(true)} aria-label="Open app menu"><Menu /></button>}</div><div className="kz-search-row"><label className="kz-search"><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search" aria-label="Search products" /></label><button className="kz-scan" onClick={() => setScannerOpen(true)} aria-label="Scan or enter a product barcode"><Camera /></button></div></header>
    {refreshMessage && <div className={`kz-refresh-notice ${refreshMessage.startsWith('Refresh failed') ? 'is-error' : ''}`} role="status">{refreshMessage}</div>}
    <main className="kz-main" onTouchStart={touchStart} onTouchEnd={touchEnd}>
      {!androidApp && <WebsiteDownload release={androidRelease} loading={releaseLoading} error={releaseError} downloading={downloading} onDownload={downloadAndroid} />}
      {loading && <div className="kz-state"><Loader2 className="kz-spin" /><strong>Loading products…</strong></div>}{error && error.status !== 403 && <div className="kz-error"><strong>Could not load Kazakari</strong><span>{error.message}</span></div>}
      {!loading && snapshot && tab === 'hot' && <div className="kz-retailer-picker" role="group" aria-label="Choose a retailer">{Object.entries(retailerLabels).map(([value, label]) => <button key={value} className={hotRetailer === value ? 'active' : ''} onClick={() => setHotRetailer(value)}>{label}</button>)}</div>}
      {!loading && snapshot && tab === 'hot' && <><div className="kz-catalog-tools"><div><strong>{hotDeals.length} products</strong><span>{lastRefresh ? `Updated ${lastRefresh.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : 'Latest saved data'}</span></div></div>{hotDeals.length === 0 ? <Empty title="No hot deals right now" copy="Refresh later to check for newly published discounts." /> : <div className="kz-product-grid">{hotDeals.map((product) => <ProductItem key={`${product.observationId}-${product.productId}`} product={product} onOpen={setSelected} onWatch={startWatch} />)}</div>}</>}
      {!loading && snapshot && tab === 'discover' && <><div className="kz-catalog-tools"><div><strong>{filtered.length} products</strong><span>{lastRefresh ? `Updated ${lastRefresh.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : 'Latest saved data'}</span></div><button className="kz-filter-toggle" onClick={() => setFiltersOpen(true)}><SlidersHorizontal /> Filter &amp; Sort</button></div><section className="kz-filters"><FilterControls {...filterControls} /></section>{filtered.length === 0 ? <Empty title="No matching products" copy="Try clearing filters or choosing a lower discount." action={<button className="kz-text-button" onClick={clearFilters}>Clear filters</button>} /> : <><div className="kz-product-grid">{visibleCatalog.map((product) => <ProductItem key={`${product.observationId}-${product.productId}`} product={product} onOpen={setSelected} onWatch={startWatch} />)}</div>{visibleCatalog.length < filtered.length && <button className="kz-primary kz-load-more" onClick={() => setVisibleCount((count) => count + 40)}>Load more products</button>}</>}</>}
      {!loading && snapshot && tab === 'penny' && <>
        <div className="kz-page-heading"><h1>Penny Finds</h1></div>
        <div className="kz-penny-view-switch" role="group" aria-label="Penny Finds section">
          <button className={pennyView === 'current' ? 'active' : ''} onClick={() => { setPennyView('current'); setPennyFiltersOpen(false); }}>Current Pennies</button>
          <button className={pennyView === 'predictions' ? 'active' : ''} onClick={() => { setPennyView('predictions'); setPennyFiltersOpen(false); }}>Penny Predictions</button>
        </div>
        {pennyView === 'current' && <div className="kz-penny-report-switch" role="group" aria-label="Penny report age"><button className={pennyReportView === 'recent' ? 'active' : ''} onClick={() => setPennyReportView('recent')}>Recent</button><button className={pennyReportView === 'all' ? 'active' : ''} onClick={() => setPennyReportView('all')}>All Reports</button></div>}
        <div className="kz-penny-toolbar"><strong>{stateLabel(pennyState)} · {pennyView === 'current' ? `${currentPennies.length} current ${currentPennies.length === 1 ? 'penny' : 'pennies'}` : `${pennyPredictions.length} ${pennyPredictions.length === 1 ? 'prediction' : 'predictions'}`}</strong><button className="kz-filter-toggle" onClick={() => setPennyFiltersOpen(true)}><SlidersHorizontal /> Filter &amp; Sort</button></div>
        {pennyView === 'current' && (currentPennies.length === 0
          ? <Empty title={`No ${pennyReportView === 'recent' ? 'recent ' : ''}penny reports in ${stateLabel(pennyState)}`} copy={pennyReportView === 'recent' ? 'Older reports remain available in All Reports.' : pennyState === 'ALL' ? 'No penny evidence matches these filters.' : 'Try All States to browse every collected penny report.'} action={pennyReportView === 'recent' ? <button className="kz-text-button" onClick={() => setPennyReportView('all')}>View All Reports</button> : pennyState !== 'ALL' ? <button className="kz-text-button" onClick={() => setPennyState('ALL')}>View All States</button> : undefined} />
          : <><div className="kz-product-grid">{currentPennies.slice(0, visiblePennyCount).map((lead) => <PennyLeadItem key={`${lead.reportId}-${lead.sku || lead.productId}`} lead={lead} selectedState={pennyState} onOpen={setSelectedPennyLead} onWatch={startWatch} />)}</div>{visiblePennyCount < currentPennies.length && <button className="kz-primary kz-load-more" onClick={() => setVisiblePennyCount((count) => count + 40)}>Load more penny reports</button>}</>)}
        {pennyView === 'predictions' && (pennyPredictions.length === 0
          ? <Empty title={`No penny predictions in ${stateLabel(pennyState)}`} copy={pennyState === 'ALL' ? 'Kazakari does not have enough evidence for a prediction under these filters.' : 'Try All States to view products worth monitoring elsewhere.'} action={pennyState !== 'ALL' ? <button className="kz-text-button" onClick={() => setPennyState('ALL')}>View All States</button> : undefined} />
          : <div className="kz-product-grid">{pennyPredictions.map((prediction) => <PennyPredictionItem key={`${prediction.retailer}-${prediction.storeId || 'national'}-${prediction.productId}`} prediction={prediction} onOpen={setSelectedPrediction} onWatch={startWatch} />)}</div>)}
      </>}
      {!loading && snapshot && tab === 'watches' && <WatchPanel watches={watches} onCreate={createWatch} onDelete={deleteWatch} creating={creatingWatch} prefill={watchPrefill} clearPrefill={() => setWatchPrefill(null)} />}
    </main>
    <nav className="kz-tabs" aria-label="Kazakari sections"><button className={tab === 'hot' ? 'active' : ''} onClick={() => changeTab('hot')}><Flame /><span>Hot Deals</span></button><button className={tab === 'penny' ? 'active' : ''} onClick={() => changeTab('penny')}><Tag /><span>Penny Finds</span></button><button className={tab === 'discover' ? 'active' : ''} onClick={() => changeTab('discover')}><Search /><span>All Products</span></button><button className={tab === 'watches' ? 'active' : ''} onClick={() => changeTab('watches')}><Bell /><span>Watches</span></button></nav>
    <footer className="kz-footer"><ShieldCheck /> Prices are observations, not register guarantees.</footer>
    <FilterSheet open={tab === 'discover' && filtersOpen} onClose={() => setFiltersOpen(false)} onClear={clearFilters} controls={filterControls} />
    <PennyFilterSheet open={tab === 'penny' && pennyFiltersOpen} onClose={() => setPennyFiltersOpen(false)} onClear={pennyView === 'current' ? clearCurrentPennyFilters : clearPredictionFilters} controls={pennyFilterControls} prediction={pennyView === 'predictions'} />
    <ProductDetail product={selected} publication={publicationFor(selected)} onClose={() => setSelected(null)} onWatch={startWatch} />
    <PennyLeadDetail lead={selectedPennyLead} onClose={() => setSelectedPennyLead(null)} onWatch={startWatch} />
    <PennyPredictionDetail prediction={selectedPrediction} onClose={() => setSelectedPrediction(null)} onWatch={startWatch} />
    <AppMenu open={menuOpen} onClose={() => setMenuOpen(false)} appInfo={appInfo} onCheckUpdates={() => checkForUpdates(true)} />
    <UpdateDialog state={updateState} onClose={() => setUpdateState(null)} onInstall={installUpdate} />
    <ScannerSheet open={scannerOpen} onClose={() => setScannerOpen(false)} snapshot={snapshot} />
  </div>;
}
