import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, X, SlidersHorizontal } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// ─── Constants ─────────────────────────────────────────────────────────────
const MTG_COLORS = [
  { value: 'W', label: 'White', symbol: '☀️', bg: 'bg-yellow-50 border-yellow-300 text-yellow-800', active: 'bg-yellow-200 border-yellow-500 text-yellow-900' },
  { value: 'U', label: 'Blue', symbol: '💧', bg: 'bg-blue-50 border-blue-300 text-blue-800', active: 'bg-blue-200 border-blue-500 text-blue-900' },
  { value: 'B', label: 'Black', symbol: '💀', bg: 'bg-gray-100 border-gray-400 text-gray-800', active: 'bg-gray-300 border-gray-600 text-gray-900' },
  { value: 'R', label: 'Red', symbol: '🔥', bg: 'bg-red-50 border-red-300 text-red-800', active: 'bg-red-200 border-red-500 text-red-900' },
  { value: 'G', label: 'Green', symbol: '🌲', bg: 'bg-green-50 border-green-300 text-green-800', active: 'bg-green-200 border-green-500 text-green-900' },
];
const MTG_TYPES = ['Creature', 'Instant', 'Sorcery', 'Enchantment', 'Artifact', 'Planeswalker', 'Land', 'Battle'];
const MTG_SUBTYPES = ['Human', 'Elf', 'Dragon', 'Wizard', 'Warrior', 'Vampire', 'Zombie', 'Angel', 'Demon', 'Merfolk', 'Goblin', 'Knight', 'Cleric', 'Rogue', 'Soldier', 'Beast', 'Spirit', 'Shaman', 'Giant', 'Faerie'];
const MTG_KEYWORDS = ['Flying', 'Trample', 'Haste', 'Vigilance', 'Deathtouch', 'Lifelink', 'First Strike', 'Double Strike', 'Reach', 'Hexproof', 'Indestructible', 'Flash', 'Menace', 'Shadow', 'Shroud', 'Protection', 'Proliferate', 'Scry', 'Flashback', 'Cycling', 'Kicker', 'Convoke', 'Cascade', 'Annihilator', 'Landfall', 'Token', 'Counter', 'Draw', 'Discard', 'Sacrifice', 'Exile', 'Ward'];
const MTG_RARITIES = ['common', 'uncommon', 'rare', 'mythic'];
const NUM_OPS = ['=', '<=', '>=', '<', '>'];

const POKEMON_TYPES = ['Colorless', 'Darkness', 'Dragon', 'Fairy', 'Fighting', 'Fire', 'Grass', 'Lightning', 'Metal', 'Psychic', 'Water'];
const POKEMON_RARITIES = ['Common', 'Uncommon', 'Rare', 'Rare Holo', 'Rare Holo EX', 'Rare Ultra', 'Rare Secret', 'Amazing Rare', 'Rare Rainbow', 'Promo'];
const POKEMON_SUPERTYPES = ['Pokémon', 'Trainer', 'Energy'];

const YUGIOH_TYPES = ['Effect Monster', 'Normal Monster', 'Fusion Monster', 'Ritual Monster', 'Synchro Monster', 'XYZ Monster', 'Link Monster', 'Spell Card', 'Trap Card'];
const YUGIOH_ATTRIBUTES = ['DARK', 'EARTH', 'FIRE', 'LIGHT', 'WATER', 'WIND'];
const YUGIOH_RACES = ['Aqua', 'Beast', 'Beast-Warrior', 'Cyberse', 'Dinosaur', 'Dragon', 'Fairy', 'Fiend', 'Fish', 'Insect', 'Machine', 'Plant', 'Psychic', 'Pyro', 'Reptile', 'Rock', 'Sea Serpent', 'Spellcaster', 'Thunder', 'Warrior', 'Winged Beast', 'Zombie'];
const YUGIOH_KEYWORDS = ['Negate', 'Destroy', 'Special Summon', 'Draw', 'Search', 'Banish', 'Return', 'Tribute', 'Equip', 'Fusion', 'Synchro', 'Xyz', 'Link', 'Pendulum', 'Flip', 'Toon', 'Union', 'Gemini', 'Tuner', 'Token'];

const OP_COLORS = [
  { value: 'Red', label: 'Red', bg: 'bg-red-50 border-red-300 text-red-800', active: 'bg-red-200 border-red-500 text-red-900' },
  { value: 'Blue', label: 'Blue', bg: 'bg-blue-50 border-blue-300 text-blue-800', active: 'bg-blue-200 border-blue-500 text-blue-900' },
  { value: 'Green', label: 'Green', bg: 'bg-green-50 border-green-300 text-green-800', active: 'bg-green-200 border-green-500 text-green-900' },
  { value: 'Purple', label: 'Purple', bg: 'bg-purple-50 border-purple-300 text-purple-800', active: 'bg-purple-200 border-purple-500 text-purple-900' },
  { value: 'Black', label: 'Black', bg: 'bg-gray-100 border-gray-400 text-gray-800', active: 'bg-gray-300 border-gray-600 text-gray-900' },
  { value: 'Yellow', label: 'Yellow', bg: 'bg-yellow-50 border-yellow-300 text-yellow-800', active: 'bg-yellow-200 border-yellow-500 text-yellow-900' },
];
const OP_CATEGORIES = ['Leader', 'Character', 'Event', 'Stage'];
const OP_RARITIES = ['C', 'UC', 'R', 'SR', 'L', 'SEC'];

