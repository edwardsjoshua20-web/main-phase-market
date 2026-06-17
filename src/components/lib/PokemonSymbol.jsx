import React from 'react';
import { getCatalogAssetUrl } from '@/config/publicAssetUrls';

const SYMBOL_VERSION = '20260408a';
const LOCAL_SYMBOLS = {
  Grass: `${getCatalogAssetUrl('pokemon', 'symbols/Grass.png')}?v=${SYMBOL_VERSION}`,
  Fire: `${getCatalogAssetUrl('pokemon', 'symbols/Fire.png')}?v=${SYMBOL_VERSION}`,
  Water: `${getCatalogAssetUrl('pokemon', 'symbols/Water.png')}?v=${SYMBOL_VERSION}`,
  Lightning: `${getCatalogAssetUrl('pokemon', 'symbols/Lightning.png')}?v=${SYMBOL_VERSION}`,
  Psychic: `${getCatalogAssetUrl('pokemon', 'symbols/Psychic.png')}?v=${SYMBOL_VERSION}`,
  Fighting: `${getCatalogAssetUrl('pokemon', 'symbols/Fighting.png')}?v=${SYMBOL_VERSION}`,
  Darkness: `${getCatalogAssetUrl('pokemon', 'symbols/darkness_hgss.png')}?v=${SYMBOL_VERSION}`,
  Metal: `${getCatalogAssetUrl('pokemon', 'symbols/metal_hgss.png')}?v=${SYMBOL_VERSION}`,
  Fairy: `${getCatalogAssetUrl('pokemon', 'symbols/Fairy.png')}?v=${SYMBOL_VERSION}`,
  Dragon: `${getCatalogAssetUrl('pokemon', 'symbols/Dragon.png')}?v=${SYMBOL_VERSION}`,
  Colorless: `${getCatalogAssetUrl('pokemon', 'symbols/Colorless.png')}?v=${SYMBOL_VERSION}`,
  Free: `${getCatalogAssetUrl('pokemon', 'symbols/Free.png')}?v=${SYMBOL_VERSION}`,
  Rainbow: `${getCatalogAssetUrl('pokemon', 'symbols/rainbow.png')}?v=${SYMBOL_VERSION}`,
  Miracle: `${getCatalogAssetUrl('pokemon', 'symbols/miracle.png')}?v=${SYMBOL_VERSION}`,
  Stellar: `${getCatalogAssetUrl('pokemon', 'symbols/Stellar.png')}?v=${SYMBOL_VERSION}`
};

const SYMBOL_META = {
  Grass: { fill: '#6cc24a', stroke: '#3a7a22', label: 'Grass', icon: 'leaf' },
  Fire: { fill: '#f97316', stroke: '#b45309', label: 'Fire', icon: 'fire' },
  Water: { fill: '#38bdf8', stroke: '#0369a1', label: 'Water', icon: 'water' },
  Lightning: { fill: '#facc15', stroke: '#a16207', label: 'Lightning', icon: 'lightning' },
  Psychic: { fill: '#a855f7', stroke: '#6b21a8', label: 'Psychic', icon: 'psychic' },
  Fighting: { fill: '#d97706', stroke: '#92400e', label: 'Fighting', icon: 'fighting' },
  Darkness: { fill: '#374151', stroke: '#111827', label: 'Darkness', icon: 'darkness' },
  Metal: { fill: '#94a3b8', stroke: '#475569', label: 'Metal', icon: 'metal' },
  Fairy: { fill: '#f472b6', stroke: '#be185d', label: 'Fairy', icon: 'fairy' },
  Dragon: { fill: '#7c3aed', stroke: '#4c1d95', label: 'Dragon', icon: 'dragon' },
  Colorless: { fill: '#e5e7eb', stroke: '#6b7280', label: 'Colorless', icon: 'colorless' }
};

