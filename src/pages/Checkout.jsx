import React, { useEffect, useMemo, useState } from 'react';
import { backend } from '@/services/backend';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { getCardImageUrl, handleCardImageError } from '@/lib/cardImages';
import { clearGuestStorage, getGuestCart } from '@/components/utils/guestStorage';
import { 
  ChevronLeft, 
  Truck, 
  ShoppingBag,
  Loader2
} from 'lucide-react';

export default function Checkout() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [shipping, setShipping] = useState(null);
  const [shippingOptions, setShippingOptions] = useState([]);
  const [loadingRates, setLoadingRates] = useState(false);
  const [ratesFetched, setRatesFetched] = useState(false);
  const zipDebounceRef = React.useRef(null);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    street: '',
    city: '',
    state: '',
    zip: '',
    country: 'US'
  });
  const [guestCart, setGuestCart] = useState([]);
  const [touched, setTouched] = useState({});

  const validateEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());

  const formErrors = useMemo(() => {
    const errors = {};

    if (!String(formData.name || '').trim()) {
      errors.name = 'Full name is required.';
    }

    if (!String(formData.email || '').trim()) {
      errors.email = 'Email is required.';
    } else if (!validateEmail(formData.email)) {
      errors.email = 'Enter a valid email address.';
    }

    if (!String(formData.street || '').trim()) {
      errors.street = 'Street address is required.';
    }

    if (!String(formData.city || '').trim()) {
      errors.city = 'City is required.';
    }

    if (!String(formData.state || '').trim()) {
      errors.state = 'State is required.';
    }

    if (!String(formData.zip || '').trim()) {
      errors.zip = 'ZIP code is required.';
    } else if (!/^\d{5}$/.test(String(formData.zip || '').trim())) {
      errors.zip = 'ZIP code must be 5 digits.';
    }

    return errors;
  }, [formData]);

  const isFormValid = Object.keys(formErrors).length === 0;

  useEffect(() => {
    const loadUser = async () => {
      const isAuth = await backend.auth.isAuthenticated();
      if (isAuth) {
        const userData = await backend.auth.getCurrentUser();
        setUser(userData);
        setFormData(prev => ({
          ...prev,
          name: userData.full_name || '',
          email: userData.email || ''
        }));
      } else {
        setGuestCart(getGuestCart());
      }
      setLoading(false);
    };
    loadUser();
  }, []);

  const STANDARD_SHIPPING = {
    id: 'standard_protected',
    name: 'Standard Shipping',
    price: 5.00,
    days: '3-7 business days',
    note: 'Includes card protection (toploader + sleeve)'
  };

  const formatShippingOption = (option) => {
    if (!option) return option;

    if (option.id === 'usps_ground_advantage') {
      return {
        ...option,
        name: 'Economy Shipping'
      };
    }

    if (option.id === 'priority') {
      return {
        ...option,
        name: 'Expedited Shipping'
      };
    }

    if (option.id === 'express') {
      return {
        ...option,
        name: 'Express Shipping'
      };
    }

    return option;
  };

  const fetchShippingRates = async (zip) => {
    if (!zip || zip.length !== 5) return;
    setLoadingRates(true);
    setRatesFetched(false);
    try {
      const response = await backend.actions.invoke('getShippingRates', {
        destinationZip: zip,
        weightOz: 3
      });
      const uspsRates = response.data?.rates || [];
      // Prepend our flat-rate standard option, then add USPS upgraded options (priority/express only)
      const upgrades = uspsRates
        .filter(r => r.id !== 'usps_ground_advantage')
        .map(formatShippingOption);
      const options = [STANDARD_SHIPPING, ...upgrades];
      setShippingOptions(options);
      setShipping(options[0]);
      setRatesFetched(true);
    } catch {
      const fallback = [
        STANDARD_SHIPPING,
        formatShippingOption({ id: 'priority', name: 'Priority Mail', price: 12.99, days: '1-3 business days' }),
        formatShippingOption({ id: 'express', name: 'Priority Mail Express', price: 29.99, days: '1-2 business days' }),
      ];
      setShippingOptions(fallback);
      setShipping(fallback[0]);
      setRatesFetched(true);
    } finally {
      setLoadingRates(false);
    }
  };

  const handleFieldChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleFieldBlur = (field) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
  };

  const handleZipChange = (zip) => {
    const normalizedZip = String(zip || '').replace(/\D/g, '').slice(0, 5);
    setFormData(prev => ({ ...prev, zip: normalizedZip }));
    setRatesFetched(false);
    setShipping(null);
    if (zipDebounceRef.current) clearTimeout(zipDebounceRef.current);
    if (normalizedZip.length === 5) {
      zipDebounceRef.current = setTimeout(() => fetchShippingRates(normalizedZip), 600);
    }
  };

  const { data: dbCartItems = [] } = useQuery({
    queryKey: ['cart', user?.email],
    queryFn: () => backend.data.CartItem.filter({ user_email: user.email }),
    enabled: !!user?.email
  });

  const cartItems = user ? dbCartItems : guestCart;

  const subtotal = cartItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const total = subtotal + (shipping?.price || 0);

  const checkoutMutation = useMutation({
    mutationFn: async () => {
      if (window.self !== window.top) {
        throw new Error('Checkout must be completed in a published app, not in preview mode.');
      }

      const response = await backend.actions.invoke('createCheckout', {
        cartItems: cartItems.map(item => ({
          card_id: item.card_id,
          card_name: item.card_name,
          card_image: item.card_image,
          price: item.price,
          quantity: item.quantity
        })),
        shippingInfo: {
          name: formData.name,
          email: formData.email,
          address: formData.street,
          city: formData.city,
          state: formData.state,
          zip: formData.zip,
          country: formData.country
        },
        shippingCost: shipping?.price || 0,
        userEmail: user?.email
      });

      return response.data.url;
    },
    onSuccess: (checkoutUrl) => {
      // Clear guest cart on successful checkout
      if (!user) {
        clearGuestStorage();
      }
      window.location.href = checkoutUrl;
    },
    onError: (error) => {
      if (error.message.includes('preview mode')) {
        toast.error('Please publish your app to test checkout');
      } else {
        toast.error(error?.message || 'Failed to start checkout. Please try again.');
      }
    }
  });

  const canSubmitCheckout = isFormValid && Boolean(shipping) && !loadingRates && !checkoutMutation.isPending;

  const handleSubmit = (e) => {
    e.preventDefault();
    setTouched({
      name: true,
      email: true,
      street: true,
      city: true,
      state: true,
      zip: true
    });

    if (!isFormValid) {
      const firstError = Object.values(formErrors)[0];
      toast.error(firstError || 'Please complete the checkout form.');
      return;
    }
    if (!shipping) {
      toast.error('Please enter your ZIP code to get shipping rates');
      return;
    }
    checkoutMutation.mutate();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-gray-700 animate-spin" />
      </div>
    );
  }



  if (cartItems.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center">
          <ShoppingBag className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h2 className="text-gray-900 text-2xl font-bold mb-2">Your cart is empty</h2>
          <p className="text-gray-600 mb-6">Add some cards to get started</p>
          <Link to={createPageUrl('Home')}>
            <Button className="bg-gray-800 hover:bg-gray-700 text-white">
              Browse Cards
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto px-4 py-8">
        <Link to={createPageUrl('Home')}>
          <Button variant="ghost" className="text-gray-600 hover:text-gray-900 mb-6 -ml-2">
            <ChevronLeft className="w-5 h-5 mr-1" />
            Continue Shopping
          </Button>
        </Link>

        <h1 className="text-3xl font-bold text-gray-900 mb-8">Checkout</h1>

        <form onSubmit={handleSubmit}>
          <div className="grid lg:grid-cols-3 gap-6 lg:gap-8">
            {/* Combined Form */}
            <div className="lg:col-span-2">
              <Card className="bg-white border-gray-200">
                <CardHeader>
                  <CardTitle className="text-gray-900 flex items-center gap-2">
                    <Truck className="w-5 h-5 text-gray-700" />
                    Shipping & Delivery
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div>
                      <Label className="text-gray-700">Full Name</Label>
                      <Input
                        required
                        value={formData.name}
                        onChange={(e) => handleFieldChange('name', e.target.value)}
                        onBlur={() => handleFieldBlur('name')}
                        className="bg-white border-gray-300 text-gray-900 mt-1"
                      />
                      {touched.name && formErrors.name && <p className="text-sm text-red-600 mt-1">{formErrors.name}</p>}
                    </div>
                    <div>
                      <Label className="text-gray-700">Email</Label>
                      <Input
                        type="email"
                        required
                        value={formData.email}
                        onChange={(e) => handleFieldChange('email', e.target.value)}
                        onBlur={() => handleFieldBlur('email')}
                        className="bg-white border-gray-300 text-gray-900 mt-1"
                      />
                      {touched.email && formErrors.email && <p className="text-sm text-red-600 mt-1">{formErrors.email}</p>}
                    </div>
                  </div>
                  <div>
                    <Label className="text-gray-700">Street Address</Label>
                    <Input
                      required
                      value={formData.street}
                      onChange={(e) => handleFieldChange('street', e.target.value)}
                      onBlur={() => handleFieldBlur('street')}
                      className="bg-white border-gray-300 text-gray-900 mt-1"
                    />
                    {touched.street && formErrors.street && <p className="text-sm text-red-600 mt-1">{formErrors.street}</p>}
                  </div>
                  <div className="grid sm:grid-cols-3 gap-4">
                    <div>
                      <Label className="text-gray-700">City</Label>
                      <Input
                        required
                        value={formData.city}
                        onChange={(e) => handleFieldChange('city', e.target.value)}
                        onBlur={() => handleFieldBlur('city')}
                        className="bg-white border-gray-300 text-gray-900 mt-1"
                      />
                      {touched.city && formErrors.city && <p className="text-sm text-red-600 mt-1">{formErrors.city}</p>}
                    </div>
                    <div>
                      <Label className="text-gray-700">State</Label>
                      <Input
                        required
                        value={formData.state}
                        onChange={(e) => handleFieldChange('state', e.target.value)}
                        onBlur={() => handleFieldBlur('state')}
                        className="bg-white border-gray-300 text-gray-900 mt-1"
                      />
                      {touched.state && formErrors.state && <p className="text-sm text-red-600 mt-1">{formErrors.state}</p>}
                    </div>
                    <div>
                      <Label className="text-gray-700">ZIP Code</Label>
                      <Input
                        required
                        value={formData.zip}
                        onChange={(e) => handleZipChange(e.target.value)}
                        onBlur={() => handleFieldBlur('zip')}
                        maxLength={5}
                        placeholder="12345"
                        className="bg-white border-gray-300 text-gray-900 mt-1"
                      />
                      {touched.zip && formErrors.zip && <p className="text-sm text-red-600 mt-1">{formErrors.zip}</p>}
                    </div>
                  </div>

                  <Separator className="bg-gray-200" />

                  <div>
                    <Label className="text-gray-700 mb-3 block">Select Shipping Method</Label>
                    {loadingRates ? (
                      <div className="flex items-center gap-2 py-4 text-gray-500">
                        <Loader2 className="w-4 h-4 animate-spin text-gray-600" />
                        <span className="text-sm">Fetching live shipping rates...</span>
                      </div>
                    ) : !ratesFetched ? (
                      <p className="text-sm text-gray-400 py-2">Enter your ZIP code above to see shipping rates.</p>
                    ) : (
                      <div className="space-y-3">
                        {shippingOptions.map((option) => (
                          <div
                            key={option.id}
                            onClick={() => setShipping(option)}
                            className={`flex items-center justify-between p-4 rounded-lg border cursor-pointer transition-colors ${
                              shipping?.id === option.id 
                                ? 'border-gray-700 bg-gray-100' 
                                : 'border-gray-200 hover:border-gray-300'
                            }`}
                          >
                            <div>
                              <p className="text-gray-900 font-medium">{option.name}</p>
                              <p className="text-gray-500 text-sm">{option.days}</p>
                              {option.note && (
                                <p className="text-green-600 text-xs mt-0.5">✓ {option.note}</p>
                              )}
                            </div>
                            <span className="text-gray-900 font-bold">${option.price.toFixed(2)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Order Summary */}
            <div>
              <Card className="bg-white border-gray-200 lg:sticky lg:top-8">
                <CardHeader>
                  <CardTitle className="text-gray-900">Order Summary</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {cartItems.map((item) => (
                    <div key={item.id} className="flex gap-3 items-start">
                      <div className="w-16 h-20 rounded bg-gray-100 overflow-hidden flex-shrink-0 border border-gray-200">
                        {getCardImageUrl(item) && (
                          <img src={getCardImageUrl(item)} alt="" className="w-full h-full object-contain" onError={(event) => handleCardImageError(event, item)} />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-gray-900 text-sm font-medium truncate">{item.card_name}</p>
                        <p className="text-gray-500 text-sm">Qty: {item.quantity}</p>
                        <p className="text-gray-800 font-medium">${(item.price * item.quantity).toFixed(2)}</p>
                      </div>
                    </div>
                  ))}

                  <Separator className="bg-gray-200" />

                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Subtotal</span>
                      <span className="text-gray-900">${subtotal.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Shipping</span>
                      <span className="text-gray-900">
                        {shipping ? `$${shipping.price.toFixed(2)}` : '—'}
                      </span>
                    </div>
                  </div>

                  <Separator className="bg-gray-200" />

                  <div className="flex justify-between text-lg font-bold">
                    <span className="text-gray-900">Total</span>
                    <span className="text-gray-900">${total.toFixed(2)}</span>
                  </div>

                  <Button 
                    type="submit"
                    className="w-full bg-gray-800 hover:bg-gray-700 text-white font-bold h-12 text-sm sm:text-base"
                    disabled={!canSubmitCheckout}
                  >
                    {checkoutMutation.isPending ? (
                      <>
                        <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                        Redirecting to Stripe...
                      </>
                    ) : (
                      'Proceed to Payment'
                    )}
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}



