import { getCatalogAssetUrl } from '@/config/publicAssetUrls';
import { getMtgSymbolFileName } from '@/config/mtgSymbolFileName';

const CONFIG = {
  White: { sym: 'W', label: 'White' },
  Blue: { sym: 'U', label: 'Blue' },
  Black: { sym: 'B', label: 'Black' },
  Red: { sym: 'R', label: 'Red' },
  Green: { sym: 'G', label: 'Green' },
  W: { sym: 'W', label: 'White' },
  U: { sym: 'U', label: 'Blue' },
  B: { sym: 'B', label: 'Black' },
  R: { sym: 'R', label: 'Red' },
  G: { sym: 'G', label: 'Green' }
};

function SymbolImage({ symbol, label, className }) {
  const fileName = getMtgSymbolFileName(symbol);

  return (
    <img
      src={getCatalogAssetUrl('mtg', `symbols/card/${fileName}`)}
      alt={label}
      title={label}
      className={className}
      loading="lazy"
    />
  );
}

export default function ColorIdentity({ colors = [], showLabel = false }) {
  if (!colors || colors.length === 0) {
    return (
      <span className="inline-flex items-center gap-2">
        <SymbolImage symbol="C" label="Colorless" className="h-5 w-5" />
        {showLabel && <span className="text-xs font-semibold text-slate-300">Colorless</span>}
      </span>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-1">
      {colors.map((color) => {
        const cfg = CONFIG[color];
        if (!cfg) return null;

        return showLabel ? (
          <span
            key={color}
            className="inline-flex items-center gap-1.5 rounded-full bg-white/5 px-2 py-1 text-xs font-semibold text-slate-100"
          >
            <SymbolImage symbol={cfg.sym} label={cfg.label} className="h-4 w-4" />
            <span>{cfg.label}</span>
          </span>
        ) : (
          <SymbolImage key={color} symbol={cfg.sym} label={cfg.label} className="h-5 w-5" />
        );
      })}
    </div>
  );
}
