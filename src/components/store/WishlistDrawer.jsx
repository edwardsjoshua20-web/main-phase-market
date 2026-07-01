import React, { useState } from 'react';
import { backend } from '@/services/backend';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ShoppingCart, Trash2, Heart, List, Plus, ChevronLeft } from 'lucide-react';
import { toast } from 'sonner';
import { getCardImageUrl, handleCardImageError } from '@/lib/cardImages';

export default function WishlistDrawer({ open, onClose, items, onAddToCart, onRemove, user }) {
  const [view, setView] = useState('main'); // 'main' | 'list-detail'
  const [selectedList, setSelectedList] = useState(null);
  const [creatingList, setCreatingList] = useState(false);
  const [newListName, setNewListName] = useState('');
  const [newListDesc, setNewListDesc] = useState('');
  const queryClient = useQueryClient();

  const { data: cardLists = [] } = useQuery({
    queryKey: ['cardlists', user?.email],
    queryFn: () => backend.data.CardList.filter({ user_email: user.email }),
    enabled: !!user?.email && open
  });

  const createListMutation = useMutation({
    mutationFn: () => backend.data.CardList.create({
      user_email: user.email,
      name: newListName.trim(),
      description: newListDesc.trim(),
      items: []
    }),
    onSuccess: () => {
      queryClient.invalidateQueries(['cardlists']);
      setNewListName('');
      setNewListDesc('');
      setCreatingList(false);
      toast.success('List created!');
    }
  });

  const deleteListMutation = useMutation({
    mutationFn: (id) => backend.data.CardList.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries(['cardlists']);
      setView('main');
      setSelectedList(null);
    }
  });

  const removeFromListMutation = useMutation({
    mutationFn: ({ list, productId }) => {
      const updatedItems = list.items.filter(i => i.product_id !== productId);
      return backend.data.CardList.update(list.id, { items: updatedItems });
    },
    onSuccess: (_, { list }) => {
      queryClient.invalidateQueries(['cardlists']);
      // Refresh selectedList
      const updated = { ...selectedList, items: selectedList.items.filter(i => i.product_id !== _.id) };
      setSelectedList(updated);
    }
  });

  const addWishlistItemToList = async (list, wishlistItem) => {
    const alreadyIn = list.items?.some(i => i.product_id === wishlistItem.product_id);
    if (alreadyIn) { toast.error('Already in this list'); return; }
    const updatedItems = [...(list.items || []), {
      product_id: wishlistItem.product_id,
      product_name: wishlistItem.product_name,
      product_image: wishlistItem.product_image,
      price: wishlistItem.price,
      product_type: wishlistItem.product_type
    }];
    await backend.data.CardList.update(list.id, { items: updatedItems });
    queryClient.invalidateQueries(['cardlists']);
    toast.success(`Added to "${list.name}"`);
  };

  const refreshSelectedList = () => {
    if (!selectedList) return;
    const fresh = cardLists.find(l => l.id === selectedList.id);
    if (fresh) setSelectedList(fresh);
  };

  // Sync selectedList when cardLists updates
  React.useEffect(() => {
    if (selectedList) {
      const fresh = cardLists.find(l => l.id === selectedList.id);
      if (fresh) setSelectedList(fresh);
    }
  }, [cardLists]);

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent className="bg-white w-full sm:max-w-lg flex flex-col">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            {view === 'list-detail' ? (
              <button onClick={() => setView('main')} className="flex items-center gap-1 text-blue-600 hover:text-blue-800 font-normal text-sm mr-1">
                <ChevronLeft className="w-4 h-4" />
                Back
              </button>
            ) : null}
            {view === 'main' ? (
              <>
                <Heart className="w-5 h-5 text-red-500" />
                My Lists & Wishlist
              </>
            ) : (
              <span className="truncate">{selectedList?.name}</span>
            )}
          </SheetTitle>
        </SheetHeader>

        {/* MAIN VIEW */}
        {view === 'main' && (
          <ScrollArea className="flex-1 mt-4">
            {/* Wishlist Section */}
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3 flex items-center gap-2">
                <Heart className="w-4 h-4 text-red-400" /> Wishlist
              </h3>
              {items.length === 0 ? (
                <p className="text-sm text-gray-400 pl-1">No items in your wishlist yet.</p>
              ) : (
                <div className="space-y-3 pr-2">
                  {items.map((item) => (
                    <div key={item.id} className="flex gap-3 p-3 border rounded-lg">
                      <div className="w-16 h-16 bg-gray-100 rounded flex-shrink-0 overflow-hidden">
                        {getCardImageUrl(item) ? (
                          <img src={getCardImageUrl(item)} alt={item.product_name} className="w-full h-full object-contain" onError={(event) => handleCardImageError(event, item)} />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-xs text-gray-400">No Image</div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-medium text-gray-900 text-sm line-clamp-2">{item.product_name}</h4>
                        <p className="text-sm font-bold text-blue-600 mt-0.5">${item.price?.toFixed(2)}</p>
                        <div className="flex gap-1.5 mt-2 flex-wrap">
                          <Button size="sm" onClick={() => onAddToCart(item)} className="bg-gray-800 hover:bg-gray-700 h-7 text-xs px-2">
                            <ShoppingCart className="w-3 h-3 mr-1" /> Cart
                          </Button>
                          {user && cardLists.length > 0 && (
                            <select
                              className="text-xs border rounded px-1 h-7 text-gray-600 bg-white cursor-pointer"
                              defaultValue=""
                              onChange={(e) => {
                                const list = cardLists.find(l => l.id === e.target.value);
                                if (list) addWishlistItemToList(list, item);
                                e.target.value = '';
                              }}
                            >
                              <option value="" disabled>+ Add to list</option>
                              {cardLists.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                            </select>
                          )}
                          <Button size="sm" variant="outline" onClick={() => onRemove(item.id)} className="h-7 px-2">
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* My Lists Section */}
            {user && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide flex items-center gap-2">
                    <List className="w-4 h-4 text-gray-500" /> My Lists
                  </h3>
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setCreatingList(true)}>
                    <Plus className="w-3 h-3 mr-1" /> New List
                  </Button>
                </div>

                {creatingList && (
                  <div className="border rounded-lg p-3 mb-3 bg-blue-50 space-y-2">
                    <Input
                      placeholder="List name (e.g. Werewolf Deck)"
                      value={newListName}
                      onChange={e => setNewListName(e.target.value)}
                      className="h-8 text-sm"
                    />
                    <Input
                      placeholder="Description (optional)"
                      value={newListDesc}
                      onChange={e => setNewListDesc(e.target.value)}
                      className="h-8 text-sm"
                    />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => createListMutation.mutate()} disabled={!newListName.trim()} className="bg-gray-800 hover:bg-gray-700 h-7 text-xs">
                        Create
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setCreatingList(false)} className="h-7 text-xs">
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}

                {cardLists.length === 0 && !creatingList && (
                  <p className="text-sm text-gray-400 pl-1">No lists yet. Create one to organize your cards!</p>
                )}

                <div className="space-y-2 pr-2">
                  {cardLists.map(list => (
                    <div
                      key={list.id}
                      className="flex items-center justify-between p-3 border rounded-lg hover:border-gray-400 hover:bg-gray-100 transition-colors cursor-pointer"
                      onClick={() => { setSelectedList(list); setView('list-detail'); }}
                    >
                      <div>
                        <p className="font-medium text-gray-900 text-sm">{list.name}</p>
                        {list.description && <p className="text-xs text-gray-500">{list.description}</p>}
                        <p className="text-xs text-gray-400 mt-0.5">{list.items?.length || 0} card{list.items?.length !== 1 ? 's' : ''}</p>
                      </div>
                      <ChevronLeft className="w-4 h-4 text-gray-400 rotate-180" />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {!user && (
              <div className="mt-4 p-4 bg-gray-50 rounded-lg text-center">
                <p className="text-sm text-gray-500">Sign in to create and manage card lists</p>
              </div>
            )}
          </ScrollArea>
        )}

        {/* LIST DETAIL VIEW */}
        {view === 'list-detail' && selectedList && (
          <div className="flex-1 flex flex-col mt-4">
            {selectedList.description && (
              <p className="text-sm text-gray-500 mb-3">{selectedList.description}</p>
            )}
            <ScrollArea className="flex-1">
              {(!selectedList.items || selectedList.items.length === 0) ? (
                <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                  <List className="w-12 h-12 mb-3" />
                  <p>No cards in this list yet.</p>
                  <p className="text-sm mt-1">Add cards from your Wishlist above.</p>
                </div>
              ) : (
                <div className="space-y-3 pr-2">
                  {selectedList.items.map((item) => (
                    <div key={item.product_id} className="flex gap-3 p-3 border rounded-lg">
                      <div className="w-16 h-16 bg-gray-100 rounded flex-shrink-0 overflow-hidden">
                        {getCardImageUrl(item) ? (
                          <img src={getCardImageUrl(item)} alt={item.product_name} className="w-full h-full object-contain" onError={(event) => handleCardImageError(event, item)} />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-xs text-gray-400">No Image</div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-medium text-gray-900 text-sm line-clamp-2">{item.product_name}</h4>
                        {item.price > 0 && <p className="text-sm font-bold text-blue-600 mt-0.5">${item.price?.toFixed(2)}</p>}
                        <Button
                          size="sm" variant="outline"
                          onClick={() => removeFromListMutation.mutate({ list: selectedList, productId: item.product_id })}
                          className="h-7 px-2 mt-2"
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
            <div className="pt-4 border-t mt-4">
              <Button
                variant="outline"
                className="w-full text-red-600 border-red-200 hover:bg-red-50"
                onClick={() => {
                  if (confirm(`Delete "${selectedList.name}"?`)) deleteListMutation.mutate(selectedList.id);
                }}
              >
                <Trash2 className="w-4 h-4 mr-2" /> Delete List
              </Button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}


