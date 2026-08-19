import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  ArrowLeft,
  Calculator,
  ChevronDown,
  ChevronRight,
  Edit3,
  ExternalLink,
  PackageCheck,
  Printer,
  Save,
  ShieldCheck,
  Truck,
} from 'lucide-react';
import { backend } from '@/services/backend';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  getShippingFulfillmentConfig,
  saveShippingFulfillmentConfig,
} from '@/services/admin/shippingFulfillmentConfig';

const money = (value) => `$${Number(value || 0).toFixed(2)}`;
const LETTER_TIER_LIMITS_OZ = {
  'economy-letter': 1,
  'protected-letter': 3.5,
};

const calculateUnitCost = (supply) => {
  const packQuantity = Math.max(1, Number(supply.packQuantity || 1));
  return Number(supply.expectedPurchasePrice || 0) / packQuantity;
};

const getSupplyStatus = (supply) => {
  const onHand = Number(supply.quantityOnHand || 0);
  const threshold = Number(supply.lowStockThreshold || 0);
  if (threshold > 0 && onHand <= 0) return 'out';
  if (threshold > 0 && onHand <= threshold) return 'low';
  return 'ok';
};

const statusBadge = (status) => {
  if (status === 'out') return <Badge className="bg-red-100 text-red-700 border-red-200">out</Badge>;
  if (status === 'low') return <Badge className="bg-amber-100 text-amber-700 border-amber-200">low</Badge>;
  return <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">ok</Badge>;
};

const getTierSummary = (tier, letterTrack) => {
  const name = String(tier?.name || '').toLowerCase();
  if (name.includes('tracked') || name.includes('package') || name.includes('high')) {
    return {
      charge: 'Calculated',
      use: 'High-value / oversized orders',
      tracking: 'Tracking required',
    };
  }
  if (name.includes('protected')) {
    return {
      charge: `${money(tier?.customerCharge)} S&H`,
      use: 'Larger low-value letter orders',
      tracking: `LetterTrack optional +${money(letterTrack?.customerAddOn ?? letterTrack?.cost)}`,
    };
  }
  return {
    charge: `${money(tier?.customerCharge)} S&H`,
    use: 'Low-value / light singles',
    tracking: `LetterTrack optional +${money(letterTrack?.customerAddOn ?? letterTrack?.cost)}`,
  };
};

const isLetterTier = (tier) => Boolean(tier && Object.prototype.hasOwnProperty.call(LETTER_TIER_LIMITS_OZ, tier.id));

const getSupplyById = (draft, supplyId) => draft?.supplies?.find((supply) => supply.id === supplyId);

const getAdditionalOunceCost = (draft) => calculateUnitCost(getSupplyById(draft, 'additional-ounce') || {});

const calculatePostageCost = (tier, weightOz, additionalOunceCost) => {
  if (!tier) return 0;
  if (!isLetterTier(tier)) return Number(tier.postageCost || 0);
  const roundedOunces = Math.max(1, Math.ceil(Number(weightOz || 1)));
  return Number(tier.postageCost || 0) + Math.max(0, roundedOunces - 1) * Number(additionalOunceCost || 0);
};

const getRecommendedTier = ({ draft, selectedTier, merchandiseTotal, highestSingleCardValue, weightOz }) => {
  const tiers = draft?.shippingTiers || [];
  const byId = (id) => tiers.find((tier) => tier.id === id);
  const selectedLimit = LETTER_TIER_LIMITS_OZ[selectedTier?.id];
  const isSelectedOverLimit = selectedLimit && Number(weightOz || 0) > selectedLimit;

  if (highestSingleCardValue >= 75) return byId('high-value') || byId('tracked-package') || selectedTier;
  if (highestSingleCardValue >= 20 || merchandiseTotal >= 35) return byId('tracked-package') || selectedTier;
  if (isSelectedOverLimit && Number(weightOz || 0) <= LETTER_TIER_LIMITS_OZ['protected-letter']) {
    return byId('protected-letter') || selectedTier;
  }
  if (isSelectedOverLimit) return byId('tracked-package') || selectedTier;
  return selectedTier;
};

