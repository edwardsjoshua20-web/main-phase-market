import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { backend } from '@/services/backend';
import { siteAutomationRegistry } from '@/services/automation/siteAutomationRegistry';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import StatsCard from '@/components/admin/StatsCard';
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock3,
  Database,
  HardDriveDownload,
  Image as ImageIcon,
  RefreshCw,
  ServerCrash,
  Wrench
} from 'lucide-react';

const statusTone = {
  ok: 'bg-green-100 text-green-700 border-green-200',
  degraded: 'bg-amber-100 text-amber-700 border-amber-200',
  stale: 'bg-orange-100 text-orange-700 border-orange-200',
  missing: 'bg-red-100 text-red-700 border-red-200'
};

const sectionIcons = {
  homepage: Activity,
  catalogs: Database,
  images: ImageIcon,
  pricing: HardDriveDownload
};

function formatSourceSummary(source) {
  if (!source || source.configured === false || source.type === 'missing') {
    return 'No source configured';
  }

  if (source.type === 'remote') {
    return source.url ? `Remote API: ${source.url}` : 'Remote API';
  }

  if (source.type === 'file') {
    return source.path || source.envVar || 'File source';
  }

  return 'Unknown source';
}

function classifyEntryIssue(entry) {
  const source = entry?.source || null;
  const status = String(entry?.status || 'missing').toLowerCase();

  if (status === 'ok') return 'Operational';
  if (status === 'stale') return 'Output stale';
  if (status === 'degraded') return 'Output degraded';

  if (status === 'missing') {
    if (!source || source.configured === false || source.type === 'missing') {
      return 'Missing source config';
    }

    if (source.type === 'file' && !source.exists) {
      return 'Missing source file';
    }

    if (source.type === 'remote') {
      return 'Missing generated output';
    }

    if (source.type === 'file' && source.exists) {
      return 'Source ready, output missing';
    }
  }

  return 'Needs review';
}

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString();
}

function formatHours(value) {
  if (value == null || Number.isNaN(Number(value))) return '—';
  return `${Number(value).toFixed(1)}h ago`;
}

function StatusBadge({ status }) {
  const normalized = String(status || 'missing').toLowerCase();
  return (
    <Badge variant="outline" className={statusTone[normalized] || statusTone.missing}>
      {normalized}
    </Badge>
  );
}

function SummaryValue({ label, value }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2">
      <p className="text-xs uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-gray-900">{value}</p>
    </div>
  );
}

