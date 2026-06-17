import React, { useMemo, useState } from 'react';
import { X, BrainCircuit, ShieldAlert, Sparkles, TrendingUp, Swords } from 'lucide-react';
import { ManaCost, MtgSymbolText } from '@/components/lib/MtgSymbolText';

const MATCHUP_TONES = {
  mill: { accent: 'bg-sky-400', text: 'text-sky-300', line: 'border-sky-500/25' },
  petitioners: { accent: 'bg-indigo-400', text: 'text-indigo-300', line: 'border-indigo-500/25' },
  control: { accent: 'bg-blue-400', text: 'text-blue-300', line: 'border-blue-500/25' },
  combo: { accent: 'bg-fuchsia-400', text: 'text-fuchsia-300', line: 'border-fuchsia-500/25' },
  artifacts: { accent: 'bg-slate-300', text: 'text-slate-200', line: 'border-slate-500/25' },
  tokens: { accent: 'bg-amber-400', text: 'text-amber-300', line: 'border-amber-500/25' },
  lands: { accent: 'bg-emerald-400', text: 'text-emerald-300', line: 'border-emerald-500/25' },
  reanimator: { accent: 'bg-violet-400', text: 'text-violet-300', line: 'border-violet-500/25' },
  aristocrats: { accent: 'bg-rose-400', text: 'text-rose-300', line: 'border-rose-500/25' },
  enchantress: { accent: 'bg-pink-400', text: 'text-pink-300', line: 'border-pink-500/25' },
  spellslinger: { accent: 'bg-cyan-400', text: 'text-cyan-300', line: 'border-cyan-500/25' },
  storm: { accent: 'bg-purple-400', text: 'text-purple-300', line: 'border-purple-500/25' },
  burn: { accent: 'bg-red-400', text: 'text-red-300', line: 'border-red-500/25' },
  counters: { accent: 'bg-lime-400', text: 'text-lime-300', line: 'border-lime-500/25' }
};

function meterColor(winRate) {
  if (winRate >= 60) return 'bg-emerald-500';
  if (winRate >= 48) return 'bg-amber-500';
  return 'bg-rose-500';
}

