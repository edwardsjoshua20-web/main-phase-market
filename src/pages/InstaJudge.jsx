import React, { useMemo, useRef, useState } from 'react';
import { ArrowRight, Flag, LoaderCircle, RotateCcw, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { instaJudgeOwner } from '@/services/instajudge/instajudgeOwner';
import {
  buildRulingReportDraft,
  captureRulingContext,
  isReportableRulingMessage,
  isRulingReportIntent
} from '@/services/instajudge/rulingReportCore';
import { rulingReportService } from '@/services/instajudge/rulingReportService';

const assistantIntro = "Hi, I’m MPM InstaJudge. What TCG do you need help with?";
const REPORT_JUDGE = Object.freeze({ id: 'instajudge', displayName: 'MPM InstaJudge' });

function createClientSession(initial = {}) {
  const id = globalThis.crypto?.randomUUID?.() || `ij-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return { ...instaJudgeOwner.createSession(initial), id };
}

function verdictClass(verdict) {
  if (verdict === 'yes') return 'border-emerald-400/40 bg-emerald-400/10 text-emerald-100';
  if (verdict === 'no') return 'border-red-400/40 bg-red-400/10 text-red-100';
  if (verdict === 'depends') return 'border-amber-300/40 bg-amber-300/10 text-amber-100';
  return 'border-slate-600 bg-slate-900/80 text-slate-200';
}

function ChatBubble({ message, onReport }) {
  const isUser = message.role === 'user';
  return (
    <div className={`flex min-w-0 ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`min-w-0 max-w-[min(42rem,calc(100vw-2rem))] overflow-hidden border px-4 py-3 text-sm leading-6 ${isUser ? 'border-cyan-300/30 bg-cyan-300/10 text-cyan-50' : 'border-slate-700 bg-slate-950/72 text-slate-100'}`}>
        {message.verdict ? (
          <span className={`mb-3 inline-flex border px-2 py-1 text-[0.68rem] font-black uppercase tracking-[0.16em] ${verdictClass(message.verdict)}`}>
            {message.verdict}
          </span>
        ) : null}
        <p className="whitespace-pre-line">{message.text}</p>
        {message.result?.cards?.length > 0 ? (
          <div className="mt-3 border-t border-slate-800 pt-3">
            <p className="text-[0.68rem] font-black uppercase tracking-[0.16em] text-slate-500">Cards</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {message.result.cards.map((card) => (
                <span key={`${card.game}-${card.id}-${card.name}`} className="border border-slate-700 bg-slate-900/80 px-2 py-1 text-xs font-semibold text-slate-200">
                  {card.name}
                </span>
              ))}
            </div>
          </div>
        ) : null}
        {message.result?.rules?.length > 0 ? (
          <div className="mt-3 border-t border-slate-800 pt-3">
            <p className="text-[0.68rem] font-black uppercase tracking-[0.16em] text-slate-500">Rules</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {message.result.rules.map((rule) => (rule.path ? (
                <a key={rule.slug} href={rule.path} className="border border-slate-700 bg-slate-900/80 px-2 py-1 text-xs font-semibold text-cyan-100 hover:border-cyan-300/70">
                  {rule.title}
                </a>
              ) : (
                <span key={rule.slug} className="border border-slate-700 bg-slate-900/80 px-2 py-1 text-xs font-semibold text-slate-200">
                  {rule.title}
                </span>
              )))}
            </div>
          </div>
        ) : null}
        {message.result?.clarificationNeeded ? (
          <p className="mt-3 border-t border-slate-800 pt-3 text-xs font-semibold text-slate-400">
            {message.result.clarificationNeeded}
          </p>
        ) : null}
        {isReportableRulingMessage(message) ? (
          <button type="button" onClick={() => onReport(message)} className="mt-3 inline-flex items-center gap-2 border-t border-slate-800 pt-3 text-xs font-semibold text-slate-400 hover:text-cyan-100">
            <Flag className="h-3.5 w-3.5" aria-hidden="true" /> Wrong Answer? Report Error
          </button>
        ) : null}
      </div>
    </div>
  );
}