const numberInput = (value, onChange, props = {}) => (
  <Input
    type="number"
    step={props.step || '1'}
    min={props.min || '0'}
    value={value}
    onChange={(event) => onChange(event.target.value)}
    className={props.className || 'h-9'}
  />
);

function SupplyIcon({ supply }) {
  const imageUrl = String(supply.imageUrl || '').trim();
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    setImageFailed(false);
  }, [imageUrl]);

  if (imageUrl && !imageFailed) {
    return (
      <span className="group relative inline-flex">
        <img
          src={imageUrl}
          alt={`${supply.name} thumbnail`}
          onError={() => setImageFailed(true)}
          className="h-12 w-12 rounded-lg border border-gray-200 bg-white object-contain"
        />
        <span className="pointer-events-none absolute left-14 top-1/2 z-50 hidden -translate-y-1/2 rounded-xl border border-gray-200 bg-white p-2 shadow-2xl group-hover:block">
          <img
            src={imageUrl}
            alt={`${supply.name} preview`}
            onError={() => setImageFailed(true)}
            className="h-40 w-40 object-contain"
          />
        </span>
      </span>
    );
  }
  const Icon = supply.id === 'knaon-y41bt' ? Printer : PackageCheck;
  return (
    <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-gray-200 bg-slate-50 text-slate-600">
      <Icon className="h-5 w-5" />
    </div>
  );
}

function MetricCard({ label, value, note, className = '' }) {
  return (
    <Card className={`border-gray-200 ${className}`}>
      <CardContent className="p-4">
        <div className="text-xs uppercase tracking-wide text-gray-500">{label}</div>
        <div className="mt-1 text-2xl font-bold text-gray-900">{value}</div>
        {note ? <div className="mt-1 text-xs text-gray-500">{note}</div> : null}
      </CardContent>
    </Card>
  );
}

function Field({ label, children }) {
  return (
    <label className="space-y-1 text-xs font-medium uppercase tracking-wide text-gray-500">
      <span>{label}</span>
      {children}
    </label>
  );
}

