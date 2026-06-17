import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from 'lucide-react';
import { backend } from '@/services/backend';

export default function ProductForm({ product, onSubmit, onCancel, isLoading }) {
  const [formData, setFormData] = useState(product || {
    name: '',
    product_type: 'dice',
    game: 'other',
    price: '',
    cost: '',
    quantity: 1,
    condition: 'sealed',
    image_url: '',
    description: '',
    status: 'active',
    featured: false
  });
  const [uploadingImage, setUploadingImage] = useState(false);

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingImage(true);
    try {
      const { file_url } = await backend.files.upload({ file });
      setFormData({ ...formData, image_url: file_url });
    } catch (error) {
      alert('Failed to upload image');
    } finally {
      setUploadingImage(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit({
      ...formData,
      price: parseFloat(formData.price) || 0,
      cost: parseFloat(formData.cost) || 0,
      quantity: parseInt(formData.quantity) || 0,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Name */}
        <div className="md:col-span-2">
          <Label htmlFor="name">Product Name *</Label>
          <Input
            id="name"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="e.g., Chessex Gemini Blue-Red/Gold 7-Die Set"
            required
            className="bg-white"
          />
        </div>

        {/* Product Type */}
        <div>
          <Label htmlFor="product_type">Product Type *</Label>
          <Select
            value={formData.product_type}
            onValueChange={(v) => setFormData({ ...formData, product_type: v })}
          >
            <SelectTrigger className="bg-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="single_card">Single Card</SelectItem>
              <SelectItem value="booster_box">Booster Box</SelectItem>
              <SelectItem value="starter_deck">Starter Deck</SelectItem>
              <SelectItem value="bundle">Bundle</SelectItem>
              <SelectItem value="dice">Dice</SelectItem>
              <SelectItem value="playmat">Play Mat</SelectItem>
              <SelectItem value="accessories">Accessories</SelectItem>
              <SelectItem value="sealed_product">Sealed Product</SelectItem>
              <SelectItem value="merch_shirt">Merch - Shirt</SelectItem>
              <SelectItem value="merch_hat">Merch - Hat</SelectItem>
              <SelectItem value="merch_other">Merch - Other</SelectItem>
              <SelectItem value="plushie">Plushie</SelectItem>
              <SelectItem value="model_kit">Model Kit (Gundam, etc)</SelectItem>
              <SelectItem value="other">Other</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Game */}
        <div>
          <Label htmlFor="game">Game</Label>
          <Select
            value={formData.game}
            onValueChange={(v) => setFormData({ ...formData, game: v })}
          >
            <SelectTrigger className="bg-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="other">Other/General</SelectItem>
              <SelectItem value="pokemon">Pokémon</SelectItem>
              <SelectItem value="yugioh">Yu-Gi-Oh!</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Price */}
        <div>
          <Label htmlFor="price">Selling Price ($) *</Label>
          <Input
            id="price"
            type="number"
            step="0.01"
            value={formData.price}
            onChange={(e) => setFormData({ ...formData, price: e.target.value })}
            placeholder="9.99"
            required
            className="bg-white"
          />
        </div>

        {/* Cost */}
        <div>
          <Label htmlFor="cost">Cost ($)</Label>
          <Input
            id="cost"
            type="number"
            step="0.01"
            value={formData.cost}
            onChange={(e) => setFormData({ ...formData, cost: e.target.value })}
            placeholder="5.00"
            className="bg-white"
          />
        </div>

        {/* Quantity */}
        <div>
          <Label htmlFor="quantity">Quantity *</Label>
          <Input
            id="quantity"
            type="number"
            value={formData.quantity}
            onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
            placeholder="10"
            required
            className="bg-white"
          />
        </div>

        {/* Condition */}
        <div>
          <Label htmlFor="condition">Condition</Label>
          <Select
            value={formData.condition}
            onValueChange={(v) => setFormData({ ...formData, condition: v })}
          >
            <SelectTrigger className="bg-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="sealed">Sealed</SelectItem>
              <SelectItem value="mint">Mint</SelectItem>
              <SelectItem value="near_mint">Near Mint</SelectItem>
              <SelectItem value="excellent">Excellent</SelectItem>
              <SelectItem value="good">Good</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Description */}
        <div className="md:col-span-2">
          <Label htmlFor="description">Description</Label>
          <Textarea
            id="description"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            placeholder="Product details, colors, contents, etc."
            rows={3}
            className="bg-white"
          />
        </div>

        {/* Image Upload */}
        <div className="md:col-span-2">
          <Label htmlFor="image">Product Image</Label>
          <div className="flex items-start gap-4">
            <div className="flex-1">
              <Input
                id="image"
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                disabled={uploadingImage}
                className="bg-white"
              />
              <p className="text-xs text-gray-500 mt-1">
                Upload a product image (JPG, PNG, etc.)
              </p>
            </div>
            {formData.image_url && (
              <img
                src={formData.image_url}
                alt="Preview"
                className="w-24 h-24 object-cover rounded border"
              />
            )}
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          type="submit"
          className="bg-blue-600 hover:bg-blue-700 text-white"
          disabled={isLoading || uploadingImage}
        >
          {isLoading || uploadingImage ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              {uploadingImage ? 'Uploading...' : 'Saving...'}
            </>
          ) : (
            product ? 'Update Product' : 'Add Product'
          )}
        </Button>
      </div>
    </form>
  );
}