export default function InstaJudge() {
  const games = useMemo(() => instaJudgeOwner.listGames(), []);
  const [session, setSession] = useState(() => createClientSession());
  const [selectedGame, setSelectedGame] = useState(null);
  const [messages, setMessages] = useState([{ id: 'intro', role: 'assistant', text: assistantIntro }]);
  const [draft, setDraft] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [reportTarget, setReportTarget] = useState(null);
  const [reportNote, setReportNote] = useState('');
  const [reportError, setReportError] = useState('');
  const [isReporting, setIsReporting] = useState(false);
  const inputRef = useRef(null);
  const latestReportable = useMemo(() => [...messages].reverse().find(isReportableRulingMessage) || null, [messages]);

  const handleSelectGame = (gameId) => {
    const selected = instaJudgeOwner.selectGame(session, gameId);
    if (!selected.game) return;
    setSelectedGame(selected.game);
    setSession(selected.session);
    setMessages((current) => [
      ...current,
      {
        id: `game-${selected.game.id}-${Date.now()}`,
        role: 'assistant',
        text: `Got it — ${selected.game.label}. Describe what’s happening in the game. Include the card names if you know them.`
      }
    ]);
    window.setTimeout(() => inputRef.current?.focus(), 0);
  };

  const clearConversation = () => {
    const nextSession = createClientSession(selectedGame ? { game: selectedGame.id } : {});
    setSession(nextSession);
    setMessages([
      { id: 'intro', role: 'assistant', text: assistantIntro },
      ...(selectedGame ? [{
        id: `game-reset-${selectedGame.id}`,
        role: 'assistant',
        text: `Got it — ${selectedGame.label}. Describe what’s happening in the game. Include the card names if you know them.`
      }] : [])
    ]);
    setDraft('');
    setReportTarget(null);
    setReportNote('');
    setReportError('');
  };

  const changeGame = () => {
    setSelectedGame(null);
    setSession(createClientSession());
    setMessages([{ id: 'intro', role: 'assistant', text: assistantIntro }]);
    setDraft('');
    setReportTarget(null);
    setReportNote('');
    setReportError('');
  };

  const openReport = (message) => {
    setReportTarget(message);
    setReportNote('');
    setReportError('');
  };

  const submitMessage = async (event) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text || !selectedGame || isThinking) return;

    setDraft('');
    if (isRulingReportIntent(text) && latestReportable) {
      setMessages((current) => [...current, { id: `user-${Date.now()}`, role: 'user', text }]);
      openReport(latestReportable);
      return;
    }

    setIsThinking(true);
    setMessages((current) => [...current, { id: `user-${Date.now()}`, role: 'user', text }]);

    const response = await instaJudgeOwner.ask({ session, gameId: selectedGame.id, message: text });
    setSession(response.session);
    setMessages((current) => [
      ...current,
      (() => {
        const result = {
          ...response.result,
          reportContext: captureRulingContext({
            session: response.session,
            userMessage: text,
            result: response.result,
            judge: REPORT_JUDGE,
            inputSource: 'typed'
          })
        };
        return {
        id: `judge-${Date.now()}`,
        role: 'assistant',
        text: response.result.answer,
        verdict: response.result.verdict,
        result
        };
      })()
    ]);
    setIsThinking(false);
    window.setTimeout(() => inputRef.current?.focus(), 0);
  };

  const submitReport = async () => {
    if (!reportTarget || isReporting) return;
    setIsReporting(true);
    setReportError('');
    try {
      const report = buildRulingReportDraft({
        message: reportTarget,
        transcript: messages,
        session,
        judge: REPORT_JUDGE,
        note: reportNote,
        route: `${window.location.pathname}${window.location.search}`,
        appVersion: import.meta.env.VITE_COMMIT_SHA || import.meta.env.VITE_APP_VERSION || 'production'
      });
      await rulingReportService.create(report);
      setMessages((current) => [...current, {
        id: `report-confirmation-${Date.now()}`,
        role: 'assistant',
        text: 'Thanks. I saved this ruling for review. Your current ruling session is unchanged.'
      }]);
      setReportTarget(null);
      setReportNote('');
    } catch (error) {
      setReportError(error instanceof Error ? error.message : 'Unable to submit this report.');
    } finally {
      setIsReporting(false);
    }
  };

  return (
    <main className="min-h-screen max-w-[100vw] overflow-x-hidden bg-[#070b14] text-slate-100">
      <section className="mx-auto box-border flex min-h-[calc(100vh-9rem)] w-full max-w-[min(64rem,100vw)] flex-col overflow-x-hidden px-4 py-6 md:py-8">
        <div className="border-b border-slate-800 pb-4">
          <h1 className="text-3xl font-black tracking-tight text-white md:text-4xl">MPM InstaJudge</h1>
        </div>

        <div className="mt-5 flex flex-1 flex-col gap-4">
          <div className="min-w-0 flex-1 space-y-4 overflow-y-auto overflow-x-hidden border-y border-slate-800 py-4">
            {messages.map((message) => <ChatBubble key={message.id} message={message} onReport={openReport} />)}

            {!selectedGame ? (
              <div className="grid min-w-0 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {games.map((game) => (
                  <button
                    key={game.id}
                    type="button"
                    onClick={() => handleSelectGame(game.id)}
                    className="flex min-h-12 min-w-0 items-center justify-between gap-3 overflow-hidden border border-slate-700 bg-slate-950/70 px-3 py-2 text-left text-sm font-bold text-slate-100 transition hover:border-cyan-300/60 hover:bg-slate-900"
                  >
                    <span className="min-w-0 break-words">{game.label}</span>
                    <ArrowRight className="hidden h-4 w-4 shrink-0 text-slate-500 sm:block" aria-hidden="true" />
                  </button>
                ))}
              </div>
            ) : null}

            {isThinking ? (
              <div className="flex justify-start">
                <div className="border border-slate-700 bg-slate-950/72 px-4 py-3 text-sm font-semibold text-slate-400">
                  Checking cards and rules...
                </div>
              </div>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={clearConversation} variant="outline" className="h-8 rounded border-slate-700 bg-slate-950/70 px-3 text-xs text-slate-200 hover:bg-slate-900">
                <RotateCcw className="mr-2 h-3.5 w-3.5" />
                New Ruling
              </Button>
              <Button type="button" onClick={changeGame} variant="outline" className="h-8 rounded border-slate-700 bg-slate-950/70 px-3 text-xs text-slate-200 hover:bg-slate-900">
                Change Game
              </Button>
            </div>
            <p>In sanctioned events, the event judge has final authority.</p>
          </div>

          <form onSubmit={submitMessage} className="flex min-w-0 max-w-full gap-2">
            <textarea
              ref={inputRef}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) submitMessage(event);
              }}
              disabled={!selectedGame}
              placeholder={selectedGame ? 'Describe the play, card names, target, zone, and format...' : 'Choose a TCG first'}
              className="min-h-14 min-w-0 flex-1 resize-none border border-slate-700 bg-slate-950/80 px-3 py-3 text-sm leading-5 text-slate-100 outline-none placeholder:text-slate-500 focus:border-cyan-300/70 disabled:opacity-60"
            />
            <Button type="submit" disabled={!selectedGame || !draft.trim() || isThinking} className="h-auto min-h-14 shrink-0 rounded bg-cyan-200 px-4 text-slate-950 hover:bg-cyan-100 disabled:opacity-50">
              <Send className="h-4 w-4" />
              <span className="sr-only">Send ruling request</span>
            </Button>
          </form>
        </div>
      </section>

      <Dialog open={Boolean(reportTarget)} onOpenChange={(open) => { if (!open && !isReporting) setReportTarget(null); }}>
        <DialogContent className="max-w-lg rounded-sm border-slate-700 bg-[#0b1220] text-slate-100">
          <DialogHeader>
            <DialogTitle>Report this ruling</DialogTitle>
          </DialogHeader>
          <p className="text-sm leading-6 text-slate-300">The ruling, recent conversation, and available diagnostic state will be sent to Main Phase Market for review.</p>
          <label className="mt-2 block text-sm font-semibold text-slate-200" htmlFor="ruling-report-note">Optional note</label>
          <Textarea
            id="ruling-report-note"
            value={reportNote}
            onChange={(event) => setReportNote(event.target.value.slice(0, 2000))}
            placeholder="What seems wrong?"
            className="min-h-28 rounded-sm border-slate-700 bg-slate-950 text-slate-100 placeholder:text-slate-500"
          />
          {reportError ? <p className="text-sm text-rose-300" role="alert">{reportError}</p> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" disabled={isReporting} onClick={() => setReportTarget(null)} className="rounded-sm border-slate-700 bg-transparent text-slate-200 hover:bg-slate-800">Cancel</Button>
            <Button type="button" disabled={isReporting} onClick={submitReport} className="rounded-sm bg-cyan-200 text-slate-950 hover:bg-cyan-100">
              {isReporting ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : <Flag className="mr-2 h-4 w-4" aria-hidden="true" />}
              Submit report
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </main>
  );
}