function IconPath({ icon }) {
  switch (icon) {
    case 'leaf':
      return <path d="M20 8c-5 1-8 4.2-8.9 9.5C15.8 18.4 19 15.3 20 8Zm-9.2 10.1c2.3-1 4.4-3 6-5.3-.1 3-1.3 5.9-3.8 8.2-1.4 1.3-3 2.1-4.8 2.9 0-2.2.7-4.2 2.6-5.8Z" fill="currentColor" />;
    case 'fire':
      return <path d="M15.4 7.5c.7 3-1.6 4.4-1.4 6.8.1 1.3 1.1 2.3 2.4 2.3 1.5 0 2.7-1.2 2.7-2.9 0-3.1-2.8-4.5-3.7-6.2Zm-1.7 4.2c-2.5 1.4-4.2 3.7-4.2 6.3 0 3.3 2.8 5.9 6.5 5.9s6.5-2.6 6.5-5.9c0-2.4-1.5-4.7-4-6 .4 2.3-.6 4.7-2.6 6.2-.4-1.5-1.1-3.2-2.2-4.5Z" fill="currentColor" />;
    case 'water':
      return <path d="M16 6c3.4 4.1 6.3 7.5 6.3 11.1A6.3 6.3 0 1 1 9.7 17C9.7 13.5 12.6 10.1 16 6Zm0 4.3c-1.8 2.4-3.5 4.4-3.5 6.6a3.5 3.5 0 1 0 7 0c0-2.2-1.7-4.2-3.5-6.6Z" fill="currentColor" />;
    case 'lightning':
      return <path d="M17.9 5 9.8 15.1h4L12 27l10.1-12.7h-4.5L17.9 5Z" fill="currentColor" />;
    case 'psychic':
      return <>
        <circle cx="16" cy="16" r="6.8" fill="none" stroke="currentColor" strokeWidth="2.4" />
        <circle cx="16" cy="16" r="2.2" fill="currentColor" />
      </>;
    case 'fighting':
      return <path d="m11.1 10.1 4.6-2.2 5.1 2.8 1.2 5.8-3.8 5.5-6.2.6-4.5-4.1.7-5.8 3-2.6Zm1.8 3.3-1 4 2.2 1.9 3.2-.3 2-2.9-.4-2.2-3.2-1.8-2.8 1.3Z" fill="currentColor" />;
    case 'darkness':
      return <path d="M19.6 8.5a7.8 7.8 0 1 0 0 15.1A8.9 8.9 0 1 1 19.6 8.5Z" fill="currentColor" />;
    case 'metal':
      return <>
        <path d="m16 7 7 4v8l-7 4-7-4v-8l7-4Z" fill="none" stroke="currentColor" strokeWidth="2.2" />
        <circle cx="16" cy="15.8" r="2.2" fill="currentColor" />
      </>;
    case 'fairy':
      return <path d="m16 7 2.1 5 5.3.7-4 3.7.9 5.5-4.3-2.6-4.3 2.6.9-5.5-4-3.7 5.3-.7L16 7Z" fill="currentColor" />;
    case 'dragon':
      return <path d="M21.2 11.3c-1.5-2.3-4.8-3.7-8-3.2 2.8.7 4.8 2.6 5.4 5.2-2.1-1.1-4.7-.8-6.8.9-2.5 2-3.5 5.1-2.8 8 1.2-2.1 3.3-3.5 5.9-3.6-.9 1.6-1 3.6-.3 5.4 3.9-.9 7.2-4.6 7.2-8.7 0-1.5-.2-2.7-.6-4Z" fill="currentColor" />;
    case 'colorless':
      return <>
        <circle cx="16" cy="16" r="7.5" fill="none" stroke="currentColor" strokeWidth="2.2" />
        <path d="M16 10.2 17.5 14l4 .3-3 2.5 1 3.9-3.5-2-3.5 2 1-3.9-3-2.5 4-.3L16 10.2Z" fill="currentColor" />
      </>;
    default:
      return <circle cx="16" cy="16" r="6" fill="currentColor" />;
  }
}

export function PokemonSymbol({ type, size = 24, className = '' }) {
  const meta = SYMBOL_META[type] || SYMBOL_META.Colorless;
  const localSymbol = LOCAL_SYMBOLS[type];

  return (
    <span
      className={`inline-flex items-center justify-center align-middle ${className}`}
      title={meta.label}
      aria-label={meta.label}
      style={{ width: size, height: size }}
    >
      {localSymbol ? (
        <img
          src={localSymbol}
          alt={meta.label}
          width={size}
          height={size}
          className="h-full w-full object-contain"
          loading="lazy"
          decoding="async"
          style={{ filter: 'drop-shadow(0 1px 1px rgba(15, 23, 42, 0.18))' }}
        />
      ) : (
        <svg viewBox="0 0 32 32" width={size} height={size} role="img" aria-hidden="true">
          <circle cx="16" cy="16" r="14" fill={meta.fill} stroke={meta.stroke} strokeWidth="2" />
          <g style={{ color: type === 'Colorless' ? '#374151' : '#ffffff' }}>
            <IconPath icon={meta.icon} />
          </g>
        </svg>
      )}
    </span>
  );
}

export function PokemonSymbolRow({ types = [], size = 22, className = '' }) {
  if (!Array.isArray(types) || types.length === 0) {
    return <span className={`text-gray-500 ${className}`}>None</span>;
  }

  return (
    <div className={`flex flex-wrap items-center gap-2.5 ${className}`}>
      {types.map((type, index) => (
        <PokemonSymbol key={`${type}-${index}`} type={type} size={size} />
      ))}
    </div>
  );
}
