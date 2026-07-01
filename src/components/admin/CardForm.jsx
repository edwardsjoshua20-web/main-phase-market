import React, { useState, useRef, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Search, Camera, X, Mic, Plus } from 'lucide-react';
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { backend } from '@/services/backend';
import { toast } from 'sonner';
import LocationInput from '@/components/admin/LocationInput';
import { searchMtgCatalog } from '@/lib/mtgLocalCatalog';
import { buildInventoryCardPayload } from '@/components/admin/cardInventorySnapshot';
import { getCardImageUrl, handleCardImageError } from '@/lib/cardImages';

const scanStyle = `
  @keyframes scan {
    0%   { top: 4px; }
    50%  { top: calc(100% - 6px); }
    100% { top: 4px; }
  }
  .scan-line { position: absolute; left: 0; right: 0; height: 2px; background: #60a5fa; animation: scan 2s ease-in-out infinite; }
`;

export default function CardForm({ card, onSubmit, onCancel, isLoading, existingLocations = [] }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [selectedCard, setSelectedCard] = useState(card || null);
  const [selectedGame, setSelectedGame] = useState(card?.game || 'magic');
  const [selectedFinish, setSelectedFinish] = useState(null);
  const [selectedCondition, setSelectedCondition] = useState(card?.condition || 'near_mint');
  
  // Edit mode fields
  const [editPrice, setEditPrice] = useState(card?.price || 0);
  const [editCost, setEditCost] = useState(card?.cost || 0);
  const [editQuantity, setEditQuantity] = useState(card?.quantity || 1);
  
  // Form data for location
  const [formData, setFormData] = useState({ location: card?.location || '' });
  
  // Add mode quantity
  const [addQuantity, setAddQuantity] = useState(1);
  const [addCost, setAddCost] = useState(0);
  
  // Batch add state (for adding multiple cards at once)
  const [batchCards, setBatchCards] = useState([]);
  
  // Camera scan state
  const [showCamera, setShowCamera] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanStatus, setScanStatus] = useState('');
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const scanIntervalRef = useRef(null);
  const cameraInputRef = useRef(null);
  
  
  // Image preview on hover
  const [hoveredImage, setHoveredImage] = useState(null);

  // Voice input state
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef(null);

  // Debounce timeout refs
  const searchTimeoutRef = useRef(null);
  
  const isEditMode = !!card;
  
  // Remove unused refs since we're not using live camera anymore
  // (keeping videoRef and streamRef removal to clean up)

  // Initialize speech recognition
  useEffect(() => {
    if (typeof window !== 'undefined' && ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = false;
      recognitionRef.current.lang = 'en-US';

      recognitionRef.current.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        setSearchQuery(transcript);
        setIsListening(false);
        
        // Trigger search with the spoken query
        if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
        searchTimeoutRef.current = setTimeout(() => searchCards(transcript), 500);
      };

      recognitionRef.current.onerror = () => {
        setIsListening(false);
      };

      recognitionRef.current.onend = () => {
        setIsListening(false);
      };
    }
  }, []);

  const toggleVoiceInput = () => {
    if (!recognitionRef.current) {
      alert('Voice input is not supported in your browser. Please use Chrome, Edge, or Safari.');
      return;
    }

    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    } else {
      recognitionRef.current.start();
      setIsListening(true);
    }
  };
  
  // Condition price multipliers (Scryfall provides Near Mint prices as baseline)
  const conditionMultipliers = {
    mint: 1.10,
    near_mint: 1.00,
    lightly_played: 0.85,
    poor: 0.50,
    damaged: 0.40
  };

  const searchCards = async (query) => {
    if (!query || query.length < 2) {
      setSearchResults([]);
      setShowResults(false);
      return;
    }

    setSearching(true);
    setShowResults(true);
    
    try {
      let formattedResults = [];

      if (selectedGame === 'magic') {
        formattedResults = await searchMtgCatalog(query, 100);
      } else if (selectedGame === 'yugioh') {
        const response = await fetch(`https://db.ygoprodeck.com/api/v7/cardinfo.php?fname=${encodeURIComponent(query)}`);
        const data = await response.json();
        
        if (data.data) {
          formattedResults = data.data.map(card => {
            const cardSet = card.card_sets?.[0];
            return {
              id: card.id,
              name: card.name,
              set_name: cardSet?.set_name || 'Unknown Set',
              set_code: cardSet?.set_code || '',
              card_number: cardSet?.set_code || card.id,
              rarity: cardSet?.set_rarity || 'common',
              image_url: card.card_images?.[0]?.image_url,
              price: card.card_prices?.[0]?.tcgplayer_price ? parseFloat(card.card_prices[0].tcgplayer_price) : null,
              type: card.type,
              game: 'yugioh'
            };
          });
        }
      } else if (selectedGame === 'pokemon') {
        const apiResponse = await backend.actions.invoke('searchPokemonCards', { query, page: 1, pageSize: 100 });
        const pokemonCards = apiResponse.data?.data || [];

        formattedResults = pokemonCards.map(card => ({
          id: card.id,
          name: card.name,
          set_name: card.set?.name || 'Unknown Set',
          set_code: card.set?.id ? card.set.id.toUpperCase() : 'UNK',
          card_number: card.number || '',
          rarity: card.rarity || 'Common',
          image_url: card.images?.small,
          price: null,
          type: 'Pokemon',
          game: 'pokemon',
          finish: 'normal',
          finishLabel: 'Normal',
          availableFinishes: [],
          allPrices: {}
        }));
      }

      // Sort results: exact matches first, then starts with, then contains
      const sortedResults = formattedResults.sort((a, b) => {
        const aName = a.name.toLowerCase();
        const bName = b.name.toLowerCase();
        const searchLower = query.toLowerCase();
        
        const aExact = aName === searchLower ? 0 : 1;
        const bExact = bName === searchLower ? 0 : 1;
        
        if (aExact !== bExact) return aExact - bExact;
        
        const aStarts = aName.startsWith(searchLower) ? 0 : 1;
        const bStarts = bName.startsWith(searchLower) ? 0 : 1;
        
        if (aStarts !== bStarts) return aStarts - bStarts;
        
        return aName.localeCompare(bName);
      });

      setSearchResults(sortedResults);
    } catch (error) {
      console.error('Search failed:', error);
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  };

  const handleSearchChange = (e) => {
    const value = e.target.value;
    setSearchQuery(value);
    
    // Debounce search
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => searchCards(value), 500);
  };

  const handleCardSelect = (cardData) => {
    // Store base price (always Near Mint from API)
    // Determine initial base price based on default finish
    let initialBasePrice = cardData.price;
    let initialFinish = 'nonfoil';
    
    if (cardData.game === 'magic') {
      // Default to nonfoil if available, otherwise first available finish
      if (cardData.allPrices?.usd) {
        initialBasePrice = cardData.allPrices.usd;
        initialFinish = 'nonfoil';
      } else if (cardData.allPrices?.usd_foil) {
        initialBasePrice = cardData.allPrices.usd_foil;
        initialFinish = 'foil';
      } else if (cardData.allPrices?.usd_etched) {
        initialBasePrice = cardData.allPrices.usd_etched;
        initialFinish = 'etched';
      }
    } else if (cardData.game === 'pokemon') {
      initialFinish = 'normal';
      initialBasePrice = cardData.price;
    }
    
    // Calculate adjusted price with condition multiplier
    let adjustedPrice = 1.00; // Default to $1 minimum
    
    if (initialBasePrice && initialBasePrice > 0) {
      adjustedPrice = initialBasePrice * conditionMultipliers[selectedCondition];
      // Minimum $1 for any card
      if (adjustedPrice < 1) {
        adjustedPrice = 1.00;
      }
    }
    
    const cardWithBase = {
      ...cardData,
      basePrice: initialBasePrice,
      price: adjustedPrice
    };
    
    setSelectedCard(cardWithBase);
    setSelectedFinish(initialFinish);
    setSearchQuery(cardData.name + ' - ' + cardData.set_name);
    setShowResults(false);
  };

  const handleFinishChange = (newFinish) => {
    setSelectedFinish(newFinish);
    
    // Update price based on selected finish
    if (selectedCard) {
      let newBasePrice = null;
      let finishLabel = 'Normal';
      
      if (selectedCard.game === 'magic') {
        if (newFinish === 'foil') {
          newBasePrice = selectedCard.allPrices?.usd_foil;
          finishLabel = 'Foil';
        } else if (newFinish === 'etched') {
          newBasePrice = selectedCard.allPrices?.usd_etched;
          finishLabel = 'Etched Foil';
        } else {
          newBasePrice = selectedCard.allPrices?.usd;
          finishLabel = 'Normal';
        }
      } else if (selectedCard.game === 'pokemon') {
        const finish = selectedCard.availableFinishes?.find(f => f.type === newFinish);
        if (finish) {
          newBasePrice = finish.price;
          finishLabel = finish.label;
        }
      }
      
      // Apply condition multiplier to the base (Near Mint) price
      let adjustedPrice = 1.00; // Default to $1 minimum

      if (newBasePrice && newBasePrice > 0) {
        adjustedPrice = newBasePrice * conditionMultipliers[selectedCondition];
        // Minimum $1 for any card
        if (adjustedPrice < 1) {
          adjustedPrice = 1.00;
        }
      }

      setSelectedCard({
        ...selectedCard,
        price: adjustedPrice,
        basePrice: newBasePrice,
        finish: newFinish,
        finishLabel: finishLabel
      });
    }
  };

  const handleConditionChange = (condition) => {
    setSelectedCondition(condition);
    
    if (selectedCard) {
      // Use base price (Near Mint) and apply new condition multiplier
      const basePrice = selectedCard.basePrice || selectedCard.price / conditionMultipliers[selectedCondition];
      let adjustedPrice = 1.00; // Default to $1 minimum

      if (basePrice && basePrice > 0) {
        adjustedPrice = basePrice * conditionMultipliers[condition];
        // Minimum $1 for any card
        if (adjustedPrice < 1) {
          adjustedPrice = 1.00;
        }
      }

      setSelectedCard({
        ...selectedCard,
        price: adjustedPrice,
        basePrice: basePrice
      });
    }
  };

  const isMobile = () => /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

  const startLiveScanner = async () => {
    // On mobile, always use native camera file input (programmatic click works when called directly from user gesture)
    if (isMobile()) {
      cameraInputRef.current?.click();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }
      });
      streamRef.current = stream;
      setShowCamera(true);
      setScanStatus('Point camera at a card...');
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
        startAutoScan();
      }, 300);
    } catch (error) {
      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        toast.error('Camera access denied. Please allow camera permission and try again.');
      } else {
        cameraInputRef.current?.click();
      }
    }
  };

  const stopLiveScanner = () => {
    if (scanIntervalRef.current) { clearInterval(scanIntervalRef.current); scanIntervalRef.current = null; }
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
    setShowCamera(false);
    setScanning(false);
    setScanStatus('');
  };

  const captureFrame = () => {
    if (!videoRef.current || videoRef.current.readyState < 2) return null;
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    canvas.getContext('2d').drawImage(videoRef.current, 0, 0);
    return new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.85));
  };

  const startAutoScan = () => {
    let attempt = 0;
    scanIntervalRef.current = setInterval(async () => {
      if (scanning) return;
      attempt++;
      setScanStatus(`Scanning... (${attempt})`);
      setScanning(true);
      try {
        const blob = await captureFrame();
        if (!blob) { setScanning(false); return; }
        const { file_url } = await backend.files.upload({ file: blob });
        const result = await backend.ai.invoke({
          prompt: `Analyze this trading card image. If you can clearly identify a trading card, return its exact name, set name, and game (magic, pokemon, or yugioh). If no card is clearly visible or the image is blurry, return null for all fields.`,
          file_urls: [file_url],
          response_json_schema: {
            type: "object",
            properties: {
              name: { type: ["string", "null"] },
              set_name: { type: ["string", "null"] },
              game: { type: ["string", "null"] }
            }
          }
        });
        if (result.name) {
          stopLiveScanner();
          setSelectedGame(result.game || selectedGame);
          setSearchQuery(result.name);
          searchCards(result.name);
          toast.success(`Identified: ${result.name}`);
        } else {
          setScanStatus('No card detected — keep scanning...');
          setScanning(false);
        }
      } catch (err) {
        setScanning(false);
        setScanStatus('Scan error, retrying...');
      }
    }, 3000);
  };



  const handleCameraCapture = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setScanning(true);
    toast.info('Identifying card...');

    try {
      const { file_url } = await backend.files.upload({ file });

      const result = await backend.ai.invoke({
        prompt: `Analyze this trading card image and identify it. Return the exact card name, set name, and game (magic, pokemon, or yugioh). Be as accurate as possible with the card name - it should match the official database name.`,
        file_urls: [file_url],
        response_json_schema: {
          type: "object",
          properties: {
            name: { type: "string" },
            set_name: { type: "string" },
            game: { type: "string" }
          }
        }
      });

      if (result.name) {
        setSelectedGame(result.game || selectedGame);
        setSearchQuery(result.name);
        await searchCards(result.name);
        toast.success(`Identified: ${result.name}`);
      } else {
        toast.error('Could not identify the card. Please try again or search manually.');
      }
    } catch (error) {
      console.error('Scan error:', error);
      toast.error('Failed to identify card. Please try manual search.');
    } finally {
      setScanning(false);
      // Reset file input so same image can be re-selected
      if (cameraInputRef.current) cameraInputRef.current.value = '';
    }
  };

  const addToBatch = () => {
    if (!selectedCard) return;
    const cardData = buildInventoryCardPayload({
      selectedCard,
      selectedCondition,
      selectedFinish,
      quantity: addQuantity,
      location: formData.location,
      fallbackCost: addCost
    });

    setBatchCards([...batchCards, cardData]);
    
    // Clear form for next card
    setSelectedCard(null);
    setSearchQuery('');
    setSearchResults([]);
    setAddQuantity(1);
    setAddCost(0);
    setFormData({ location: '' });
    setSelectedCondition('near_mint');
    setSelectedFinish(null);
    
    toast.success(`Added ${cardData.name} to batch`);
  };

  const removeFromBatch = (index) => {
    setBatchCards(batchCards.filter((_, i) => i !== index));
    toast.success('Card removed from batch');
  };

  const addSingleCard = () => {
    if (!selectedCard) return;
    const cardData = buildInventoryCardPayload({
      selectedCard,
      selectedCondition,
      selectedFinish,
      quantity: addQuantity,
      location: formData.location,
      fallbackCost: addCost
    });

    onSubmit([cardData]);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (isEditMode) {
      // Edit mode - only update editable fields
      if (!selectedCard) return;
      const submitData = {
        price: parseFloat(editPrice) || 0,
        cost: parseFloat(editCost) || 0,
        quantity: parseInt(editQuantity) || 0,
        condition: selectedCondition,
        location: formData.location || ''
      };
      onSubmit(submitData);
    } else {
      // Batch add mode - submit all cards at once
      if (batchCards.length === 0) return;
      onSubmit(batchCards);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <style>{scanStyle}</style>
      {isEditMode ? (
        <div>
          <div className="mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Edit Card</h3>
            <p className="text-sm text-gray-500">Update card details</p>
          </div>

          {/* Card Info Display */}
          <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg mb-4">
            <div className="flex items-start gap-4">
              {getCardImageUrl(selectedCard) && (
                <img
                  src={getCardImageUrl(selectedCard)}
                  alt={selectedCard.name}
                  className="w-32 h-auto rounded shadow"
                  onError={(event) => handleCardImageError(event, selectedCard)}
                />
              )}
              <div className="flex-1">
                <h4 className="font-semibold text-gray-900">{selectedCard.name}</h4>
                <p className="text-sm text-gray-600 mt-1">
                  {selectedCard.set_name} • #{selectedCard.card_number}
                </p>
                <p className="text-xs text-gray-500 mt-1 capitalize">
                  {selectedCard.rarity} • {selectedCard.game}
                </p>
              </div>
            </div>
          </div>

          {/* Editable Fields */}
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-2">Condition:</label>
              <Select value={selectedCondition} onValueChange={setSelectedCondition}>
                <SelectTrigger className="bg-white border-gray-300">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mint">Mint (M)</SelectItem>
                  <SelectItem value="near_mint">Near Mint (NM)</SelectItem>
                  <SelectItem value="lightly_played">Lightly Played (LP)</SelectItem>
                  <SelectItem value="poor">Poor (P)</SelectItem>
                  <SelectItem value="damaged">Damaged (DMG)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700 block mb-2">Market Price ($):</label>
              <Input
                type="number"
                step="0.01"
                value={editCost}
                onChange={(e) => setEditCost(e.target.value)}
                className="bg-white border-gray-300"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700 block mb-2">Sell Price ($) <span className="text-xs text-gray-400 font-normal">— min $1.00</span></label>
              <Input
                type="number"
                step="0.01"
                value={editPrice}
                onChange={(e) => {
                  const val = parseFloat(e.target.value) || 0;
                  setEditPrice(val < 1 ? 1.00 : val);
                }}
                className="bg-white border-gray-300"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700 block mb-2">Quantity:</label>
              <Input
                type="number"
                value={editQuantity}
                onChange={(e) => setEditQuantity(e.target.value)}
                className="bg-white border-gray-300"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700 block mb-2">Storage Location:</label>
              <LocationInput
                value={formData.location}
                onChange={(val) => setFormData({...formData, location: val})}
                existingLocations={existingLocations}
              />
            </div>
          </div>
        </div>
      ) : (
      <div>
        <div className="mb-3">
          <h3 className="text-lg font-semibold text-gray-900">Search for Card</h3>
          <p className="text-sm text-gray-500">
            Search the catalog, choose the exact printing you own, then create a stock row for what you actually have on hand.
          </p>
        </div>

        {/* Game Selector */}
        <div className="mb-4">
          <Select value={selectedGame} onValueChange={(v) => { setSelectedGame(v); setSearchResults([]); setSearchQuery(''); }}>
            <SelectTrigger className="w-[200px] bg-white border-gray-300">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="magic">Magic: The Gathering</SelectItem>
              <SelectItem value="pokemon">Pokémon TCG</SelectItem>
              <SelectItem value="yugioh">Yu-Gi-Oh!</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Search Input with Camera Button */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <Input
              value={searchQuery}
              onChange={handleSearchChange}
              placeholder="Search for a card (e.g., Terramorphic Expanse)..."
              className="pl-10 pr-12 h-12 text-lg bg-white border-gray-300"
              onFocus={() => searchResults.length > 0 && setShowResults(true)}
            />
            <button
              type="button"
              onClick={toggleVoiceInput}
              className={`absolute right-3 top-1/2 -translate-y-1/2 ${
                isListening ? 'text-red-500 animate-pulse' : 'text-gray-400 hover:text-blue-600'
              } transition-colors z-10`}
              title="Voice search"
            >
              <Mic className="w-5 h-5" />
            </button>
          </div>
          <Button
            type="button"
            variant="outline"
            className="h-12 px-4 border-gray-300"
            onClick={showCamera ? stopLiveScanner : startLiveScanner}
            disabled={scanning && !showCamera}
          >
            {showCamera ? <X className="w-5 h-5 mr-2" /> : <Camera className="w-5 h-5 mr-2" />}
            {showCamera ? 'Stop Scan' : 'Scan Card'}
          </Button>
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handleCameraCapture}
          />
        </div>

        {/* Live Camera Scanner Overlay */}
        {showCamera && (
          <div className="mt-4 relative rounded-xl overflow-hidden bg-black border-2 border-blue-500 shadow-xl">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-auto max-h-72 object-cover"
            />
            {/* Viewfinder overlay */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="relative w-52 h-52 sm:w-64 sm:h-64">
                <span className="absolute top-0 left-0 w-7 h-7 border-t-4 border-l-4 border-blue-400 rounded-tl" />
                <span className="absolute top-0 right-0 w-7 h-7 border-t-4 border-r-4 border-blue-400 rounded-tr" />
                <span className="absolute bottom-0 left-0 w-7 h-7 border-b-4 border-l-4 border-blue-400 rounded-bl" />
                <span className="absolute bottom-0 right-0 w-7 h-7 border-b-4 border-r-4 border-blue-400 rounded-br" />
                <div className="scan-line opacity-80" />
              </div>
            </div>
            {/* Status bar */}
            <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-4 py-2 flex items-center justify-between">
              <div className="flex items-center gap-2 text-white text-sm">
                {scanning
                  ? <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
                  : <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />}
                <span>{scanStatus}</span>
              </div>
              <button type="button" onClick={stopLiveScanner} className="text-white/70 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}

        {/* Image Preview on Hover */}
        {hoveredImage && (
          <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 pointer-events-none select-none">
            <img 
              src={hoveredImage} 
              alt="Card preview"
              className="w-80 h-auto rounded-lg shadow-2xl border-4 border-white pointer-events-none"
            />
          </div>
        )}

        {/* Results Dropdown */}
        {showResults && searchResults.length > 0 && (
          <div className="mt-2 border border-gray-200 rounded-lg bg-white shadow-lg max-h-[600px] overflow-hidden">
            <div className="p-3 border-b bg-gray-50">
              <p className="text-sm font-medium text-gray-700">
                Found {searchResults.length} version{searchResults.length !== 1 ? 's' : ''}
              </p>
            </div>
            <ScrollArea className="h-[500px]">
              <div className="p-2">
                {searchResults.map((result, idx) => (
                  <button
                    key={`${result.id}-${idx}`}
                    type="button"
                    onClick={() => handleCardSelect(result)}
                    className="w-full flex items-start gap-4 p-3 hover:bg-blue-50 rounded-lg transition-colors border border-transparent hover:border-blue-200 mb-2"
                  >
                    {getCardImageUrl(result) ? (
                      <img
                        src={getCardImageUrl(result)}
                        alt={result.name}
                        className="w-24 h-auto rounded shadow-sm flex-shrink-0 cursor-pointer"
                        onMouseEnter={() => setHoveredImage(getCardImageUrl(result))}
                        onMouseLeave={() => setHoveredImage(null)}
                        onClick={(e) => { e.stopPropagation(); setHoveredImage(null); handleCardSelect(result); }}
                        onError={(event) => handleCardImageError(event, result)}
                      />
                    ) : (
                      <div className="w-24 h-32 bg-gray-100 rounded flex items-center justify-center flex-shrink-0">
                        <span className="text-gray-400 text-xs">No Image</span>
                      </div>
                    )}
                    <div className="flex-1 text-left min-w-0">
                      <h4 className="font-semibold text-gray-900 truncate">
                        {result.name}
                      </h4>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className="text-sm text-gray-600">
                          {result.set_name}
                        </span>
                        <span className="text-xs bg-gray-200 px-2 py-0.5 rounded">
                          {result.set_code}
                        </span>
                        <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded capitalize">
                          {result.rarity}
                        </span>
                        {result.game === 'magic' && result.lang && (
                          <span className="text-xs bg-sky-100 text-sky-700 px-2 py-0.5 rounded uppercase">
                            {result.lang}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-500 mt-1 line-clamp-2">
                       #{result.card_number} • {result.type}
                      </p>
                      {result.treatments?.length > 0 && (
                        <div className="mt-1 flex items-center gap-1 flex-wrap">
                          {result.treatments.map((treatment, i) => (
                            <span key={i} className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded">
                              {treatment}
                            </span>
                          ))}
                        </div>
                      )}
                      {result.price && (
                       <p className="text-lg font-bold text-blue-600 mt-2">
                         ${result.price.toFixed(2)}
                       </p>
                      )}
                    </div>
                    {result.set_icon_uri && (
                      <div className="flex-shrink-0 flex items-center">
                        <img 
                          src={result.set_icon_uri} 
                          alt={result.set_name}
                          className="w-12 h-12 object-contain"
                        />
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}

        {/* No Results */}
        {showResults && !searching && searchQuery && searchResults.length === 0 && (
          <div className="mt-2 p-8 text-center border border-gray-200 rounded-lg bg-gray-50">
            <p className="text-gray-500">No cards found for "{searchQuery}"</p>
            <p className="text-sm text-gray-400 mt-1">Try a different search term</p>
          </div>
        )}

        {/* Selected Card Preview */}
        {selectedCard && (
          <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-start gap-4">
              {getCardImageUrl(selectedCard) && (
                <img
                  src={getCardImageUrl(selectedCard)}
                  alt={selectedCard.name}
                  className="w-32 h-auto rounded shadow"
                  onError={(event) => handleCardImageError(event, selectedCard)}
                />
              )}
              <div className="flex-1">
                <h4 className="font-semibold text-gray-900">{selectedCard.name}</h4>
                <div className="flex items-center gap-2 mt-1">
                  <p className="text-sm text-gray-600">
                    {selectedCard.set_name} • #{selectedCard.card_number}
                  </p>
                  {selectedCard.set_icon_uri && (
                    <img 
                      src={selectedCard.set_icon_uri} 
                      alt={selectedCard.set_name}
                      className="w-5 h-5"
                    />
                  )}
                </div>
                <p className="text-xs text-gray-500 mt-1 capitalize">
                  {selectedCard.rarity} • {selectedCard.type}
                </p>
                {selectedCard.game === 'magic' && selectedCard.lang && (
                  <p className="text-xs text-sky-700 mt-1 uppercase">
                    Language: {selectedCard.lang}
                  </p>
                )}
                {selectedCard.game === 'magic' && selectedCard.oracle_id && (
                  <p className="text-xs text-gray-500 mt-1 break-all">
                    Oracle ID: {selectedCard.oracle_id}
                  </p>
                )}
                
                {/* Condition Selector */}
                <div className="mt-3">
                  <label className="text-sm font-medium text-gray-700 block mb-2">Condition:</label>
                  <Select value={selectedCondition} onValueChange={handleConditionChange}>
                    <SelectTrigger className="bg-white border-gray-300">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="mint">Mint (M) - 110% of NM</SelectItem>
                      <SelectItem value="near_mint">Near Mint (NM) - Base Price</SelectItem>
                      <SelectItem value="lightly_played">Lightly Played (LP) - 85% of NM</SelectItem>
                      <SelectItem value="poor">Poor (P) - 50% of NM</SelectItem>
                      <SelectItem value="damaged">Damaged (DMG) - 40% of NM</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Finish Selector for Magic */}
                {selectedCard.game === 'magic' && selectedCard.allFinishes?.length > 0 && (
                  <div className="mt-3">
                    <label className="text-sm font-medium text-gray-700 block mb-2">
                      Card Finish: 
                      <span className="text-xs text-gray-500 ml-2">
                        ({selectedCard.allFinishes.join(', ')} available)
                      </span>
                    </label>
                    <Select 
                      value={selectedFinish || 'nonfoil'} 
                      onValueChange={handleFinishChange}
                    >
                      <SelectTrigger className="bg-white border-gray-300">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {selectedCard.allFinishes.includes('nonfoil') && (
                                  <SelectItem value="nonfoil">
                                    Normal - ${Math.max(1, (selectedCard.allPrices?.usd || 1) * conditionMultipliers[selectedCondition]).toFixed(2)}
                                  </SelectItem>
                                )}
                                {selectedCard.allFinishes.includes('foil') && (
                                  <SelectItem value="foil">
                                    Foil - ${Math.max(1, (selectedCard.allPrices?.usd_foil || 1) * conditionMultipliers[selectedCondition]).toFixed(2)}
                                  </SelectItem>
                                )}
                                {selectedCard.allFinishes.includes('etched') && (
                                  <SelectItem value="etched">
                                    Etched Foil - ${Math.max(1, (selectedCard.allPrices?.usd_etched || 1) * conditionMultipliers[selectedCondition]).toFixed(2)}
                                  </SelectItem>
                                )}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Finish Selector for Pokemon */}
                {selectedCard.game === 'pokemon' && selectedCard.availableFinishes?.length > 0 && (
                  <div className="mt-3">
                    <label className="text-sm font-medium text-gray-700 block mb-2">Card Finish:</label>
                    <Select 
                      value={selectedFinish || 'normal'} 
                      onValueChange={handleFinishChange}
                    >
                      <SelectTrigger className="bg-white border-gray-300">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {selectedCard.availableFinishes.map((finish) => (
                          <SelectItem key={finish.type} value={finish.type}>
                            {finish.label} - ${Math.max(1, finish.price * conditionMultipliers[selectedCondition]).toFixed(2)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                
                {/* Treatments Display */}
                {selectedCard.treatments?.length > 0 && (
                  <div className="mt-2 flex gap-1 flex-wrap">
                    {selectedCard.treatments.map((treatment, i) => (
                      <span key={i} className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded">
                        {treatment}
                      </span>
                    ))}
                  </div>
                )}

                <div className="mt-4 space-y-3">
                  <div>
                    <label className="text-sm font-medium text-gray-700 block mb-2">Catalog Market Price:</label>
                    <div className="h-10 rounded-md border border-gray-200 bg-gray-50 px-3 flex items-center text-sm text-gray-700">
                      {selectedCard.basePrice && selectedCard.basePrice > 0
                        ? `$${selectedCard.basePrice.toFixed(2)}`
                        : 'No market price available'}
                    </div>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700 block mb-2">Price ($):</label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0.01"
                      value={selectedCard.price || 1.00}
                      onChange={(e) => {
                        const newPrice = parseFloat(e.target.value) || 1.00;
                        setSelectedCard({...selectedCard, price: newPrice < 1 ? 1.00 : newPrice});
                      }}
                      className="bg-white border-gray-300"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700 block mb-2">Your Cost ($):</label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={addCost}
                      onChange={(e) => setAddCost(parseFloat(e.target.value) || 0)}
                      className="bg-white border-gray-300"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700 block mb-2">Quantity:</label>
                    <Input
                      type="number"
                      min="1"
                      value={addQuantity}
                      onChange={(e) => setAddQuantity(parseInt(e.target.value) || 1)}
                      className="bg-white border-gray-300"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700 block mb-2">Storage Location:</label>
                    <LocationInput
                      value={formData.location || ''}
                      onChange={(val) => setFormData({...formData, location: val})}
                      existingLocations={existingLocations}
                    />
                  </div>
                </div>
                </div>
                </div>
                </div>
                )}
                </div>
                )}

        {/* Action Buttons - always visible above batch list */}
        <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 mt-4">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          {!isEditMode && selectedCard && (
            <>
              <Button 
                type="button"
                onClick={addSingleCard}
                className="bg-green-600 hover:bg-green-700 text-white"
                disabled={isLoading}
              >
                {isLoading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Adding...</> : 'Add Single Card'}
              </Button>
              <Button 
                type="button"
                onClick={addToBatch}
                variant="outline"
                className="border-blue-600 text-blue-600 hover:bg-blue-50"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add to Batch
              </Button>
            </>
          )}
          {!isEditMode && batchCards.length > 0 && (
            <Button 
              type="submit" 
              className="bg-blue-600 hover:bg-blue-700 text-white" 
              disabled={isLoading}
            >
              {isLoading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Adding...</> : `Add All ${batchCards.length} Cards`}
            </Button>
          )}
        </div>

        {/* Batch List - below action buttons */}
        {!isEditMode && batchCards.length > 0 && (
          <div className="mt-4 border-t border-gray-200 pt-4">
            <h4 className="text-sm font-semibold text-gray-900 mb-3">
              Batch Queue ({batchCards.length} cards)
            </h4>
            <div className="space-y-2">
              {batchCards.map((card, index) => (
                <div key={index} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
                  {getCardImageUrl(card) && (
                    <img src={getCardImageUrl(card)} alt={card.name} className="w-16 h-auto rounded shadow-sm flex-shrink-0" onError={(event) => handleCardImageError(event, card)} />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 text-sm truncate">{card.name}</p>
                    <p className="text-xs text-gray-500">{card.set_name} • {card.condition.replace('_', ' ')}</p>
                    <p className="text-xs font-semibold text-blue-600">${card.price.toFixed(2)}</p>
                  </div>
                  {/* Quantity controls */}
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        if (card.quantity <= 1) return removeFromBatch(index);
                        setBatchCards(batchCards.map((c, i) => i === index ? {...c, quantity: c.quantity - 1} : c));
                      }}
                      className="w-7 h-7 rounded border border-gray-300 bg-white text-gray-600 hover:bg-gray-100 flex items-center justify-center text-lg leading-none"
                    >−</button>
                    <span className="w-8 text-center text-sm font-medium">{card.quantity}</span>
                    <button
                      type="button"
                      onClick={() => setBatchCards(batchCards.map((c, i) => i === index ? {...c, quantity: c.quantity + 1} : c))}
                      className="w-7 h-7 rounded border border-gray-300 bg-white text-gray-600 hover:bg-gray-100 flex items-center justify-center text-lg leading-none"
                    >+</button>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeFromBatch(index)}
                    className="text-red-500 hover:text-red-700 hover:bg-red-50 shrink-0"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

    </form>
  );
}


