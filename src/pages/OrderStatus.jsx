import React, { useState } from 'react';
import { backend } from '@/services/backend';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Loader2, Package, Truck, CheckCircle, Clock, Search, MapPin, AlertCircle } from 'lucide-react';

const ORDER_STATUS_STEPS = ['pending', 'confirmed', 'shipped', 'delivered'];

const statusConfig = {
  pending:   { label: 'Order Placed',   icon: Clock,        color: 'text-yellow-600',  bg: 'bg-yellow-100' },
  confirmed: { label: 'Confirmed',      icon: CheckCircle,  color: 'text-blue-600',    bg: 'bg-blue-100' },
  shipped:   { label: 'Shipped',        icon: Truck,        color: 'text-purple-600',  bg: 'bg-purple-100' },
  delivered: { label: 'Delivered',      icon: Package,      color: 'text-green-600',   bg: 'bg-green-100' },
  cancelled: { label: 'Cancelled',      icon: AlertCircle,  color: 'text-red-600',     bg: 'bg-red-100' },
};

export default function OrderStatus() {
  const [orderNumber, setOrderNumber] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!orderNumber.trim()) return;

    setLoading(true);
    setError(null);
    setResult(null);

    const response = await backend.actions.invoke('getOrderStatus', {
      order_number: orderNumber.trim(),
      email: email.trim().toLowerCase()
    });

    const data = response.data;
    if (data.error) {
      setError(data.error);
    } else {
      setResult(data);
    }
    setLoading(false);
  };

  const { order, tracking } = result || {};
  const currentStepIndex = order ? ORDER_STATUS_STEPS.indexOf(order.status) : -1;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 py-12">

        {/* Header */}
        <div className="text-center mb-10">
          <div className="w-14 h-14 bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4">
            <Package className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900">Track Your Order</h1>
          <p className="text-gray-500 mt-2">Enter your order number to see real-time shipping updates</p>
        </div>

        {/* Search Form */}
        <Card className="bg-white border-gray-200 mb-6">
          <CardContent className="pt-6">
            <form onSubmit={handleSearch} className="space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Order Number</label>
                <Input
                  placeholder="e.g. MPM-12345"
                  value={orderNumber}
                  onChange={(e) => setOrderNumber(e.target.value)}
                  className="bg-white border-gray-300"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Email Address <span className="text-gray-400 font-normal">(optional, for verification)</span></label>
                <Input
                  type="email"
                  placeholder="your@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="bg-white border-gray-300"
                />
              </div>
              <Button
                type="submit"
                disabled={loading || !orderNumber.trim()}
                className="w-full bg-gray-800 hover:bg-gray-700 text-white h-11"
              >
                {loading ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Searching...</>
                ) : (
                  <><Search className="w-4 h-4 mr-2" /> Track Order</>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Error */}
        {error && (
          <Card className="bg-red-50 border-red-200 mb-6">
            <CardContent className="pt-5 pb-5 flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
              <p className="text-red-700 text-sm">{error}</p>
            </CardContent>
          </Card>
        )}

        {/* Order Result */}
        {order && (
          <>
            {/* Order Summary */}
            <Card className="bg-white border-gray-200 mb-6">
              <CardHeader>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <CardTitle className="text-gray-900">Order #{order.order_number}</CardTitle>
                  {order.status && statusConfig[order.status] && (() => {
                    const cfg = statusConfig[order.status];
                    const Icon = cfg.icon;
                    return (
                      <span className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium ${cfg.bg} ${cfg.color}`}>
                        <Icon className="w-4 h-4" />
                        {cfg.label}
                      </span>
                    );
                  })()}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-gray-500">Customer</p>
                    <p className="font-medium text-gray-900">{order.customer_name}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Total</p>
                    <p className="font-medium text-gray-900">${order.total?.toFixed(2)}</p>
                  </div>
                </div>

                {/* Progress Steps */}
                {order.status !== 'cancelled' && (
                  <div className="mt-4">
                    <div className="flex items-start justify-between gap-2 relative">
                      <div className="absolute left-0 right-0 top-4 h-0.5 bg-gray-200 z-0 hidden sm:block" />
                      <div
                        className="absolute left-0 top-4 h-0.5 bg-gray-800 z-0 transition-all duration-500 hidden sm:block"
                        style={{ width: `${currentStepIndex >= 0 ? (currentStepIndex / (ORDER_STATUS_STEPS.length - 1)) * 100 : 0}%` }}
                      />
                      {ORDER_STATUS_STEPS.map((step, idx) => {
                        const cfg = statusConfig[step];
                        const Icon = cfg.icon;
                        const done = idx <= currentStepIndex;
                        return (
                          <div key={step} className="flex flex-1 flex-col items-center z-10 gap-2 min-w-0">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all ${done ? 'bg-gray-800 border-gray-800' : 'bg-white border-gray-300'}`}>
                              <Icon className={`w-4 h-4 ${done ? 'text-white' : 'text-gray-400'}`} />
                            </div>
                            <span className={`text-[11px] sm:text-xs font-medium text-center leading-tight ${done ? 'text-gray-900' : 'text-gray-400'}`}>{cfg.label}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Items */}
                {order.items?.length > 0 && (
                  <>
                    <Separator className="bg-gray-100" />
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-gray-700">Items ({order.items.length})</p>
                      {order.items.map((item, i) => (
                        <div key={i} className="flex items-center gap-3">
                          {(item.card_image || item.image_url) && (
                            <img src={item.card_image || item.image_url} alt={item.card_name} className="w-10 h-12 object-contain rounded border border-gray-100 bg-gray-50" />
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">{item.card_name}</p>
                            <p className="text-xs text-gray-500">Qty: {item.quantity} · ${item.price?.toFixed(2)}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Tracking Details */}
            {order.tracking_number && (
              <Card className="bg-white border-gray-200">
                <CardHeader>
                  <CardTitle className="text-gray-900 flex items-center gap-2">
                    <Truck className="w-5 h-5 text-gray-600" />
                    Shipping & Tracking
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm text-gray-500">Tracking Number</p>
                      <p className="font-mono font-medium text-gray-900">{order.tracking_number}</p>
                    </div>
                    <a
                      href={`https://tools.usps.com/go/TrackConfirmAction?tLabels=${order.tracking_number}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-gray-700 underline hover:text-gray-900"
                    >
                      Track on USPS →
                    </a>
                  </div>

                  {tracking?.events?.length > 0 && (
                    <>
                      <Separator className="bg-gray-100" />
                      <p className="text-sm font-medium text-gray-700">Tracking History</p>
                      <div className="space-y-3 max-h-72 overflow-y-auto">
                        {tracking.events.map((event, i) => (
                          <div key={i} className="flex gap-3">
                            <div className="mt-1 shrink-0">
                              <div className={`w-2.5 h-2.5 rounded-full ${i === 0 ? 'bg-gray-800' : 'bg-gray-300'}`} />
                            </div>
                            <div className="flex-1">
                              <p className="text-sm font-medium text-gray-900">{event.description}</p>
                              {event.location && (
                                <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                                  <MapPin className="w-3 h-3" />{event.location}
                                </p>
                              )}
                              <p className="text-xs text-gray-400 mt-0.5">{event.timestamp}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}

                  {tracking && !tracking.events?.length && (
                    <p className="text-sm text-gray-500">No tracking events yet. Check back soon.</p>
                  )}
                </CardContent>
              </Card>
            )}

            {!order.tracking_number && order.status !== 'pending' && (
              <Card className="bg-gray-50 border-gray-200">
                <CardContent className="pt-5 pb-5 flex items-center gap-3">
                  <Clock className="w-5 h-5 text-gray-500 shrink-0" />
                  <p className="text-gray-600 text-sm">Tracking information will appear here once your order ships.</p>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  );
}


