import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { backend } from '@/services/backend';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import ForumPostCard from '@/components/forum/ForumPostCard';
import ForumUnansweredCallout from '@/components/forum/ForumUnansweredCallout';
import ForumReferenceCard from '@/components/forum/ForumReferenceCard';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Plus, Search, Loader2, MessageSquare, Clock, Flame, Pin, ArrowUpRight } from 'lucide-react';
import ContentShellWide from '@/components/layout/ContentShellWide';
import { START_HERE_THREADS } from '@/components/forum/forumSeedData';
import { toast } from 'sonner';

const GAMES = [
  { key: 'all', label: 'All Games' },
  { key: 'magic', label: 'Magic' },
  { key: 'pokemon', label: 'Pokemon' },
  { key: 'yugioh', label: 'Yu-Gi-Oh!' },
  { key: 'lorcana', label: 'Lorcana' },
  { key: 'onepiece', label: 'One Piece' },
  { key: 'flesh_and_blood', label: 'Flesh & Blood' }
];

const CATEGORIES = [
  { key: 'all', label: 'All Topics' },
  { key: 'rules_qa', label: 'Rules' },
  { key: 'deckbuilding', label: 'Deckbuilding' },
  { key: 'card_identification', label: 'Card Help' },
  { key: 'general', label: 'General' }
];

const SORTS = [
  { key: 'latest', label: 'Latest', icon: Clock },
  { key: 'hot', label: 'Hot', icon: Flame }
];

const COMMON_TAGS = ['rules', 'budget', 'combo', 'control', 'aggro', 'commander', 'standard', 'modern', 'draft'];

function railButton(active) {
  return active
    ? 'border-[#c7d2e3] bg-[#e9eef6] text-[#22324d]'
    : 'border-[#d8dee8] bg-[#f8fafc] text-[#66758a] hover:border-[#c7d2e3] hover:text-[#22324d]';
}

