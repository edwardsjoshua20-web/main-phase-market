import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  ArrowLeft,
  Calculator,
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
import {
  getShippingFulfillmentConfig,
  saveShippingFulfillmentConfig,
} from '@/services/admin/shippingFulfillmentConfig';

const money = (value) => `$${Number(value || 0).toFixed(2)}`;
const percent = (value) => `${Number(value || 0).toFixed(2)}%`;

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
  if (supply.imageUrl) {
    return (
      <img
        src={supply.imageUrl}
        alt=""
        className="h-12 w-12 rounded-lg border border-gray-200 bg-white object-contain"
      />
    );
  }
  const Icon = supply.id === 'knaon-y41bt' ? Printer : PackageCheck;
  return (
    <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-gray-200 bg-slate-50 text-slate-600">
      <Icon className="h-5 w-5" />
    </div>
  );
}

function MetricCard({ label, value, note }) {
  return (
    <Card className="border-gray-200">
      <CardContent className="p-4">
        <div className="text-xs uppercase tracking-wide text-gray-500">{label}</div>
        <div className="mt-1 text-2xl font-bold text-gray-900">{value}</div>
        {note ? <div className="mt-1 text-xs text-gray-500">{note}</div> : null}
      </CardContent>
    </Card>
  );
}

export default function AdminShippingFulfillment() {
  const queryClient = useQueryClient();
  const [user, setUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [draft, setDraft] = useState(null);
  const [calculator, setCalculator] = useState({
    tierId: 'economy-letter',
    orderValue: 3,
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
    const orderValue = Number(calculator.orderValue || 0);
    const tierCharge = Number(selectedTier.customerCharge || 0);
    const letterTrackCharge = calculator.letterTrack ? Number(draft.letterTrack?.customerAddOn || 0) : 0;
    const letterTrackCost = calculator.letterTrack ? Number(draft.letterTrack?.cost || 0) : 0;
    const fulfillmentCost = Number(selectedTier.postageCost || 0)
      + Number(selectedTier.packagingCost || 0)
      + Number(selectedTier.handlingCost || 0)
      + letterTrackCost;
    const customerShipping = tierCharge + letterTrackCharge;
    const grossCustomerTotal = orderValue + customerShipping;
    const paymentFee = grossCustomerTotal * (Number(draft.paymentFee?.percent || 0) / 100) + Number(draft.paymentFee?.fixed || 0);
    const contribution = grossCustomerTotal - fulfillmentCost - paymentFee;
    return { customerShipping, fulfillmentCost, paymentFee, contribution };
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
      <div className="mx-auto max-w-7xl px-4 py-8">
        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
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
            <p className="mt-2 max-w-3xl text-sm text-gray-600">
              One business control surface for supplies, shipping rules, fulfillment costs, restock links, and low-value-card order math.
            </p>
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

        <div className="mb-6 grid gap-4 md:grid-cols-4">
          <MetricCard label="Tracked supplies" value={supplySummary.total} note="Fulfillment supplies only" />
          <MetricCard label="Low stock" value={supplySummary.low} note="At or below threshold" />
          <MetricCard label="Out of stock" value={supplySummary.out} note="Needs source/restock" />
          <MetricCard label="Supply value" value={money(supplySummary.totalValue)} note="On-hand estimate" />
        </div>

        <Card className="mb-6 border-blue-200 bg-blue-50/50">
          <CardContent className="flex gap-3 p-4">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-blue-700" />
            <div className="text-sm text-blue-950">
              <div className="font-semibold">Locked business rule</div>
              <p>
                Shipping and handling can cover postage, packaging, labels, tracking tools, overhead, and a modest margin.
                Keep it fair: no gouging, no hiding sellable card inventory inside fulfillment supplies.
              </p>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-6 xl:grid-cols-[1.35fr_0.9fr]">
          <Card className="border-gray-200">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl">
                <PackageCheck className="h-5 w-5" />
                Shipping supplies
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto rounded-lg border border-gray-200">
                <table className="w-full min-w-[980px] text-sm">
                  <thead className="bg-gray-100 text-left text-xs uppercase tracking-wide text-gray-500">
                    <tr>
                      <th className="p-3">Supply</th>
                      <th className="p-3">Source</th>
                      <th className="p-3">Price / pack</th>
                      <th className="p-3">Unit</th>
                      <th className="p-3">On hand</th>
                      <th className="p-3">Threshold</th>
                      <th className="p-3">Status</th>
                      <th className="p-3">Restock</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white">
                    {draft.supplies.map((supply, index) => {
                      const status = getSupplyStatus(supply);
                      return (
                        <tr key={supply.id} className="align-top">
                          <td className="p-3">
                            <div className="flex gap-3">
                              <SupplyIcon supply={supply} />
                              <div className="min-w-0 space-y-2">
                                <Input value={supply.name} onChange={(event) => updateSupply(index, { name: event.target.value })} className="h-9 font-medium" />
                                <Input value={supply.category} onChange={(event) => updateSupply(index, { category: event.target.value })} className="h-8 text-xs" />
                                <Input placeholder="Image URL" value={supply.imageUrl} onChange={(event) => updateSupply(index, { imageUrl: event.target.value })} className="h-8 text-xs" />
                                <Textarea value={supply.notes} onChange={(event) => updateSupply(index, { notes: event.target.value })} className="min-h-[44px] text-xs" />
                              </div>
                            </div>
                          </td>
                          <td className="p-3">
                            <div className="space-y-2">
                              <Input placeholder="Source name" value={supply.sourceName} onChange={(event) => updateSupply(index, { sourceName: event.target.value })} className="h-9" />
                              <Input placeholder="Restock URL" value={supply.sourceUrl} onChange={(event) => updateSupply(index, { sourceUrl: event.target.value })} className="h-9 text-xs" />
                            </div>
                          </td>
                          <td className="p-3">
                            <div className="grid grid-cols-2 gap-2">
                              {numberInput(supply.expectedPurchasePrice, (value) => updateSupply(index, { expectedPurchasePrice: value }), { step: '0.01' })}
                              {numberInput(supply.packQuantity, (value) => updateSupply(index, { packQuantity: value }))}
                            </div>
                          </td>
                          <td className="p-3 font-semibold text-gray-900">{money(calculateUnitCost(supply))}</td>
                          <td className="p-3">{numberInput(supply.quantityOnHand, (value) => updateSupply(index, { quantityOnHand: value }))}</td>
                          <td className="p-3">{numberInput(supply.lowStockThreshold, (value) => updateSupply(index, { lowStockThreshold: value }))}</td>
                          <td className="p-3">{statusBadge(status)}</td>
                          <td className="p-3">
                            {supply.sourceUrl ? (
                              <Button variant="outline" size="sm" asChild>
                                <a href={supply.sourceUrl} target="_blank" rel="noreferrer">
                                  Buy <ExternalLink className="ml-1 h-3 w-3" />
                                </a>
                              </Button>
                            ) : (
                              <span className="text-xs text-gray-400">Add source</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <Textarea
                className="mt-4 min-h-[70px]"
                value={draft.supplyNotes}
                onChange={(event) => setDraft((current) => ({ ...current, supplyNotes: event.target.value }))}
              />
            </CardContent>
          </Card>

          <div className="space-y-6">
            <Card className="border-gray-200">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-xl">
                  <Truck className="h-5 w-5" />
                  Locked shipping guide
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {draft.shippingTiers.map((tier, index) => (
                  <div key={tier.id} className="rounded-lg border border-gray-200 bg-white p-3">
                    <div className="flex items-center justify-between gap-3">
                      <Input value={tier.name} onChange={(event) => updateTier(index, { name: event.target.value })} className="h-9 font-semibold" />
                      <Badge variant="outline">{money(tier.customerCharge)}</Badge>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <label className="text-xs text-gray-500">Charge {numberInput(tier.customerCharge, (value) => updateTier(index, { customerCharge: value }), { step: '0.01' })}</label>
                      <label className="text-xs text-gray-500">Postage {numberInput(tier.postageCost, (value) => updateTier(index, { postageCost: value }), { step: '0.01' })}</label>
                      <label className="text-xs text-gray-500">Packaging {numberInput(tier.packagingCost, (value) => updateTier(index, { packagingCost: value }), { step: '0.01' })}</label>
                      <label className="text-xs text-gray-500">Handling {numberInput(tier.handlingCost, (value) => updateTier(index, { handlingCost: value }), { step: '0.01' })}</label>
                    </div>
                    <Textarea value={tier.policy} onChange={(event) => updateTier(index, { policy: event.target.value })} className="mt-3 min-h-[56px] text-xs" />
                  </div>
                ))}
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                  <strong>Low-value cards:</strong> minimum sell price remains $1. Cheap cards use the lowest safe shipping tier. LetterTrack can be a configurable add-on, but it does not replace true tracking.
                </div>
              </CardContent>
            </Card>

            <Card className="border-gray-200">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-xl">
                  <Calculator className="h-5 w-5" />
                  Fulfillment calculator
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <label className="text-xs text-gray-500">
                    Shipping tier
                    <select
                      value={calculator.tierId}
                      onChange={(event) => setCalculator((current) => ({ ...current, tierId: event.target.value }))}
                      className="mt-1 h-9 w-full rounded-md border border-gray-200 bg-white px-3 text-sm"
                    >
                      {draft.shippingTiers.map((tier) => <option key={tier.id} value={tier.id}>{tier.name}</option>)}
                    </select>
                  </label>
                  <label className="text-xs text-gray-500">Order value {numberInput(calculator.orderValue, (value) => setCalculator((current) => ({ ...current, orderValue: value })), { step: '0.01' })}</label>
                  <label className="text-xs text-gray-500">Cards {numberInput(calculator.cards, (value) => setCalculator((current) => ({ ...current, cards: value })))}</label>
                  <label className="text-xs text-gray-500">Weight oz {numberInput(calculator.weightOz, (value) => setCalculator((current) => ({ ...current, weightOz: value })), { step: '0.1' })}</label>
                </div>
                <label className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white p-3 text-sm">
                  <input
                    type="checkbox"
                    checked={calculator.letterTrack}
                    onChange={(event) => setCalculator((current) => ({ ...current, letterTrack: event.target.checked }))}
                  />
                  Add LetterTrack ({money(draft.letterTrack.customerAddOn)} customer add-on / {money(draft.letterTrack.cost)} cost)
                </label>
                {fulfillmentMath ? (
                  <div className="grid grid-cols-2 gap-3">
                    <MetricCard label="Customer S&H" value={money(fulfillmentMath.customerShipping)} />
                    <MetricCard label="Fulfillment cost" value={money(fulfillmentMath.fulfillmentCost)} />
                    <MetricCard label="Payment fee" value={money(fulfillmentMath.paymentFee)} note={percent(draft.paymentFee.percent)} />
                    <MetricCard label="Order contribution" value={money(fulfillmentMath.contribution)} />
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </div>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <Card className="border-gray-200">
            <CardHeader>
              <CardTitle>Startup / break-even calculator</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <label className="text-xs text-gray-500">Startup supply cost {numberInput(draft.breakEven.startupSupplyCost, (value) => setDraft((current) => ({ ...current, breakEven: { ...current.breakEven, startupSupplyCost: value } })), { step: '0.01' })}</label>
                <label className="text-xs text-gray-500">Avg card sale {numberInput(draft.breakEven.averageCardSale, (value) => setDraft((current) => ({ ...current, breakEven: { ...current.breakEven, averageCardSale: value } })), { step: '0.01' })}</label>
                <label className="text-xs text-gray-500">Avg shipping charge {numberInput(draft.breakEven.averageShippingCharge, (value) => setDraft((current) => ({ ...current, breakEven: { ...current.breakEven, averageShippingCharge: value } })), { step: '0.01' })}</label>
                <label className="text-xs text-gray-500">Avg fulfillment cost {numberInput(draft.breakEven.averageFulfillmentCost, (value) => setDraft((current) => ({ ...current, breakEven: { ...current.breakEven, averageFulfillmentCost: value } })), { step: '0.01' })}</label>
              </div>
              {breakEvenMath ? (
                <div className="grid grid-cols-2 gap-3">
                  <MetricCard label="Gross per order" value={money(breakEvenMath.gross)} />
                  <MetricCard label="Contribution/order" value={money(breakEvenMath.contribution)} />
                  <MetricCard label="Payment fee/order" value={money(breakEvenMath.fee)} />
                  <MetricCard label="Break-even orders" value={Number.isFinite(breakEvenMath.orders) ? breakEvenMath.orders : 'N/A'} />
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card className="border-gray-200">
            <CardHeader>
              <CardTitle>Promotion note placeholder</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                value={draft.promotionNote}
                onChange={(event) => setDraft((current) => ({ ...current, promotionNote: event.target.value }))}
                className="min-h-[90px]"
              />
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
                This is intentionally only a planning note. It does not modify checkout, discounts, cart pricing, or customer-visible promotions.
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
