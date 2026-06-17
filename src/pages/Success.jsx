import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { backend } from '@/services/backend';
import { Button } from "@/components/ui/button";
import { CheckCircle, Package, Home, Loader2, AlertCircle } from 'lucide-react';
import { clearGuestStorage } from '@/components/utils/guestStorage';

export default function Success() {
    const [loading, setLoading] = useState(true);
    const [order, setOrder] = useState(null);
    const [error, setError] = useState('');

    useEffect(() => {
        const finalizeCheckout = async () => {
            try {
                const params = new URLSearchParams(window.location.search);
                const sessionId = params.get('session_id');

                if (sessionId) {
                    const response = await backend.actions.invoke('finalizeCheckoutSession', {
                        session_id: sessionId
                    });
                    const finalizedOrder = response?.data?.order || null;
                    setOrder(finalizedOrder);
                }

                const isAuth = await backend.auth.isAuthenticated();
                if (isAuth) {
                    const user = await backend.auth.getCurrentUser();
                    const cartItems = await backend.data.CartItem.filter({ user_email: user.email });
                    for (const item of cartItems) {
                        await backend.data.CartItem.delete(item.id);
                    }
                } else {
                    clearGuestStorage();
                }
            } catch (error) {
                console.error('Error finalizing checkout:', error);
                setError(error?.message || 'We could not finalize your order.');
            } finally {
                setLoading(false);
            }
        };

        finalizeCheckout();
    }, []);

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
                <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-6 sm:p-8 text-center">
                    <Loader2 className="w-10 h-10 text-gray-700 animate-spin mx-auto mb-4" />
                    <h1 className="text-2xl font-bold text-gray-900 mb-2">Finalizing your order</h1>
                    <p className="text-gray-600">Please wait while we confirm payment and create your order.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
            <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-6 sm:p-8 text-center">
                {error ? (
                    <>
                        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
                            <AlertCircle className="w-10 h-10 text-red-600" />
                        </div>
                        <h1 className="text-2xl font-bold text-gray-900 mb-2">Checkout Needs Attention</h1>
                        <p className="text-gray-600 mb-6">{error}</p>
                    </>
                ) : (
                    <>
                        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
                            <CheckCircle className="w-10 h-10 text-green-600" />
                        </div>

                        <h1 className="text-2xl font-bold text-gray-900 mb-2">Payment Successful!</h1>
                        <p className="text-gray-600 mb-6">
                            Thank you for your order. We'll send you a confirmation email shortly.
                        </p>

                        <div className="bg-gray-100 rounded-lg p-4 mb-6">
                            <Package className="w-8 h-8 text-gray-700 mx-auto mb-2" />
                            <p className="text-sm text-gray-700">
                                {order?.order_number ? `Order ${order.order_number} is confirmed and being processed.` : 'Your order is being processed and will ship soon.'}
                            </p>
                        </div>
                    </>
                )}

                <div className="flex flex-col gap-3">
                    <Button asChild className="bg-gray-800 hover:bg-gray-700 w-full">
                        <Link to={createPageUrl('Home')}>
                            <Home className="w-4 h-4 mr-2" />
                            Continue Shopping
                        </Link>
                    </Button>
                </div>
            </div>
        </div>
    );
}



