import React from 'react';
import { useNavigate, Link } from 'react-router-dom';
import * as adminOperationsModel from '@/services/admin/adminOperationsModel';
import { useAdminOperationsDashboard } from '@/hooks/useAdminOperationsDashboard';
import {
  siteAutomationRegistry
} from '@/services/automation/siteAutomationRegistry';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import StatsCard from '@/components/admin/StatsCard';
import { AutomationHistoryCard, PipelineControlsCard } from '@/components/admin/AdminOperationsRuntimeCards';
import { ActionCenterCard, BridgeReadinessCard, DashboardAreaBoardCard, ReadinessCard, SectionCard } from '@/components/admin/AdminOperationsOverviewCards';
import { CapabilityConfidenceCard, ControlPlaneCard, DataContractsCard, LaunchReadinessCard, OperationsIncidentCard, RecoveryPlaybookCard, RunnerAuditTimelineCard, ServiceLevelCard, SourceGovernanceCard } from '@/components/admin/AdminOperationsHealthCards';
import { StatusBadge } from '@/components/admin/AdminOperationsShared';
import { AlertTriangle, ArrowLeft, CheckCircle2, Clock3, RefreshCw, ServerCrash } from 'lucide-react';

function getHoursSince(timestamp) {
  if (!timestamp) return null;
  const parsed = new Date(timestamp).getTime();
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, (Date.now() - parsed) / (1000 * 60 * 60));
}

function normalizeStatus(value) {
  return String(value || 'missing').toLowerCase();
}

function getBusinessCoreSummary(sections = {}) {
  const systems = [
    { key: 'homepage', label: 'Homepage feed', status: normalizeStatus(sections.homepage?.status) },
    { key: 'catalogs', label: 'Card catalogs', status: normalizeStatus(sections.catalogs?.overallStatus) },
    { key: 'images', label: 'Image pipelines', status: normalizeStatus(sections.images?.overallStatus) },
    { key: 'pricing', label: 'Pricing', status: normalizeStatus(sections.pricing?.status) },
    { key: 'readiness', label: 'Launch readiness', status: normalizeStatus(sections.readiness?.overallStatus) }
  ];
  const healthy = systems.filter((system) => system.status === 'ok').length;
  const statuses = systems.map((system) => system.status);
  const needsAttention = systems.filter((system) => system.status !== 'ok');
  const topStatus = statuses.includes('missing')
    ? 'missing'
    : statuses.some((status) => ['degraded', 'failed', 'running', 'blocked'].includes(status))
      ? 'degraded'
      : statuses.includes('stale')
        ? 'stale'
        : 'ok';
  return {
    systems,
    healthy,
    total: systems.length,
    topStatus,
    needsAttention
  };
}

function getSelfMaintainingSummary({ reportFreshnessStatus, controlStatus, schedulerEnabled, overallStatus }) {
  if (reportFreshnessStatus !== 'ok') {
    return {
      status: 'stale',
      title: 'Not proven yet',
      detail: 'The hosted report is stale, so the site is not currently proving unattended health on its own.'
    };
  }

  if (!controlStatus?.available) {
    return {
      status: 'degraded',
      title: 'Read-only proof mode',
      detail: 'The page can read business reports, but the live runner bridge is not available from the hosted admin yet.'
    };
  }

  if (!schedulerEnabled) {
    return {
      status: 'stale',
      title: 'Runner connected, autopilot not fully active',
      detail: 'The control bridge is reachable, but unattended scheduling is not fully proving itself yet.'
    };
  }

  if (overallStatus !== 'ok') {
    return {
      status: 'degraded',
      title: 'Autopilot active, but issues remain',
      detail: 'The self-maintaining backbone is live, but one or more business systems still need attention.'
    };
  }

  return {
    status: 'ok',
    title: 'Self-maintaining mode is proven',
    detail: 'Hosted reporting is fresh, the runner bridge is live, autopilot is active, and the major business systems are healthy.'
  };
}

