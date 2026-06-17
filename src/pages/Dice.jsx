import React, { useState } from 'react';
import { backend } from '@/services/backend';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Mail, Grid3x3, List, Plus, Minus } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export default function Dice() {
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState('grid');
  const [sortBy, setSortBy] = useState('newest');
  const [selectedType, setSelectedType] = useState('all');
  const [selectedColor, setSelectedColor] = useState('all');
  const [selectedProductForContact, setSelectedProductForContact] = useState(null);
  const [quantities, setQuantities] = useState({});
  const queryClient = useQueryClient();

  const { data: diceProducts = [], isLoading } = useQuery({
    queryKey: ['dice-products'],
    queryFn: () => backend.data.Product.filter({ product_type: 'dice' }, '-created_date'),
  });

  const handleContactRequest = (product) => {
    setSelectedProductForContact(product);
  };

  const handleSendContactRequest = async () => {
    await backend.email.send({
      to: 'support@mainphasemarket.com',
      subject: `Dice Request: ${selectedProductForContact.name}`,
      body: `A customer has requested the following dice:

Product: ${selectedProductForContact.name}
${selectedProductForContact.description ? `Description: ${selectedProductForContact.description}` : ''}

Please contact the customer to discuss availability and pricing.`
    });
    
    setSelectedProductForContact(null);
    alert('Request sent! We will contact you soon about this product.');
  };

  const updateQuantity = (productId, delta) => {
    setQuantities(prev => ({
      ...prev,
      [productId]: Math.max(1, (prev[productId] || 1) + delta)
    }));
  };

  const filteredProducts = diceProducts
    .filter(product => {
      const matchesSearch = product.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                           product.description?.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesSearch;
    })
    .sort((a, b) => {
      if (sortBy === 'price-asc') return a.price - b.price;
      if (sortBy === 'price-desc') return b.price - a.price;
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      return 0;
    });

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Dice</h1>
          <p className="text-gray-600">
            Premium polyhedral dice - sets, individual dice, and custom designs
          </p>
        </div>

        <div className="flex gap-6">
          {/* Sidebar Filters */}
          <div className="hidden lg:block w-64 flex-shrink-0">
            <div className="bg-white rounded-lg border border-gray-200 p-4 sticky top-4">
              <h3 className="font-semibold text-gray-900 mb-4">Filters</h3>
              
              {/* Search */}
              <div className="mb-4">
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search..."
                  className="bg-white"
                />
              </div>

              {/* Type Filter */}
              <div className="mb-4">
                <h4 className="text-sm font-medium text-gray-700 mb-2">Type</h4>
                <div className="space-y-2">
                  {['all', 'set', 'individual', 'custom'].map(type => (
                    <label key={type} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="type"
                        checked={selectedType === type}
                        onChange={() => setSelectedType(type)}
                        className="text-blue-600"
                      />
                      <span className="text-sm text-gray-700 capitalize">{type === 'all' ? 'All Dice' : type}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Color Filter */}
              <div className="mb-4">
                <h4 className="text-sm font-medium text-gray-700 mb-2">Color</h4>
                <div className="space-y-2">
                  {['all', 'clear', 'red', 'blue', 'green', 'black', 'white', 'translucent'].map(color => (
                    <label key={color} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="color"
                        checked={selectedColor === color}
                        onChange={() => setSelectedColor(color)}
                        className="text-blue-600"
                      />
                      <span className="text-sm text-gray-700 capitalize">{color === 'all' ? 'All Colors' : color}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Main Content */}
          <div className="flex-1">
            {/* Controls Bar */}
            <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6 flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <Button
                  variant={viewMode === 'grid' ? 'default' : 'outline'}
                  size="icon"
                  onClick={() => setViewMode('grid')}
                  className={viewMode === 'grid' ? 'bg-blue-600' : ''}
                >
                  <Grid3x3 className="w-4 h-4" />
                </Button>
                <Button
                  variant={viewMode === 'list' ? 'default' : 'outline'}
                  size="icon"
                  onClick={() => setViewMode('list')}
                  className={viewMode === 'list' ? 'bg-blue-600' : ''}
                >
                  <List className="w-4 h-4" />
                </Button>
              </div>

              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-600">Sort by:</span>
                  <Select value={sortBy} onValueChange={setSortBy}>
                    <SelectTrigger className="w-[150px] bg-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="newest">Newest</SelectItem>
                      <SelectItem value="price-asc">Price: Low to High</SelectItem>
                      <SelectItem value="price-desc">Price: High to Low</SelectItem>
                      <SelectItem value="name">Name</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Mobile Search */}
            <div className="lg:hidden mb-4">
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search dice..."
                className="bg-white"
              />
            </div>

            {/* Products Grid/List */}
            {isLoading ? (
              <div className={viewMode === 'grid' ? 'grid grid-cols-2 md:grid-cols-3 gap-4' : 'space-y-4'}>
                {[...Array(6)].map((_, i) => (
                  <div key={i} className="bg-white rounded-lg border border-gray-200 p-4">
                    <Skeleton className="aspect-square bg-gray-100 mb-3" />
                    <Skeleton className="h-4 bg-gray-100 w-3/4 mb-2" />
                    <Skeleton className="h-6 bg-gray-100 w-1/3" />
                  </div>
                ))}
              </div>
            ) : filteredProducts.length > 0 ? (
              <div className={viewMode === 'grid' ? 'grid grid-cols-2 md:grid-cols-3 gap-4' : 'space-y-4'}>
                {filteredProducts.map((product) => {
                  const quantity = quantities[product.id] || 1;
                  const isOutOfStock = product.quantity === 0;

                  return (
                    <div
                      key={product.id}
                      className={`bg-white rounded-lg border border-gray-200 overflow-hidden hover:shadow-lg transition-all ${
                        viewMode === 'list' ? 'flex gap-4 p-4' : ''
                      }`}
                    >
                      {/* Image */}
                      <div className={viewMode === 'grid' ? 'aspect-square bg-gray-50 relative' : 'w-40 h-40 bg-gray-50 relative flex-shrink-0'}>
                        {product.image_url ? (
                          <img
                            src={product.image_url}
                            alt={product.name}
                            className="w-full h-full object-contain p-3"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-gray-400">
                            No Image
                          </div>
                        )}
                        {isOutOfStock && (
                          <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                            <Badge className="bg-red-600 text-white">Out of Stock</Badge>
                          </div>
                        )}
                      </div>

                      {/* Content */}
                      <div className={viewMode === 'grid' ? 'p-4' : 'flex-1 flex flex-col'}>
                        <h3 className="font-medium text-gray-900 text-sm mb-1 line-clamp-2">
                          {product.name}
                        </h3>
                        {product.sku && (
                          <p className="text-xs text-gray-500 mb-2">SKU: {product.sku}</p>
                        )}
                        
                        <div className="mt-auto">
                          <div className="flex items-baseline gap-2 mb-3">
                            <span className="text-lg font-bold text-blue-600">
                              ${product.price?.toFixed(2)}
                            </span>
                            {product.quantity > 0 && product.quantity <= 10 && (
                              <span className="text-xs text-amber-600">
                                Only {product.quantity} left
                              </span>
                            )}
                          </div>

                          {!isOutOfStock ? (
                            <div className="space-y-2">
                              {/* Quantity Selector */}
                              <div className="flex items-center gap-2">
                                <Button
                                  variant="outline"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => updateQuantity(product.id, -1)}
                                  disabled={quantity <= 1}
                                >
                                  <Minus className="w-3 h-3" />
                                </Button>
                                <span className="w-8 text-center font-medium">{quantity}</span>
                                <Button
                                  variant="outline"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => updateQuantity(product.id, 1)}
                                  disabled={quantity >= product.quantity}
                                >
                                  <Plus className="w-3 h-3" />
                                </Button>
                              </div>

                              {/* Add to Cart Button */}
                              <Button className="w-full bg-red-500 hover:bg-red-600 text-white">
                                ADD TO CART
                              </Button>
                            </div>
                          ) : (
                            <Button
                              variant="outline"
                              onClick={() => handleContactRequest(product)}
                              className="w-full"
                            >
                              <Mail className="w-4 h-4 mr-2" />
                              Request
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
                <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-gray-100 flex items-center justify-center">
                  <svg className="w-10 h-10 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                  </svg>
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">
                  {searchQuery ? 'No dice found' : 'No dice in stock'}
                </h3>
                <p className="text-gray-500">
                  {searchQuery ? 'Try a different search term' : 'Check back soon for new inventory!'}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Contact Request Dialog */}
      <Dialog open={!!selectedProductForContact} onOpenChange={() => setSelectedProductForContact(null)}>
        <DialogContent className="bg-white">
          <DialogHeader>
            <DialogTitle>Request Dice</DialogTitle>
            <DialogDescription>
              We'll contact you about availability and pricing for this product.
            </DialogDescription>
          </DialogHeader>
          {selectedProductForContact && (
            <div className="space-y-4">
              <div className="flex gap-4">
                {selectedProductForContact.image_url && (
                  <img
                    src={selectedProductForContact.image_url}
                    alt={selectedProductForContact.name}
                    className="w-32 h-32 object-contain rounded border"
                  />
                )}
                <div>
                  <h4 className="font-semibold text-gray-900">{selectedProductForContact.name}</h4>
                  {selectedProductForContact.description && (
                    <p className="text-sm text-gray-600 mt-1">
                      {selectedProductForContact.description}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex justify-end gap-3">
                <Button variant="outline" onClick={() => setSelectedProductForContact(null)}>
                  Cancel
                </Button>
                <Button onClick={handleSendContactRequest} className="bg-blue-600 hover:bg-blue-700">
                  Send Request
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}