function SectionCard({ title, sectionKey, section }) {
  const Icon = sectionIcons[sectionKey] || Wrench;
  const entries = Array.isArray(section?.entries) ? section.entries : [];
  const topLevelStatus = section?.status || section?.overallStatus || 'missing';

  return (
    <Card className="border-gray-200">
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-slate-100 p-2.5">
              <Icon className="h-5 w-5 text-slate-700" />
            </div>
            <div>
              <CardTitle className="text-lg text-gray-900">{title}</CardTitle>
              <p className="text-sm text-gray-500 mt-1">Operational visibility for this pipeline family.</p>
            </div>
          </div>
          <StatusBadge status={topLevelStatus} />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {section?.file && (
          <div className="grid gap-3 md:grid-cols-3">
            <SummaryValue label="Updated" value={formatDate(section.file.modifiedAt)} />
            <SummaryValue label="Freshness" value={formatHours(section.modifiedHoursAgo)} />
            {'releaseCount' in section ? (
              <SummaryValue label="Items" value={section.releaseCount} />
            ) : null}
          </div>
        )}

        {section?.snapshot && (
          <div className="grid gap-3 md:grid-cols-4">
            <SummaryValue label="Snapshot Status" value={section.snapshot.status || '—'} />
            <SummaryValue label="Updated" value={formatDate(section.snapshot.file?.modifiedAt)} />
            <SummaryValue label="Freshness" value={formatHours(section.snapshot.modifiedHoursAgo)} />
            <SummaryValue label="Preview Rows" value={section.snapshot.previewCount ?? 0} />
          </div>
        )}

        {section?.counts && (
          <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
            <SummaryValue label="OK" value={section.counts.ok ?? 0} />
            <SummaryValue label="Degraded" value={section.counts.degraded ?? 0} />
            <SummaryValue label="Stale" value={section.counts.stale ?? 0} />
            <SummaryValue label="Missing" value={section.counts.missing ?? 0} />
          </div>
        )}

        {entries.length > 0 && (
          <div className="overflow-x-auto rounded-xl border border-gray-200">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Target</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Issue</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Source</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Updated</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Freshness</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Coverage</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {entries.map((entry) => (
                  <tr key={entry.game || entry.source || entry.id}>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">
                      {entry.game || entry.source || entry.id || 'entry'}
                    </td>
                    <td className="px-4 py-3 text-sm"><StatusBadge status={entry.status} /></td>
                    <td className="px-4 py-3 text-sm text-gray-600">{classifyEntryIssue(entry)}</td>
                    <td className="px-4 py-3 text-sm text-gray-600 break-all max-w-xs">{formatSourceSummary(entry.source)}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{formatDate(entry.file?.modifiedAt || entry.cards?.file?.modifiedAt || entry.sets?.file?.modifiedAt)}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{formatHours(entry.modifiedHoursAgo)}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {entry.rows != null ? `${entry.rows} rows` : null}
                      {entry.cards?.count != null ? `${entry.cards.count} cards / ${entry.sets?.count ?? 0} sets` : null}
                      {entry.cardsSeen != null ? `${entry.cardsSeen} cards seen` : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function AdminOperations() {
  const navigate = useNavigate();
  const [, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadUser = async () => {
      const isAuth = await backend.auth.isAuthenticated();
      if (!isAuth) {
        backend.auth.redirectToLogin(window.location.href);
        return;
      }
      const userData = await backend.auth.getCurrentUser();
      if (userData.role !== 'admin') {
        window.location.href = '/';
        return;
      }
      setUser(userData);
      setLoading(false);
    };
    loadUser();
  }, []);

  const healthQuery = useQuery({
    queryKey: ['admin-operations-health'],
    queryFn: () => backend.app.getHealthStatus(),
    enabled: !loading,
    refetchInterval: 30000
  });

  const systemHealth = healthQuery.data?.systemHealth || null;
  const sections = systemHealth?.sections || {};
  const generatedAt = systemHealth?.generatedAt || null;

  const summary = useMemo(() => {
    const topStatus = String(systemHealth?.overallStatus || 'missing').toLowerCase();
    const sectionStatuses = Object.values(sections).map((section) => String(section?.status || section?.overallStatus || 'missing').toLowerCase());
    return {
      ok: sectionStatuses.filter((status) => status === 'ok').length,
      degraded: sectionStatuses.filter((status) => status === 'degraded').length,
      stale: sectionStatuses.filter((status) => status === 'stale').length,
      missing: sectionStatuses.filter((status) => status === 'missing').length,
      topStatus
    };
  }, [sections, systemHealth]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-600">Loading operations dashboard...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-3 mb-3">
              <Button type="button" variant="outline" onClick={() => navigate('/AdminDashboard')} className="border-gray-200">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Button>
              <Link to="/" className="text-sm text-gray-500 hover:text-gray-800">Site</Link>
            </div>
            <h1 className="text-3xl font-bold text-gray-900">Admin Operations</h1>
            <p className="text-gray-500 mt-1">A visual pulse for the pipelines, downloads, catalog feeds, image sync, pricing, and system health.</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-sm text-gray-500">
              Last report: <span className="font-medium text-gray-800">{formatDate(generatedAt)}</span>
            </div>
            <Button type="button" onClick={() => healthQuery.refetch()} className="bg-blue-600 hover:bg-blue-700 text-white">
              <RefreshCw className={`mr-2 h-4 w-4 ${healthQuery.isFetching ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <StatsCard title="Overall" value={summary.topStatus} icon={summary.topStatus === 'ok' ? CheckCircle2 : summary.topStatus === 'missing' ? ServerCrash : AlertTriangle} color={summary.topStatus === 'ok' ? 'green' : summary.topStatus === 'missing' ? 'red' : 'amber'} />
          <StatsCard title="Healthy Areas" value={summary.ok} icon={CheckCircle2} color="green" />
          <StatsCard title="Degraded Areas" value={summary.degraded} icon={AlertTriangle} color="amber" />
          <StatsCard title="Stale Areas" value={summary.stale} icon={Clock3} color="purple" />
          <StatsCard title="Missing Areas" value={summary.missing} icon={ServerCrash} color="red" />
        </div>

        {healthQuery.isError && (
          <Card className="border-amber-200 bg-amber-50">
            <CardContent className="flex flex-col gap-3 p-5 md:flex-row md:items-start md:justify-between">
              <div className="flex gap-3">
                <div className="rounded-xl bg-amber-100 p-2.5">
                  <AlertTriangle className="h-5 w-5 text-amber-700" />
                </div>
                <div>
                  <p className="font-semibold text-amber-900">Live health feed is not connected on the hosted domain yet.</p>
                  <p className="mt-1 text-sm text-amber-800">
                    The admin operations panel itself is live, but the hosted site is not returning the runtime health payload yet.
                    We can still use this page for structure and automation visibility while we wire the hosted health endpoint.
                  </p>
                </div>
              </div>
              <StatusBadge status="degraded" />
            </CardContent>
          </Card>
        )}

        <Card className="border-gray-200">
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle className="text-xl text-gray-900">Automation registry</CardTitle>
                <p className="text-sm text-gray-500 mt-1">These are the declared pipeline families currently registered in the system.</p>
              </div>
              <StatusBadge status={summary.topStatus} />
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 lg:grid-cols-2">
              {siteAutomationRegistry.map((job) => (
                <div key={job.id} className="rounded-2xl border border-gray-200 bg-white p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-gray-900">{job.label}</p>
                      <p className="text-sm text-gray-500 mt-1">{job.purpose}</p>
                    </div>
                    <Badge variant="outline" className="border-slate-200 text-slate-700 bg-slate-50">{job.cadence}</Badge>
                  </div>
                  <div className="mt-3 space-y-2 text-sm text-gray-600">
                    <p><span className="font-medium text-gray-800">Script:</span> {job.script}</p>
                    <p><span className="font-medium text-gray-800">Owner:</span> {job.owner}</p>
                    <p><span className="font-medium text-gray-800">Outputs:</span> {job.outputs.join(', ')}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-6">
          <SectionCard title="Homepage feed" sectionKey="homepage" section={sections.homepage} />
          <SectionCard title="Catalog pipelines" sectionKey="catalogs" section={sections.catalogs} />
          <SectionCard title="Image pipelines" sectionKey="images" section={sections.images} />
          <SectionCard title="Pricing pipelines" sectionKey="pricing" section={sections.pricing} />
        </div>
      </div>
    </div>
  );
}
