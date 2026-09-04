import { useEffect, useRef, useState } from 'react';
import CardImage from '@/components/cards/CardImage';
import { cn } from '@/lib/utils';

const DISPLAY_LABELS = Object.freeze({
  mint: 'Mint',
  near_mint: 'Near Mint',
  lightly_played: 'Lightly Played',
  light_played: 'Lightly Played',
  moderately_played: 'Moderately Played',
  heavily_played: 'Heavily Played',
  damaged: 'Damaged',
  excellent: 'Excellent',
  good: 'Good',
  played: 'Played',
  poor: 'Poor',
  nonfoil: 'Non-Foil',
  foil: 'Foil',
  etched: 'Etched Foil',
  en: 'English',
  eng: 'English',
  english: 'English',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  it: 'Italian',
  pt: 'Portuguese',
  ja: 'Japanese',
  ko: 'Korean',
  ru: 'Russian',
  zhs: 'Simplified Chinese',
  zht: 'Traditional Chinese'
});

export function formatCardMetadataLabel(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const normalized = raw.toLowerCase();
  if (DISPLAY_LABELS[normalized]) return DISPLAY_LABELS[normalized];
  return raw
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .split(' ')
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(' ');
}

export function cardTileSurfaceClassName({ tone = 'dark', interactive = true } = {}) {
  return cn(
    'overflow-hidden rounded-[2px] border shadow-none transition-colors',
    tone === 'dark'
      ? 'border-transparent bg-[#0c141e]'
      : 'border-transparent bg-white/75',
    interactive && tone === 'dark' && 'hover:border-slate-700/60 hover:bg-[#101a26]',
    interactive && tone !== 'dark' && 'hover:border-slate-300/70 hover:bg-white'
  );
}

export function CardTileSurface({ as: Component = 'div', tone = 'dark', interactive = true, className, children, ...props }) {
  return (
    <Component className={cn(cardTileSurfaceClassName({ tone, interactive }), className)} {...props}>
      {children}
    </Component>
  );
}

export function useCardHoverPreview({ openDelay = 180, closeDelay = 120 } = {}) {
  const [card, setCard] = useState(null);
  const timerRef = useRef(null);

  const clearTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  useEffect(() => () => clearTimer(), []);

  const showPreview = (nextCard) => {
    clearTimer();
    timerRef.current = setTimeout(() => {
      setCard(nextCard || null);
      timerRef.current = null;
    }, openDelay);
  };

  const hidePreview = () => {
    clearTimer();
    timerRef.current = setTimeout(() => {
      setCard(null);
      timerRef.current = null;
    }, closeDelay);
  };

  return { card, showPreview, hidePreview, clearPreview: () => { clearTimer(); setCard(null); } };
}

export function CardHoverPreview({ card, name, setName, price, showMetadata = true, position = null }) {
  if (!card) return null;

  const displayName = name || card.name || card.card_name || card.product_name || 'Card preview';
  const displaySet = setName ?? card.set_name ?? '';
  const numericPrice = Number(price);
  const hasPrice = Number.isFinite(numericPrice) && numericPrice > 0;
  const positioned = position && Number.isFinite(position.x) && Number.isFinite(position.y);

  const preview = (
    <div className="pointer-events-none w-64 max-w-[calc(100vw-2rem)] rounded-[2px] border border-slate-600/35 bg-[#0d1621] p-2 shadow-[0_18px_45px_rgba(0,0,0,0.38)]">
      <CardImage
        card={card}
        alt={displayName}
        className="aspect-[63/88] max-h-[calc(100vh-10rem)] w-full rounded-[2px] object-contain"
        fallbackClassName="flex aspect-[63/88] max-h-[calc(100vh-10rem)] w-full items-center justify-center bg-[#09111b] px-3 text-center text-sm text-slate-500"
        loading="eager"
      />
      {showMetadata && (
        <div className="px-1 pb-0.5 pt-2">
          <h3 className="truncate text-sm font-semibold text-slate-100">{displayName}</h3>
          {displaySet && <p className="mt-0.5 truncate text-[11px] text-slate-400">{displaySet}</p>}
          {hasPrice && <p className="mt-1 text-base font-bold text-slate-100">${numericPrice.toFixed(2)}</p>}
        </div>
      )}
    </div>
  );

  if (positioned) {
    return (
      <div className="pointer-events-none fixed z-[200]" style={{ left: position.x, top: position.y }}>
        {preview}
      </div>
    );
  }

  return <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center p-4">{preview}</div>;
}
