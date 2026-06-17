import React, { useState, useEffect } from 'react';
import { backend } from '@/services/backend';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { 
  Plus, 
  Search, 
  MoreVertical, 
  Pencil, 
  Trash2,
  Package,
  Eye,
  EyeOff,
  DollarSign,
  TrendingUp,
  AlertCircle,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ArrowLeft
} from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import CardForm from '@/components/admin/CardForm';
import ProductForm from '@/components/admin/ProductForm';
import StatsCard from '@/components/admin/StatsCard';
import DollarCardStatsCard from '@/components/admin/DollarCardStatsCard';
import { getInventoryCardFinish, getInventoryCardMergeKey } from '@/components/admin/cardInventorySnapshot';
import { inventoryListings } from '@/services/inventoryListings';

const gameLabels = {
  magic: 'Magic: The Gathering',
  pokemon: 'Pokémon',
  yugioh: 'Yu-Gi-Oh!',
};

export default function AdminInventory() {
  const navigate = useNavigate();
  const [, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingCard, setEditingCard] = useState(null);
  const [editingProduct, setEditingProduct] = useState(null);
  const [activeTab, setActiveTab] = useState('cards');
  const [selectedGame, setSelectedGame] = useState('all');
  const [cardPage, setCardPage] = useState(0);
  const [sortField, setSortField] = useState(null);
  const [sortDir, setSortDir] = useState('desc');
  const ITEMS_PER_PAGE = 20;
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

  const { data: cards = [] } = useQuery({
    queryKey: ['admin-cards'],
    queryFn: () => inventoryListings.list('-created_date'),
    enabled: !loading
  });

  const { data: products = [] } = useQuery({
    queryKey: ['admin-products'],
    queryFn: () => backend.data.Product.list('-created_date'),
    enabled: !loading
  });

  const createMutation = useMutation({
    mutationFn: async (data) => {
      const cardsToAdd = Array.isArray(data) ? data : [data];
      
      for (const cardData of cardsToAdd) {
        const mergeKey = getInventoryCardMergeKey(cardData);
        const existingCard = cards.find((c) => getInventoryCardMergeKey(c) === mergeKey);
        
        if (existingCard) {
          // Update quantity and location if provided
          await inventoryListings.update(existingCard.id, {
            quantity: existingCard.quantity + cardData.quantity,
            location: cardData.location || existingCard.location
          });
        } else {
          await inventoryListings.create(cardData);
        }
      }
      
      return cardsToAdd.length;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries(['admin-cards']);
      setShowForm(false);
      toast.success(`${count} card${count > 1 ? 's' : ''} added/updated successfully`);
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => inventoryListings.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['admin-cards']);
      setShowForm(false);
      setEditingCard(null);
      toast.success('Card updated successfully');
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => inventoryListings.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries(['admin-cards']);
      toast.success('Card deleted');
    }
  });

  const createProductMutation = useMutation({
    mutationFn: (data) => backend.data.Product.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries(['admin-products']);
      setShowForm(false);
      toast.success('Product added successfully');
    }
  });

  const updateProductMutation = useMutation({
    mutationFn: ({ id, data }) => backend.data.Product.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['admin-products']);
      setShowForm(false);
      setEditingProduct(null);
      toast.success('Product updated successfully');
    }
  });

  const deleteProductMutation = useMutation({
    mutationFn: (id) => backend.data.Product.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries(['admin-products']);
      toast.success('Product deleted');
    }
  });

  const handleSubmit = (data) => {
    if (editingCard) {
      updateMutation.mutate({ id: editingCard.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleProductSubmit = (data) => {
    if (editingProduct) {
      updateProductMutation.mutate({ id: editingProduct.id, data });
    } else {
      createProductMutation.mutate(data);
    }
  };

  const handleEdit = (card) => {
    setEditingCard(card);
    setShowForm(true);
  };

  const handleDelete = (card) => {
    if (confirm(`Delete "${card.name}"?`)) {
      deleteMutation.mutate(card.id);
    }
  };

  const toggleStatus = (card) => {
    const newStatus = card.status === 'active' ? 'archived' : 'active';
    updateMutation.mutate({ id: card.id, data: { status: newStatus } });
  };

  const handleEditProduct = (product) => {
    setEditingProduct(product);
    setShowForm(true);
  };

  const handleDeleteProduct = (product) => {
    if (confirm(`Delete "${product.name}"?`)) {
      deleteProductMutation.mutate(product.id);
    }
  };

  const toggleProductStatus = (product) => {
    const newStatus = product.status === 'active' ? 'archived' : 'active';
    updateProductMutation.mutate({ id: product.id, data: { status: newStatus } });
  };

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('desc');
    }
    setCardPage(0);
  };

  const SortIcon = ({ field }) => {
    if (sortField !== field) return <ArrowUpDown className="w-3 h-3 ml-1 text-gray-400" />;
    return sortDir === 'asc' ? <ArrowUp className="w-3 h-3 ml-1 text-blue-600" /> : <ArrowDown className="w-3 h-3 ml-1 text-blue-600" />;
  };

  const filteredCards = cards.filter(c => 
    (selectedGame === 'all' || c.game === selectedGame) &&
    (c.name?.toLowerCase().includes(search.toLowerCase()) ||
    c.set_name?.toLowerCase().includes(search.toLowerCase()) ||
    c.sku?.toLowerCase().includes(search.toLowerCase()))
  ).sort((a, b) => {
    if (!sortField) return 0;
    const aVal = sortField === 'price' ? (a.price || 0) : (a.quantity || 0);
    const bVal = sortField === 'price' ? (b.price || 0) : (b.quantity || 0);
    return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
  });

  const totalCardPages = Math.ceil(filteredCards.length / ITEMS_PER_PAGE);
  const paginatedCards = filteredCards.slice(cardPage * ITEMS_PER_PAGE, (cardPage + 1) * ITEMS_PER_PAGE);

  const getPageNumbers = (currentPage, totalPages) => {
    const pages = [];
    const delta = 2;
    for (let i = Math.max(0, currentPage - delta); i <= Math.min(totalPages - 1, currentPage + delta); i++) {
      pages.push(i);
    }
    if (pages[0] > 0) {
      if (pages[0] > 1) pages.unshift('...');
      pages.unshift(0);
    }
    if (pages[pages.length - 1] < totalPages - 1) {
      if (pages[pages.length - 1] < totalPages - 2) pages.push('...');
      pages.push(totalPages - 1);
    }
    return pages;
  };

  const filteredProducts = products.filter(p => 
    p.name?.toLowerCase().includes(search.toLowerCase()) ||
    p.description?.toLowerCase().includes(search.toLowerCase()) ||
    p.sku?.toLowerCase().includes(search.toLowerCase())
  );

  const totalValue = cards.reduce((sum, c) => sum + (c.price * c.quantity), 0);
  const totalCost = cards.reduce((sum, c) => sum + ((c.cost || 0) * c.quantity), 0);
  const potentialProfit = totalValue - totalCost;
  const activeCards = cards.filter(c => c.status === 'active').length;
  const lowStock = cards.filter(c => c.quantity > 0 && c.quantity <= 3).length;
  const handleLeaveInventory = () => {
    if (window.history.length > 1) {
      navigate(-1);
      return;
    }
    navigate('/MemberBenefits');
  };

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
        <div className="sticky top-0 z-20 -mx-4 mb-4 border-b border-gray-200 bg-white/95 px-4 py-3 backdrop-blur md:hidden">
          <div className="flex items-center justify-between gap-3">
            <Button
              type="button"
              variant="ghost"
              onClick={handleLeaveInventory}
              className="h-10 px-3 text-gray-700"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
            <p className="text-sm font-semibold text-gray-900">Inventory</p>
            <Button
              type="button"
              variant="ghost"
              onClick={() => navigate('/MemberBenefits')}
              className="h-10 px-3 text-gray-700"
            >
              Members
            </Button>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Inventory</h1>
            <p className="text-gray-500 mt-1">Manage sellable stock while keeping the catalog separate from inventory rows.</p>
          </div>
          <Button 
            className="bg-blue-600 hover:bg-blue-700 text-white"
            onClick={() => { 
              if (activeTab === 'cards') {
                setEditingCard(null);
              } else {
                setEditingProduct(null);
              }
              setShowForm(true); 
            }}
          >
            <Plus className="w-5 h-5 mr-2" />
            {activeTab === 'cards' ? 'Add Card' : 'Add Product'}
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
          <StatsCard 
            title="Inventory Value" 
            value={`$${totalValue.toFixed(2)}`} 
            icon={DollarSign}
            color="blue"
          />
          <StatsCard 
            title="Potential Profit" 
            value={`$${potentialProfit.toFixed(2)}`} 
            icon={TrendingUp}
            color="green"
          />
          <StatsCard 
            title="Active Listings" 
            value={activeCards} 
            icon={Package}
            color="purple"
          />
          <StatsCard 
            title="Low Stock" 
            value={lowStock} 
            icon={AlertCircle}
            color="amber"
          />
          <DollarCardStatsCard cards={cards} />
        </div>

        {/* Search */}
        <div className="relative mb-6">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <Input
            placeholder="Search cards by name, set, or SKU..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setCardPage(0); }}
            className="pl-10 bg-white border-gray-200 text-gray-900 h-12"
          />
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-6">
          <TabsList className="bg-gray-100">
            <TabsTrigger value="cards">Cards</TabsTrigger>
            <TabsTrigger value="products">Products (Dice, Accessories)</TabsTrigger>
          </TabsList>
        </Tabs>

         {/* Game Filter - Show when Cards tab is active */}
         {activeTab === 'cards' && (
           <div className="flex flex-wrap gap-2 mb-6">
             {['all', 'magic', 'pokemon', 'yugioh'].map(game => (
             <Button
              key={game}
              variant={selectedGame === game ? 'default' : 'outline'}
              onClick={() => { setSelectedGame(game); setCardPage(0); }}
                 className={selectedGame === game ? 'bg-blue-600 hover:bg-blue-700 text-white' : 'border-gray-200'}
               >
                 {game === 'all' ? 'All Games' : gameLabels[game] || game}
               </Button>
             ))}
           </div>
         )}

        {/* Cards Table */}
        {activeTab === 'cards' && (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-gray-200 bg-gray-50">
                  <TableHead className="text-gray-600">Card</TableHead>
                  <TableHead className="text-gray-600">Game</TableHead>
                  <TableHead className="text-gray-600">Finish</TableHead>
                  <TableHead className="text-gray-600">Condition</TableHead>
                  <TableHead className="text-gray-600">Market Price</TableHead>
                  <TableHead className="text-gray-600 cursor-pointer select-none" onClick={() => handleSort('price')}>
                    <span className="flex items-center">Sell Price <SortIcon field="price" /></span>
                  </TableHead>
                  <TableHead className="text-gray-600 cursor-pointer select-none" onClick={() => handleSort('quantity')}>
                    <span className="flex items-center">Qty <SortIcon field="quantity" /></span>
                  </TableHead>
                  <TableHead className="text-gray-600">Location</TableHead>
                  <TableHead className="text-gray-600">Status</TableHead>
                  <TableHead className="text-gray-600 w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedCards.map((card) => (
                  <TableRow key={card.id} className="border-gray-200">
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-14 rounded bg-gray-100 overflow-hidden flex-shrink-0 border border-gray-200">
                          {card.image_url && (
                            <img src={card.image_url} alt="" className="w-full h-full object-contain" />
                          )}
                        </div>
                        <div>
                          <p className="text-gray-900 font-medium">{card.name}</p>
                          <p className="text-gray-500 text-sm">{card.set_name || card.sku}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-gray-700">{gameLabels[card.game]}</TableCell>
                    <TableCell>
                     {(() => {
                       const skuFinish = getInventoryCardFinish(card);
                       if (skuFinish) {
                         const labels = { foil: 'Foil', nonfoil: 'Normal', etched: 'Etched Foil', normal: 'Normal' };
                         const isSpecial = skuFinish === 'foil' || skuFinish === 'etched';
                         return (
                           <Badge variant="outline" className={isSpecial ? 'border-yellow-400 text-yellow-700 bg-yellow-50' : 'border-gray-300 text-gray-500'}>
                             {labels[skuFinish]}
                           </Badge>
                         );
                       }
                       return <span className="text-gray-400 text-sm">—</span>;
                     })()}
                    </TableCell>
                    <TableCell>
                     <Badge variant="outline" className="border-gray-300 text-gray-600">
                       {card.condition?.replace('_', ' ')}
                     </Badge>
                    </TableCell>
                    <TableCell className="text-gray-500">${(card.cost || 0).toFixed(2)}</TableCell>
                    <TableCell className="text-blue-600 font-medium">${card.price?.toFixed(2)}</TableCell>
                    <TableCell>
                      <span className={card.quantity <= 3 && card.quantity > 0 ? 'text-amber-600 font-medium' : 'text-gray-900'}>
                        {card.quantity}
                      </span>
                    </TableCell>
                    <TableCell className="text-gray-600">
                      {card.location || '-'}
                    </TableCell>
                    <TableCell>
                      <Badge className={
                        card.status === 'active' ? 'bg-green-100 text-green-700' :
                        card.status === 'sold_out' ? 'bg-red-100 text-red-700' :
                        'bg-gray-100 text-gray-600'
                      }>
                        {card.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="text-gray-400 hover:text-gray-600">
                            <MoreVertical className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="bg-white border-gray-200">
                          <DropdownMenuItem onClick={() => handleEdit(card)} className="text-gray-700">
                            <Pencil className="w-4 h-4 mr-2" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => toggleStatus(card)} className="text-gray-700">
                            {card.status === 'active' ? (
                              <><EyeOff className="w-4 h-4 mr-2" />Archive</>
                            ) : (
                              <><Eye className="w-4 h-4 mr-2" />Activate</>
                            )}
                          </DropdownMenuItem>
                          <DropdownMenuItem 
                            onClick={() => handleDelete(card)} 
                            className="text-red-600"
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
                {paginatedCards.length === 0 && (
                   <TableRow>
                     <TableCell colSpan={11} className="text-center py-12 text-gray-500">
                       {search ? 'No cards found matching your search' : 'No cards in inventory'}
                     </TableCell>
                   </TableRow>
                 )}
                </TableBody>
                </Table>
                </div>
                {/* Pagination */}
                {totalCardPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50">
                <p className="text-sm text-gray-500">
                Showing {cardPage * ITEMS_PER_PAGE + 1}–{Math.min((cardPage + 1) * ITEMS_PER_PAGE, filteredCards.length)} of {filteredCards.length}
                </p>
                <div className="flex items-center gap-1 flex-wrap">
                <Button variant="outline" size="sm" onClick={() => setCardPage(p => Math.max(0, p - 1))} disabled={cardPage === 0}>Previous</Button>
                {getPageNumbers(cardPage, totalCardPages).map((page, idx) =>
                  page === '...' ? (
                    <span key={`e-${idx}`} className="px-2 text-gray-400">…</span>
                  ) : (
                    <Button
                      key={page}
                      variant={cardPage === page ? 'default' : 'outline'}
                      size="sm"
                      className={cardPage === page ? 'bg-blue-600 text-white' : ''}
                      onClick={() => setCardPage(page)}
                    >
                      {page + 1}
                    </Button>
                  )
                )}
                <Button variant="outline" size="sm" onClick={() => setCardPage(p => Math.min(totalCardPages - 1, p + 1))} disabled={cardPage === totalCardPages - 1}>Next</Button>
                </div>
                </div>
                )}
                </div>
                )}

        {/* Products Table */}
        {activeTab === 'products' && (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-gray-200 bg-gray-50">
                  <TableHead className="text-gray-600">Product</TableHead>
                  <TableHead className="text-gray-600">Type</TableHead>
                  <TableHead className="text-gray-600">Market Price</TableHead>
                  <TableHead className="text-gray-600">Sell Price</TableHead>
                  <TableHead className="text-gray-600">Qty</TableHead>
                  <TableHead className="text-gray-600">Status</TableHead>
                  <TableHead className="text-gray-600 w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredProducts.map((product) => (
                  <TableRow key={product.id} className="border-gray-200">
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="w-14 h-14 rounded bg-gray-100 overflow-hidden flex-shrink-0 border border-gray-200">
                          {product.image_url && (
                            <img src={product.image_url} alt="" className="w-full h-full object-cover" />
                          )}
                        </div>
                        <div>
                          <p className="text-gray-900 font-medium">{product.name}</p>
                          <p className="text-gray-500 text-sm line-clamp-1">{product.description}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="border-gray-300 text-gray-600 capitalize">
                        {product.product_type?.replace('_', ' ')}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-gray-500">${(product.cost || 0).toFixed(2)}</TableCell>
                    <TableCell className="text-blue-600 font-medium">${product.price?.toFixed(2)}</TableCell>
                    <TableCell>
                      <span className={product.quantity <= 3 && product.quantity > 0 ? 'text-amber-600 font-medium' : 'text-gray-900'}>
                        {product.quantity}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge className={
                        product.status === 'active' ? 'bg-green-100 text-green-700' :
                        product.status === 'sold_out' ? 'bg-red-100 text-red-700' :
                        'bg-gray-100 text-gray-600'
                      }>
                        {product.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="text-gray-400 hover:text-gray-600">
                            <MoreVertical className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="bg-white border-gray-200">
                          <DropdownMenuItem onClick={() => handleEditProduct(product)} className="text-gray-700">
                            <Pencil className="w-4 h-4 mr-2" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => toggleProductStatus(product)} className="text-gray-700">
                            {product.status === 'active' ? (
                              <><EyeOff className="w-4 h-4 mr-2" />Archive</>
                            ) : (
                              <><Eye className="w-4 h-4 mr-2" />Activate</>
                            )}
                          </DropdownMenuItem>
                          <DropdownMenuItem 
                            onClick={() => handleDeleteProduct(product)} 
                            className="text-red-600"
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
                {filteredProducts.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-12 text-gray-500">
                      {search ? 'No products found matching your search' : 'No products in inventory'}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>
        )}

        {/* Feature Suggestions */}
        {false && (
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Feature Suggestions for Main Phase Market</h2>
            <div className="space-y-8">
              {[
                {
                  category: "Homepage Banners & Promotions",
                  items: [
                    "Game-Specific Hero Banners - Rotating featured game banners (e.g., 'New One Piece Release - Shop Now') with background images, similar to TCGPlayer's approach but tailored to your inventory.",
                    "Limited Time Promotion Box - Flash sale or pre-order banners for upcoming sets with countdown timers",
                    "Staff Picks / Curated Collections - Themed collections like 'Best Budget Commander Cards' or 'Meta-Defining Yu-Gi-Oh Cards'"
                  ]
                },
                {
                  category: "Collection & Community",
                  items: [
                    "User Wishlist Sharing - Public deck/wishlist URLs so players can share their builds on social media",
                    "Community Deck Showcase - Featured user-built decks with voting/reviews",
                    "Price Tracking Alerts - Users can set alerts when specific cards drop below a target price"
                  ]
                },
                {
                  category: "Search & Discovery",
                  items: [
                    "Trending Cards Feed - Show what cards are trending based on searches and additions to wishlists",
                    "Related Cards Section - When viewing a card, show synergistic cards (e.g., cards with the same mechanics)",
                    "Set Release Calendar - Upcoming set releases with pre-order availability countdown"
                  ]
                },
                {
                  category: "Mobile UX Improvements",
                  items: [
                    "Bottom Sheet Filters - Slide-up filter panel from bottom (more mobile-native) instead of side drawer",
                    "One-Tap Game Switcher - Quick toggle buttons for games at the top of search",
                    "Floating Action Button (FAB) - Persistent 'Quick Add to Cart' FAB for easier mobile checkout"
                  ]
                },
                {
                  category: "Trust & Authority",
                  items: [
                    "Card Authenticity Badges - Visual indicators for rare/valuable cards with authentication verification",
                    "Player Reviews on Cards - Reviews from players about card usefulness in meta formats",
                    "Price History Charts - Show price trends over time (like TCGPlayer's price tracker)"
                  ]
                },
                {
                  category: "Gamification",
                  items: [
                    "Deck Rating System - Upvote/downvote decks to build community consensus on viable strategies",
                    "Achievement Badges - Unlock badges for building decks in different formats or collecting specific cards",
                    "Leaderboards - Top-rated deck builders, most valuable collections, etc."
                  ]
                }
              ].map((section, idx) => (
                <div key={idx}>
                  <h3 className="text-lg font-semibold text-gray-900 mb-4 pb-2 border-b-2 border-blue-500">
                    {section.category}
                  </h3>
                  <ul className="space-y-3">
                    {section.items.map((item, itemIdx) => (
                      <li key={itemIdx} className="flex gap-3 text-gray-700">
                        <span className="text-blue-600 font-bold">•</span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        )}
        </div>

        {/* Form Dialogs */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="bg-white border-gray-200 max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-gray-900 text-xl">
              {activeTab === 'cards' ? (
                editingCard ? 'Edit Card' : 'Add New Card'
              ) : (
                editingProduct ? 'Edit Product' : 'Add New Product'
              )}
            </DialogTitle>
          </DialogHeader>
          {activeTab === 'cards' ? (
            <CardForm
              card={editingCard}
              onSubmit={handleSubmit}
              onCancel={() => { setShowForm(false); setEditingCard(null); }}
              isLoading={createMutation.isPending || updateMutation.isPending}
              existingLocations={[...new Set(cards.map(c => c.location).filter(Boolean))].sort()}
            />
          ) : (
            <ProductForm
              product={editingProduct}
              onSubmit={handleProductSubmit}
              onCancel={() => { setShowForm(false); setEditingProduct(null); }}
              isLoading={createProductMutation.isPending || updateProductMutation.isPending}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}


