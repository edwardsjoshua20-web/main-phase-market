import { siteAutomationRegistry } from '../automation/siteAutomationRegistry.js';
import { formatDate } from './adminOperationsModel.js';

function automationRunsHasJob(automationJobs = [], jobId) {
  return automationJobs.some((job) => job?.jobId === jobId || job?.id === jobId);
}

export function buildOwnerInvestorSnapshot({
  summary,
  businessCoreSummary,
  selfMaintainingSummary,
  productWorkSummary,
  beastModeProgress,
  topBlocker,
  automationJobs = [],
  automationRunSummary = {},
  latestSuccessfulAutomationRun,
  nextMilestone,
  reportFreshnessStatus,
  reportAgeHours,
  controlStatus,
  schedulerEnabled
}) {
  const activeIssueCount = Number(summary?.degraded || 0) + Number(summary?.stale || 0) + Number(summary?.missing || 0);
  const failedJobs = automationJobs.filter((job) => String(job?.lastStatus || '').toLowerCase() === 'failed');
  const runningJobs = automationJobs.filter((job) => String(job?.lastStatus || '').toLowerCase() === 'running');
  const missingRunJobs = siteAutomationRegistry.filter((job) => !automationRunsHasJob(automationJobs, job.id));
  const provenAutomation = selfMaintainingSummary.status === 'ok';
  const investorStatus = businessCoreSummary.topStatus === 'ok' && provenAutomation
    ? {
        status: 'ok',
        label: 'Green',
        detail: 'The business systems and self-maintaining proof are both green.'
      }
    : businessCoreSummary.topStatus === 'ok'
      ? {
          status: selfMaintainingSummary.status,
          label: 'Stabilizing',
          detail: 'The core business systems look healthy, but the unattended proof layer still needs to finish proving itself.'
        }
      : {
          status: businessCoreSummary.topStatus,
          label: 'Needs attention',
          detail: 'One or more core business systems still need work before this is investor-safe.'
        };

  const currentBlocker = failedJobs.length > 0
    ? `Failed automation job${failedJobs.length === 1 ? '' : 's'}: ${failedJobs.map((job) => job.label || job.jobId).join(', ')}.`
    : runningJobs.length > 0
      ? `Automation currently running: ${runningJobs.map((job) => job.label || job.jobId).join(', ')}. Wait for completion before trusting final output status.`
      : topBlocker
        ? `${topBlocker.title}: ${topBlocker.detail}`
        : !controlStatus?.available
          ? 'The hosted admin can read reports, but the live runner bridge is not fully available.'
          : !schedulerEnabled
            ? 'The runner is reachable, but autopilot scheduling is not fully proven yet.'
            : 'No blocking operations item is currently flagged.';

  const proofLabel = reportFreshnessStatus === 'ok'
    ? 'Fresh hosted proof'
    : reportFreshnessStatus === 'stale'
      ? `Hosted proof is ${reportAgeHours == null ? 'stale' : `${reportAgeHours.toFixed(1)}h old`}`
      : 'Hosted proof missing';

  return {
    investorStatus,
    activeIssueCount,
    currentBlocker,
    proofLabel,
    readinessPercent: beastModeProgress.percent,
    outputHealthLabel: `${businessCoreSummary.healthy}/${businessCoreSummary.total} core outputs green`,
    automationRunHealthLabel: `${automationRunSummary.ok || 0}/${siteAutomationRegistry.length} automation jobs latest-green`,
    automationRunProblemLabel: failedJobs.length > 0
      ? `${failedJobs.length} failed`
      : runningJobs.length > 0
        ? `${runningJobs.length} running`
        : missingRunJobs.length > 0
          ? `${missingRunJobs.length} without history`
          : 'No failed/running jobs',
    automationLabel: provenAutomation
      ? 'Autopilot proof is green'
      : `${beastModeProgress.complete}/${beastModeProgress.total} self-maintaining checks proven`,
    lastSuccessfulAutomationLabel: formatDate(latestSuccessfulAutomationRun),
    nextAction: nextMilestone?.title || 'Keep stabilizing the operations backbone.',
    productWorkLabel: productWorkSummary.title,
    productWorkStatus: productWorkSummary.status
  };
}