const LORCANA_INKS = [
  { value: 'Amber', label: 'Amber', bg: 'bg-amber-50 border-amber-300 text-amber-800', active: 'bg-amber-200 border-amber-500 text-amber-900' },
  { value: 'Amethyst', label: 'Amethyst', bg: 'bg-purple-50 border-purple-300 text-purple-800', active: 'bg-purple-200 border-purple-500 text-purple-900' },
  { value: 'Emerald', label: 'Emerald', bg: 'bg-emerald-50 border-emerald-300 text-emerald-800', active: 'bg-emerald-200 border-emerald-500 text-emerald-900' },
  { value: 'Ruby', label: 'Ruby', bg: 'bg-red-50 border-red-300 text-red-800', active: 'bg-red-200 border-red-500 text-red-900' },
  { value: 'Sapphire', label: 'Sapphire', bg: 'bg-blue-50 border-blue-300 text-blue-800', active: 'bg-blue-200 border-blue-500 text-blue-900' },
  { value: 'Steel', label: 'Steel', bg: 'bg-gray-100 border-gray-400 text-gray-800', active: 'bg-gray-300 border-gray-600 text-gray-900' },
];
const LORCANA_TYPES = ['Character', 'Action', 'Item', 'Location'];
const LORCANA_RARITIES = ['Common', 'Uncommon', 'Rare', 'Super Rare', 'Legendary', 'Enchanted'];
const LORCANA_KEYWORDS = ['Bodyguard', 'Challenger', 'Evasive', 'Reckless', 'Resist', 'Rush', 'Shift', 'Singer', 'Support', 'Ward'];

const FAB_COLORS = [
  { value: 'Red', label: 'Red', bg: 'bg-red-50 border-red-300 text-red-800', active: 'bg-red-200 border-red-500 text-red-900' },
  { value: 'Yellow', label: 'Yellow', bg: 'bg-yellow-50 border-yellow-300 text-yellow-800', active: 'bg-yellow-200 border-yellow-500 text-yellow-900' },
  { value: 'Blue', label: 'Blue', bg: 'bg-blue-50 border-blue-300 text-blue-800', active: 'bg-blue-200 border-blue-500 text-blue-900' },
];
const FAB_TYPES = ['Action', 'Attack Action', 'Attack Reaction', 'Defense Reaction', 'Instant', 'Hero', 'Equipment', 'Weapon', 'Token'];
const FAB_KEYWORDS = ['Go Again', 'Dominate', 'Intimidate', 'Phantasm', 'Stealth', 'Temper', 'Battleworn', 'Blade Break', 'Crush', 'Reprise', 'Spectra'];
const FAB_RARITIES = ['Common', 'Rare', 'Super Rare', 'Majestic', 'Legendary', 'Fabled'];

const STARWARS_ASPECTS = [
  { value: 'Heroism', label: 'Heroism', bg: 'bg-blue-50 border-blue-300 text-blue-800', active: 'bg-blue-200 border-blue-500 text-blue-900' },
  { value: 'Villainy', label: 'Villainy', bg: 'bg-red-50 border-red-300 text-red-800', active: 'bg-red-200 border-red-500 text-red-900' },
  { value: 'Command', label: 'Command', bg: 'bg-green-50 border-green-300 text-green-800', active: 'bg-green-200 border-green-500 text-green-900' },
  { value: 'Cunning', label: 'Cunning', bg: 'bg-yellow-50 border-yellow-300 text-yellow-800', active: 'bg-yellow-200 border-yellow-500 text-yellow-900' },
  { value: 'Aggression', label: 'Aggression', bg: 'bg-orange-50 border-orange-300 text-orange-800', active: 'bg-orange-200 border-orange-500 text-orange-900' },
  { value: 'Vigilance', label: 'Vigilance', bg: 'bg-purple-50 border-purple-300 text-purple-800', active: 'bg-purple-200 border-purple-500 text-purple-900' }
];
const STARWARS_TYPES = ['Unit', 'Event', 'Upgrade', 'Base', 'Leader', 'Token'];
const STARWARS_ARENAS = ['Ground', 'Space'];
const STARWARS_RARITIES = ['Common', 'Uncommon', 'Rare', 'Legendary', 'Special', 'Hyperfoil', 'Promo'];
const STARWARS_KEYWORDS = ['Shielded', 'Saboteur', 'Ambush', 'Raid', 'Overwhelm', 'Restore', 'Bounty', 'Grit', 'Sentinel', 'Smuggle'];

// ─── Shared UI helpers ─────────────────────────────────────────────────────
function ToggleBtn({ active, onClick, children, activeClass = 'bg-gray-700 text-white border-gray-700' }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-all ${
        active ? activeClass : 'bg-white text-gray-700 border-gray-300 hover:border-gray-500 hover:text-gray-900'
      }`}
    >
      {children}
    </button>
  );
}

function ColorBtn({ color, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all border-2 ${
        active ? color.active : color.bg
      }`}
    >
      {color.symbol && <span>{color.symbol}</span>}
      {color.label}
    </button>
  );
}

