import React from 'react';
import { getCatalogAssetUrl } from '@/config/publicAssetUrls';
import { getMtgSymbolFileName } from '@/config/mtgSymbolFileName';

function parseManaSymbols(manaCost) {
  return String(manaCost || '').match(/\{([^}]+)\}/g) || [];
}

function renderScryfallSymbol(symbol, key, className = 'h-5 w-5') {
  const token = symbol.replace(/[{}]/g, '').toUpperCase();
  const fileName = getMtgSymbolFileName(token);
  const localUrl = getCatalogAssetUrl('mtg', `symbols/card/${fileName}`);

  return (
    <img
      key={key}
      src={localUrl}
      alt={symbol}
      title={symbol}
      className={className}
      loading="lazy"
    />
  );
}

function getLoyaltyBadgeAsset(value, kind) {
  if (kind === 'start') {
    return getCatalogAssetUrl('mtg', 'symbols/loyalty/start.svg');
  }

  const normalized = String(value || '').trim().replace('−', '-').replace('âˆ’', '-');
  if (normalized.startsWith('+')) {
    return getCatalogAssetUrl('mtg', 'symbols/loyalty/ability-plus.svg');
  }
  if (normalized.startsWith('-')) {
    return getCatalogAssetUrl('mtg', 'symbols/loyalty/ability-minus.svg');
  }
  return getCatalogAssetUrl('mtg', 'symbols/loyalty/ability-zero.svg');
}

export function PlaneswalkerLoyaltyBadge({ value, kind = 'ability', className = 'h-8 w-auto' }) {
  const normalized = String(value || '').trim().replace('−', '-').replace('âˆ’', '-');
  if (!normalized) {
    return null;
  }

  const isStart = kind === 'start';
  const assetUrl = getLoyaltyBadgeAsset(normalized, kind);
  const sizeClass = isStart ? 'h-full aspect-square' : 'h-full w-[2.35em]';
  const textClass = isStart ? 'text-[0.95em]' : 'text-[0.82em]';
  const leftPaddingClass = isStart ? 'px-0' : 'pl-[0.2em] pr-[0.05em]';

  return (
    <span className={`relative inline-flex items-center justify-center ${className}`} aria-label={`Loyalty ${normalized}`} role="img">
      <img src={assetUrl} alt="" aria-hidden="true" className={sizeClass} loading="lazy" />
      <span className={`pointer-events-none absolute inset-0 flex items-center justify-center font-black tracking-tight text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.7)] ${textClass} ${leftPaddingClass}`}>
        {normalized}
      </span>
    </span>
  );
}

export function ManaCost({ manaCost }) {
  const symbols = parseManaSymbols(manaCost);

  if (symbols.length === 0) {
    return <span className="text-gray-900 font-medium">—</span>;
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {symbols.map((symbol, index) => {
        const token = symbol.replace(/[{}]/g, '').toUpperCase();
        return renderScryfallSymbol(symbol, `${token}-${index}`);
      })}
    </div>
  );
}

export function MtgSymbolText({ text, className = 'space-y-2 text-gray-900 leading-relaxed', symbolClassName = 'h-4 w-4' }) {
  const lines = String(text || '').split('\n');

  return (
    <div className={className}>
      {lines.map((line, lineIndex) => {
        const rawLine = String(line);
        const loyaltyMatch = rawLine.match(/^([+\-−]?\d+):\s*(.*)$/);
        const lineBody = loyaltyMatch ? loyaltyMatch[2] : rawLine;
        const parts = lineBody.split(/(\{[^}]+\})/g).filter(Boolean);

        return (
          <p key={`oracle-line-${lineIndex}`} className="whitespace-normal">
            {loyaltyMatch && (
              <span className="mr-2 inline-flex align-[-0.35em]">
                <PlaneswalkerLoyaltyBadge value={loyaltyMatch[1]} className="h-8 w-auto" />
              </span>
            )}
            {parts.length === 0 ? <span>&nbsp;</span> : parts.map((part, partIndex) => {
              if (/^\{[^}]+\}$/.test(part)) {
                return (
                  <span key={`oracle-symbol-${lineIndex}-${partIndex}`} className="mx-[1px] inline-flex align-[-0.2em]">
                    {renderScryfallSymbol(part, `oracle-${lineIndex}-${partIndex}`, symbolClassName)}
                  </span>
                );
              }

              return <span key={`oracle-text-${lineIndex}-${partIndex}`}>{part}</span>;
            })}
          </p>
        );
      })}
    </div>
  );
}
