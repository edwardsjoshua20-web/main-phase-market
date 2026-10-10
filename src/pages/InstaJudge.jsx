import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ChevronDown,
  CircleAlert,
  Flag,
  LoaderCircle,
  RotateCcw,
  Send,
  ShieldCheck
} from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { assertInstaJudgeInteractionInvariant, instaJudgeOwner } from '@/services/instajudge/instajudgeOwner';
import { shouldRepairCollectorInput } from '@/services/instajudge/messageRouter';
import {
  buildRulingReportDraft,
  captureRulingContext,
  isReportableRulingMessage,
  isRulingReportIntent
} from '@/services/instajudge/rulingReportCore';
import { rulingReportService } from '@/services/instajudge/rulingReportService';
import { searchOwner } from '@/services/search/searchOwner';

const assistantIntro = "Hi, I’m MPM InstaJudge. What TCG do you need help with?";

const JUDGE_POOL = Object.freeze([
  { id: 'josh', displayName: 'Judge Josh', initials: 'JJ', avatarSrc: '/images/instajudge/avatars/judge-josh.png' },
  { id: 'alora', displayName: 'Judge Alora', initials: 'JA', avatarSrc: '/images/instajudge/avatars/judge-alora.png' },
  { id: 'rowan', displayName: 'Judge Rowan', initials: 'JR', avatarSrc: '/images/instajudge/avatars/judge-rowan.png' },
  { id: 'leo', displayName: 'Judge Leo', initials: 'JL', avatarSrc: '/images/instajudge/avatars/judge-leo.png' },
  { id: 'sera', displayName: 'Judge Sera', initials: 'JS', avatarSrc: '/images/instajudge/avatars/judge-sera.png' },
  { id: 'vale', displayName: 'Judge Vale', initials: 'JV', avatarSrc: '/images/instajudge/avatars/judge-vale.png' },
  { id: 'nyx', displayName: 'Judge Nyx', initials: 'JN', avatarSrc: '/images/instajudge/avatars/judge-nyx.png' },
  { id: 'orion', displayName: 'Judge Orion', initials: 'JO', avatarSrc: '/images/instajudge/avatars/judge-orion.png' },
  { id: 'chen', displayName: 'Judge Chen', initials: 'JC', avatarSrc: '/images/instajudge/avatars/judge-chen.png' },
  { id: 'mara', displayName: 'Judge Mara', initials: 'JM', avatarSrc: '/images/instajudge/avatars/judge-mara.png' }
]);

const GAME_IDENTITY = Object.freeze({
  magic: { src: 'https://commons.wikimedia.org/wiki/Special:Redirect/file/Magic_the_Gathering_2017.svg', imageClass: 'brightness-0 invert' },
  pokemon: { src: 'https://commons.wikimedia.org/wiki/Special:Redirect/file/Pok%C3%A9mon_Trading_Card_Game_logo.svg' },
  yugioh: { src: 'https://commons.wikimedia.org/wiki/Special:Redirect/file/Yu-Gi-Oh!.png' },
  lorcana: { src: '/images/disney-lorcana-logo.png' },
  flesh_and_blood: { src: '/images/fab-logo.png' },
  onepiece: { src: '/images/oplogo.webp', imageClass: 'brightness-0 invert' },
  starwars: { src: '/images/star-wars-unlimited-logo.png', imageClass: 'brightness-0 invert' }
});

const WAITING_STATE_FIELDS = Object.freeze([
  'Game',
  'Turn',
  'Phase',
  'Priority',
  'Stack',
  'Combat',
  'Targets'
]);

const DEMO_MESSAGES = Object.freeze([
  { role: 'user', text: 'I attack with Colossal Dreadmaw and they block with Grizzly Bears.' },
  { role: 'assistant', text: 'Who has priority after blockers?' },
  { role: 'user', text: 'Me', compact: true },
  { role: 'assistant', text: 'YES - you can cast Murder before combat damage.', ruling: true }
]);

const DEMO_STATE = Object.freeze({
  Game: 'Magic',
  Turn: 'You',
  Phase: 'Combat',
  Priority: 'You',
  Stack: 'Empty',
  Combat: 'Dreadmaw blocked by Grizzly Bears',
  Targets: 'Colossal Dreadmaw'
});

const CARD_REPAIR_KEYS = new Set(['combat-attackers', 'combat-blockers', 'stack-items']);