function NumFilter({ label, op, setOp, val, setVal, placeholder = 'e.g. 3' }) {
  return (
    <div>
      <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5 block">{label}</label>
      <div className="flex gap-2">
        <Select value={op} onValueChange={setOp}>
          <SelectTrigger className="w-20 border-gray-200"><SelectValue /></SelectTrigger>
          <SelectContent>{NUM_OPS.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
        </Select>
        <Input type="number" min="0" placeholder={placeholder} value={val} onChange={e => setVal(e.target.value)} />
      </div>
    </div>
  );
}

function FieldLabel({ children }) {
  return <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5 block">{children}</label>;
}

function ActionRow({ onSearch, onClear }) {
  return (
    <div className="flex gap-3 pt-2 border-t border-gray-100">
      <Button type="button" onClick={onSearch} className="bg-gray-700 hover:bg-gray-800 text-white flex-1 sm:flex-none">
        <Search className="w-4 h-4 mr-2" /> Search Cards
      </Button>
      <Button type="button" variant="outline" onClick={onClear} className="border-gray-300">
        <X className="w-4 h-4 mr-2" /> Clear All
      </Button>
    </div>
  );
}

// ─── MTG ───────────────────────────────────────────────────────────────────
const MTG_DEFAULT = { name: '', oracleText: '', typeLine: '', keywords: [], colors: [], colorMode: 'including', cmc: '', cmcOp: '=', rarity: '', set: '', power: '', powerOp: '=', toughness: '', toughnessOp: '=' };

function MtgSearch({ onSearch }) {
  const [p, setP] = useState(MTG_DEFAULT);
  const toggle = (field, val) => setP(prev => ({ ...prev, [field]: prev[field].includes(val) ? prev[field].filter(x => x !== val) : [...prev[field], val] }));
  const search = () => {
    const hasFilters = Boolean(
      p.name ||
      p.oracleText ||
      p.typeLine ||
      p.keywords.length ||
      p.colors.length ||
      p.cmc ||
      p.rarity ||
      p.set ||
      p.power ||
      p.toughness
    );
    if (!hasFilters) return;

    const displayParts = [
      p.name,
      p.oracleText,
      p.typeLine,
      p.colors.length ? p.colors.join('') : '',
      ...p.keywords,
      p.rarity,
      p.set
    ].filter(Boolean);

    onSearch(JSON.stringify(p), displayParts.join(' + ') || 'Magic Search', 'magic');
  };
  return (
    <div className="p-5 space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <FieldLabel>Card Name</FieldLabel>
          <Input placeholder='e.g. "Lightning Bolt"' value={p.name} onChange={e => setP(x => ({ ...x, name: e.target.value }))} onKeyDown={e => e.key === 'Enter' && search()} />
        </div>
        <div>
          <FieldLabel>Card Text / Oracle Text</FieldLabel>
          <Input placeholder='e.g. "draw a card", "flying"' value={p.oracleText} onChange={e => setP(x => ({ ...x, oracleText: e.target.value }))} onKeyDown={e => e.key === 'Enter' && search()} />
          <p className="text-xs text-gray-400 mt-1">Searches the rules text on the card</p>
        </div>
      </div>
      <div>
        <FieldLabel>Keywords & Abilities</FieldLabel>
        <div className="flex flex-wrap gap-2">
          {MTG_KEYWORDS.map(kw => <ToggleBtn key={kw} active={p.keywords.includes(kw)} onClick={() => toggle('keywords', kw)}>{kw}</ToggleBtn>)}
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <FieldLabel>Card Type</FieldLabel>
          <div className="flex flex-wrap gap-2">
            {MTG_TYPES.map(t => <ToggleBtn key={t} active={p.typeLine === t} onClick={() => setP(x => ({ ...x, typeLine: x.typeLine === t ? '' : t }))} activeClass="bg-purple-600 text-white border-purple-600">{t}</ToggleBtn>)}
          </div>
        </div>
        <div>
          <FieldLabel>Creature Subtype</FieldLabel>
          <Select value={p.typeLine || '__any__'} onValueChange={v => setP(x => ({ ...x, typeLine: v === '__any__' ? '' : v }))}>
            <SelectTrigger className="border-gray-200"><SelectValue placeholder="Select subtype..." /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__any__">Any</SelectItem>
              {MTG_SUBTYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div>
        <FieldLabel>Colors</FieldLabel>
        <div className="flex flex-wrap gap-3">
          {MTG_COLORS.map(c => <ColorBtn key={c.value} color={c} active={p.colors.includes(c.value)} onClick={() => toggle('colors', c.value)} />)}
        </div>
        {p.colors.length > 0 && (
          <div className="mt-2 flex gap-2">
            {['including', 'exactly', 'at_most'].map(mode => (
              <ToggleBtn key={mode} active={p.colorMode === mode} onClick={() => setP(x => ({ ...x, colorMode: mode }))}>
                {mode === 'including' ? 'Including' : mode === 'exactly' ? 'Exactly' : 'At most'}
              </ToggleBtn>
            ))}
          </div>
        )}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <NumFilter label="Mana Value (CMC)" op={p.cmcOp} setOp={v => setP(x => ({ ...x, cmcOp: v }))} val={p.cmc} setVal={v => setP(x => ({ ...x, cmc: v }))} />
        <NumFilter label="Power" op={p.powerOp} setOp={v => setP(x => ({ ...x, powerOp: v }))} val={p.power} setVal={v => setP(x => ({ ...x, power: v }))} placeholder="e.g. 4" />
        <NumFilter label="Toughness" op={p.toughnessOp} setOp={v => setP(x => ({ ...x, toughnessOp: v }))} val={p.toughness} setVal={v => setP(x => ({ ...x, toughness: v }))} placeholder="e.g. 4" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <FieldLabel>Rarity</FieldLabel>
          <div className="flex gap-2 flex-wrap">
            {MTG_RARITIES.map(r => (
              <ToggleBtn key={r} active={p.rarity === r} onClick={() => setP(x => ({ ...x, rarity: x.rarity === r ? '' : r }))}
                activeClass={r === 'mythic' ? 'bg-orange-500 text-white border-orange-500' : r === 'rare' ? 'bg-yellow-500 text-white border-yellow-500' : r === 'uncommon' ? 'bg-gray-500 text-white border-gray-500' : 'bg-gray-700 text-white border-gray-700'}>
                <span className="capitalize">{r}</span>
              </ToggleBtn>
            ))}
          </div>
        </div>
        <div>
          <FieldLabel>Set Code</FieldLabel>
          <Input placeholder='e.g. "MH3", "OTJ", "LTR"' value={p.set} onChange={e => setP(x => ({ ...x, set: e.target.value }))} onKeyDown={e => e.key === 'Enter' && search()} />
        </div>
      </div>
      <ActionRow onSearch={search} onClear={() => setP(MTG_DEFAULT)} />
    </div>
  );
}

// ─── POKEMON ───────────────────────────────────────────────────────────────
const POKE_DEFAULT = { name: '', supertype: '', type: '', rarity: '', set: '' };

function PokemonSearch({ onSearch }) {
  const [p, setP] = useState(POKE_DEFAULT);
  const search = () => {
    if (!p.name && !p.supertype && !p.type && !p.rarity && !p.set) return;
    const displayName = [p.name, p.supertype, p.type, p.rarity].filter(Boolean).join(' + ') || 'Pokémon Search';
    onSearch(JSON.stringify(p), displayName, 'pokemon');
  };
  return (
    <div className="p-5 space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <FieldLabel>Card Name</FieldLabel>
          <Input placeholder='e.g. "Charizard", "Pikachu"' value={p.name} onChange={e => setP(x => ({ ...x, name: e.target.value }))} onKeyDown={e => e.key === 'Enter' && search()} />
        </div>
        <div>
          <FieldLabel>Set Name</FieldLabel>
          <Input placeholder='e.g. "Scarlet & Violet", "Base Set"' value={p.set} onChange={e => setP(x => ({ ...x, set: e.target.value }))} onKeyDown={e => e.key === 'Enter' && search()} />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <FieldLabel>Card Category</FieldLabel>
          <div className="flex flex-wrap gap-2">
            {POKEMON_SUPERTYPES.map(t => <ToggleBtn key={t} active={p.supertype === t} onClick={() => setP(x => ({ ...x, supertype: x.supertype === t ? '' : t }))} activeClass="bg-yellow-500 text-white border-yellow-500">{t}</ToggleBtn>)}
          </div>
        </div>
        <div>
          <FieldLabel>Pokémon Type</FieldLabel>
          <div className="flex flex-wrap gap-2">
            {POKEMON_TYPES.map(t => <ToggleBtn key={t} active={p.type === t} onClick={() => setP(x => ({ ...x, type: x.type === t ? '' : t }))}>{t}</ToggleBtn>)}
          </div>
        </div>
      </div>
      <div>
        <FieldLabel>Rarity</FieldLabel>
        <div className="flex flex-wrap gap-2">
          {POKEMON_RARITIES.map(r => <ToggleBtn key={r} active={p.rarity === r} onClick={() => setP(x => ({ ...x, rarity: x.rarity === r ? '' : r }))} activeClass="bg-yellow-500 text-white border-yellow-500">{r}</ToggleBtn>)}
        </div>
      </div>
      <ActionRow onSearch={search} onClear={() => setP(POKE_DEFAULT)} />
    </div>
  );
}

// ─── YUGIOH ────────────────────────────────────────────────────────────────
const YGO_DEFAULT = { name: '', desc: '', type: '', race: '', attribute: '', keywords: [], atk: '', atkOp: '=', def: '', defOp: '=', level: '', levelOp: '=' };

function YugiohSearch({ onSearch }) {
  const [p, setP] = useState(YGO_DEFAULT);
  const toggle = (field, val) => setP(prev => ({ ...prev, [field]: prev[field].includes(val) ? prev[field].filter(x => x !== val) : [...prev[field], val] }));
  const search = () => {
    const qs = [];
    // Combine name, desc, and selected keywords into fname for text search
    const textParts = [p.name, p.desc, ...p.keywords].filter(Boolean);
    if (textParts.length) qs.push(`fname=${encodeURIComponent(textParts[0])}`); // YGOPRODeck fname does partial text match
    if (p.type) qs.push(`type=${encodeURIComponent(p.type)}`);
    if (p.race) qs.push(`race=${encodeURIComponent(p.race)}`);
    if (p.attribute) qs.push(`attribute=${encodeURIComponent(p.attribute)}`);
    // YGOPRODeck only supports exact = for numeric fields; other ops require client-side filtering
    if (p.level && p.levelOp === '=') qs.push(`level=${p.level}`);
    if (p.atk && p.atkOp === '=') qs.push(`atk=${p.atk}`);
    if (p.def && p.defOp === '=') qs.push(`def=${p.def}`);
    if (!qs.length) return;
    // Pass numeric filter params as JSON suffix for client-side post-filtering
    const numFilters = { atk: p.atk, atkOp: p.atkOp, def: p.def, defOp: p.defOp, level: p.level, levelOp: p.levelOp, desc: p.desc, keywords: p.keywords };
    onSearch(qs.join('&') + `&__numFilters=${encodeURIComponent(JSON.stringify(numFilters))}`, [p.name, p.desc, ...p.keywords, p.type, p.attribute, p.race].filter(Boolean).join(' + ') || 'Yu-Gi-Oh Search', 'yugioh');
  };
  return (
    <div className="p-5 space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <FieldLabel>Card Name</FieldLabel>
          <Input placeholder='e.g. "Blue-Eyes White Dragon"' value={p.name} onChange={e => setP(x => ({ ...x, name: e.target.value }))} onKeyDown={e => e.key === 'Enter' && search()} />
        </div>
        <div>
          <FieldLabel>Card Text / Effect</FieldLabel>
          <Input placeholder='e.g. "destroy", "Special Summon"' value={p.desc} onChange={e => setP(x => ({ ...x, desc: e.target.value }))} onKeyDown={e => e.key === 'Enter' && search()} />
        </div>
      </div>
      <div>
        <FieldLabel>Keywords & Abilities</FieldLabel>
        <div className="flex flex-wrap gap-2">
          {YUGIOH_KEYWORDS.map(kw => <ToggleBtn key={kw} active={p.keywords.includes(kw)} onClick={() => toggle('keywords', kw)} activeClass="bg-purple-600 text-white border-purple-600">{kw}</ToggleBtn>)}
        </div>
      </div>
      <div>
        <FieldLabel>Card Type</FieldLabel>
        <div className="flex flex-wrap gap-2">
          {YUGIOH_TYPES.map(t => <ToggleBtn key={t} active={p.type === t} onClick={() => setP(x => ({ ...x, type: x.type === t ? '' : t }))} activeClass="bg-purple-600 text-white border-purple-600">{t}</ToggleBtn>)}
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <FieldLabel>Attribute</FieldLabel>
          <div className="flex flex-wrap gap-2">
            {YUGIOH_ATTRIBUTES.map(a => <ToggleBtn key={a} active={p.attribute === a} onClick={() => setP(x => ({ ...x, attribute: x.attribute === a ? '' : a }))}>{a}</ToggleBtn>)}
          </div>
        </div>
        <div>
          <FieldLabel>Monster Race / Type</FieldLabel>
          <Select value={p.race || '__any__'} onValueChange={v => setP(x => ({ ...x, race: v === '__any__' ? '' : v }))}>
            <SelectTrigger className="border-gray-200"><SelectValue placeholder="Any race..." /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__any__">Any</SelectItem>
              {YUGIOH_RACES.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <NumFilter label="Level / Rank" op={p.levelOp} setOp={v => setP(x => ({ ...x, levelOp: v }))} val={p.level} setVal={v => setP(x => ({ ...x, level: v }))} placeholder="e.g. 4" />
        <NumFilter label="ATK" op={p.atkOp} setOp={v => setP(x => ({ ...x, atkOp: v }))} val={p.atk} setVal={v => setP(x => ({ ...x, atk: v }))} placeholder="e.g. 2400" />
        <NumFilter label="DEF" op={p.defOp} setOp={v => setP(x => ({ ...x, defOp: v }))} val={p.def} setVal={v => setP(x => ({ ...x, def: v }))} placeholder="e.g. 2000" />
      </div>
      <ActionRow onSearch={search} onClear={() => setP(YGO_DEFAULT)} />
    </div>
  );
}

// ─── ONE PIECE ─────────────────────────────────────────────────────────────
const OP_DEFAULT = { name: '', effect: '', colors: [], category: '', rarity: '', cost: '', costOp: '=', power: '', powerOp: '>=' };

function OnePieceSearch({ onSearch }) {
  const [p, setP] = useState(OP_DEFAULT);
  const toggle = (field, val) => setP(prev => ({ ...prev, [field]: prev[field].includes(val) ? prev[field].filter(x => x !== val) : [...prev[field], val] }));
  const search = () => {
    if (!p.name && !p.colors.length && !p.category && !p.rarity && !p.cost && !p.power && !p.effect) return;
    onSearch(JSON.stringify(p), [p.name, p.colors.join('/'), p.category, p.rarity].filter(Boolean).join(' + ') || 'One Piece Search', 'onepiece');
  };
  return (
    <div className="p-5 space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <FieldLabel>Card Name</FieldLabel>
          <Input placeholder='e.g. "Monkey D. Luffy"' value={p.name} onChange={e => setP(x => ({ ...x, name: e.target.value }))} onKeyDown={e => e.key === 'Enter' && search()} />
        </div>
        <div>
          <FieldLabel>Effect Text</FieldLabel>
          <Input placeholder='e.g. "draw", "K.O."' value={p.effect} onChange={e => setP(x => ({ ...x, effect: e.target.value }))} onKeyDown={e => e.key === 'Enter' && search()} />
        </div>
      </div>
      <div>
        <FieldLabel>Color</FieldLabel>
        <div className="flex flex-wrap gap-2">
          {OP_COLORS.map(c => <ColorBtn key={c.value} color={c} active={p.colors.includes(c.value)} onClick={() => toggle('colors', c.value)} />)}
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <FieldLabel>Category</FieldLabel>
          <div className="flex flex-wrap gap-2">
            {OP_CATEGORIES.map(t => <ToggleBtn key={t} active={p.category === t} onClick={() => setP(x => ({ ...x, category: x.category === t ? '' : t }))} activeClass="bg-red-600 text-white border-red-600">{t}</ToggleBtn>)}
          </div>
        </div>
        <div>
          <FieldLabel>Rarity</FieldLabel>
          <div className="flex flex-wrap gap-2">
            {OP_RARITIES.map(r => <ToggleBtn key={r} active={p.rarity === r} onClick={() => setP(x => ({ ...x, rarity: x.rarity === r ? '' : r }))}>{r}</ToggleBtn>)}
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <NumFilter label="Cost" op={p.costOp} setOp={v => setP(x => ({ ...x, costOp: v }))} val={p.cost} setVal={v => setP(x => ({ ...x, cost: v }))} placeholder="e.g. 5" />
        <NumFilter label="Power" op={p.powerOp} setOp={v => setP(x => ({ ...x, powerOp: v }))} val={p.power} setVal={v => setP(x => ({ ...x, power: v }))} placeholder="e.g. 6000" />
      </div>
      <ActionRow onSearch={search} onClear={() => setP(OP_DEFAULT)} />
    </div>
  );
}

// ─── LORCANA ───────────────────────────────────────────────────────────────
const LRC_DEFAULT = { name: '', bodyText: '', inks: [], type: '', rarity: '', cost: '', costOp: '=', lore: '', loreOp: '>=', keywords: [] };

function LorcanaSearch({ onSearch }) {
  const [p, setP] = useState(LRC_DEFAULT);
  const toggle = (field, val) => setP(prev => ({ ...prev, [field]: prev[field].includes(val) ? prev[field].filter(x => x !== val) : [...prev[field], val] }));
  const search = () => {
    if (!p.name && !p.inks.length && !p.type && !p.rarity && !p.cost && !p.lore && !p.keywords.length && !p.bodyText) return;
    onSearch(JSON.stringify(p), [p.name, p.inks.join('/'), p.type, p.rarity].filter(Boolean).join(' + ') || 'Lorcana Search', 'lorcana');
  };
  return (
    <div className="p-5 space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <FieldLabel>Card Name</FieldLabel>
          <Input placeholder='e.g. "Elsa", "Mickey Mouse"' value={p.name} onChange={e => setP(x => ({ ...x, name: e.target.value }))} onKeyDown={e => e.key === 'Enter' && search()} />
        </div>
        <div>
          <FieldLabel>Card Text</FieldLabel>
          <Input placeholder='e.g. "draw a card", "Exert"' value={p.bodyText} onChange={e => setP(x => ({ ...x, bodyText: e.target.value }))} onKeyDown={e => e.key === 'Enter' && search()} />
        </div>
      </div>
      <div>
        <FieldLabel>Ink Color</FieldLabel>
        <div className="flex flex-wrap gap-2">
          {LORCANA_INKS.map(c => <ColorBtn key={c.value} color={c} active={p.inks.includes(c.value)} onClick={() => toggle('inks', c.value)} />)}
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <FieldLabel>Card Type</FieldLabel>
          <div className="flex flex-wrap gap-2">
            {LORCANA_TYPES.map(t => <ToggleBtn key={t} active={p.type === t} onClick={() => setP(x => ({ ...x, type: x.type === t ? '' : t }))} activeClass="bg-purple-600 text-white border-purple-600">{t}</ToggleBtn>)}
          </div>
        </div>
        <div>
          <FieldLabel>Rarity</FieldLabel>
          <div className="flex flex-wrap gap-2">
            {LORCANA_RARITIES.map(r => <ToggleBtn key={r} active={p.rarity === r} onClick={() => setP(x => ({ ...x, rarity: x.rarity === r ? '' : r }))}>{r}</ToggleBtn>)}
          </div>
        </div>
      </div>
      <div>
        <FieldLabel>Keywords & Abilities</FieldLabel>
        <div className="flex flex-wrap gap-2">
          {LORCANA_KEYWORDS.map(kw => <ToggleBtn key={kw} active={p.keywords.includes(kw)} onClick={() => toggle('keywords', kw)}>{kw}</ToggleBtn>)}
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <NumFilter label="Cost" op={p.costOp} setOp={v => setP(x => ({ ...x, costOp: v }))} val={p.cost} setVal={v => setP(x => ({ ...x, cost: v }))} placeholder="e.g. 3" />
        <NumFilter label="Lore Value" op={p.loreOp} setOp={v => setP(x => ({ ...x, loreOp: v }))} val={p.lore} setVal={v => setP(x => ({ ...x, lore: v }))} placeholder="e.g. 2" />
      </div>
      <ActionRow onSearch={search} onClear={() => setP(LRC_DEFAULT)} />
    </div>
  );
}

// ─── FLESH AND BLOOD ───────────────────────────────────────────────────────
const FAB_DEFAULT = { name: '', text: '', colors: [], type: '', keywords: [], rarity: '', cost: '', costOp: '=', power: '', powerOp: '>=', defense: '', defenseOp: '>=' };

function FleshAndBloodSearch({ onSearch }) {
  const [p, setP] = useState(FAB_DEFAULT);
  const toggle = (field, val) => setP(prev => ({ ...prev, [field]: prev[field].includes(val) ? prev[field].filter(x => x !== val) : [...prev[field], val] }));
  const search = () => {
    if (!p.name && !p.colors.length && !p.type && !p.keywords.length && !p.rarity && !p.cost && !p.power && !p.defense && !p.text) return;
    onSearch(JSON.stringify(p), [p.name, p.colors.join('/'), p.type, p.rarity].filter(Boolean).join(' + ') || 'FAB Search', 'flesh_and_blood');
  };
  return (
    <div className="p-5 space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <FieldLabel>Card Name</FieldLabel>
          <Input placeholder='e.g. "Enlightened Strike"' value={p.name} onChange={e => setP(x => ({ ...x, name: e.target.value }))} onKeyDown={e => e.key === 'Enter' && search()} />
        </div>
        <div>
          <FieldLabel>Card Text</FieldLabel>
          <Input placeholder='e.g. "go again", "boost"' value={p.text} onChange={e => setP(x => ({ ...x, text: e.target.value }))} onKeyDown={e => e.key === 'Enter' && search()} />
        </div>
      </div>
      <div>
        <FieldLabel>Pitch Color</FieldLabel>
        <div className="flex flex-wrap gap-2">
          {FAB_COLORS.map(c => <ColorBtn key={c.value} color={c} active={p.colors.includes(c.value)} onClick={() => toggle('colors', c.value)} />)}
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <FieldLabel>Card Type</FieldLabel>
          <div className="flex flex-wrap gap-2">
            {FAB_TYPES.map(t => <ToggleBtn key={t} active={p.type === t} onClick={() => setP(x => ({ ...x, type: x.type === t ? '' : t }))} activeClass="bg-red-600 text-white border-red-600">{t}</ToggleBtn>)}
          </div>
        </div>
        <div>
          <FieldLabel>Keywords</FieldLabel>
          <div className="flex flex-wrap gap-2">
            {FAB_KEYWORDS.map(kw => <ToggleBtn key={kw} active={p.keywords.includes(kw)} onClick={() => toggle('keywords', kw)}>{kw}</ToggleBtn>)}
          </div>
        </div>
      </div>
      <div>
        <FieldLabel>Rarity</FieldLabel>
        <div className="flex flex-wrap gap-2">
          {FAB_RARITIES.map(r => <ToggleBtn key={r} active={p.rarity === r} onClick={() => setP(x => ({ ...x, rarity: x.rarity === r ? '' : r }))}>{r}</ToggleBtn>)}
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <NumFilter label="Cost" op={p.costOp} setOp={v => setP(x => ({ ...x, costOp: v }))} val={p.cost} setVal={v => setP(x => ({ ...x, cost: v }))} placeholder="e.g. 2" />
        <NumFilter label="Power" op={p.powerOp} setOp={v => setP(x => ({ ...x, powerOp: v }))} val={p.power} setVal={v => setP(x => ({ ...x, power: v }))} placeholder="e.g. 4" />
        <NumFilter label="Defense" op={p.defenseOp} setOp={v => setP(x => ({ ...x, defenseOp: v }))} val={p.defense} setVal={v => setP(x => ({ ...x, defense: v }))} placeholder="e.g. 3" />
      </div>
      <ActionRow onSearch={search} onClear={() => setP(FAB_DEFAULT)} />
    </div>
  );
}

const STARWARS_DEFAULT = { name: '', text: '', aspects: [], type: '', arena: '', rarity: '', keywords: [], cost: '', costOp: '=', power: '', powerOp: '>=', hp: '', hpOp: '>=' };

function StarWarsSearch({ onSearch }) {
  const [p, setP] = useState(STARWARS_DEFAULT);
  const toggle = (field, val) => setP(prev => ({ ...prev, [field]: prev[field].includes(val) ? prev[field].filter(x => x !== val) : [...prev[field], val] }));
  const search = () => {
    if (!p.name && !p.text && !p.aspects.length && !p.type && !p.arena && !p.rarity && !p.keywords.length && !p.cost && !p.power && !p.hp) return;
    onSearch(JSON.stringify(p), [p.name, p.aspects.join('/'), p.type, p.rarity].filter(Boolean).join(' + ') || 'Star Wars Search', 'starwars');
  };
  return (
    <div className="p-5 space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <FieldLabel>Card Name</FieldLabel>
          <Input placeholder='e.g. "Luke Skywalker"' value={p.name} onChange={e => setP(x => ({ ...x, name: e.target.value }))} onKeyDown={e => e.key === 'Enter' && search()} />
        </div>
        <div>
          <FieldLabel>Card Text</FieldLabel>
          <Input placeholder='e.g. "Ambush", "deal damage"' value={p.text} onChange={e => setP(x => ({ ...x, text: e.target.value }))} onKeyDown={e => e.key === 'Enter' && search()} />
        </div>
      </div>
      <div>
        <FieldLabel>Aspects</FieldLabel>
        <div className="flex flex-wrap gap-2">
          {STARWARS_ASPECTS.map(c => <ColorBtn key={c.value} color={c} active={p.aspects.includes(c.value)} onClick={() => toggle('aspects', c.value)} />)}
        </div>
      </div>
      <div>
        <FieldLabel>Keywords</FieldLabel>
        <div className="flex flex-wrap gap-2">
          {STARWARS_KEYWORDS.map(kw => <ToggleBtn key={kw} active={p.keywords.includes(kw)} onClick={() => toggle('keywords', kw)}>{kw}</ToggleBtn>)}
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <FieldLabel>Card Type</FieldLabel>
          <div className="flex flex-wrap gap-2">
            {STARWARS_TYPES.map(t => <ToggleBtn key={t} active={p.type === t} onClick={() => setP(x => ({ ...x, type: x.type === t ? '' : t }))} activeClass="bg-slate-700 text-white border-slate-700">{t}</ToggleBtn>)}
          </div>
        </div>
        <div>
          <FieldLabel>Arena</FieldLabel>
          <div className="flex flex-wrap gap-2">
            {STARWARS_ARENAS.map(a => <ToggleBtn key={a} active={p.arena === a} onClick={() => setP(x => ({ ...x, arena: x.arena === a ? '' : a }))} activeClass="bg-indigo-600 text-white border-indigo-600">{a}</ToggleBtn>)}
          </div>
        </div>
        <div>
          <FieldLabel>Rarity</FieldLabel>
          <div className="flex flex-wrap gap-2">
            {STARWARS_RARITIES.map(r => <ToggleBtn key={r} active={p.rarity === r} onClick={() => setP(x => ({ ...x, rarity: x.rarity === r ? '' : r }))}>{r}</ToggleBtn>)}
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <NumFilter label="Cost" op={p.costOp} setOp={v => setP(x => ({ ...x, costOp: v }))} val={p.cost} setVal={v => setP(x => ({ ...x, cost: v }))} placeholder="e.g. 4" />
        <NumFilter label="Power" op={p.powerOp} setOp={v => setP(x => ({ ...x, powerOp: v }))} val={p.power} setVal={v => setP(x => ({ ...x, power: v }))} placeholder="e.g. 5" />
        <NumFilter label="HP" op={p.hpOp} setOp={v => setP(x => ({ ...x, hpOp: v }))} val={p.hp} setVal={v => setP(x => ({ ...x, hp: v }))} placeholder="e.g. 6" />
      </div>
      <ActionRow onSearch={search} onClear={() => setP(STARWARS_DEFAULT)} />
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────
const GAME_OPTIONS = [
  { value: 'magic', label: 'Magic: The Gathering' },
  { value: 'pokemon', label: 'Pokémon' },
  { value: 'yugioh', label: 'Yu-Gi-Oh!' },
  { value: 'lorcana', label: 'Disney Lorcana' },
  { value: 'onepiece', label: 'One Piece TCG' },
  { value: 'flesh_and_blood', label: 'Flesh and Blood' },
  { value: 'starwars', label: 'Star Wars Unlimited' },
];

export default function AdvancedSearch({ onSearch, initialGame = 'magic' }) {
  // *** IMPORTANT: game is INTERNAL state — changing it never navigates or changes URL ***
  const [game, setGame] = useState(initialGame);

  React.useEffect(() => {
    setGame(initialGame || 'magic');
  }, [initialGame]);

  const renderForm = () => {
    switch (game) {
      case 'magic': return <MtgSearch onSearch={onSearch} />;
      case 'pokemon': return <PokemonSearch onSearch={onSearch} />;
      case 'yugioh': return <YugiohSearch onSearch={onSearch} />;
      case 'onepiece': return <OnePieceSearch onSearch={onSearch} />;
      case 'lorcana': return <LorcanaSearch onSearch={onSearch} />;
      case 'flesh_and_blood': return <FleshAndBloodSearch onSearch={onSearch} />;
      case 'starwars': return <StarWarsSearch onSearch={onSearch} />;
      default: return <MtgSearch onSearch={onSearch} />;
    }
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200">
        <SlidersHorizontal className="w-4 h-4 text-gray-600 flex-shrink-0" />
        <span className="text-sm font-semibold text-gray-800 flex-shrink-0">Advanced Card Search</span>
        {/* This Select only changes the form — it does NOT navigate or change URL params */}
        <Select value={game} onValueChange={setGame}>
          <SelectTrigger className="w-52 h-7 text-sm border-gray-300">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {GAME_OPTIONS.map(g => (
              <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {renderForm()}
    </div>
  );
}