export default function AdminShippingFulfillment() {
  const queryClient = useQueryClient();
  const [user, setUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [draft, setDraft] = useState(null);
  const [editingSupplyId, setEditingSupplyId] = useState(null);
  const [editingTierId, setEditingTierId] = useState(null);
  const [planningOpen, setPlanningOpen] = useState(false);
  const [calculator, setCalculator] = useState({
    tierId: 'economy-letter',
    orderValue: 3,
    highestCardValue: 3,
    cards: 1,
    weightOz: 1,
    letterTrack: false,
  });

  useEffect(() => {
    const checkAuth = async () => {
      const isAuth = await backend.auth.isAuthenticated();
      if (!isAuth) {
        backend.auth.redirectToLogin(window.location.href);
        return;
      }
      const currentUser = await backend.auth.getCurrentUser();
      if (currentUser?.role !== 'admin') {
        window.location.href = '/';
        return;
      }
      setUser(currentUser);
      setAuthChecked(true);
    };
    checkAuth();
  }, []);

  const configQuery = useQuery({
    queryKey: ['shippingFulfillmentConfig'],
    queryFn: getShippingFulfillmentConfig,
    enabled: authChecked,
  });

  useEffect(() => {
    if (configQuery.data) setDraft(configQuery.data);
  }, [configQuery.data]);

  const saveMutation = useMutation({
    mutationFn: (nextConfig) => saveShippingFulfillmentConfig(nextConfig, user),
    onSuccess: () => {
      toast.success('Shipping fulfillment config saved');
      queryClient.invalidateQueries({ queryKey: ['shippingFulfillmentConfig'] });
    },
    onError: (error) => {
      console.error(error);
      toast.error(`Save failed: ${error.message || 'unknown error'}`);
    },
  });

  const supplySummary = useMemo(() => {
    const supplies = draft?.supplies || [];
    const low = supplies.filter((supply) => getSupplyStatus(supply) === 'low').length;
    const out = supplies.filter((supply) => getSupplyStatus(supply) === 'out').length;
    const totalValue = supplies.reduce((sum, supply) => sum + Number(supply.quantityOnHand || 0) * calculateUnitCost(supply), 0);
    return { total: supplies.length, low, out, totalValue };
  }, [draft]);

  const selectedTier = useMemo(() => {
    return draft?.shippingTiers?.find((tier) => tier.id === calculator.tierId) || draft?.shippingTiers?.[0];
  }, [draft, calculator.tierId]);

  const fulfillmentMath = useMemo(() => {
    if (!draft || !selectedTier) return null;
    const merchandiseTotal = Number(calculator.orderValue || 0);
    const highestSingleCardValue = Number(calculator.highestCardValue || 0);
    const weightOz = Math.max(0, Number(calculator.weightOz || 0));
    const additionalOunceCost = getAdditionalOunceCost(draft);
    const recommendedTier = getRecommendedTier({
      draft,
      selectedTier,
      merchandiseTotal,
      highestSingleCardValue,
      weightOz,
    });
    const letterTrackEligible = isLetterTier(recommendedTier) && highestSingleCardValue < 20 && merchandiseTotal < 35;
    const letterTrackEnabled = calculator.letterTrack && letterTrackEligible;
    const letterTrackCharge = letterTrackEnabled ? Number(draft.letterTrack?.customerAddOn || 0) : 0;
    const letterTrackCost = letterTrackEnabled ? Number(draft.letterTrack?.cost || 0) : 0;
    const postageCost = calculatePostageCost(recommendedTier, weightOz, additionalOunceCost);
    const packagingAndHandling = Number(recommendedTier.packagingCost || 0) + Number(recommendedTier.handlingCost || 0);
    const fulfillmentCost = postageCost
      + packagingAndHandling
      + letterTrackCost;
    const customerShipping = Number(recommendedTier.customerCharge || 0) + letterTrackCharge;
    const grossCustomerTotal = merchandiseTotal + customerShipping;
    const paymentFee = grossCustomerTotal * (Number(draft.paymentFee?.percent || 0) / 100) + Number(draft.paymentFee?.fixed || 0);
    const estimatedProfit = grossCustomerTotal - fulfillmentCost - paymentFee;
    const shippingMargin = customerShipping - fulfillmentCost;
    return {
      customerShipping,
      fulfillmentCost,
      paymentFee,
      estimatedProfit,
      recommendedTier,
      recommendedTierName: recommendedTier.name,
      shippingMargin,
      letterTrackCost,
      letterTrackEligible,
      postageCost,
      packagingAndHandling,
      merchandiseTotal,
      weightOz,
    };
  }, [draft, selectedTier, calculator]);

  const breakEvenMath = useMemo(() => {
    if (!draft) return null;
    const model = draft.breakEven || {};
    const gross = Number(model.averageCardSale || 0) + Number(model.averageShippingCharge || 0);
    const fee = gross * (Number(draft.paymentFee?.percent || 0) / 100) + Number(draft.paymentFee?.fixed || 0);
    const contribution = gross - Number(model.averageFulfillmentCost || 0) - fee;
    const orders = contribution > 0 ? Math.ceil(Number(model.startupSupplyCost || 0) / contribution) : Infinity;
    return { gross, fee, contribution, orders };
  }, [draft]);

  const updateSupply = (index, patch) => {
    setDraft((current) => ({
      ...current,
      supplies: current.supplies.map((supply, supplyIndex) => (
        supplyIndex === index ? { ...supply, ...patch } : supply
      )),
    }));
  };

  const updateTier = (index, patch) => {
    setDraft((current) => ({
      ...current,
      shippingTiers: current.shippingTiers.map((tier, tierIndex) => (
        tierIndex === index ? { ...tier, ...patch } : tier
      )),
    }));
  };

  if (!authChecked || configQuery.isLoading || !draft) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-gray-900" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-[1800px] px-3 py-6 lg:px-6">
        <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="mb-4 flex items-center gap-3">
              <Button variant="outline" asChild>
                <Link to="/AdminOperations">
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Ops
                </Link>
              </Button>
              <Badge className="border-blue-200 bg-blue-50 text-blue-700">Admin only</Badge>
            </div>
            <h1 className="text-3xl font-bold text-gray-900">Shipping & Fulfillment</h1>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right text-xs text-gray-500">
              <div>Last saved</div>
              <div className="font-medium text-gray-800">{draft.updatedAt ? new Date(draft.updatedAt).toLocaleString() : 'defaults not saved yet'}</div>
            </div>
            <Button
              onClick={() => saveMutation.mutate(draft)}
              disabled={saveMutation.isPending}
              className="bg-slate-900 text-white hover:bg-slate-800"
            >
              <Save className="mr-2 h-4 w-4" />
              {saveMutation.isPending ? 'Saving...' : 'Save config'}
            </Button>
          </div>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
          <Badge variant="outline" className="bg-white">Tracked supplies: {supplySummary.total}</Badge>
          <Badge variant="outline" className="bg-white">Low stock: {supplySummary.low}</Badge>
          <Badge variant="outline" className="bg-white">Out of stock: {supplySummary.out}</Badge>
          <Badge variant="outline" className="bg-white">Supply value: {money(supplySummary.totalValue)}</Badge>
        </div>

        <div className="mb-5 flex gap-3 rounded-xl border border-blue-200 bg-blue-50/60 p-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-blue-700" />
            <div className="text-sm text-blue-950">
              <div className="font-semibold">Locked business rule</div>
              <p className="mt-0.5">
                Shipping and handling can cover postage, packaging, labels, tracking tools, overhead, and a modest margin.
                Keep it fair: no gouging, no hiding sellable card inventory inside fulfillment supplies.
              </p>
            </div>
        </div>

        <div className="space-y-6">
          <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                <div>
                  <h2 className="flex items-center gap-2 text-xl font-semibold text-gray-900">
                    <PackageCheck className="h-5 w-5" />
                    Shipping supplies
                  </h2>
                </div>
              </div>
              <div className="mt-4 overflow-visible rounded-lg border border-gray-200">
                <table className="w-full min-w-[980px] text-sm">
                  <thead className="bg-gray-100 text-left text-xs uppercase tracking-wide text-gray-500">
                    <tr>
                      <th className="p-3">Supply</th>
                      <th className="p-3">On hand</th>
                      <th className="p-3">Unit</th>
                      <th className="p-3">Status</th>
                      <th className="p-3">Supplier</th>
                      <th className="p-3">Restock</th>
                      <th className="p-3 text-right">Edit</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white">
                    {draft.supplies.map((supply, index) => {
                      const status = getSupplyStatus(supply);
                      const isEditing = editingSupplyId === supply.id;
                      return (
                        <React.Fragment key={supply.id}>
                          <tr className="align-middle hover:bg-gray-50">
                            <td className="p-3">
                              <div className="flex items-center gap-3">
                                <SupplyIcon supply={supply} />
                                <div className="min-w-0">
                                  <div className="font-semibold text-gray-900">{supply.name}</div>
                                  <div className="text-xs text-gray-500">{supply.category}</div>
                                </div>
                              </div>
                            </td>
                            <td className="p-3">
                              <div className="font-medium text-gray-900">{Number(supply.quantityOnHand || 0)} on hand</div>
                              <div className="text-xs text-gray-500">low at {Number(supply.lowStockThreshold || 0)}</div>
                            </td>
                            <td className="p-3 font-semibold text-gray-900">{money(calculateUnitCost(supply))} each</td>
                            <td className="p-3">{statusBadge(status)}</td>
                            <td className="p-3">
                              <div className="font-medium text-gray-900">{supply.sourceName || '—'}</div>
                            </td>
                            <td className="p-3">
                              {supply.sourceUrl ? (
                                <Button variant="outline" size="sm" asChild>
                                  <a href={supply.sourceUrl} target="_blank" rel="noreferrer">
                                    Restock <ExternalLink className="ml-1 h-3 w-3" />
                                  </a>
                                </Button>
                              ) : (
                                <span className="text-xs text-gray-400">No link</span>
                              )}
                            </td>
                            <td className="p-3 text-right">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setEditingSupplyId(isEditing ? null : supply.id)}
                              >
                                {isEditing ? <ChevronDown className="mr-1 h-4 w-4" /> : <Edit3 className="mr-1 h-4 w-4" />}
                                Edit
                              </Button>
                            </td>
                          </tr>
                          {isEditing ? (
                            <tr className="bg-slate-50/70">
                              <td colSpan={7} className="p-4">
                                <div className="grid gap-4 lg:grid-cols-3">
                                  <Field label="Supply name">
                                    <Input value={supply.name} onChange={(event) => updateSupply(index, { name: event.target.value })} className="h-9" />
                                  </Field>
                                  <Field label="Category">
                                    <Input value={supply.category} onChange={(event) => updateSupply(index, { category: event.target.value })} className="h-9" />
                                  </Field>
                                  <Field label="Image URL">
                                    <Input value={supply.imageUrl} onChange={(event) => updateSupply(index, { imageUrl: event.target.value })} className="h-9" />
                                  </Field>
                                  <Field label="Source name">
                                    <Input value={supply.sourceName} onChange={(event) => updateSupply(index, { sourceName: event.target.value })} className="h-9" />
                                  </Field>
                                  <Field label="Restock URL">
                                    <Input value={supply.sourceUrl} onChange={(event) => updateSupply(index, { sourceUrl: event.target.value })} className="h-9" />
                                  </Field>
                                  <div className="grid grid-cols-3 gap-3">
                                    <Field label="Pack price">
                                      {numberInput(supply.expectedPurchasePrice, (value) => updateSupply(index, { expectedPurchasePrice: value }), { step: '0.01' })}
                                    </Field>
                                    <Field label="Pack qty">
                                      {numberInput(supply.packQuantity, (value) => updateSupply(index, { packQuantity: value }))}
                                    </Field>
                                    <Field label="Threshold">
                                      {numberInput(supply.lowStockThreshold, (value) => updateSupply(index, { lowStockThreshold: value }))}
                                    </Field>
                                  </div>
                                  <Field label="On hand">
                                    {numberInput(supply.quantityOnHand, (value) => updateSupply(index, { quantityOnHand: value }))}
                                  </Field>
                                  <div className="lg:col-span-2">
                                    <Field label="Internal notes">
                                      <Textarea value={supply.notes} onChange={(event) => updateSupply(index, { notes: event.target.value })} className="min-h-[70px]" />
                                    </Field>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          ) : null}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
          </section>

          <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <h2 className="flex items-center gap-2 text-xl font-semibold text-gray-900">
                <Truck className="h-5 w-5" />
                Shipping policy
              </h2>
              <div className="mt-4 grid gap-3 lg:grid-cols-4">
                {draft.shippingTiers.map((tier, index) => {
                  const summary = getTierSummary(tier, draft.letterTrack);
                  const isEditing = editingTierId === tier.id;
                  return (
                    <div key={tier.id} className="rounded-lg border border-gray-200 bg-white p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h3 className="text-base font-semibold text-gray-900">{tier.name}</h3>
                          <div className="mt-1 text-2xl font-bold text-gray-900">{summary.charge}</div>
                        </div>
                        <Button variant="ghost" size="sm" onClick={() => setEditingTierId(isEditing ? null : tier.id)}>
                          {isEditing ? <ChevronDown className="mr-1 h-4 w-4" /> : <Edit3 className="mr-1 h-4 w-4" />}
                          Edit
                        </Button>
                      </div>
                      <div className="mt-3 space-y-1 text-sm text-gray-600">
                        <div>{summary.use}</div>
                        <div>{summary.tracking}</div>
                      </div>
                      {isEditing ? (
                        <div className="mt-4 border-t border-gray-200 pt-4">
                          <div className="grid grid-cols-2 gap-3">
                            <Field label="Tier name">
                              <Input value={tier.name} onChange={(event) => updateTier(index, { name: event.target.value })} className="h-9" />
                            </Field>
                            <Field label="Customer charge">
                              {numberInput(tier.customerCharge, (value) => updateTier(index, { customerCharge: value }), { step: '0.01' })}
                            </Field>
                            <Field label="Postage">
                              {numberInput(tier.postageCost, (value) => updateTier(index, { postageCost: value }), { step: '0.01' })}
                            </Field>
                            <Field label="Packaging">
                              {numberInput(tier.packagingCost, (value) => updateTier(index, { packagingCost: value }), { step: '0.01' })}
                            </Field>
                            <Field label="Handling">
                              {numberInput(tier.handlingCost, (value) => updateTier(index, { handlingCost: value }), { step: '0.01' })}
                            </Field>
                            <div className="col-span-2">
                              <Field label="Internal policy notes">
                                <Textarea value={tier.policy} onChange={(event) => updateTier(index, { policy: event.target.value })} className="min-h-[72px]" />
                              </Field>
                            </div>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
          </section>

          <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <h2 className="flex items-center gap-2 text-xl font-semibold text-gray-900">
                <Calculator className="h-5 w-5" />
                Fulfillment calculator
              </h2>
              <div className="mt-4 grid gap-3 md:grid-cols-3 xl:grid-cols-6">
                <Field label="Cards">
                  {numberInput(calculator.cards, (value) => setCalculator((current) => ({ ...current, cards: value })))}
                </Field>
                <Field label="Merchandise total">
                  {numberInput(calculator.orderValue, (value) => setCalculator((current) => ({ ...current, orderValue: value })), { step: '0.01' })}
                </Field>
                <Field label="Highest single card value">
                  {numberInput(calculator.highestCardValue, (value) => setCalculator((current) => ({ ...current, highestCardValue: value })), { step: '0.01' })}
                </Field>
                <Field label="Shipping tier">
                  <select
                    value={calculator.tierId}
                    onChange={(event) => setCalculator((current) => ({ ...current, tierId: event.target.value }))}
                    className="h-9 w-full rounded-md border border-gray-200 bg-white px-3 text-sm"
                  >
                    {draft.shippingTiers.map((tier) => <option key={tier.id} value={tier.id}>{tier.name}</option>)}
                  </select>
                </Field>
                <Field label="Weight oz">
                  {numberInput(calculator.weightOz, (value) => setCalculator((current) => ({ ...current, weightOz: value })), { step: '0.1' })}
                </Field>
                <label className="flex h-9 items-center gap-2 self-end rounded-md border border-gray-200 bg-white px-3 text-sm normal-case tracking-normal text-gray-700">
                  <input
                    type="checkbox"
                    checked={calculator.letterTrack}
                    onChange={(event) => setCalculator((current) => ({ ...current, letterTrack: event.target.checked }))}
                  />
                  LetterTrack
                </label>
              </div>
              {fulfillmentMath ? (
                <div className="mt-4 rounded-lg border border-gray-200 bg-slate-50 p-4">
                  <div className="grid gap-x-8 gap-y-2 text-sm md:grid-cols-2 xl:grid-cols-3">
                    {[
                      ['Recommended Tier', fulfillmentMath.recommendedTierName],
                      ['Merchandise Total', money(fulfillmentMath.merchandiseTotal)],
                      ['Customer S&H', money(fulfillmentMath.customerShipping)],
                      ['Postage', money(fulfillmentMath.postageCost)],
                      ['Packaging', money(fulfillmentMath.packagingAndHandling)],
                      ['LetterTrack', fulfillmentMath.letterTrackEligible ? money(fulfillmentMath.letterTrackCost) : 'Not eligible for this tier'],
                      ['Fulfillment Cost', money(fulfillmentMath.fulfillmentCost)],
                      ['Estimated Payment Processing Fee', money(fulfillmentMath.paymentFee)],
                      ['Shipping Margin', money(fulfillmentMath.shippingMargin)],
                      ['Estimated Profit', money(fulfillmentMath.estimatedProfit)],
                    ].map(([label, value]) => (
                      <div key={label} className="flex items-center justify-between gap-4 border-b border-gray-200 py-2">
                        <span className="font-medium text-gray-600">{label}</span>
                        <span className={`font-semibold ${label === 'Estimated Profit' && fulfillmentMath.estimatedProfit < 0 ? 'text-red-700' : 'text-gray-950'}`}>
                          {value}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
          </section>

          <Collapsible open={planningOpen} onOpenChange={setPlanningOpen}>
            <Card className="border-gray-200">
              <CardHeader>
                <CollapsibleTrigger asChild>
                  <button className="flex w-full items-center justify-between text-left">
                    <div>
                      <CardTitle className="text-xl">Advanced / Planning tools</CardTitle>
                      <p className="mt-1 text-sm text-gray-500">Startup math, supply notes, and future promotion planning are tucked away until needed.</p>
                    </div>
                    {planningOpen ? <ChevronDown className="h-5 w-5 text-gray-500" /> : <ChevronRight className="h-5 w-5 text-gray-500" />}
                  </button>
                </CollapsibleTrigger>
              </CardHeader>
              <CollapsibleContent>
                <CardContent className="space-y-6">
                  <div className="grid gap-6 lg:grid-cols-2">
                    <div className="space-y-4">
                      <h3 className="font-semibold text-gray-900">Startup / break-even calculator</h3>
                      <div className="grid grid-cols-2 gap-3">
                        <Field label="Startup supply cost">
                          {numberInput(draft.breakEven.startupSupplyCost, (value) => setDraft((current) => ({ ...current, breakEven: { ...current.breakEven, startupSupplyCost: value } })), { step: '0.01' })}
                        </Field>
                        <Field label="Avg card sale">
                          {numberInput(draft.breakEven.averageCardSale, (value) => setDraft((current) => ({ ...current, breakEven: { ...current.breakEven, averageCardSale: value } })), { step: '0.01' })}
                        </Field>
                        <Field label="Avg shipping charge">
                          {numberInput(draft.breakEven.averageShippingCharge, (value) => setDraft((current) => ({ ...current, breakEven: { ...current.breakEven, averageShippingCharge: value } })), { step: '0.01' })}
                        </Field>
                        <Field label="Avg fulfillment cost">
                          {numberInput(draft.breakEven.averageFulfillmentCost, (value) => setDraft((current) => ({ ...current, breakEven: { ...current.breakEven, averageFulfillmentCost: value } })), { step: '0.01' })}
                        </Field>
                      </div>
                      {breakEvenMath ? (
                        <div className="grid grid-cols-2 gap-3">
                          <MetricCard label="Gross/order" value={money(breakEvenMath.gross)} />
                          <MetricCard label="Contribution/order" value={money(breakEvenMath.contribution)} />
                          <MetricCard label="Payment fee/order" value={money(breakEvenMath.fee)} />
                          <MetricCard label="Break-even orders" value={Number.isFinite(breakEvenMath.orders) ? breakEvenMath.orders : 'N/A'} />
                        </div>
                      ) : null}
                    </div>
                    <div className="space-y-4">
                      <h3 className="font-semibold text-gray-900">Planning notes</h3>
                      <Field label="Supply notes">
                        <Textarea
                          className="min-h-[90px]"
                          value={draft.supplyNotes}
                          onChange={(event) => setDraft((current) => ({ ...current, supplyNotes: event.target.value }))}
                        />
                      </Field>
                      <Field label="$20 promotion concept">
                        <Textarea
                          value={draft.promotionNote}
                          onChange={(event) => setDraft((current) => ({ ...current, promotionNote: event.target.value }))}
                          className="min-h-[90px]"
                        />
                      </Field>
                      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                        <strong>Low-value cards:</strong> minimum sell price remains $1. Promotion planning here does not modify checkout, discounts, cart pricing, or customer-visible promotions.
                      </div>
                    </div>
                  </div>
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>
        </div>
      </div>
    </div>
  );
}