function repairNameCandidate(value = '') {
  return String(value)
    .replace(/^(?:my|your|their|opponent'?s?)\s+/i, '')
    .replace(/^(?:(?:attacking|blocking)\s+)?(?:attacker|blocker|creature|spell|ability)\s*[,;:-]?\s*/i, '')
    .trim();
}

function normalizedRepairText(value = '') {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function editDistance(left = '', right = '') {
  const a = normalizedRepairText(left);
  const b = normalizedRepairText(right);
  const row = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let diagonal = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const previous = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
      diagonal = previous;
    }
  }
  return row[b.length];
}

function nonCardRepairCopy(pendingKey, attempt) {
  const copy = {
    turn: ['I didn’t catch whose turn it is. Is it yours or your opponent’s?', 'I still need the active player. Whose turn is it?'],
    phase: ['I couldn’t match that to a game phase. Which phase are you in?', 'That still isn’t a phase I can use. Try the phase name again.'],
    step: ['I couldn’t place that combat step. Which part of combat are you in?', 'I still need the exact combat step. Choose the closest option below.'],
    priority: ['I didn’t catch who has priority. Is it you or your opponent?', 'I still need the priority holder. Who has priority right now?'],
    stack: ['I couldn’t tell whether the stack is empty. Is anything currently on it?', 'I still need the stack status. Is it empty or not empty?']
  };
  return copy[pendingKey]?.[Math.min(attempt, 1)] || (attempt > 0
    ? 'That still doesn’t resolve the missing detail. Try the answer again with the exact value.'
    : 'I couldn’t use that answer for the current ruling. Try the exact value again.');
}

const VERDICT_STYLES = Object.freeze({
  yes: 'border-emerald-400/45 bg-emerald-400/10 text-emerald-100',
  no: 'border-rose-400/45 bg-rose-400/10 text-rose-100',
  depends: 'border-amber-300/45 bg-amber-300/10 text-amber-100',
  unverified: 'border-slate-500 bg-slate-800/80 text-slate-100'
});

function inputPlaceholder(session, selectedGame, assignedJudge) {
  if (!selectedGame) return 'Describe the play, card names, turn, priority, combat, or stack...';
  const judgeName = assignedJudge?.displayName || 'your judge';
  if (session.stage === 'intent') return `Tell ${judgeName} what happened...`;
  if (session.stage === 'collecting') return `Answer ${judgeName}...`;
  if (session.stage === 'verifying') return `Confirm the state with ${judgeName}...`;
  if (session.stage === 'editing') return `Tell ${judgeName} what changed...`;
  if (session.stage === 'clarifying') return `Answer ${judgeName}...`;
  return 'Add to this ruling...';
}

function verdictClass(verdict) {
  return VERDICT_STYLES[verdict] || VERDICT_STYLES.unverified;
}

function judgeOpeningText(gameId) {
  return gameId === 'magic'
    ? 'Hey — I’ve got this ruling. What do you need help with?'
    : 'Hey — I’ve got this ruling. Tell me what happened.';
}

function JudgeAvatar({ judge, size = 'md' }) {
  if (!judge) return null;
  const sizeClass = size === 'sm'
    ? 'h-7 w-7 text-[0.58rem]'
    : size === 'chat'
      ? 'h-10 w-10 text-[0.7rem]'
      : 'h-9 w-9 text-[0.68rem]';
  return (
    <span
      className={`grid shrink-0 place-items-center overflow-hidden rounded-full border border-cyan-200/30 bg-[linear-gradient(145deg,#12273d,#09111d)] font-black tracking-[0.08em] text-cyan-100 shadow-[0_0_20px_rgba(56,189,248,0.08)] ${sizeClass}`}
      aria-hidden="true"
    >
      <img src={judge.avatarSrc} alt="" className="h-full w-full rounded-full object-cover" />
    </span>
  );
}

function JudgeIdentity({ judge, compact = false }) {
  if (!judge) return null;
  return (
    <div className="flex items-center gap-2.5">
      <JudgeAvatar judge={judge} size={compact ? 'sm' : 'md'} />
      <div className="min-w-0">
        <p className={`${compact ? 'text-xs' : 'text-sm'} truncate font-semibold text-slate-100`}>{judge.displayName}</p>
      </div>
    </div>
  );
}

function cleanAnswer(message) {
  const answer = String(message.result?.summary || message.text || '').trim();
  if (message.result?.summary) return answer;
  const verdict = String(message.verdict || '').toUpperCase();
  const lines = answer.split(/\r?\n/);
  if (verdict && lines[0]?.trim().toUpperCase() === verdict) lines.shift();
  return lines.join('\n').trim();
}

function rulingParts(message) {
  const answer = cleanAnswer(message);
  const sentenceEnd = answer.match(/^(.+?[.?])(?:\s+|\n+)([\s\S]+)$/);
  if (!sentenceEnd) return { summary: answer, why: '' };
  return { summary: sentenceEnd[1].trim(), why: sentenceEnd[2].trim() };
}

function StateSummary({ summary }) {
  if (!summary) return null;
  return (
    <dl className="grid gap-x-6 gap-y-2 text-xs sm:grid-cols-2">
      {Object.entries(summary).map(([label, value]) => (
        <div key={label} className={['combat', 'attacker', 'blockers'].includes(label) ? 'sm:col-span-2' : ''}>
          <dt className="text-[0.64rem] font-bold uppercase tracking-[0.14em] text-slate-500">{label}</dt>
          <dd className="mt-0.5 break-words text-slate-200">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function ActiveStateContent({ selectedGame, summary }) {
  const coreRows = [
    ['Game', selectedGame?.label || 'Unknown'],
    ['Turn', summary?.turn || 'Unknown'],
    ['Phase', summary?.phase || 'Unknown'],
    ...(summary?.step ? [['Step', summary.step]] : []),
    ['Priority', summary?.priority || 'Unknown'],
    ['Stack', summary?.stack || 'Unknown']
  ];
  const combatRows = [
    ...(summary?.combat ? [['Status', summary.combat]] : []),
    ...(summary?.window ? [['Window', summary.window]] : []),
    ...(summary?.attacker ? [['Attackers', summary.attacker]] : []),
    ...(summary?.blockers ? [['Blockers', summary.blockers]] : [])
  ];

  return (
    <div className="space-y-5">
      <dl className="divide-y divide-slate-800/80 border-t border-slate-800/80">
        {coreRows.map(([label, value]) => (
          <div key={label} className="grid min-h-9 grid-cols-[5.25rem_1fr] items-start gap-3 py-2 text-xs">
            <dt className="text-slate-500">{label}</dt>
            <dd className={`min-w-0 whitespace-pre-line break-words text-right leading-5 ${value === 'Unknown' || value === 'Not supplied' ? 'text-slate-600' : 'text-slate-200'}`}>{value}</dd>
          </div>
        ))}
      </dl>

      {combatRows.length > 0 ? (
        <section>
          <h3 className="text-[0.64rem] font-bold uppercase tracking-[0.16em] text-slate-500">Combat</h3>
          <dl className="mt-2 divide-y divide-slate-800/80 border-t border-slate-800/80">
            {combatRows.map(([label, value]) => (
              <div key={label} className="grid grid-cols-[5.25rem_1fr] items-start gap-3 py-2 text-xs">
                <dt className="text-slate-500">{label}</dt>
                <dd className="min-w-0 break-words text-right leading-5 text-slate-200">{value}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}
    </div>
  );
}

function ActiveStateReview({ selectedGame, summary, assignedJudge, className = '' }) {
  return (
    <details className={`group border-y border-slate-800/80 bg-slate-950/20 ${className}`}>
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 py-2 text-xs font-bold uppercase tracking-[0.12em] text-slate-300 marker:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-cyan-300">
        Review state
        <ChevronDown className="h-4 w-4 text-slate-500 transition-transform group-open:rotate-180" aria-hidden="true" />
      </summary>
      <div className="border-t border-slate-800 py-4">
        <div className="mb-4"><JudgeIdentity judge={assignedJudge} compact /></div>
        <ActiveStateContent selectedGame={selectedGame} summary={summary} />
      </div>
    </details>
  );
}

function ActiveStateRail({ selectedGame, summary, assignedJudge }) {
  return (
    <aside className="sticky top-24 pl-7" aria-label="Detected game state">
      <div className="border-b border-slate-800/80 pb-4">
        <p className="mb-2 text-[0.62rem] font-bold uppercase tracking-[0.14em] text-slate-500">Current judge</p>
        <JudgeIdentity judge={assignedJudge} compact />
      </div>
      <div className="flex items-center justify-between gap-4">
        <h2 className="mt-4 text-xs font-bold uppercase tracking-[0.14em] text-slate-300">Detected state</h2>
        <span className="text-[0.62rem] uppercase tracking-[0.12em] text-cyan-200/55">Live case</span>
      </div>
      <p className="mt-2 text-xs leading-5 text-slate-500">What {assignedJudge?.displayName || 'your judge'} currently understands.</p>
      <div className="mt-4">
        <ActiveStateContent selectedGame={selectedGame} summary={summary} />
      </div>
    </aside>
  );
}

function StateReview({ summary, defaultOpen = false, className = '' }) {
  if (!summary) return null;
  return (
    <details className={`group border-y border-slate-800/80 bg-slate-950/20 ${className}`} open={defaultOpen || undefined}>
      <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-xs font-bold text-slate-300 marker:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-cyan-300">
        <span className="inline-flex items-center gap-2">
          <ShieldCheck className="h-3.5 w-3.5 text-cyan-200" aria-hidden="true" />
          Review state
        </span>
        <ChevronDown className="h-3.5 w-3.5 text-slate-500 transition-transform group-open:rotate-180" aria-hidden="true" />
      </summary>
      <div className="border-t border-slate-800/80 py-3">
        <StateSummary summary={summary} />
      </div>
    </details>
  );
}

function ReferenceList({ label, children }) {
  return (
    <div className="grid gap-2 border-t border-slate-800/80 pt-3 sm:grid-cols-[4rem_1fr] sm:items-start">
      <p className="text-[0.64rem] font-bold uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <div className="flex min-w-0 flex-wrap gap-x-3 gap-y-1.5 text-xs">{children}</div>
    </div>
  );
}

function RulingMessage({ message, assignedJudge, onReport }) {
  const { summary, why } = rulingParts(message);
  const outcomeItems = (message.result?.sequence || [])
    .filter((item) => typeof item === 'string' && /\s/.test(item))
    .slice(0, 4);
  const trace = message.result?.diagnosticTrace || [];
  const traceItems = trace
    .map((item) => typeof item === 'string' ? item : item?.result || item?.type)
    .filter(Boolean);
  const visibleRules = message.result?.rules?.slice(0, 4) || [];
  const verdict = String(message.verdict || 'unverified').toLowerCase();

  return (
    <div className="w-full max-w-[52rem]">
      <div className="mb-2"><JudgeIdentity judge={assignedJudge} compact /></div>
      <article className="border-l-2 border-cyan-200/55 bg-[#09111d] px-4 py-5 sm:px-6">
      <div className="flex flex-wrap items-center gap-3">
        <span className={`inline-flex min-h-8 items-center border-y px-1 text-sm font-black uppercase tracking-[0.18em] ${verdictClass(message.verdict)}`}>
          {message.verdict}
        </span>
        <span className="text-[0.68rem] font-bold uppercase tracking-[0.16em] text-slate-400">Judge ruling</span>
      </div>

      {summary ? <p className="mt-3 text-base font-semibold leading-7 text-white sm:text-lg">{summary}</p> : null}
      {why ? (
        <div className="mt-4 border-t border-slate-800/80 pt-3">
          <p className="text-[0.64rem] font-bold uppercase tracking-[0.14em] text-slate-500">Why</p>
          <p className="mt-1.5 text-sm leading-6 text-slate-300">{why}</p>
        </div>
      ) : null}

      {outcomeItems.length > 0 ? (
        <div className="mt-4 border-t border-slate-800/80 pt-3">
          <p className="text-[0.64rem] font-bold uppercase tracking-[0.14em] text-slate-500">What happens</p>
          <ol className="mt-2 space-y-1.5 text-sm leading-6 text-slate-300">
            {outcomeItems.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}
          </ol>
        </div>
      ) : null}

      {message.result?.clarificationNeeded ? (
        <div className="mt-3 border-l border-amber-300/45 pl-3 text-sm leading-6 text-amber-50/90">
          <p className="text-[0.64rem] font-bold uppercase tracking-[0.14em] text-amber-200/65">
            {verdict === 'unverified' ? 'What I still need to verify' : 'What I need'}
          </p>
          <p className="mt-1">{message.result.clarificationNeeded}</p>
        </div>
      ) : null}

      {message.result?.cards?.length > 0 ? (
        <ReferenceList label="Cards">
          {message.result.cards.map((card, index) => (
            <React.Fragment key={`${card.game}-${card.id}-${card.name}`}>
              {index > 0 ? <span className="text-slate-700" aria-hidden="true">/</span> : null}
              <span className="font-semibold text-slate-200">{card.name}</span>
            </React.Fragment>
          ))}
        </ReferenceList>
      ) : null}

      {visibleRules.length > 0 ? (
        <ReferenceList label="Rules">
          {visibleRules.map((rule, index) => (
            <React.Fragment key={rule.slug}>
              {index > 0 ? <span className="text-slate-700" aria-hidden="true">/</span> : null}
              {rule.path ? (
                <a href={rule.path} className="font-semibold text-cyan-100 underline decoration-slate-700 underline-offset-4 hover:decoration-cyan-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300">
                  {rule.title}
                </a>
              ) : (
                <span className="font-semibold text-slate-300">{rule.title}</span>
              )}
            </React.Fragment>
          ))}
        </ReferenceList>
      ) : null}

      {traceItems.length > 0 ? (
        <details className="group mt-3 border-t border-slate-800/80 pt-3">
          <summary className="inline-flex cursor-pointer list-none items-center gap-2 text-xs font-semibold text-slate-500 marker:hidden hover:text-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300">
            Ruling details
            <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" aria-hidden="true" />
          </summary>
          <ol className="mt-2 space-y-1 border-l border-slate-800 pl-3 text-xs leading-5 text-slate-400">
            {traceItems.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}
          </ol>
        </details>
      ) : null}
      </article>
      {onReport && isReportableRulingMessage(message) ? (
        <button
          type="button"
          onClick={() => onReport(message)}
          className="mt-2 inline-flex min-h-8 items-center gap-1.5 text-xs font-semibold text-slate-500 transition hover:text-rose-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
        >
          <Flag className="h-3.5 w-3.5" aria-hidden="true" />
          Wrong Answer? Report Error
        </button>
      ) : null}
    </div>
  );
}

function AssistantMessage({ message, onChoice, assignedJudge }) {
  const isVerification = message.result?.kind === 'state-verification';
  const isError = message.result?.kind === 'ui-error';
  const displayText = isVerification
    ? 'I have the current game state. Confirm it before I rule.'
    : message.text;

  return (
    <div className="grid w-full max-w-[48rem] grid-cols-[2.5rem_minmax(0,1fr)] items-start gap-3 sm:grid-cols-[2.75rem_minmax(0,1fr)] sm:gap-3.5">
      <div>
        {isError ? (
          <span className="grid h-10 w-10 place-items-center rounded-full border border-rose-400/30 bg-rose-400/10">
            <CircleAlert className="h-3.5 w-3.5 text-rose-300" aria-hidden="true" />
          </span>
        ) : (
          <JudgeAvatar judge={assignedJudge} size="chat" />
        )}
      </div>
      <div className={`min-w-0 ${isError ? 'border-l border-rose-400/55 pl-3' : ''}`}>
        <div className="mb-2 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <p className="text-sm font-semibold text-slate-100">{isError ? 'InstaJudge' : assignedJudge?.displayName || 'InstaJudge'}</p>
        </div>
        <div className={`inline-block max-w-[42rem] rounded-md px-3.5 py-2.5 text-left shadow-[0_8px_20px_rgba(0,0,0,0.16),inset_0_1px_rgba(255,255,255,0.025)] ${isError ? 'bg-rose-400/[0.08]' : 'bg-[#0c1726]'}`}>
          <p className={`whitespace-pre-line text-[0.94rem] leading-6 ${isError ? 'text-rose-100' : 'text-slate-100'}`}>{displayText}</p>
        </div>

        {message.result?.stateKey === 'priority' ? (
          <details className="group mt-2 max-w-[32rem]">
            <summary className="cursor-pointer list-none text-xs font-semibold text-cyan-200/65 marker:hidden hover:text-cyan-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300">
              How do I know?
            </summary>
            <p className="mt-2 border-l border-cyan-300/25 pl-3 text-xs leading-5 text-slate-400">
              The active player normally gets priority first in a new priority window. After a player casts a spell or activates an ability, that player gets priority again. Priority passes when that player passes. If you are unsure, describe what just happened and I can help reconstruct it.
            </p>
          </details>
        ) : null}

        {isVerification ? <StateReview summary={message.result?.stateSummary} defaultOpen className="mt-4 max-w-[42rem]" /> : null}

        {message.result?.choices?.length > 0 && onChoice ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {message.result.choices.map((choice) => (
              <button
                key={choice}
                type="button"
                onClick={() => onChoice(choice)}
                className="min-h-9 rounded-sm border border-slate-700 bg-slate-900/45 px-3 py-1.5 text-xs font-semibold text-slate-100 transition hover:border-cyan-300/65 hover:bg-cyan-300/[0.07] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
              >
                {choice}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ChatMessage({ message, onChoice, onCorrect, onReport, assignedJudge }) {
  if (message.verdict === 'depends' && message.result?.clarificationNeeded) {
    return (
      <AssistantMessage
        message={{
          ...message,
          verdict: null,
          text: message.result.clarificationNeeded,
          result: { ...message.result, choices: message.result.choices || [] }
        }}
        onChoice={onChoice}
        assignedJudge={assignedJudge}
      />
    );
  }
  if (message.verdict) return <RulingMessage message={message} assignedJudge={assignedJudge} onReport={onReport} />;
  if (message.role === 'user') {
    return (
      <div className="flex justify-end pr-0 sm:pr-2">
        <div className="max-w-[min(36rem,86%)] text-right">
          <p className="mb-1 text-[0.58rem] font-bold uppercase tracking-[0.15em] text-cyan-200/45">You</p>
          <div className="rounded-md bg-[#102b43] px-3.5 py-2.5 text-left text-[0.94rem] leading-6 text-cyan-50 shadow-[0_8px_20px_rgba(0,0,0,0.16),inset_0_1px_rgba(255,255,255,0.025)] sm:px-4">
            <p className="whitespace-pre-line break-words">{message.text}</p>
          </div>
          {onCorrect ? (
            <button
              type="button"
              onClick={() => onCorrect(message.id)}
              className="mt-1 text-[0.68rem] font-semibold text-slate-500 transition hover:text-cyan-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
            >
              Undo
            </button>
          ) : null}
        </div>
      </div>
    );
  }
  return <AssistantMessage message={message} onChoice={onChoice} assignedJudge={assignedJudge} />;
}

function JudgeComposer({
  draft,
  inputRef,
  isThinking,
  onChange,
  onKeyDown,
  onSubmit,
  selectedGame,
  session,
  assignedJudge,
  opening = false
}) {
  return (
    <form
      onSubmit={onSubmit}
      className={`bg-[#09111d]/90 p-2 transition focus-within:border-sky-300/75 ${opening
        ? 'rounded-md border border-sky-400/75 bg-slate-950/80 shadow-[0_18px_55px_rgba(0,0,0,0.32),inset_0_0_32px_rgba(14,165,233,0.035)] backdrop-blur-sm'
        : 'rounded-md border border-slate-700/90 shadow-[0_14px_36px_rgba(0,0,0,0.18)]'}`}
    >
      <label htmlFor="instajudge-composer" className="sr-only">Message {assignedJudge?.displayName || 'InstaJudge'}</label>
      <textarea
        id="instajudge-composer"
        ref={inputRef}
        value={draft}
        rows={opening ? 3 : 2}
        onChange={onChange}
        onKeyDown={onKeyDown}
        disabled={isThinking}
        data-input-mode={session.stage}
        placeholder={inputPlaceholder(session, selectedGame, assignedJudge)}
        className={`w-full resize-y bg-transparent px-2 py-2 text-sm leading-6 text-slate-100 outline-none placeholder:text-slate-500 disabled:cursor-not-allowed disabled:opacity-60 ${opening ? 'min-h-20' : 'min-h-12'}`}
      />
      <div className="flex items-center justify-between gap-3 border-t border-slate-800/70 px-2 pt-2">
        <p className="text-[0.68rem] text-slate-500">
          {selectedGame ? 'Shift + Enter for a new line · Enter to send' : 'Choose a game, then send your question'}
        </p>
        <Button
          type="submit"
          disabled={!selectedGame || !draft.trim() || isThinking}
          className={`${opening ? 'h-10 px-5' : 'h-9 px-3'} shrink-0 rounded-sm bg-sky-500 text-white shadow-[0_8px_22px_rgba(14,165,233,0.2)] hover:bg-sky-400 disabled:shadow-none disabled:opacity-40`}
        >
          <Send className="mr-2 h-4 w-4" aria-hidden="true" />
          Send
          <span className="sr-only"> ruling request</span>
        </Button>
      </div>
    </form>
  );
}

function GameIdentityIcon({ gameId }) {
  const identity = GAME_IDENTITY[gameId];
  if (!identity) return null;
  return (
    <span className="grid h-7 w-9 shrink-0 place-items-center" aria-hidden="true">
      <img
        src={identity.src}
        alt=""
        className={`max-h-7 max-w-9 object-contain ${identity.imageClass || ''}`}
        onError={(event) => { event.currentTarget.style.display = 'none'; }}
      />
    </span>
  );
}

function GameSelector({ games, onSelect }) {
  return (
    <section aria-labelledby="instajudge-game-selector">
      <h2 id="instajudge-game-selector" className="text-lg font-semibold text-white sm:text-xl">Select a game</h2>
      <div className="mt-3 grid sm:grid-cols-2 sm:gap-x-8" role="group" aria-label="Choose a trading card game">
        {games.map((game) => (
          <button
            key={game.id}
            type="button"
            onClick={() => onSelect(game.id)}
            className="group flex min-h-14 items-center gap-3 border-b border-slate-700/75 px-1 py-2 text-left text-sm font-semibold text-slate-100 transition hover:border-sky-300 hover:bg-sky-300/[0.05] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-300"
          >
            <GameIdentityIcon gameId={game.id} />
            <span className="min-w-0 flex-1 leading-5">{game.label}</span>
            <span className="text-base text-slate-600 transition group-hover:translate-x-0.5 group-hover:text-sky-300" aria-hidden="true">→</span>
          </button>
        ))}
      </div>
    </section>
  );
}

function OpeningBrand() {
  return (
    <div>
      <img
        src="/images/instajudge/instajudge-stacked.png"
        alt="InstaJudge"
        className="h-auto max-h-28 w-auto max-w-[17rem] object-contain sm:hidden"
      />
      <img
        src="/images/instajudge/instajudge-horizontal.png"
        alt="InstaJudge"
        className="hidden h-auto max-h-28 w-auto max-w-[31rem] object-contain sm:block"
      />
    </div>
  );
}

function ProductDemo({ onStepChange }) {
  const [visibleCount, setVisibleCount] = useState(1);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setVisibleCount((current) => current >= DEMO_MESSAGES.length ? 1 : current + 1);
    }, 1900);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    onStepChange?.(visibleCount);
  }, [onStepChange, visibleCount]);

  return (
    <section aria-labelledby="instajudge-demo" className="border-t border-slate-700/70 pt-4">
      <div className="flex items-center justify-between gap-4">
        <h2 id="instajudge-demo" className="text-xs font-bold uppercase text-slate-400">See it work</h2>
      </div>
      <div className="mt-3 min-h-[15.5rem] border-l border-sky-300/30 bg-[#050b14]/60 px-4 py-3 backdrop-blur-sm sm:min-h-[13.5rem] sm:px-5" aria-live="off">
        <div className="space-y-3">
          {DEMO_MESSAGES.slice(0, visibleCount).map((message) => (
            <div
              key={`${message.role}-${message.text}`}
              className={`animate-in fade-in slide-in-from-bottom-1 duration-500 ${message.role === 'user' ? 'ml-auto max-w-[88%] text-right' : 'max-w-[92%]'}`}
            >
              <p className={`text-[0.62rem] font-bold uppercase ${message.role === 'user' ? 'text-sky-300/65' : 'text-slate-500'}`}>
                {message.role === 'user' ? 'You' : 'InstaJudge'}
              </p>
              <p className={`mt-1 inline-block text-sm leading-5 ${message.ruling ? 'border-l-2 border-emerald-300/65 pl-3 font-semibold text-emerald-50' : message.compact ? 'border border-sky-300/35 bg-sky-300/[0.08] px-3 py-1.5 text-sky-50' : 'text-slate-200'}`}>
                {message.text}
              </p>
            </div>
          ))}
          <span className="sr-only">Demo step {Math.min(visibleCount, DEMO_MESSAGES.length)} of {DEMO_MESSAGES.length}</span>
        </div>
      </div>
    </section>
  );
}

const HOW_IT_WORKS_STEPS = Object.freeze([
  ['Describe the situation', 'Tell InstaJudge what’s happening in your own words.'],
  ['InstaJudge builds the game state', 'It identifies cards, players, zones, stack, combat, priority, and other relevant details.'],
  ['It asks only for what’s missing', 'Then it gives the ruling and explains why.']
]);

function HowItWorks({ compact = false }) {
  return (
    <section className={compact ? '' : 'border-b border-slate-800/90 pb-5'}>
      {!compact ? <h2 className="text-xs font-bold uppercase text-slate-400">How InstaJudge works</h2> : null}
      <ol className={`${compact ? 'space-y-4' : 'mt-4 space-y-5'}`}>
        {HOW_IT_WORKS_STEPS.map(([title, copy], index) => (
          <li key={title} className="grid grid-cols-[1.75rem_1fr] gap-3">
            <span className="grid h-7 w-7 place-items-center rounded-full bg-sky-500 text-xs font-bold text-white shadow-[0_0_18px_rgba(14,165,233,0.22)]">{index + 1}</span>
            <div>
              <h3 className="text-sm font-semibold text-slate-100">{title}</h3>
              <p className="mt-1 text-xs leading-5 text-slate-400">{copy}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function DetectedState({ demoStep = 0, compact = false }) {
  const displayedState = {
    Game: demoStep >= 1 ? DEMO_STATE.Game : '—',
    Turn: demoStep >= 1 ? DEMO_STATE.Turn : '—',
    Phase: demoStep >= 1 ? DEMO_STATE.Phase : '—',
    Priority: demoStep >= 3 ? DEMO_STATE.Priority : '—',
    Stack: demoStep >= 3 ? DEMO_STATE.Stack : '—',
    Combat: demoStep >= 1 ? DEMO_STATE.Combat : '—',
    Targets: demoStep >= 4 ? DEMO_STATE.Targets : '—'
  };

  return (
    <section>
      {!compact ? <h2 className="text-xs font-bold uppercase text-slate-400">Detected state</h2> : null}
      <dl className={`${compact ? '' : 'mt-3'} divide-y divide-slate-800/85 border-t border-slate-800/85`}>
        {WAITING_STATE_FIELDS.map((label) => (
          <div key={label} className="grid min-h-8 grid-cols-[5rem_1fr] items-center gap-3 py-1 text-xs">
            <dt className="text-slate-500">{label}</dt>
            <dd className={`min-w-0 break-words text-right ${displayedState[label] === '—' ? 'text-slate-700' : 'text-slate-200'}`}>{displayedState[label]}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function SupportRailContent({ demoStep }) {
  return (
    <div className="border-l border-slate-700/70 pl-5">
      <HowItWorks />
      <div className="pt-5"><DetectedState demoStep={demoStep} /></div>
    </div>
  );
}

function MobileSupportRail({ demoStep }) {
  return (
    <div className="space-y-2 min-[900px]:hidden">
      <details className="group border-y border-slate-700/70 bg-slate-950/35">
        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-bold text-slate-100 marker:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-300">
          How InstaJudge works
          <ChevronDown className="h-4 w-4 text-slate-500 transition-transform group-open:rotate-180" aria-hidden="true" />
        </summary>
        <div className="border-t border-slate-800 px-4 py-4">
          <HowItWorks compact />
        </div>
      </details>
      <details className="group border-b border-slate-700/70 bg-slate-950/35">
        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-bold text-slate-100 marker:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-300">
          Detected state
          <ChevronDown className="h-4 w-4 text-slate-500 transition-transform group-open:rotate-180" aria-hidden="true" />
        </summary>
        <div className="border-t border-slate-800 px-4 py-4"><DetectedState demoStep={demoStep} compact /></div>
      </details>
    </div>
  );
}

function OpeningExperience({ games, onSelectGame }) {
  const [demoStep, setDemoStep] = useState(1);

  return (
    <div className="relative isolate -mx-4 -mt-5 overflow-hidden sm:-mx-6 md:-mt-7 min-[900px]:grid min-[900px]:min-h-[calc(100vh-8rem)] min-[900px]:grid-cols-[minmax(0,68fr)_minmax(19rem,32fr)]">
      <div className="relative overflow-hidden px-4 py-6 sm:px-8 min-[900px]:px-9 min-[900px]:py-8 xl:px-14">
        <div
          className="pointer-events-none absolute inset-0 -z-20 bg-cover bg-[72%_center] opacity-45"
          style={{ backgroundImage: "url('/images/shop-marketplace-banner.png')" }}
          aria-hidden="true"
        />
        <div className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(90deg,rgba(3,8,18,0.98)_0%,rgba(3,8,18,0.84)_58%,rgba(3,8,18,0.45)_100%),linear-gradient(180deg,rgba(2,6,14,0.46)_0%,rgba(2,6,14,0.92)_100%)]" aria-hidden="true" />

        <div className="mx-auto max-w-[62rem]">
          <OpeningBrand />
          <div className="mt-8"><GameSelector games={games} onSelect={onSelectGame} /></div>
          <div className="mt-7"><ProductDemo onStepChange={setDemoStep} /></div>
          <div className="mt-5"><MobileSupportRail demoStep={demoStep} /></div>
        </div>
      </div>

      <aside className="hidden border-l border-slate-800/90 bg-[#07101b] px-5 py-8 min-[900px]:block xl:px-7" aria-label="About InstaJudge">
        <SupportRailContent demoStep={demoStep} />
      </aside>
    </div>
  );
}

function ActiveCaseHeader({ selectedGame, onBackToGames, onNewRuling }) {
  return (
    <header className="border-b border-slate-800/80 py-3 sm:py-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3 sm:gap-4">
          <button
            type="button"
            onClick={onBackToGames}
            className="shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
            aria-label="Back to InstaJudge game selection"
          >
            <img
              src="/images/instajudge/instajudge-horizontal.png"
              alt="InstaJudge"
              className="h-auto max-h-10 w-auto max-w-[11.5rem] object-contain sm:max-h-11 sm:max-w-[13rem]"
            />
          </button>
          <div className="hidden h-8 w-px bg-slate-800 sm:block" aria-hidden="true" />
          <div className="hidden min-w-0 items-center gap-3 sm:flex">
            <p className="text-[0.62rem] font-bold uppercase tracking-[0.16em] text-slate-500">Active case</p>
            <GameIdentityIcon gameId={selectedGame.id} />
            <span className="sr-only">{selectedGame.label}</span>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={onBackToGames} variant="outline" className="h-9 rounded-sm border-slate-700 bg-transparent px-3 text-xs text-slate-200 hover:bg-slate-900">
            <ArrowLeft className="mr-2 h-3.5 w-3.5" aria-hidden="true" />
            Back to games
          </Button>
          <Button type="button" onClick={onNewRuling} variant="outline" className="h-9 rounded-sm border-slate-700 bg-transparent px-3 text-xs text-slate-200 hover:bg-slate-900">
            <RotateCcw className="mr-2 h-3.5 w-3.5" aria-hidden="true" />
            New Ruling
          </Button>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-3 sm:hidden">
        <p className="text-[0.62rem] font-bold uppercase tracking-[0.16em] text-slate-500">Active case</p>
        <GameIdentityIcon gameId={selectedGame.id} />
        <span className="sr-only">{selectedGame.label}</span>
      </div>
    </header>
  );
}

export default function InstaJudge() {
  const games = useMemo(() => instaJudgeOwner.listGames(), []);
  const [searchParams, setSearchParams] = useSearchParams();
  const [session, setSession] = useState(() => instaJudgeOwner.createSession());
  const [selectedGame, setSelectedGame] = useState(null);
  const [assignedJudge, setAssignedJudge] = useState(null);
  const [messages, setMessages] = useState([{ id: 'intro', role: 'assistant', text: assistantIntro }]);
  const [draft, setDraft] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [reportFlow, setReportFlow] = useState(null);
  const [reportNote, setReportNote] = useState('');
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [reportError, setReportError] = useState('');
  const inputRef = useRef(null);
  const transcriptEndRef = useRef(null);
  const autoFollowTranscriptRef = useRef(false);
  const lastScrollYRef = useRef(0);
  const submissionInFlightRef = useRef(false);
  const judgeCursorRef = useRef(-1);
  const repairAttemptsRef = useRef(new Map());
  const repairChoiceMapRef = useRef(new Map());

  const assignNextJudge = useCallback(() => {
    judgeCursorRef.current = (judgeCursorRef.current + 1) % JUDGE_POOL.length;
    const judge = JUDGE_POOL[judgeCursorRef.current];
    setAssignedJudge(judge);
    return judge;
  }, []);

  const buildRepairResult = useCallback(async ({ pendingKey, attempt, answer, result, gameId }) => {
    if (!CARD_REPAIR_KEYS.has(pendingKey)) {
      return {
        result: { ...result, answer: nonCardRepairCopy(pendingKey, attempt) },
        choices: new Map()
      };
    }

    const query = repairNameCandidate(answer);
    let names = [];
    if (query.length >= 3) {
      try {
        const threshold = Math.max(2, Math.floor(normalizedRepairText(query).length * 0.22));
        const exactSuggestions = await searchOwner.searchPreviewByGame(query, gameId, 5, { includeInventory: false });
        const safeNames = (suggestions) => suggestions
          .map((card) => card?.name)
          .filter(Boolean)
          .filter((name) => editDistance(query, name) <= threshold);
        names = [...new Set(safeNames(exactSuggestions))].slice(0, 3);
        const prefix = query.split(/\s+/).find((part) => part.length >= 3)?.slice(0, 3) || '';
        if (names.length === 0 && prefix) {
          const prefixSuggestions = await searchOwner.searchByGame(prefix, gameId, 24, { includeInventory: false });
          names = [...new Set(safeNames(prefixSuggestions))].slice(0, 3);
        }
      } catch {
        names = [];
      }
    }

    if (names.length === 1) {
      const choices = new Map([
        ['Yes', { ownerText: names[0] }],
        ["No — I'll retype it", { retype: true }]
      ]);
      return {
        result: {
          ...result,
          answer: `I think you mean ${names[0]}. Is that the card you meant?`,
          choices: [...choices.keys()]
        },
        choices
      };
    }

    if (names.length > 1) {
      return {
        result: {
          ...result,
          answer: `Did you mean ${names.slice(0, -1).join(', ')} or ${names.at(-1)}?`,
          choices: names
        },
        choices: new Map(names.map((name) => [name, { ownerText: name }]))
      };
    }

    return {
      result: {
        ...result,
        answer: attempt > 0
          ? 'That still doesn’t match a card I can identify. Try the card name again, or give me part of the name.'
          : 'I couldn’t match that card name. Can you try typing it again?',
        choices: []
      },
      choices: new Map()
    };
  }, []);

  const latestStateSummary = useMemo(() => {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      if (messages[index].result?.stateSummary) return messages[index].result.stateSummary;
    }
    return null;
  }, [messages]);
  const correctableAnswerIds = useMemo(() => new Set((session.history || []).map((entry) => entry.answerId)), [session.history]);

  const isTranscriptNearBottom = useCallback(() => {
    const pageBottomDistance = document.documentElement.scrollHeight - (window.scrollY + window.innerHeight);
    return pageBottomDistance <= 80;
  }, []);

  useEffect(() => {
    if (!autoFollowTranscriptRef.current) return;
    transcriptEndRef.current?.scrollIntoView({ block: 'nearest' });
  }, [messages, isThinking]);

  useEffect(() => {
    const preserveScrollIntent = () => {
      const currentScrollY = window.scrollY;
      if (submissionInFlightRef.current) {
        if (currentScrollY < lastScrollYRef.current - 2) autoFollowTranscriptRef.current = false;
        lastScrollYRef.current = currentScrollY;
        return;
      }
      autoFollowTranscriptRef.current = isTranscriptNearBottom();
      lastScrollYRef.current = currentScrollY;
    };
    window.addEventListener('scroll', preserveScrollIntent, { passive: true });
    preserveScrollIntent();
    return () => window.removeEventListener('scroll', preserveScrollIntent);
  }, [isTranscriptNearBottom]);

  const applyGameTransition = useCallback((gameId) => {
    const nextSession = instaJudgeOwner.createSession();
    const selected = gameId ? instaJudgeOwner.selectGame(nextSession, gameId) : null;

    if (!selected?.game) {
      setSelectedGame(null);
      setAssignedJudge(null);
      setSession(nextSession);
      setMessages([{ id: 'intro', role: 'assistant', text: assistantIntro }]);
      setDraft('');
      setIsThinking(false);
      submissionInFlightRef.current = false;
      repairAttemptsRef.current.clear();
      repairChoiceMapRef.current.clear();
      return;
    }

    assignNextJudge();
    setSelectedGame(selected.game);
    setSession(selected.session);
    setMessages([{
      id: `game-${selected.game.id}-${Date.now()}`,
      role: 'assistant',
      text: judgeOpeningText(selected.game.id),
      result: selected.result
    }]);
    setDraft('');
    setIsThinking(false);
    setReportFlow(null);
    setReportNote('');
    setReportError('');
    submissionInFlightRef.current = false;
    repairAttemptsRef.current.clear();
    repairChoiceMapRef.current.clear();
    window.setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 0);
  }, [assignNextJudge]);

  const requestedGameId = searchParams.get('game');

  useEffect(() => {
    const normalizedGameId = instaJudgeOwner.getGame(requestedGameId)?.id || null;
    if (normalizedGameId === selectedGame?.id || (!normalizedGameId && !selectedGame)) return;
    applyGameTransition(normalizedGameId);
  }, [applyGameTransition, requestedGameId, selectedGame]);

  const handleSelectGame = (gameId) => {
    setSearchParams({ game: gameId });
  };

  const clearConversation = () => {
    const selected = selectedGame ? instaJudgeOwner.selectGame(instaJudgeOwner.createSession(), selectedGame.id) : null;
    if (selectedGame) assignNextJudge();
    setSession(selected?.session || instaJudgeOwner.createSession());
    setMessages(selectedGame ? [{
      id: `game-reset-${selectedGame.id}`,
      role: 'assistant',
      text: judgeOpeningText(selectedGame.id),
      result: selected.result
    }] : [{ id: 'intro', role: 'assistant', text: assistantIntro }]);
    setDraft('');
    setReportFlow(null);
    setReportNote('');
    setReportError('');
    repairAttemptsRef.current.clear();
    repairChoiceMapRef.current.clear();
  };

  const returnToGames = () => {
    setSearchParams({}, { replace: true });
  };

  const beginReport = useCallback((message, { announce = false } = {}) => {
    if (!isReportableRulingMessage(message)) return;
    setReportFlow({ message });
    setReportNote('');
    setReportError('');
    if (announce) {
      setMessages((current) => [...current, {
        id: `judge-report-prompt-${Date.now()}`,
        role: 'assistant',
        text: 'I can save that ruling for review. What do you think was wrong? You can also submit it without notes.',
        result: { kind: 'ruling-report-prompt' }
      }]);
    }
  }, []);

  const submitReport = useCallback(async () => {
    if (!reportFlow?.message || reportSubmitting) return;
    setReportSubmitting(true);
    setReportError('');
    try {
      const report = buildRulingReportDraft({
        message: reportFlow.message,
        transcript: messages,
        session,
        judge: assignedJudge,
        note: reportNote,
        route: `${window.location.pathname}${window.location.search}`,
        appVersion: import.meta.env.VITE_APP_VERSION || import.meta.env.MODE || 'local'
      });
      await rulingReportService.create(report);
      setReportFlow(null);
      setReportNote('');
      setMessages((current) => [...current, {
        id: `judge-report-saved-${Date.now()}`,
        role: 'assistant',
        text: 'Thanks — I saved this ruling for review.',
        result: { kind: 'ruling-report-confirmation' }
      }]);
    } catch (error) {
      setReportError(error instanceof Error ? error.message : 'I could not save this report. Please try again.');
    } finally {
      setReportSubmitting(false);
    }
  }, [assignedJudge, messages, reportFlow, reportNote, reportSubmitting, session]);

  const submitText = async (value, { inputSource = 'typed' } = {}) => {
    const text = String(value || '').trim();
    if (!text || !selectedGame || isThinking || submissionInFlightRef.current) return;
    autoFollowTranscriptRef.current = isTranscriptNearBottom();
    lastScrollYRef.current = window.scrollY;

    if (inputSource === 'typed' && isRulingReportIntent(text)) {
      const latestRuling = [...messages].reverse().find(isReportableRulingMessage);
      setDraft('');
      setMessages((current) => [...current, { id: `user-${Date.now()}`, role: 'user', text }]);
      if (latestRuling) {
        beginReport(latestRuling, { announce: true });
      } else {
        setMessages((current) => [...current, {
          id: `judge-report-missing-${Date.now()}`,
          role: 'assistant',
          text: 'I don’t have a completed ruling to attach that report to yet.',
          result: { kind: 'ruling-report-missing' }
        }]);
      }
      return;
    }

    const repairChoice = repairChoiceMapRef.current.get(text);
    if (repairChoice?.retype) {
      repairChoiceMapRef.current.clear();
      setMessages((current) => [
        ...current,
        { id: `user-${Date.now()}`, role: 'user', text },
        {
          id: `judge-repair-${Date.now()}`,
          role: 'assistant',
          text: 'Type the card name again when you’re ready.',
          result: { kind: 'input-repair', choices: [], stateSummary: latestStateSummary }
        }
      ]);
      window.setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 0);
      return;
    }

    const ownerText = repairChoice?.ownerText || text;
    repairChoiceMapRef.current.clear();
    const pendingKeyBefore = session.pendingStateKey || (session.stage === 'clarifying' ? 'clarification' : null);
    const stageBefore = session.stage;

    const answerId = `user-${Date.now()}`;
    submissionInFlightRef.current = true;
    setDraft('');
    setIsThinking(true);
    setMessages((current) => [...current, { id: answerId, role: 'user', text }]);

    try {
      const response = await instaJudgeOwner.ask({
        session,
        gameId: selectedGame.id,
        message: ownerText,
        answerId,
        inputSource,
        judge: assignedJudge
      });
      assertInstaJudgeInteractionInvariant(response.session, response.result);
      const sameRequirement = shouldRepairCollectorInput({
        previousStage: stageBefore,
        previousStateKey: pendingKeyBefore,
        session: response.session,
        result: response.result
      });
      let displayedResult = response.result;
      if (sameRequirement) {
        const attempt = repairAttemptsRef.current.get(pendingKeyBefore) || 0;
        const repair = await buildRepairResult({
          pendingKey: pendingKeyBefore,
          attempt,
          answer: text,
          result: response.result,
          gameId: selectedGame.id
        });
        displayedResult = repair.result;
        repairChoiceMapRef.current = repair.choices;
        repairAttemptsRef.current.set(pendingKeyBefore, attempt + 1);
      } else {
        repairAttemptsRef.current.clear();
      }
      if (displayedResult.verdict && !displayedResult.clarificationNeeded) {
        displayedResult = {
          ...displayedResult,
          reportContext: captureRulingContext({
            session: response.session,
            userMessage: text,
            result: displayedResult,
            judge: assignedJudge,
            inputSource
          })
        };
      }
      setSession(response.session);
      setMessages((current) => {
        const timestamp = Date.now();
        const leadIn = displayedResult.leadIn ? [{
          id: `judge-lead-${timestamp}`,
          role: 'assistant',
          text: displayedResult.leadIn.answer,
          result: displayedResult.leadIn
        }] : [];
        return [
          ...current,
          ...leadIn,
          {
            id: `judge-${timestamp}`,
            role: 'assistant',
            text: displayedResult.answer,
            verdict: displayedResult.verdict,
            result: displayedResult
          }
        ];
      });
      window.setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 0);
    } catch {
      setMessages((current) => [...current, {
        id: `judge-error-${Date.now()}`,
        role: 'assistant',
        text: "I couldn't complete that check. Your current ruling state is still here, so you can try again.",
        result: { kind: 'ui-error' }
      }]);
    } finally {
      submissionInFlightRef.current = false;
      setIsThinking(false);
    }
  };

  const correctAnswer = (answerId) => {
    if (isThinking || submissionInFlightRef.current) return;
    const response = instaJudgeOwner.rollback(session, answerId);
    setSession(response.session);
    setMessages((current) => {
      const answerIndex = current.findIndex((message) => message.id === answerId);
      if (answerIndex < 0) return current;
      const retained = current.slice(0, answerIndex);
      const priorPrompt = retained.at(-1);
      if (priorPrompt?.role === 'assistant' && priorPrompt.text === response.result.answer) {
        return [...retained.slice(0, -1), { ...priorPrompt, result: response.result }];
      }
      return [...retained, {
          id: `judge-rollback-${Date.now()}`,
          role: 'assistant',
          text: response.result.answer,
          result: response.result
        }];
    });
    repairAttemptsRef.current.clear();
    repairChoiceMapRef.current.clear();
    window.setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 0);
  };

  const submitMessage = async (event) => {
    event.preventDefault();
    await submitText(draft);
  };

  return (
    <main className="min-h-screen max-w-[100vw] overflow-x-clip bg-[#070b14] text-slate-100">
      <section className="mx-auto box-border w-full max-w-[100rem] overflow-x-clip px-4 pb-24 pt-5 sm:px-6 md:py-7">
        {selectedGame ? <ActiveCaseHeader selectedGame={selectedGame} onBackToGames={returnToGames} onNewRuling={clearConversation} /> : null}

        {!selectedGame ? (
          <OpeningExperience
            games={games}
            onSelectGame={handleSelectGame}
          />
        ) : (
          <div className="min-[900px]:grid min-[900px]:grid-cols-[minmax(0,72fr)_minmax(18rem,28fr)] min-[900px]:items-start min-[900px]:gap-8 xl:gap-12">
            <div className="min-w-0 py-5 min-[900px]:py-8">
              <div className="mx-auto w-full max-w-[52rem]">
                <ActiveStateReview selectedGame={selectedGame} summary={latestStateSummary} assignedJudge={assignedJudge} className="mb-5 min-[900px]:hidden" />

                <section aria-label="Ruling conversation" className="min-w-0 space-y-5 pb-5 sm:space-y-6">
                  {messages.map((message, index) => (
                    <ChatMessage
                      key={message.id}
                      message={message}
                      assignedJudge={assignedJudge}
                      onChoice={index === messages.length - 1 && !isThinking ? (choice) => submitText(choice, { inputSource: 'quick-reply' }) : null}
                      onCorrect={message.role === 'user' && !isThinking && correctableAnswerIds.has(message.id) ? correctAnswer : null}
                      onReport={isReportableRulingMessage(message) ? beginReport : null}
                    />
                  ))}

                  {isThinking ? (
                    <div className="grid max-w-[48rem] grid-cols-[2.5rem_minmax(0,1fr)] items-center gap-3 text-sm text-slate-400 sm:grid-cols-[2.75rem_minmax(0,1fr)] sm:gap-3.5" role="status">
                      <JudgeAvatar judge={assignedJudge} size="chat" />
                      <span className="flex items-center gap-2">
                        <LoaderCircle className="h-4 w-4 animate-spin text-cyan-200" aria-hidden="true" />
                        {assignedJudge?.displayName || 'Your judge'} is reviewing the game state...
                      </span>
                    </div>
                  ) : null}
                  <div ref={transcriptEndRef} />
                </section>

                <div className="border-t border-slate-800/80 pt-3">
                  <JudgeComposer
                    draft={draft}
                    inputRef={inputRef}
                    isThinking={isThinking}
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && !event.shiftKey) submitMessage(event);
                    }}
                    onSubmit={submitMessage}
                    selectedGame={selectedGame}
                    session={session}
                    assignedJudge={assignedJudge}
                  />
                </div>

                <p className="mt-3 text-xs leading-5 text-slate-600">In sanctioned events, the event judge has final authority.</p>
              </div>
            </div>

            <div className="hidden border-l border-slate-800/75 py-8 min-[900px]:sticky min-[900px]:top-20 min-[900px]:block min-[900px]:max-h-[calc(100vh-5rem)] min-[900px]:self-start min-[900px]:overflow-y-auto">
              <ActiveStateRail selectedGame={selectedGame} summary={latestStateSummary} assignedJudge={assignedJudge} />
            </div>
          </div>
        )}
      </section>

      <Dialog open={Boolean(reportFlow)} onOpenChange={(open) => {
        if (!open && !reportSubmitting) {
          setReportFlow(null);
          setReportNote('');
          setReportError('');
        }
      }}>
        <DialogContent className="max-w-lg border-slate-700 bg-[#09111d] text-slate-100 sm:rounded-md">
          <DialogHeader>
            <DialogTitle>Report this ruling</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm leading-6 text-slate-300">What do you think was wrong?</p>
            <Textarea
              value={reportNote}
              onChange={(event) => setReportNote(event.target.value)}
              placeholder="Optional notes"
              maxLength={2000}
              rows={4}
              className="border-slate-700 bg-slate-950/60 text-slate-100 placeholder:text-slate-600"
            />
            {reportError ? <p className="text-sm text-rose-300" role="alert">{reportError}</p> : null}
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="outline" disabled={reportSubmitting} onClick={() => {
                setReportFlow(null);
                setReportNote('');
                setReportError('');
              }} className="rounded-sm border-slate-700 bg-transparent text-slate-200 hover:bg-slate-800">
                Cancel
              </Button>
              <Button type="button" disabled={reportSubmitting} onClick={submitReport} className="rounded-sm bg-cyan-500 text-slate-950 hover:bg-cyan-400">
                {reportSubmitting ? 'Saving…' : reportNote.trim() ? 'Submit report' : 'Submit without notes'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </main>
  );
}
