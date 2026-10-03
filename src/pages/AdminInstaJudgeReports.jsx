import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, RefreshCw, Search, ShieldAlert } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { backend } from '@/services/backend';
import { REPORT_STATUSES } from '@/services/instajudge/rulingReportCore';
import { rulingReportService } from '@/services/instajudge/rulingReportService';

const STATUS_LABELS = Object.freeze({
  new: 'New',
  reviewing: 'Reviewing',
  confirmed_bug: 'Confirmed bug',
  expected_behavior: 'Expected behavior',
  fixed: 'Fixed',
  closed: 'Closed'
});

function formatDate(value) {
  if (!value) return 'Unknown';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function JsonBlock({ value }) {
  if (value == null) return <p className="text-sm text-slate-500">Not captured</p>;
  return <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words bg-slate-950 p-3 text-xs leading-5 text-slate-300">{JSON.stringify(value, null, 2)}</pre>;
}

export default function AdminInstaJudgeReports() {
  const [reports, setReports] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [aiFilter, setAiFilter] = useState('');
  const [sort, setSort] = useState('newest');
  const [cardName, setCardName] = useState('');
  const [operation, setOperation] = useState('');
  const [judge, setJudge] = useState('');
  const [unresolved, setUnresolved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [adminNotes, setAdminNotes] = useState('');
  const [editStatus, setEditStatus] = useState('new');
  const [access, setAccess] = useState('checking');

  useEffect(() => {
    let active = true;
    backend.auth.getCurrentUser()
      .then((user) => { if (active) setAccess(user?.role === 'admin' ? 'allowed' : 'denied'); })
      .catch(() => { if (active) setAccess('denied'); });
    return () => { active = false; };
  }, []);

  const loadReports = useCallback(async () => {
    if (access !== 'allowed') return;
    setLoading(true);
    setError('');
    try {
      const payload = await rulingReportService.list({
        status: status || undefined,
        search: search || undefined,
        aiInvolved: aiFilter === '' ? undefined : aiFilter === 'yes',
        sort,
        cardName: cardName || undefined,
        operation: operation || undefined,
        judge: judge || undefined,
        unresolved
      });
      const nextReports = payload?.reports || [];
      setReports(nextReports);
      setSelectedId((current) => current && nextReports.some((report) => report.id === current) ? current : nextReports[0]?.id || null);
    } catch (loadError) {
      setReports([]);
      setSelectedId(null);
      setError(loadError instanceof Error ? loadError.message : 'Unable to load ruling reports.');
    } finally {
      setLoading(false);
    }
  }, [access, aiFilter, cardName, judge, operation, search, sort, status, unresolved]);

  useEffect(() => { loadReports(); }, [loadReports]);

  const selected = useMemo(() => reports.find((report) => report.id === selectedId) || null, [reports, selectedId]);
  const similarCount = useMemo(() => selected
    ? reports.filter((report) => report.id !== selected.id && report.scenario_fingerprint === selected.scenario_fingerprint).length
    : 0, [reports, selected]);
  const operationOptions = useMemo(() => [...new Set(reports.map((report) => report.engine_operation).filter(Boolean))].sort(), [reports]);
  const judgeOptions = useMemo(() => [...new Map(reports.filter((report) => report.judge_id).map((report) => [report.judge_id, report.judge_name || report.judge_id])).entries()], [reports]);

  useEffect(() => {
    setAdminNotes(selected?.admin_notes || '');
    setEditStatus(selected?.status || 'new');
  }, [selected]);

  const saveReview = async () => {
    if (!selected || saving) return;
    setSaving(true);
    setError('');
    try {
      const payload = await rulingReportService.update(selected.id, { status: editStatus, adminNotes });
      setReports((current) => current.map((report) => report.id === selected.id ? payload.report : report));
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save this review.');
    } finally {
      setSaving(false);
    }
  };

  if (access === 'checking') return <main className="min-h-screen bg-[#070b14] px-6 py-12 text-slate-300">Checking administrator access…</main>;
  if (access === 'denied') return (
    <main className="min-h-screen bg-[#070b14] px-6 py-12 text-slate-100">
      <div className="mx-auto max-w-2xl border-l-2 border-rose-400 bg-rose-400/10 px-5 py-4">
        <h1 className="text-xl font-bold">Administrator access required</h1>
        <p className="mt-2 text-sm text-rose-100/80">This report-management page is available only to Main Phase Market administrators.</p>
        <Link to="/" className="mt-4 inline-flex text-sm font-semibold text-cyan-200 hover:text-white">Return to site</Link>
      </div>
    </main>
  );

  return (
    <main className="min-h-screen bg-[#070b14] px-4 py-8 text-slate-100 sm:px-6">
      <div className="mx-auto max-w-[92rem]">
        <header className="border-b border-slate-800 pb-6">
          <Link to="/AdminDashboard" className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Admin tools
          </Link>
          <div className="mt-5 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-cyan-300/70">InstaJudge</p>
              <h1 className="mt-1 text-3xl font-bold">Ruling error reports</h1>
              <p className="mt-2 text-sm text-slate-400">Review player-submitted rulings and their captured diagnostic evidence.</p>
            </div>
            <Button type="button" variant="outline" onClick={loadReports} disabled={loading} className="rounded-sm border-slate-700 bg-transparent text-slate-100 hover:bg-slate-800">
              <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" /> Refresh
            </Button>
          </div>
        </header>

        <section className="grid gap-3 border-b border-slate-800 py-4 sm:grid-cols-2 xl:grid-cols-[minmax(14rem,1fr)_11rem_9rem_9rem]" aria-label="Report filters">
          <label className="relative">
            <span className="sr-only">Search reports</span>
            <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-500" aria-hidden="true" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search question, answer, note, or fingerprint" className="h-10 w-full border border-slate-700 bg-slate-950 pl-10 pr-3 text-sm text-white outline-none focus:border-cyan-400" />
          </label>
          <select value={status} onChange={(event) => setStatus(event.target.value)} className="h-10 border border-slate-700 bg-slate-950 px-3 text-sm text-white outline-none focus:border-cyan-400" aria-label="Filter by status">
            <option value="">All statuses</option>
            {REPORT_STATUSES.map((item) => <option key={item} value={item}>{STATUS_LABELS[item]}</option>)}
          </select>
          <select value={aiFilter} onChange={(event) => setAiFilter(event.target.value)} className="h-10 border border-slate-700 bg-slate-950 px-3 text-sm text-white outline-none focus:border-cyan-400" aria-label="Filter by AI involvement">
            <option value="">AI: Any</option>
            <option value="yes">AI involved</option>
            <option value="no">No AI</option>
          </select>
          <select value={sort} onChange={(event) => setSort(event.target.value)} className="h-10 border border-slate-700 bg-slate-950 px-3 text-sm text-white outline-none focus:border-cyan-400" aria-label="Sort reports">
            <option value="newest">Newest first</option><option value="oldest">Oldest first</option>
          </select>
          <input value={cardName} onChange={(event) => setCardName(event.target.value)} placeholder="Card name" className="h-10 border border-slate-700 bg-slate-950 px-3 text-sm text-white outline-none focus:border-cyan-400" aria-label="Filter by card name" />
          <select value={operation} onChange={(event) => setOperation(event.target.value)} className="h-10 border border-slate-700 bg-slate-950 px-3 text-sm text-white outline-none focus:border-cyan-400" aria-label="Filter by engine operation">
            <option value="">All operations</option>{operationOptions.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <select value={judge} onChange={(event) => setJudge(event.target.value)} className="h-10 border border-slate-700 bg-slate-950 px-3 text-sm text-white outline-none focus:border-cyan-400" aria-label="Filter by judge">
            <option value="">All judges</option>{judgeOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
          <label className="flex h-10 items-center gap-2 border border-slate-700 bg-slate-950 px-3 text-sm text-slate-200"><input type="checkbox" checked={unresolved} onChange={(event) => setUnresolved(event.target.checked)} /> Unresolved only</label>
        </section>

        {error ? <p className="my-4 border-l-2 border-rose-400 bg-rose-400/10 px-4 py-3 text-sm text-rose-100" role="alert">{error}</p> : null}

        <div className="grid min-h-[38rem] gap-6 py-6 lg:grid-cols-[minmax(20rem,0.9fr)_minmax(0,1.6fr)]">
          <section aria-label="Ruling reports" className="min-w-0 border-r-0 border-slate-800 lg:border-r lg:pr-6">
            {loading ? <p className="text-sm text-slate-400">Loading reports…</p> : null}
            {!loading && reports.length === 0 ? <p className="text-sm text-slate-400">No reports match these filters.</p> : null}
            <div className="divide-y divide-slate-800 border-y border-slate-800">
              {reports.map((report) => (
                <button key={report.id} type="button" onClick={() => setSelectedId(report.id)} className={`w-full px-3 py-4 text-left transition hover:bg-slate-900 ${selectedId === report.id ? 'bg-slate-900 border-l-2 border-cyan-300' : ''}`}>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs font-bold uppercase tracking-[0.12em] text-cyan-200">{STATUS_LABELS[report.status] || report.status}</span>
                    <time className="text-xs text-slate-500">{formatDate(report.created_at)}</time>
                  </div>
                  <p className="mt-2 line-clamp-2 text-sm font-semibold leading-5 text-white">{report.user_message}</p>
                  <p className="mt-2 text-xs text-slate-500">{report.judge_name || 'Unknown judge'} · {report.engine_operation || 'Unknown operation'}</p>
                  <p className="mt-1 font-mono text-[0.68rem] text-slate-600">{report.scenario_fingerprint}</p>
                </button>
              ))}
            </div>
          </section>

          <section aria-label="Selected report details" className="min-w-0">
            {!selected ? <p className="text-sm text-slate-400">Select a report to inspect it.</p> : (
              <div className="space-y-6">
                <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-800 pb-5">
                  <div>
                    <p className="font-mono text-xs text-slate-500">{selected.id}</p>
                    <h2 className="mt-2 text-xl font-bold">{selected.user_message}</h2>
                    <p className="mt-2 text-sm text-slate-400">{selected.judge_name} · {formatDate(selected.created_at)}</p>
                    <p className="mt-1 text-xs text-slate-500">Similar reports in this result set: {similarCount}</p>
                  </div>
                  <span className="inline-flex items-center gap-2 border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-300">
                    <ShieldAlert className="h-4 w-4 text-amber-300" aria-hidden="true" /> {selected.ai_involved ? 'AI involved' : 'Deterministic path'}
                  </span>
                </div>

                <div className="grid gap-5 md:grid-cols-2">
                  <div><h3 className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Judge answer</h3><p className="mt-2 text-sm leading-6 text-white">{selected.judge_answer}</p></div>
                  <div><h3 className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Explanation</h3><p className="mt-2 text-sm leading-6 text-slate-300">{selected.explanation || 'None captured'}</p></div>
                </div>
                <div><h3 className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Player note</h3><p className="mt-2 text-sm leading-6 text-slate-300">{selected.user_note || 'Submitted without notes'}</p></div>

                <dl className="grid gap-3 border-y border-slate-800 py-4 text-sm sm:grid-cols-2">
                  <div><dt className="text-slate-500">Fingerprint</dt><dd className="break-all font-mono text-slate-200">{selected.scenario_fingerprint}</dd></div>
                  <div><dt className="text-slate-500">Engine operation</dt><dd className="text-slate-200">{selected.engine_operation || 'Unknown'}</dd></div>
                  <div><dt className="text-slate-500">Verdict / class</dt><dd className="text-slate-200">{selected.engine_verdict || 'Unknown'} · {selected.result_class || 'Unknown'}</dd></div>
                  <div><dt className="text-slate-500">Cards</dt><dd className="text-slate-200">{selected.card_names?.join(', ') || 'None captured'}</dd></div>
                  <div><dt className="text-slate-500">Build / route</dt><dd className="break-words text-slate-200">{selected.app_version || 'Unknown'} · {selected.route || 'Unknown'}</dd></div>
                </dl>

                <details className="border-b border-slate-800 pb-4"><summary className="cursor-pointer text-sm font-semibold text-slate-200">Canonical state snapshot</summary><div className="mt-3"><JsonBlock value={selected.state_snapshot} /></div></details>
                <details className="border-b border-slate-800 pb-4"><summary className="cursor-pointer text-sm font-semibold text-slate-200">Diagnostic payload</summary><div className="mt-3"><JsonBlock value={selected.diagnostic_payload} /></div></details>
                <details className="border-b border-slate-800 pb-4"><summary className="cursor-pointer text-sm font-semibold text-slate-200">Status history</summary><div className="mt-3"><JsonBlock value={selected.status_history} /></div></details>

                <div className="grid gap-4 sm:grid-cols-[12rem_1fr]">
                  <label className="text-sm text-slate-300">Status<select value={editStatus} onChange={(event) => setEditStatus(event.target.value)} className="mt-2 h-10 w-full border border-slate-700 bg-slate-950 px-3 text-white">{REPORT_STATUSES.map((item) => <option key={item} value={item}>{STATUS_LABELS[item]}</option>)}</select></label>
                  <label className="text-sm text-slate-300">Internal notes<Textarea value={adminNotes} onChange={(event) => setAdminNotes(event.target.value)} rows={4} maxLength={12000} className="mt-2 border-slate-700 bg-slate-950 text-white" /></label>
                </div>
                <div className="flex justify-end"><Button type="button" onClick={saveReview} disabled={saving} className="rounded-sm bg-cyan-500 text-slate-950 hover:bg-cyan-400">{saving ? 'Saving…' : 'Save review'}</Button></div>
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
