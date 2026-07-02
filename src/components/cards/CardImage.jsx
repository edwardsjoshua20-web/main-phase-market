import { useEffect, useMemo, useState } from 'react';
import { getCardImageCandidates } from '@/lib/cardImages';

export default function CardImage({
  card,
  alt,
  className = '',
  fallbackClassName = '',
  loading = 'lazy',
  draggable = undefined,
  renderFallback = null,
  onMouseEnter,
  onMouseLeave,
  onClick,
  onLoad,
  onExhausted
}) {
  const candidates = useMemo(() => getCardImageCandidates(card), [card]);
  const candidateKey = useMemo(() => candidates.join('||'), [candidates]);
  const [candidateIndex, setCandidateIndex] = useState(0);
  const [exhausted, setExhausted] = useState(false);

  useEffect(() => {
    setCandidateIndex(0);
    setExhausted(false);
  }, [candidateKey]);

  const src = exhausted ? null : candidates[candidateIndex] || null;

  const handleError = (event) => {
    const nextIndex = candidateIndex + 1;
    const nextSrc = candidates[nextIndex];

    if (nextSrc) {
      setCandidateIndex(nextIndex);
      return;
    }

    setExhausted(true);
    onExhausted?.(event.currentTarget);
  };

  if (!src) {
    return typeof renderFallback === 'function'
      ? renderFallback()
      : <div className={fallbackClassName}>No image</div>;
  }

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      loading={loading}
      draggable={draggable}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onClick={onClick}
      onLoad={onLoad}
      onError={handleError}
    />
  );
}
