import {
  getAutomationDependencySummary,
  siteAutomationRegistry
} from '../automation/siteAutomationRegistry.js';

export function getCadenceTargetHours(cadence) {
  const normalized = String(cadence || '').toLowerCase();
  if (normalized.includes('hourly')) return 1.5;
  if (normalized.includes('every-2-days')) return 54;
  if (normalized.includes('daily')) return 30;
  return 30;
}

export function getRunFreshnessHours(run) {
  const lastRunAt = run?.lastSucceededAt || run?.lastFinishedAt || run?.lastStartedAt || null;
  if (!lastRunAt) return null;
  const time = new Date(lastRunAt).getTime();
  if (Number.isNaN(time)) return null;
  return Math.max(0, (Date.now() - time) / 36e5);
}

export function getBusinessImpact(jobId) {
  const impact = {
    'card-backfill-refresh': 'Raw card data feeding catalog, images, pricing, search, and storefront accuracy.',
    'catalog-refresh': 'Normalized card/search catalog used across storefront, deck tools, and admin inventory flows.',
    'image-repair-sync': 'Card image coverage across shop, deck builder, commander hub, and inventory intake.',
    'pricing-refresh': 'Storefront market price guidance and deck/card value calculations.',
    'homepage-upcoming-releases': 'Public homepage hero/release feed staying current for upcoming products.',
    'system-health-report': 'Admin visibility, incident detection, and freshness reporting.'
  };
  return impact[jobId] || 'Business automation health.';
}

export function getJobDetails(jobId) {
  return siteAutomationRegistry.find((job) => job.id === jobId) || null;
}

export function getRunRecord(automationRuns, jobId) {
  return automationRuns?.jobs?.[jobId] || null;
}

export function summarizeTargets(entries) {
  const names = entries
    .map((entry) => entry.game || entry.source || entry.id)
    .filter(Boolean);

  if (names.length === 0) return 'No affected targets listed';
  if (names.length <= 3) return names.join(', ');
  return `${names.slice(0, 3).join(', ')} +${names.length - 3} more`;
}

export function summarizeAutomationRuns(automationRuns) {
  const runs = Object.values(automationRuns?.jobs || {});
  return {
    ok: runs.filter((run) => run?.lastStatus === 'ok').length,
    failed: runs.filter((run) => run?.lastStatus === 'failed').length,
    running: runs.filter((run) => run?.lastStatus === 'running').length,
    missing: siteAutomationRegistry.filter((job) => !automationRuns?.jobs?.[job.id]?.lastStatus).length
  };
}

export function getControlReadiness(run) {
  const status = String(run?.lastStatus || 'missing').toLowerCase();

  if (status === 'ok') {
    return {
      label: 'Ready when runner is wired',
      tone: 'text-green-700',
      note: 'Latest recorded run completed successfully.'
    };
  }

  if (status === 'running') {
    return {
      label: 'Run in progress',
      tone: 'text-blue-700',
      note: 'Wait for this job to finish before allowing another run.'
    };
  }

  if (status === 'failed') {
    return {
      label: 'Needs review before rerun',
      tone: 'text-red-700',
      note: run?.lastError || 'The last run failed and should be reviewed before manual execution.'
    };
  }

  return {
    label: 'Needs first recorded run',
    tone: 'text-amber-700',
    note: 'No run history has been captured yet.'
  };
}

export function dependencyRunStatus(automationRuns, jobId) {
  return String(getRunRecord(automationRuns, jobId)?.lastStatus || 'missing').toLowerCase();
}

export function getDependencyDiagnostics(job, automationRuns) {
  const dependencySummary = getAutomationDependencySummary(job.id);
  const dependencies = dependencySummary.dependsOn.map((dependency) => ({
    ...dependency,
    runStatus: dependencyRunStatus(automationRuns, dependency.id)
  }));
  const blockers = dependencies.filter((dependency) => dependency.runStatus !== 'ok');

  return {
    dependencies,
    blocks: dependencySummary.blocks,
    blockers,
    ready: blockers.length === 0
  };
}