function SuggestionPreview({ card }) {
  if (!card) return null;

  return (
    <div className="grid gap-6 border-b border-slate-800 pb-4 lg:grid-cols-[240px_minmax(0,1fr)]">
      {card.image_url ? (
        <img src={card.image_url} alt={card.name} className="h-[336px] w-[240px] object-cover shadow-2xl" />
      ) : (
        <div className="flex h-[336px] w-[240px] items-center justify-center bg-slate-900 text-xs text-slate-500">Card</div>
      )}
      <div className="min-w-0 pt-2">
        <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Card details</div>
        <div className="mt-2 text-3xl font-black text-white">{card.name}</div>
        {card.mana_cost ? (
          <div className="mt-3">
            <ManaCost manaCost={card.mana_cost} />
          </div>
        ) : null}
        {card.type_line ? <div className="mt-3 text-sm text-slate-300">{card.type_line}</div> : null}
        <div className="mt-4 text-sm text-slate-400">{card.reason}</div>
        <div className="mt-4 text-base font-semibold text-amber-300">{card.recommendation_label || 'Strong fit'}</div>
        {typeof card.synergy === 'number' ? (
          <div className="mt-1 text-sm text-slate-400">Seen in similar decks: {Math.round(card.synergy * 100)}%</div>
        ) : null}
        {card.oracle_text ? (
          <div className="mt-6 max-w-4xl">
            <MtgSymbolText
              text={card.oracle_text}
              className="space-y-3 text-sm leading-7 text-slate-200"
              symbolClassName="h-4 w-4"
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}

function SuggestionRow({ card, active, onSelect }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex w-full items-center gap-3 border-b px-1 py-2 text-left transition ${
        active ? 'border-cyan-500/35 bg-slate-900/80' : 'border-slate-800 hover:bg-slate-900/45'
      }`}
    >
      {card.image_url ? (
        <img src={card.image_url} alt={card.name} className="h-16 w-12 object-cover" />
      ) : (
        <div className="flex h-16 w-12 items-center justify-center bg-slate-900 text-[10px] text-slate-500">Card</div>
      )}
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold text-white">{card.name}</div>
        <div className="mt-1 text-xs text-slate-400">{card.reason}</div>
      </div>
    </button>
  );
}

function MatchupRow({ matchup }) {
  const tone = MATCHUP_TONES[matchup.slug] || { accent: 'bg-slate-400', text: 'text-slate-200', line: 'border-slate-500/25' };

  return (
    <div className={`border-t ${tone.line} pl-4`}>
      <div className="grid grid-cols-[6px_minmax(0,1.1fr)_minmax(280px,0.9fr)_140px] gap-4 py-4">
        <div className={`mt-1 w-[6px] ${tone.accent}`} />

        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <h4 className={`text-lg font-bold ${tone.text}`}>{matchup.label}</h4>
            <span className="text-xs uppercase tracking-[0.2em] text-slate-500">{matchup.wins}W / {matchup.losses}L</span>
          </div>
          <p className="mt-1 text-sm text-slate-300">{matchup.headline}</p>
          <p className="mt-2 text-xs text-slate-500">{matchup.archetypeDescription}</p>
        </div>

        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-[0.18em] text-rose-300">Why you lose</div>
          <p className="mt-2 text-sm text-slate-200">{matchup.whyItLoses || 'This matchup looks playable if you sequence cleanly.'}</p>
          {matchup.focus ? (
            <>
              <div className="mt-4 text-[11px] uppercase tracking-[0.18em] text-amber-300">Best fix</div>
              <p className="mt-2 text-sm text-slate-300">{matchup.focus}</p>
            </>
          ) : null}
        </div>

        <div className="text-right">
          <div className={`text-3xl font-black ${matchup.winRate >= 60 ? 'text-emerald-300' : matchup.winRate >= 48 ? 'text-amber-300' : 'text-rose-300'}`}>
            {matchup.winRate}%
          </div>
          <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Projected</div>
          <div className="mt-3 h-2 overflow-hidden bg-slate-900">
            <div className={`h-full ${meterColor(matchup.winRate)}`} style={{ width: `${matchup.winRate}%` }} />
          </div>
          <div className="mt-2 text-xs uppercase tracking-[0.18em] text-slate-500">Avg {matchup.avgTurns} turns</div>
        </div>
      </div>
    </div>
  );
}

export default function AISimulationResults({ simulation, onClose }) {
  const matchups = Object.values(simulation?.results || {}).sort((a, b) => a.winRate - b.winRate || a.label.localeCompare(b.label));
  const stats = simulation?.deck_stats || {};
  const summary = simulation?.summary || {};
  const suggestedCards = simulation?.suggested_cards || [];
  const [selectedSuggestionId, setSelectedSuggestionId] = useState(suggestedCards[0]?.oracle_id || suggestedCards[0]?.name || null);
  const selectedSuggestion = useMemo(
    () => suggestedCards.find((card) => (card.oracle_id || card.name) === selectedSuggestionId) || suggestedCards[0] || null,
    [suggestedCards, selectedSuggestionId]
  );

  if (!simulation) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-4">
      <div className="flex max-h-[94vh] w-full max-w-[1560px] flex-col overflow-hidden border border-slate-700 bg-slate-950 shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-800 px-8 py-5">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-cyan-300">
              <BrainCircuit className="h-4 w-4" />
              Gauntlet Simulation
            </div>
            <h2 className="mt-1 text-2xl font-black text-white">{simulation.deck_name}</h2>
            <p className="mt-1 text-sm text-slate-400">
              {simulation.commander_name ? `${simulation.commander_name} | ` : ''}
              {simulation.corpus_decks_analyzed} validated decks across {matchups.length} matchup archetypes
            </p>
          </div>

          <div className="flex items-center gap-5">
            <div className="text-right">
              <div className={`text-4xl font-black ${simulation.overall_win_rate >= 60 ? 'text-emerald-300' : simulation.overall_win_rate >= 48 ? 'text-amber-300' : 'text-rose-300'}`}>
                {simulation.overall_win_rate}%
              </div>
              <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Overall projection</div>
            </div>
            <button onClick={onClose} className="border border-slate-700 bg-slate-900 p-3 text-slate-400 transition hover:text-white">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-8 py-5">
          <div className="grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
            <aside className="border-r border-slate-800 pr-6">
              <section className="border-b border-slate-800 pb-5">
                <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
                  <Swords className="h-4 w-4 text-cyan-300" />
                  Deck Snapshot
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-slate-900 px-4 py-3">
                    <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Cards</div>
                    <div className="mt-1 text-3xl font-black text-white">{stats.totalCards}</div>
                  </div>
                  <div className="bg-slate-900 px-4 py-3">
                    <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Unique</div>
                    <div className="mt-1 text-3xl font-black text-white">{stats.uniqueCards}</div>
                  </div>
                  <div className="bg-slate-900 px-4 py-3">
                    <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Lands</div>
                    <div className="mt-1 text-3xl font-black text-white">{stats.lands}</div>
                  </div>
                  <div className="bg-slate-900 px-4 py-3">
                    <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Avg CMC</div>
                    <div className="mt-1 text-3xl font-black text-white">{stats.avgCmc}</div>
                  </div>
                </div>
                {stats.themes?.length > 0 ? (
                  <div className="mt-5">
                    <div className="mb-2 text-[11px] uppercase tracking-[0.18em] text-slate-500">Detected themes</div>
                    <div className="flex flex-wrap gap-2">
                      {stats.themes.map((theme) => (
                        <span key={theme} className="border border-cyan-500/25 bg-cyan-500/8 px-3 py-1 text-xs font-medium text-cyan-200">
                          {theme.replace(/(^|\s|-)\w/g, (match) => match.toUpperCase())}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}
              </section>

              <section className="border-b border-slate-800 py-5">
                <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
                  <TrendingUp className="h-4 w-4 text-emerald-300" />
                  Readout
                </div>
                {stats.goldfish ? (
                  <div className="mb-4 grid gap-3 border-b border-slate-800 pb-4 sm:grid-cols-2">
                    <div>
                      <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Avg commander turn</div>
                      <div className="mt-1 text-lg font-semibold text-white">{stats.goldfish.avgCommanderTurn || 'N/A'}</div>
                    </div>
                    <div>
                      <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">First cheap interaction</div>
                      <div className="mt-1 text-lg font-semibold text-white">{stats.goldfish.avgInteractionTurn || 'N/A'}</div>
                    </div>
                    <div>
                      <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Keepable hands</div>
                      <div className="mt-1 text-lg font-semibold text-white">{stats.goldfish.keepRate}%</div>
                    </div>
                    <div>
                      <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Miss turn-3 land</div>
                      <div className="mt-1 text-lg font-semibold text-white">{stats.goldfish.missThirdLandRate}%</div>
                    </div>
                  </div>
                ) : null}
                {summary.strongest_matchups?.length > 0 ? (
                  <div className="mb-4">
                    <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Best projected matchups</div>
                    <div className="mt-1 text-lg font-semibold text-white">{summary.strongest_matchups.join(', ')}</div>
                  </div>
                ) : null}
                {summary.weakest_matchups?.length > 0 ? (
                  <div className="mb-4">
                    <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Most stressed matchups</div>
                    <div className="mt-1 text-lg font-semibold text-white">{summary.weakest_matchups.join(', ')}</div>
                  </div>
                ) : null}
                {summary.risks?.length > 0 ? (
                  <div>
                    <div className="mb-2 flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-rose-300">
                      <ShieldAlert className="h-3.5 w-3.5" />
                      Main weak spots
                    </div>
                    <ul className="list-disc space-y-2 pl-5 text-sm text-slate-200 marker:text-rose-300">
                      {summary.risks.map((item) => <li key={item}>{item}</li>)}
                    </ul>
                  </div>
                ) : null}
                {summary.diagnostics?.length > 0 ? (
                  <div className="mt-4 border-t border-slate-800 pt-4">
                    <div className="mb-2 text-[11px] uppercase tracking-[0.18em] text-slate-500">Goldfish notes</div>
                    <ul className="list-disc space-y-2 pl-5 text-sm text-slate-300 marker:text-cyan-300">
                      {summary.diagnostics.map((item) => <li key={item}>{item}</li>)}
                    </ul>
                  </div>
                ) : null}
              </section>

              <section className="py-5">
                <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
                  <Sparkles className="h-4 w-4 text-amber-300" />
                  Upgrade Priorities
                </div>
                {summary.priorities?.length > 0 ? (
                  <ul className="list-disc space-y-2 pl-5 text-sm text-slate-200 marker:text-amber-300">
                    {summary.priorities.map((item) => <li key={item}>{item}</li>)}
                  </ul>
                ) : (
                  <p className="text-sm text-slate-400">The gauntlet did not surface a strong structural weakness yet.</p>
                )}
              </section>
            </aside>

            <section className="min-w-0">
              <div className="mb-3 text-sm font-semibold text-white">Your deck vs</div>
              <div className="border-b border-slate-800">
                {matchups.map((matchup) => (
                  <MatchupRow key={matchup.slug} matchup={matchup} />
                ))}
              </div>
            </section>

            {suggestedCards.length > 0 ? (
              <section className="xl:col-span-2">
                <div className="mt-2 border-t border-slate-800 pt-8">
                  <div className="mb-3 text-sm font-semibold text-white">Commander-backed card suggestions</div>
                  <SuggestionPreview card={selectedSuggestion} />
                  <div className="grid gap-2 xl:grid-cols-2">
                    {suggestedCards.map((card) => {
                      const key = card.oracle_id || card.name;
                      return (
                        <SuggestionRow
                          key={key}
                          card={card}
                          active={key === selectedSuggestionId}
                          onSelect={() => setSelectedSuggestionId(key)}
                        />
                      );
                    })}
                  </div>
                </div>
              </section>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
