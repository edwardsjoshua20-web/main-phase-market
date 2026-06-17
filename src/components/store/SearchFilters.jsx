import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Slider } from "@/components/ui/slider";
import { Search, SlidersHorizontal, X } from 'lucide-react';

const gameOptions = [
  { value: 'all', label: 'All Games' },
  { value: 'magic', label: 'Magic: The Gathering' },
  { value: 'pokemon', label: 'Pokémon' },
  { value: 'yugioh', label: 'Yu-Gi-Oh!' },
];

const rarityOptions = [
  { value: 'all', label: 'All Rarities' },
  { value: 'common', label: 'Common' },
  { value: 'uncommon', label: 'Uncommon' },
  { value: 'rare', label: 'Rare' },
  { value: 'holo_rare', label: 'Holo Rare' },
  { value: 'ultra_rare', label: 'Ultra Rare' },
  { value: 'secret_rare', label: 'Secret Rare' },
];

const conditionOptions = [
  { value: 'all', label: 'All Conditions' },
  { value: 'mint', label: 'Mint' },
  { value: 'near_mint', label: 'Near Mint' },
  { value: 'excellent', label: 'Excellent' },
  { value: 'good', label: 'Good' },
  { value: 'light_played', label: 'Light Played' },
  { value: 'played', label: 'Played' },
  { value: 'poor', label: 'Poor' },
];

const sortOptions = [
  { value: 'newest', label: 'Newest' },
  { value: 'price_low', label: 'Price: Low to High' },
  { value: 'price_high', label: 'Price: High to Low' },
  { value: 'name', label: 'Name A-Z' },
];

export default function SearchFilters({ filters, onFilterChange, onClearFilters }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  const hasActiveFilters = 
    filters.game !== 'all' || 
    filters.rarity !== 'all' || 
    filters.condition !== 'all' || 
    filters.minPrice > 0 || 
    filters.maxPrice < 10000;

  const FilterContent = () => (
    <div className="space-y-4">
      <div>
        <label className="text-sm font-medium text-gray-700 mb-2 block">Game</label>
        <Select value={filters.game} onValueChange={(v) => onFilterChange({ game: v })}>
          <SelectTrigger className="bg-white border-gray-200">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {gameOptions.map(opt => (
              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <label className="text-sm font-medium text-gray-700 mb-2 block">Rarity</label>
        <Select value={filters.rarity} onValueChange={(v) => onFilterChange({ rarity: v })}>
          <SelectTrigger className="bg-white border-gray-200">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {rarityOptions.map(opt => (
              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <label className="text-sm font-medium text-gray-700 mb-2 block">Condition</label>
        <Select value={filters.condition} onValueChange={(v) => onFilterChange({ condition: v })}>
          <SelectTrigger className="bg-white border-gray-200">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {conditionOptions.map(opt => (
              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <label className="text-sm font-medium text-gray-700 mb-2 block">
          Price Range: ${filters.minPrice} - ${filters.maxPrice}
        </label>
        <Slider
          value={[filters.minPrice, filters.maxPrice]}
          min={0}
          max={10000}
          step={10}
          onValueChange={([min, max]) => onFilterChange({ minPrice: min, maxPrice: max })}
          className="mt-2"
        />
      </div>

      {hasActiveFilters && (
        <Button variant="outline" onClick={onClearFilters} className="w-full border-gray-300">
          <X className="w-4 h-4 mr-2" />
          Clear Filters
        </Button>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Search and Sort Row */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder="Search by name, set, or card number..."
            value={filters.search}
            onChange={(e) => onFilterChange({ search: e.target.value })}
            className="pl-10 bg-white border-gray-200"
          />
        </div>

        <div className="flex gap-2">
          {/* Mobile Filter Button */}
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" className="md:hidden border-gray-200">
                <SlidersHorizontal className="w-4 h-4 mr-2" />
                Filters
                {hasActiveFilters && (
                  <span className="ml-2 w-2 h-2 rounded-full bg-gray-700" />
                )}
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="bg-white">
              <SheetHeader>
                <SheetTitle>Filters</SheetTitle>
              </SheetHeader>
              <div className="mt-6">
                <FilterContent />
              </div>
            </SheetContent>
          </Sheet>

          <Select value={filters.sort} onValueChange={(v) => onFilterChange({ sort: v })}>
            <SelectTrigger className="w-[180px] bg-white border-gray-200">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {sortOptions.map(opt => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Desktop Filters */}
      <div className="hidden md:flex flex-wrap gap-3 items-center">
        <Select value={filters.game} onValueChange={(v) => onFilterChange({ game: v })}>
          <SelectTrigger className="w-[180px] bg-white border-gray-200">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {gameOptions.map(opt => (
              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filters.rarity} onValueChange={(v) => onFilterChange({ rarity: v })}>
          <SelectTrigger className="w-[150px] bg-white border-gray-200">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {rarityOptions.map(opt => (
              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filters.condition} onValueChange={(v) => onFilterChange({ condition: v })}>
          <SelectTrigger className="w-[150px] bg-white border-gray-200">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {conditionOptions.map(opt => (
              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {hasActiveFilters && (
          <Button variant="ghost" onClick={onClearFilters} className="text-gray-600 hover:text-gray-900">
            <X className="w-4 h-4 mr-1" />
            Clear
          </Button>
        )}
      </div>
    </div>
  );
}