export default function Forum() {
  const qc = useQueryClient();
  const [user, setUser] = useState(null);
  const [game, setGame] = useState('all');
  const [category, setCategory] = useState('all');
  const [sort, setSort] = useState('latest');
  const [search, setSearch] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ title: '', content: '', game: 'magic', category: 'general', tags: [] });
  const [tagInput, setTagInput] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    backend.auth.isAuthenticated().then(async (auth) => {
      if (auth) setUser(await backend.auth.getCurrentUser());
    });
    const params = new URLSearchParams(window.location.search);
    if (params.get('category')) setCategory(params.get('category'));
  }, []);

  const { data: posts = [], isLoading } = useQuery({
    queryKey: ['forum-posts', game, category, sort],
    queryFn: () => {
      const filter = {};
      if (game !== 'all') filter.game = game;
      if (category !== 'all') filter.category = category;
      return backend.data.ForumPost.filter(filter, sort === 'hot' ? '-likes' : '-created_date', 50);
    },
    refetchInterval: 30000
  });

  const filtered = useMemo(() => posts.filter((post) => (
    !search
      || post.title?.toLowerCase().includes(search.toLowerCase())
      || post.content?.toLowerCase().includes(search.toLowerCase())
      || (post.tags || []).some((tag) => tag.toLowerCase().includes(search.toLowerCase()))
  )), [posts, search]);

  const pinned = filtered.filter((post) => post.is_pinned).slice(0, 3);
  const feed = filtered.filter((post) => !post.is_pinned);
  const unanswered = filtered
    .filter((post) => ['rules_qa', 'card_identification'].includes(post.category) && (post.reply_count || 0) === 0)
    .slice(0, 5)
    .map((post) => ({
      ...post,
      category_label: post.category === 'rules_qa' ? 'Rules' : 'Card Help',
      game_label:
        post.game === 'magic' ? 'Magic'
          : post.game === 'pokemon' ? 'Pokemon'
            : post.game === 'yugioh' ? 'Yu-Gi-Oh!'
              : post.game === 'lorcana' ? 'Lorcana'
                : post.game === 'onepiece' ? 'One Piece'
                  : post.game === 'flesh_and_blood' ? 'Flesh & Blood'
                    : 'General'
    }));

  const _stats = useMemo(() => ({
    threads: filtered.length,
    replies: filtered.reduce((sum, post) => sum + (post.reply_count || 0), 0),
    pinnedCount: pinned.length
  }), [filtered, pinned.length]);

  const handleSubmit = async () => {
    if (!user) {
      toast.error('Sign in to post');
      return;
    }
    if (!form.title.trim() || !form.content.trim()) return;
    setSubmitting(true);
    try {
      await backend.data.ForumPost.create({
        ...form,
        author_email: user.email,
        author_name: user.full_name || user.email,
        view_count: 0,
        reply_count: 0,
        likes: 0,
        liked_by: []
      });
      qc.invalidateQueries(['forum-posts']);
      setShowNew(false);
      setForm({ title: '', content: '', game: 'magic', category: 'general', tags: [] });
      toast.success('Discussion posted');
    } catch (error) {
      console.error('Forum thread create failed:', error);
      toast.error(error?.message || 'Posting discussion failed');
    } finally {
      setSubmitting(false);
    }
  };

  const addTag = (tag) => {
    const normalized = tag.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    if (normalized && !form.tags.includes(normalized) && form.tags.length < 5) {
      setForm((current) => ({ ...current, tags: [...current.tags, normalized] }));
    }
    setTagInput('');
  };

  return (
    <div className="min-h-screen bg-[#f3f5f8] text-[#1d2738]">
      <ContentShellWide className="py-5 md:py-6">
        <div
          className="relative overflow-hidden border border-[#d8dee8]"
          style={{
            backgroundImage:
              "linear-gradient(90deg, rgba(247,249,252,0.3) 0%, rgba(247,249,252,0.24) 34%, rgba(247,249,252,0.12) 58%, rgba(247,249,252,0.2) 100%), url('/forum-banner.png')",
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat'
          }}
        >
          <div className="flex flex-col gap-4 px-4 py-5 md:px-7 md:py-7 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0">
              <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#5b6980]">Main Phase Market Forum</div>
              <h1 className="mt-1 text-2xl font-black tracking-tight text-[#152033] md:text-3xl">
                TCG Lounge
              </h1>
            </div>

            <div className="flex w-full flex-col gap-3 lg:w-auto lg:min-w-[32rem]">
              <div className="relative">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6d7a8e]" />
                <Input
                  placeholder="Search threads, tags, or card names..."
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  className="h-12 border-[#d8dee8] bg-white/95 pl-11 text-[#1d2738] placeholder:text-[#7b8799] shadow-[0_8px_20px_rgba(19,32,51,0.08)]"
                />
              </div>
              {user ? (
                <Button onClick={() => setShowNew(true)} className="h-12 bg-[#22324d] font-black text-white shadow-[0_8px_20px_rgba(19,32,51,0.16)] hover:bg-[#1a2740] lg:self-end">
                  <Plus className="mr-2 h-4 w-4" />
                  Start Thread
                </Button>
              ) : (
                <Button onClick={() => backend.auth.redirectToLogin(window.location.href)} className="h-12 bg-[#22324d] font-black text-white shadow-[0_8px_20px_rgba(19,32,51,0.16)] hover:bg-[#1a2740] lg:self-end">
                  Sign In to Post
                </Button>
              )}
            </div>
          </div>
        </div>

        <div className="mt-4 border-y border-[#d8dee8] bg-[#eef2f7] px-3 py-3">
          <div className="space-y-3 xl:space-y-0 xl:flex xl:flex-nowrap xl:items-center xl:justify-between">
            <div className="flex flex-wrap gap-2">
              {SORTS.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setSort(item.key)}
                    className={`inline-flex items-center gap-2 border px-3 py-2 text-[11px] font-bold uppercase tracking-[0.18em] transition-colors ${railButton(sort === item.key)}`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {item.label}
                  </button>
                );
              })}
            </div>

            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setCategory(item.key)}
                  className={`border px-3 py-2 text-[11px] font-bold uppercase tracking-[0.18em] transition-colors ${railButton(category === item.key)}`}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap gap-2 xl:flex-nowrap">
              {GAMES.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setGame(item.key)}
                  className={`border px-3 py-2 text-[11px] font-bold uppercase tracking-[0.18em] transition-colors ${railButton(game === item.key)}`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-5 grid gap-6 xl:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="min-w-0">
            <div className="mb-5 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#7a8799]">
                {filtered.length} live threads
              </div>
              <div className="hidden items-center gap-3 text-[11px] font-bold uppercase tracking-[0.18em] text-[#7a8799] md:flex">
                <span>{sort === 'hot' ? 'Sorted by hot threads' : 'Sorted by latest activity'}</span>
              </div>
            </div>

            {pinned.length > 0 && (
              <section className="mb-6">
                <div className="mb-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.22em] text-[#7a8799]">
                  <Pin className="h-3.5 w-3.5 text-[#22324d]" />
                  Pinned Threads
                </div>
                <div className="space-y-3">
                  {pinned.map((post) => <ForumPostCard key={post.id} post={post} />)}
                </div>
              </section>
            )}

            <section>
              {isLoading ? (
                <div className="flex justify-center py-20">
                  <Loader2 className="h-6 w-6 animate-spin text-[#22324d]" />
                </div>
              ) : filtered.length === 0 ? (
                <div className="border border-[#d6dfeb] bg-[#fbfdff] px-5 py-8">
                  <div className="flex items-start gap-3">
                    <div className="border border-[#d6dfeb] bg-[#f4f8fc] p-2 text-[#7a8799]">
                      <MessageSquare className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-base font-semibold text-[#1d2738]">No threads match this view yet.</p>
                      <p className="mt-1 text-sm text-[#5d6b7f]">Try another filter or open the first useful thread for this lane.</p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {feed.map((post) => <ForumPostCard key={post.id} post={post} />)}
                </div>
              )}
            </section>
          </div>

          <aside className="space-y-4">
            <section className="border border-[#d6dfeb] bg-[#fbfdff] px-4 py-4">
              <div className="mb-3 text-[11px] font-bold uppercase tracking-[0.22em] text-[#7a8799]">Start Here</div>
              <div className="space-y-2">
                {START_HERE_THREADS.map((thread) => (
                  <Link
                    key={thread.id}
                    to={thread.to}
                    className="group flex items-start justify-between gap-3 border border-[#d6dfeb] bg-[#fafbfd] px-3 py-3 transition-colors hover:border-[#c7d2e3] hover:bg-white"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-semibold leading-6 text-[#1d2738]">{thread.title}</div>
                      <div className="mt-1 text-xs leading-5 text-[#5d6b7f]">{thread.description}</div>
                    </div>
                    <ArrowUpRight className="mt-0.5 h-4 w-4 shrink-0 text-[#7a8799] transition-colors group-hover:text-[#22324d]" />
                  </Link>
                ))}
              </div>
            </section>

            <ForumUnansweredCallout items={unanswered} />
            <ForumReferenceCard />
          </aside>
        </div>
      </ContentShellWide>

      <Dialog open={showNew} onOpenChange={setShowNew}>
        <DialogContent className="max-w-2xl border-[#d6dfeb] bg-[#fbfdff] text-[#1d2738] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl font-black text-[#1d2738]">Start a New Discussion</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-sm text-[#5d6b7f]">Game</label>
                <select
                  value={form.game}
                  onChange={(event) => setForm((current) => ({ ...current, game: event.target.value }))}
                  className="w-full border border-[#d6dfeb] bg-white px-3 py-2 text-sm text-[#1d2738] focus:border-[#22324d] focus:outline-none"
                >
                  <option value="magic">Magic: The Gathering</option>
                  <option value="pokemon">Pokemon</option>
                  <option value="yugioh">Yu-Gi-Oh!</option>
                  <option value="lorcana">Disney Lorcana</option>
                  <option value="onepiece">One Piece</option>
                  <option value="flesh_and_blood">Flesh & Blood</option>
                  <option value="general">General TCG</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm text-[#5d6b7f]">Category</label>
                <select
                  value={form.category}
                  onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))}
                  className="w-full border border-[#d6dfeb] bg-white px-3 py-2 text-sm text-[#1d2738] focus:border-[#22324d] focus:outline-none"
                >
                  <option value="rules_qa">Rules Q&A</option>
                  <option value="deckbuilding">Deckbuilding & Strategy</option>
                  <option value="card_identification">Card Help</option>
                  <option value="general">General Discussion</option>
                </select>
              </div>
            </div>

            <div>
              <label className="mb-1 block text-sm text-[#5d6b7f]">Title</label>
              <Input
                placeholder="What are you asking or posting?"
                value={form.title}
                onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                className="border-[#d6dfeb] bg-white text-[#1d2738] placeholder:text-[#7a8799]"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm text-[#5d6b7f]">Details</label>
              <textarea
                rows={5}
                placeholder="Post the board state, cards, deck context, or exact ruling question."
                value={form.content}
                onChange={(event) => setForm((current) => ({ ...current, content: event.target.value }))}
                className="w-full resize-none border border-[#d6dfeb] bg-white px-3 py-2 text-sm text-[#1d2738] placeholder:text-[#7a8799] focus:border-[#22324d] focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm text-[#5d6b7f]">Tags <span className="text-[#99a5b7]">(up to 5)</span></label>
              <div className="mb-2 flex flex-wrap gap-1.5">
                {form.tags.map((tag) => (
                  <span key={tag} className="flex items-center gap-1 border border-[#d6dfeb] bg-[#f8fbff] px-2 py-1 text-xs text-[#52617a]">
                    #{tag}
                    <button
                      type="button"
                      onClick={() => setForm((current) => ({ ...current, tags: current.tags.filter((value) => value !== tag) }))}
                      className="ml-0.5 text-[#7a8799] hover:text-[#1d2738]"
                    >
                      x
                    </button>
                  </span>
                ))}
              </div>

              <div className="mb-2 flex flex-wrap gap-1">
                {COMMON_TAGS.filter((tag) => !form.tags.includes(tag)).map((tag) => (
                  <button key={tag} type="button" onClick={() => addTag(tag)} className="border border-[#d6dfeb] bg-[#f8fbff] px-2 py-1 text-xs text-[#52617a] transition-colors hover:border-[#c7d2e3] hover:text-[#1d2738]">
                    +{tag}
                  </button>
                ))}
              </div>

              <div className="flex gap-2">
                <Input
                  placeholder="Add custom tag..."
                  value={tagInput}
                  onChange={(event) => setTagInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      addTag(tagInput);
                    }
                  }}
                  className="h-9 border-[#d6dfeb] bg-white text-[#1d2738] placeholder:text-[#7a8799]"
                />
                <Button size="sm" variant="outline" onClick={() => addTag(tagInput)} className="border-[#d6dfeb] text-[#52617a] hover:bg-[#f4f8fc]">
                  Add
                </Button>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowNew(false)} className="text-[#5d6b7f]">Cancel</Button>
            <Button onClick={handleSubmit} disabled={submitting || !form.title.trim() || !form.content.trim()} className="bg-[#22324d] font-black text-white hover:bg-[#1a2740]">
              {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Post Discussion
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
