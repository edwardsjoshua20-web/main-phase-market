import React, { useState, useEffect } from 'react';
import { backend } from '@/services/backend';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { format } from 'date-fns';
import { 
  Search, 
  Package,
  Truck,
  CheckCircle,
  XCircle,
  Clock,
  DollarSign,
  ShoppingBag
} from 'lucide-react';
import StatsCard from '@/components/admin/StatsCard';

const statusConfig = {
  pending: { label: 'Pending', color: 'bg-yellow-100 text-yellow-700', icon: Clock },
  confirmed: { label: 'Confirmed', color: 'bg-blue-100 text-blue-700', icon: Package },
  shipped: { label: 'Shipped', color: 'bg-purple-100 text-purple-700', icon: Truck },
  delivered: { label: 'Delivered', color: 'bg-green-100 text-green-700', icon: CheckCircle },
  cancelled: { label: 'Cancelled', color: 'bg-red-100 text-red-700', icon: XCircle },
};

export default function AdminOrders() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedOrder, setSelectedOrder] = useState(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    const loadUser = async () => {
      const isAuth = await backend.auth.isAuthenticated();
      if (!isAuth) {
        backend.auth.redirectToLogin(window.location.href);
        return;
      }
      const userData = await backend.auth.getCurrentUser();
      if (userData.role !== 'admin') {
        window.location.href = '/';
        return;
      }
      setUser(userData);
      setLoading(false);
    };
    loadUser();
  }, []);

  const { data: orders = [], isLoading: ordersLoading } = useQuery({
    queryKey: ['admin-orders'],
    queryFn: () => backend.data.Order.list('-created_date'),
    enabled: !loading
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => backend.data.Order.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['admin-orders']);
      toast.success('Order updated');
    }
  });

  const filteredOrders = orders.filter(o => {
    const matchesSearch = 
      o.order_number?.toLowerCase().includes(search.toLowerCase()) ||
      o.customer_name?.toLowerCase().includes(search.toLowerCase()) ||
      o.customer_email?.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'all' || o.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const totalRevenue = orders.filter(o => o.status !== 'cancelled').reduce((sum, o) => sum + (o.total || 0), 0);
  const pendingOrders = orders.filter(o => o.status === 'pending').length;
  const shippedOrders = orders.filter(o => o.status === 'shipped').length;
  const completedOrders = orders.filter(o => o.status === 'delivered').length;

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-600">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Orders</h1>
          <p className="text-gray-500 mt-1">Manage and track customer orders</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <StatsCard 
            title="Total Revenue" 
            value={`$${totalRevenue.toFixed(2)}`} 
            icon={DollarSign}
            color="blue"
          />
          <StatsCard 
            title="Pending" 
            value={pendingOrders} 
            icon={Clock}
            color="amber"
          />
          <StatsCard 
            title="In Transit" 
            value={shippedOrders} 
            icon={Truck}
            color="purple"
          />
          <StatsCard 
            title="Completed" 
            value={completedOrders} 
            icon={CheckCircle}
            color="green"
          />
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <Input
              placeholder="Search by order #, customer..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 bg-white border-gray-200 text-gray-900 h-12"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px] bg-white border-gray-200 text-gray-900 h-12">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Orders</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="confirmed">Confirmed</SelectItem>
              <SelectItem value="shipped">Shipped</SelectItem>
              <SelectItem value="delivered">Delivered</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Orders Table */}
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-gray-200 bg-gray-50">
                  <TableHead className="text-gray-600">Order</TableHead>
                  <TableHead className="text-gray-600">Customer</TableHead>
                  <TableHead className="text-gray-600">Items</TableHead>
                  <TableHead className="text-gray-600">Total</TableHead>
                  <TableHead className="text-gray-600">Date</TableHead>
                  <TableHead className="text-gray-600">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredOrders.map((order) => {
                  const status = statusConfig[order.status] || statusConfig.pending;
                  const StatusIcon = status.icon;
                  
                  return (
                    <TableRow 
                      key={order.id} 
                      className="border-gray-200 cursor-pointer hover:bg-gray-50"
                      onClick={() => setSelectedOrder(order)}
                    >
                      <TableCell className="font-medium text-blue-600">
                        {order.order_number}
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="text-gray-900">{order.customer_name}</p>
                          <p className="text-gray-500 text-sm">{order.customer_email}</p>
                        </div>
                      </TableCell>
                      <TableCell className="text-gray-700">
                        {order.items?.length || 0} items
                      </TableCell>
                      <TableCell className="text-gray-900 font-medium">
                        ${order.total?.toFixed(2)}
                      </TableCell>
                      <TableCell className="text-gray-500">
                        {order.created_date && format(new Date(order.created_date), 'MMM d, yyyy')}
                      </TableCell>
                      <TableCell>
                        <Badge className={`${status.color} flex items-center gap-1 w-fit`}>
                          <StatusIcon className="w-3 h-3" />
                          {status.label}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {filteredOrders.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-12 text-gray-500">
                      No orders found
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>

      {/* Order Detail Dialog */}
      <Dialog open={!!selectedOrder} onOpenChange={() => setSelectedOrder(null)}>
        <DialogContent className="bg-white border-gray-200 max-w-2xl max-h-[90vh] overflow-y-auto">
          {selectedOrder && (
            <>
              <DialogHeader>
                <DialogTitle className="text-gray-900 text-xl flex items-center gap-2">
                  <ShoppingBag className="w-5 h-5 text-blue-600" />
                  Order {selectedOrder.order_number}
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-6">
                {/* Status Update */}
                <div className="flex items-center gap-4">
                  <Label className="text-gray-700">Status:</Label>
                  <Select 
                    value={selectedOrder.status} 
                    onValueChange={(v) => {
                      updateMutation.mutate({ id: selectedOrder.id, data: { status: v } });
                      setSelectedOrder({ ...selectedOrder, status: v });
                    }}
                  >
                    <SelectTrigger className="w-[180px] bg-white border-gray-300 text-gray-900">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="confirmed">Confirmed</SelectItem>
                      <SelectItem value="shipped">Shipped</SelectItem>
                      <SelectItem value="delivered">Delivered</SelectItem>
                      <SelectItem value="cancelled">Cancelled</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Tracking */}
                {(selectedOrder.status === 'shipped' || selectedOrder.status === 'delivered') && (
                  <div>
                    <Label className="text-gray-700 mb-2 block">Tracking Number</Label>
                    <div className="flex gap-2">
                      <Input
                        value={selectedOrder.tracking_number || ''}
                        onChange={(e) => setSelectedOrder({ ...selectedOrder, tracking_number: e.target.value })}
                        placeholder="Enter tracking number"
                        className="bg-white border-gray-300 text-gray-900"
                      />
                      <Button 
                        onClick={() => updateMutation.mutate({ 
                          id: selectedOrder.id, 
                          data: { tracking_number: selectedOrder.tracking_number } 
                        })}
                        className="bg-blue-600 hover:bg-blue-700 text-white"
                      >
                        Save
                      </Button>
                    </div>
                  </div>
                )}

                {/* Customer Info */}
                <Card className="bg-gray-50 border-gray-200">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-gray-900 text-lg">Customer</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <p className="text-gray-900">{selectedOrder.customer_name}</p>
                    <p className="text-gray-600">{selectedOrder.customer_email}</p>
                  </CardContent>
                </Card>

                {/* Shipping Address */}
                <Card className="bg-gray-50 border-gray-200">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-gray-900 text-lg">Shipping Address</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {selectedOrder.shipping_address && (
                      <div className="text-gray-700">
                        <p>{selectedOrder.shipping_address.street}</p>
                        <p>
                          {selectedOrder.shipping_address.city}, {selectedOrder.shipping_address.state} {selectedOrder.shipping_address.zip}
                        </p>
                        <p>{selectedOrder.shipping_address.country}</p>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Order Items */}
                <Card className="bg-gray-50 border-gray-200">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-gray-900 text-lg">Items</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {selectedOrder.items?.map((item, i) => (
                      <div key={i} className="flex items-center gap-3">
                        <div className="w-12 h-16 rounded bg-white overflow-hidden flex-shrink-0 border border-gray-200">
                          {item.image_url && (
                            <img src={item.image_url} alt="" className="w-full h-full object-contain" />
                          )}
                        </div>
                        <div className="flex-1">
                          <p className="text-gray-900">{item.card_name}</p>
                          <p className="text-gray-500 text-sm">Qty: {item.quantity}</p>
                        </div>
                        <p className="text-blue-600 font-medium">${(item.price * item.quantity).toFixed(2)}</p>
                      </div>
                    ))}
                    
                    <div className="border-t border-gray-200 pt-3 mt-3 space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">Subtotal</span>
                        <span className="text-gray-900">${selectedOrder.subtotal?.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">Shipping</span>
                        <span className="text-gray-900">${selectedOrder.shipping_cost?.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between font-bold">
                        <span className="text-gray-900">Total</span>
                        <span className="text-blue-600">${selectedOrder.total?.toFixed(2)}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}


