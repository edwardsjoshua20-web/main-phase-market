import React, { useMemo, useRef, useState } from 'react';
import { ArrowRight, RotateCcw, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { instaJudgeOwner } from '@/services/instajudge/instajudgeOwner';

const assistantIntro = "Hi, I’m MPM InstaJudge. What TCG do you need help with?";

function verdictClass(verdict) {
  if (verdict === 'yes') return 'border-emerald-400/40 bg-emerald-400/10 text-emerald-100';
  if (verdict === 'no') return 'border-red-400/40 bg-red-400/10 text-red-100';
  if (verdict === 'depends') return 'border-amber-300/40 bg-amber-300/10 text-amber-100';
  return 'border-slate-600 bg-slate-900/80 text-slate-200';
}

function ChatBubble({ message }) {
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
              {message.result.rules.map((rule) => (
                <a key={rule.slug} href={rule.path} className="border border-slate-700 bg-slate-900/80 px-2 py-1 text-xs font-semibold text-cyan-100 hover:border-cyan-300/70">
                  {rule.title}
                </a>
              ))}
            </div>
          </div>
        ) : null}
        {message.result?.clarificationNeeded ? (
          <p className="mt-3 border-t border-slate-800 pt-3 text-xs font-semibold text-slate-400">
            {message.result.clarificationNeeded}
          </p>
        ) : null}
      </div>
    </div>
  );
}

export default function InstaJudge() {
  const games = useMemo(() => instaJudgeOwner.listGames(), []);
  const [session, setSession] = useState(() => instaJudgeOwner.createSession());
  const [selectedGame, setSelectedGame] = useState(null);
  const [messages, setMessages] = useState([{ id: 'intro', role: 'assistant', text: assistantIntro }]);
  const [draft, setDraft] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const inputRef = useRef(null);

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
    const nextSession = instaJudgeOwner.createSession(selectedGame ? { game: selectedGame.id } : {});
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
  };

  const changeGame = () => {
    setSelectedGame(null);
    setSession(instaJudgeOwner.createSession());
    setMessages([{ id: 'intro', role: 'assistant', text: assistantIntro }]);
    setDraft('');
  };

  const submitMessage = async (event) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text || !selectedGame || isThinking) return;

    setDraft('');
    setIsThinking(true);
    setMessages((current) => [...current, { id: `user-${Date.now()}`, role: 'user', text }]);

    const response = await instaJudgeOwner.ask({ session, gameId: selectedGame.id, message: text });
    setSession(response.session);
    setMessages((current) => [
      ...current,
      {
        id: `judge-${Date.now()}`,
        role: 'assistant',
        text: response.result.answer,
        verdict: response.result.verdict,
        result: response.result
      }
    ]);
    setIsThinking(false);
    window.setTimeout(() => inputRef.current?.focus(), 0);
  };

  return (
    <main className="min-h-screen max-w-[100vw] overflow-x-hidden bg-[#070b14] text-slate-100">
      <section className="mx-auto box-border flex min-h-[calc(100vh-9rem)] w-full max-w-[min(64rem,100vw)] flex-col overflow-x-hidden px-4 py-6 md:py-8">
        <div className="border-b border-slate-800 pb-4">
          <h1 className="text-3xl font-black tracking-tight text-white md:text-4xl">MPM InstaJudge</h1>
        </div>

        <div className="mt-5 flex flex-1 flex-col gap-4">
          <div className="min-w-0 flex-1 space-y-4 overflow-y-auto overflow-x-hidden border-y border-slate-800 py-4">
            {messages.map((message) => <ChatBubble key={message.id} message={message} />)}

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
    </main>
  );
}