function getProductWorkSummary({ attentionItems, reportFreshnessStatus, controlStatus, schedulerEnabled }) {
  if (reportFreshnessStatus !== 'ok') {
    return {
      status: 'stale',
      title: 'Only with caution',
      detail: 'You can keep building, but trust the admin page as a warning surface instead of hard proof until freshness is restored.'
    };
  }

  if (!controlStatus?.available || !schedulerEnabled) {
    return {
      status: 'stale',
      title: 'Yes, but ops is still maturing',
      detail: 'Product work can continue, but the operations backbone is not fully unattended yet.'
    };
  }

  if (attentionItems.length > 0) {
    return {
      status: 'degraded',
      title: 'Mostly yes',
      detail: 'You can move product forward, but there are still flagged operations items to close out.'
    };
  }

  return {
    status: 'ok',
    title: 'Yes',
    detail: 'Nothing major is blocking product work right now.'
  };
}

export default function AdminOperations() {
  const navigate = useNavigate();
  const {
    loading,
    manualRefreshPending,
    healthQuery,
    controlQuery,
    systemHealth,
    sections,
    generatedAt,
    automationRuns,
    summary,
    targetSummary,
    dashboardAreas,
    controlStatus,
    startingJobId,
    displayLastCheckedAt,
    handleRefresh,
    runJob
  } = useAdminOperationsDashboard();

  const automationJobs = Object.values(automationRuns?.jobs || {});
  const latestSuccessfulAutomationRun = automationJobs
    .map((job) => job?.lastSucceededAt || null)
    .filter(Boolean)
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] || null;

  const schedulerEnabled = Boolean(controlStatus?.scheduler?.enabled);
  const schedulerChecks = Number(controlStatus?.scheduler?.checks || 0);
  const reportAgeHours = getHoursSince(generatedAt);
  const reportFreshnessStatus = reportAgeHours == null ? 'missing' : reportAgeHours > 2 ? 'stale' : 'ok';
  const operatingMode = !controlStatus?.available
    ? 'Snapshot mode'
    : schedulerEnabled
      ? 'Autopilot active'
      : 'Runner connected';
  const businessCoreSummary = getBusinessCoreSummary(sections);

  const attentionItems = [
    sections.homepage?.status !== 'ok'
      ? {
          title: 'Homepage feed needs attention',
          detail: sections.homepage?.diagnostics?.[0] || 'Homepage release data is not current yet.'
        }
      : null,
    sections.catalogs?.overallStatus !== 'ok'
      ? {
          title: 'Card catalogs need attention',
          detail: 'One or more game catalogs are missing, stale, or degraded.'
        }
      : null,
    sections.images?.overallStatus !== 'ok'
      ? {
          title: 'Image pipeline needs attention',
          detail: 'One or more image mirror pipelines are not healthy.'
        }
      : null,
    sections.pricing?.status !== 'ok'
      ? {
          title: 'Pricing pipeline needs attention',
          detail: sections.pricing?.diagnostics?.[0] || 'Pricing data is not current yet.'
        }
      : null,
    reportFreshnessStatus !== 'ok'
      ? {
          title: 'Hosted report is out of date',
          detail: generatedAt
            ? `The latest published health snapshot is ${reportAgeHours.toFixed(1)} hours old, so this page is not currently proving that the site is staying healthy on its own.`
            : 'No hosted health snapshot has been published yet.'
        }
      : null,
    !controlStatus?.available
      ? {
          title: 'Manual automation controls are not connected',
          detail: controlStatus?.reason || 'The live operations bridge is not connected yet.'
        }
      : null,
    !schedulerEnabled
      ? {
          title: 'Autopilot scheduler is not currently running',
          detail: 'Automations can report health, but unattended scheduling is not active on the control bridge yet.'
        }
      : null
  ].filter(Boolean);

  const selfMaintainingSummary = getSelfMaintainingSummary({
    reportFreshnessStatus,
    controlStatus,
    schedulerEnabled,
    overallStatus: summary.topStatus
  });

  const productWorkSummary = getProductWorkSummary({
    attentionItems,
    reportFreshnessStatus,
    controlStatus,
    schedulerEnabled
  });

  const topBlocker = attentionItems[0] || null;
  const operatorControlStatus = !controlStatus?.available
    ? 'degraded'
    : schedulerEnabled
      ? 'ok'
      : 'stale';

  const systemCards = [
    {
      title: 'Homepage Feed',
      status: sections.homepage?.status || 'missing',
      primary: sections.homepage?.status === 'ok' ? 'Fresh' : 'Needs attention',
      secondary: `Items loaded: ${sections.homepage?.releaseCount ?? 0}`,
      tertiary: `Last update: ${adminOperationsModel.formatDate(sections.homepage?.file?.modifiedAt || generatedAt)}`
    },
    {
      title: 'Card Catalogs',
      status: sections.catalogs?.overallStatus || 'missing',
      primary: `${sections.catalogs?.counts?.ok ?? 0}/${sections.catalogs?.entries?.length || 0} games healthy`,
      secondary: `Missing: ${sections.catalogs?.counts?.missing ?? 0} • Stale: ${sections.catalogs?.counts?.stale ?? 0}`,
      tertiary: sections.catalogs?.overallStatus === 'ok' ? 'Catalogs are current.' : 'One or more catalogs need work.'
    },
    {
      title: 'Images',
      status: sections.images?.overallStatus || 'missing',
      primary: `${sections.images?.counts?.ok ?? 0}/${sections.images?.entries?.length || 0} image pipelines healthy`,
      secondary: `Missing: ${sections.images?.counts?.missing ?? 0} • Stale: ${sections.images?.counts?.stale ?? 0}`,
      tertiary: sections.images?.overallStatus === 'ok' ? 'Image mirrors are current.' : 'Image mirrors need attention.'
    },
    {
      title: 'Pricing',
      status: sections.pricing?.status || 'missing',
      primary: sections.pricing?.status === 'ok' ? 'Fresh' : 'Needs attention',
      secondary: `Sources synced: ${sections.pricing?.sourceSummary?.counts?.ok ?? 0}/3`,
      tertiary: `Last update: ${adminOperationsModel.formatDate(sections.pricing?.snapshot?.file?.modifiedAt || generatedAt)}`
    },
    {
      title: 'Automations',
      status: controlStatus?.available && schedulerEnabled ? 'ok' : 'degraded',
      primary: schedulerEnabled ? 'Running on schedule' : 'Scheduler not active yet',
      secondary: `Last successful run: ${adminOperationsModel.formatDate(latestSuccessfulAutomationRun)}`,
      tertiary: controlStatus?.available ? `Bridge mode: ${controlStatus?.mode || 'connected'}` : (controlStatus?.reason || 'Bridge unavailable')
    }
  ];

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
            <p className="text-gray-500 mt-1">The business control room for catalogs, images, pricing, homepage feeds, and the automations that keep them alive.</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-sm text-gray-500 text-right space-y-1">
              <div>
                Report generated: <span className="font-medium text-gray-800">{adminOperationsModel.formatDate(generatedAt)}</span>
              </div>
              <div>
                Last checked: <span className="font-medium text-gray-800">{adminOperationsModel.formatDate(displayLastCheckedAt)}</span>
              </div>
            </div>
            <Button
              type="button"
              onClick={handleRefresh}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${manualRefreshPending || healthQuery.isFetching || controlQuery.isFetching ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>

        <Card className="border-gray-200">
          <CardHeader>
            <CardTitle className="text-xl text-gray-900">Plain-English status</CardTitle>
            <p className="text-sm text-gray-500 mt-1">This is the fast version: what matters right now, whether the site is maintaining itself, and whether we can safely focus on product work.</p>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 lg:grid-cols-3">
              <div className="rounded-2xl border border-gray-200 bg-white p-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold text-gray-900">Overall answer</p>
                  <StatusBadge status={businessCoreSummary.topStatus} />
                </div>
                <p className="text-lg font-semibold text-gray-900">
                  {businessCoreSummary.topStatus === 'ok'
                    ? 'Business systems are healthy'
                    : businessCoreSummary.topStatus === 'stale'
                      ? 'Business systems need a freshness pass'
                      : businessCoreSummary.topStatus === 'missing'
                        ? 'Business systems are missing proof'
                        : 'Business systems need attention'}
                </p>
                <p className="text-sm text-gray-600">
                  {businessCoreSummary.topStatus === 'ok'
                    ? `All ${businessCoreSummary.total} core business systems are green.`
                    : `${businessCoreSummary.healthy}/${businessCoreSummary.total} core business systems are green right now.`}
                </p>
              </div>

              <div className="rounded-2xl border border-gray-200 bg-white p-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold text-gray-900">Self-maintaining beast mode</p>
                  <StatusBadge status={selfMaintainingSummary.status} />
                </div>
                <p className="text-lg font-semibold text-gray-900">{selfMaintainingSummary.title}</p>
                <p className="text-sm text-gray-600">{selfMaintainingSummary.detail}</p>
              </div>

              <div className="rounded-2xl border border-gray-200 bg-white p-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold text-gray-900">Can we focus on product work?</p>
                  <StatusBadge status={productWorkSummary.status} />
                </div>
                <p className="text-lg font-semibold text-gray-900">{productWorkSummary.title}</p>
                <p className="text-sm text-gray-600">{productWorkSummary.detail}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <StatsCard title="Business Core" value={businessCoreSummary.topStatus} icon={businessCoreSummary.topStatus === 'ok' ? CheckCircle2 : businessCoreSummary.topStatus === 'missing' ? ServerCrash : AlertTriangle} color={businessCoreSummary.topStatus === 'ok' ? 'green' : businessCoreSummary.topStatus === 'missing' ? 'red' : 'amber'} />
          <StatsCard title="Core Systems Green" value={`${businessCoreSummary.healthy}/${businessCoreSummary.total}`} icon={CheckCircle2} color={businessCoreSummary.healthy === businessCoreSummary.total ? 'green' : 'amber'} />
          <StatsCard title="Self-Maintaining Proof" value={selfMaintainingSummary.status} icon={selfMaintainingSummary.status === 'ok' ? CheckCircle2 : selfMaintainingSummary.status === 'stale' ? Clock3 : AlertTriangle} color={selfMaintainingSummary.status === 'ok' ? 'green' : selfMaintainingSummary.status === 'stale' ? 'purple' : 'amber'} />
          <StatsCard title="Operator Controls" value={!controlStatus?.available ? 'offline' : schedulerEnabled ? 'live' : 'partial'} icon={!controlStatus?.available ? ServerCrash : schedulerEnabled ? CheckCircle2 : Clock3} color={operatorControlStatus === 'ok' ? 'green' : operatorControlStatus === 'stale' ? 'purple' : 'amber'} />
          <StatsCard title="Hosted Report" value={reportAgeHours == null ? 'missing' : reportAgeHours <= 2 ? 'current' : `${reportAgeHours.toFixed(1)}h`} icon={reportFreshnessStatus === 'ok' ? CheckCircle2 : reportFreshnessStatus === 'stale' ? Clock3 : ServerCrash} color={reportFreshnessStatus === 'ok' ? 'green' : reportFreshnessStatus === 'stale' ? 'purple' : 'red'} />
        </div>

        <Card className="border-gray-200">
          <CardHeader>
            <CardTitle className="text-xl text-gray-900">Operations counters</CardTitle>
            <p className="text-sm text-gray-500 mt-1">These are the deeper ops counts. Useful for engineering, but not the first thing you should need to read.</p>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatsCard title="Healthy Areas" value={summary.ok} icon={CheckCircle2} color="green" />
              <StatsCard title="Degraded Areas" value={summary.degraded} icon={AlertTriangle} color="amber" />
              <StatsCard title="Stale Areas" value={summary.stale} icon={Clock3} color="purple" />
              <StatsCard title="Missing Areas" value={summary.missing} icon={ServerCrash} color="red" />
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <Card className="border-gray-200 xl:col-span-2">
            <CardContent className="p-5 space-y-2">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm text-gray-500">Top blocker right now</p>
                <StatusBadge status={topBlocker ? 'degraded' : 'ok'} />
              </div>
              <p className="text-lg font-semibold text-gray-900">{topBlocker?.title || 'No blocker flagged'}</p>
              <p className="text-sm text-gray-500">{topBlocker?.detail || 'Nothing major is blocking the business backbone right now.'}</p>
            </CardContent>
          </Card>

          <Card className="border-gray-200">
            <CardContent className="p-5 space-y-2">
              <p className="text-sm text-gray-500">Last Successful Automation</p>
              <p className="text-xl font-semibold text-gray-900">{adminOperationsModel.formatDate(latestSuccessfulAutomationRun)}</p>
              <p className="text-sm text-gray-500">Most recent pipeline success recorded by the system.</p>
            </CardContent>
          </Card>

          <Card className="border-gray-200">
            <CardContent className="p-5 space-y-2">
              <p className="text-sm text-gray-500">Operating Mode</p>
              <div className="flex items-center justify-between gap-3">
                <p className="text-xl font-semibold text-gray-900">{operatingMode}</p>
                <StatusBadge status={!controlStatus?.available ? 'degraded' : schedulerEnabled ? 'ok' : 'stale'} />
              </div>
              <p className="text-sm text-gray-500">
                {!controlStatus?.available
                  ? 'Hosted admin can read reports, but cannot yet prove live runner access.'
                  : schedulerEnabled
                    ? `Scheduler checks recorded: ${schedulerChecks}`
                    : 'Runner is reachable, but autopilot is not fully active yet.'}
              </p>
            </CardContent>
          </Card>

          <Card className="border-gray-200">
            <CardContent className="p-5 space-y-2">
              <p className="text-sm text-gray-500">Hosted Report Freshness</p>
              <div className="flex items-center justify-between gap-3">
                <p className="text-xl font-semibold text-gray-900">
                  {reportAgeHours == null ? 'Missing' : reportAgeHours <= 2 ? 'Current' : `${reportAgeHours.toFixed(1)}h old`}
                </p>
                <StatusBadge status={reportFreshnessStatus} />
              </div>
              <p className="text-sm text-gray-500">This is the proof line for whether hosted reporting is staying fresh on its own.</p>
            </CardContent>
          </Card>
        </div>

        <Card className="border-gray-200">
          <CardHeader>
            <CardTitle className="text-xl text-gray-900">How to use this page</CardTitle>
            <p className="text-sm text-gray-500 mt-1">
              Start at the plain-English cards above. If those look good, glance at Business systems. Only open Technical details when you want the engineering proof.
            </p>
          </CardHeader>
        </Card>

        {(reportFreshnessStatus !== 'ok' || !controlStatus?.available || !schedulerEnabled) ? (
          <Card className="border-amber-200 bg-amber-50">
            <CardContent className="p-5 space-y-2">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-amber-900">How to read this right now</p>
                  <p className="text-sm text-amber-800 mt-1">
                    {reportFreshnessStatus !== 'ok'
                      ? 'The hosted report is stale, so treat this page as a warning surface right now instead of proof that the business systems are fully self-maintaining.'
                      : !controlStatus?.available
                        ? 'The business data is visible, but the hosted admin is still in snapshot/read-only mode until the runner bridge is reachable.'
                        : 'The runner is reachable, but autopilot is not yet proving unattended freshness end to end.'}
                  </p>
                </div>
                <StatusBadge status={reportFreshnessStatus !== 'ok' ? 'stale' : !controlStatus?.available ? 'degraded' : 'ok'} />
              </div>
            </CardContent>
          </Card>
        ) : null}

        <Card className="border-gray-200">
          <CardHeader>
            <CardTitle className="text-xl text-gray-900">Business systems</CardTitle>
            <p className="text-sm text-gray-500 mt-1">The five systems that matter most day to day.</p>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
              {systemCards.map((card) => (
                <div key={card.title} className="rounded-2xl border border-gray-200 bg-white p-4 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-semibold text-gray-900">{card.title}</p>
                    <StatusBadge status={card.status} />
                  </div>
                  <p className="text-lg font-semibold text-gray-900">{card.primary}</p>
                  <p className="text-sm text-gray-600">{card.secondary}</p>
                  <p className="text-sm text-gray-500">{card.tertiary}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="border-gray-200">
          <CardHeader>
            <CardTitle className="text-xl text-gray-900">Attention needed</CardTitle>
            <p className="text-sm text-gray-500 mt-1">If something is in here, it is one of the reasons the site is not fully self-maintaining yet.</p>
          </CardHeader>
          <CardContent>
            {attentionItems.length === 0 ? (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
                No blocking operations work is flagged right now. We can focus on product and storefront work.
              </div>
            ) : (
              <div className="space-y-3">
                {attentionItems.map((item) => (
                  <div key={item.title} className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                    <p className="font-semibold text-amber-900">{item.title}</p>
                    <p className="mt-1 text-sm text-amber-800">{item.detail}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

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

        <details className="group rounded-2xl border border-gray-200 bg-white open:shadow-sm">
          <summary className="cursor-pointer list-none px-6 py-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">Technical details</h2>
                <p className="mt-1 text-sm text-gray-500">
                  Open this when you want the deeper engineering proof: pipeline internals, bridge readiness, run history, and recovery detail.
                </p>
              </div>
              <Badge variant="outline" className="border-slate-200 text-slate-700 bg-slate-50 group-open:bg-slate-100">
                Expand
              </Badge>
            </div>
          </summary>

          <div className="space-y-8 px-6 pb-6">
            <DashboardAreaBoardCard areas={dashboardAreas} />

            <Card className="border-gray-200">
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <CardTitle className="text-xl text-gray-900">Automation registry</CardTitle>
                    <p className="text-sm text-gray-500 mt-1">These are the declared pipeline families currently registered in the system.</p>
                  </div>
                  <StatusBadge status={summary.automationAreaStatus} />
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

            <OperationsIncidentCard
              systemHealth={systemHealth}
              sections={sections}
              automationRuns={automationRuns}
              controlStatus={controlStatus}
            />
            <ServiceLevelCard automationRuns={automationRuns} controlStatus={controlStatus} />
            <LaunchReadinessCard
              sections={sections}
              automationRuns={automationRuns}
              controlStatus={controlStatus}
            />
            <CapabilityConfidenceCard
              sections={sections}
              automationRuns={automationRuns}
              controlStatus={controlStatus}
            />
            <SourceGovernanceCard sections={sections} />
            <DataContractsCard automationRuns={automationRuns} />
            <RecoveryPlaybookCard
              systemHealth={systemHealth}
              sections={sections}
              automationRuns={automationRuns}
              controlStatus={controlStatus}
            />
            <AutomationHistoryCard automationRuns={automationRuns} />
            <ControlPlaneCard controlStatus={controlStatus} />
            <RunnerAuditTimelineCard controlStatus={controlStatus} />
            <BridgeReadinessCard controlStatus={controlStatus} />
            <PipelineControlsCard
              automationRuns={automationRuns}
              controlStatus={controlStatus}
              onRunJob={runJob}
              startingJobId={startingJobId}
            />

            <div className="grid gap-6">
              <ActionCenterCard systemHealth={systemHealth} sections={sections} automationRuns={automationRuns} controlStatus={controlStatus} />
              <SectionCard title="Homepage feed" sectionKey="homepage" section={sections.homepage} automationRuns={automationRuns} />
              <ReadinessCard section={sections.readiness} />
              <SectionCard title="Catalog pipelines" sectionKey="catalogs" section={sections.catalogs} automationRuns={automationRuns} />
              <SectionCard title="Image pipelines" sectionKey="images" section={sections.images} automationRuns={automationRuns} />
              <SectionCard title="Pricing pipelines" sectionKey="pricing" section={sections.pricing} automationRuns={automationRuns} />
            </div>
          </div>
        </details>
      </div>
    </div>
  );
}


