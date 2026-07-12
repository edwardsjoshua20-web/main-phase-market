import {
  siteAutomationRegistry,
  siteAutomationSections
} from '../automation/siteAutomationRegistry.js';

export function buildLaunchReadinessRows({
  sections,
  automationRuns,
  controlStatus,
  getRunRecord,
  buildOperationIncidents
}) {
  const controlsConnected = Boolean(controlStatus?.available);
  const schedulerEnabled = Boolean(controlStatus?.scheduler?.enabled);
  const jobOk = (jobId) => String(getRunRecord(automationRuns, jobId)?.lastStatus || 'missing').toLowerCase() === 'ok';
  const sectionOk = (sectionKey) => {
    const section = sections?.[sectionKey];
    return String(section?.status || section?.overallStatus || 'missing').toLowerCase() === 'ok';
  };
  const capabilityOrder = ['Catalog', 'Images', 'Pricing', 'Homepage', 'Readiness'];
  const capabilityRiskCounts = buildOperationIncidents(null, sections, automationRuns, controlStatus)
    .reduce((acc, incident) => {
      (incident.impactedCapabilities || []).forEach((capability) => {
        acc[capability] = (acc[capability] || 0) + 1;
      });
      return acc;
    }, {});
  const atRiskCapabilities = capabilityOrder.filter((capability) => capabilityRiskCounts[capability] > 0);

  return {
    atRiskCapabilities,
    topRisk: atRiskCapabilities[0] || 'None',
    rows: [
      {
        id: 'public-storefront',
        label: 'Public storefront',
        owner: 'storefront',
        status: sectionOk('catalogs') && sectionOk('images') && sectionOk('pricing') ? 'ok' : 'degraded',
        evidence: 'Catalogs, images, and pricing all need to stay green for buyers to trust product pages.',
        nextStep: 'Repair whichever pipeline is not green, then rerun System health report.'
      },
      {
        id: 'search-and-discovery',
        label: 'Search and discovery',
        owner: 'catalog',
        status: sectionOk('catalogs') && jobOk('catalog-refresh') ? 'ok' : 'degraded',
        evidence: 'Search depends on normalized catalog outputs and successful catalog refresh history.',
        nextStep: 'Run Card backfill refresh, then Catalog refresh.'
      },
      {
        id: 'card-images',
        label: 'Card image coverage',
        owner: 'images',
        status: sectionOk('images') && jobOk('image-repair-sync') ? 'ok' : 'degraded',
        evidence: 'Shop, deck builder, commander hub, and inventory intake share the image pipeline.',
        nextStep: 'Run Image repair and sync after Catalog refresh is healthy.'
      },
      {
        id: 'market-pricing',
        label: 'Market pricing',
        owner: 'pricing',
        status: sectionOk('pricing') && jobOk('pricing-refresh') ? 'ok' : 'degraded',
        evidence: 'Deck values and storefront values need a fresh merged pricing snapshot.',
        nextStep: 'Run Pricing refresh after Catalog refresh is healthy.'
      },
      {
        id: 'homepage-merchandising',
        label: 'Homepage merchandising',
        owner: 'homepage',
        status: sectionOk('homepage') && jobOk('homepage-upcoming-releases') ? 'ok' : 'degraded',
        evidence: 'The hero/release banner should automatically reflect upcoming sets.',
        nextStep: 'Run Homepage upcoming releases refresh.'
      },
      {
        id: 'operations-control',
        label: 'Operations control',
        owner: 'operations',
        status: controlsConnected ? 'ok' : 'degraded',
        evidence: controlsConnected
          ? 'Manual pipeline controls can reach the backend runner.'
          : 'Hosted admin can read reports, but cannot manually run automations until the bridge is connected.',
        nextStep: 'Host/connect the operations backend and set VITE_API_ORIGIN.'
      },
      {
        id: 'autopilot',
        label: 'Autopilot scheduler',
        owner: 'operations',
        status: schedulerEnabled ? 'ok' : 'degraded',
        evidence: schedulerEnabled
          ? 'Scheduler is enabled and can keep routine jobs moving.'
          : 'Scheduler is intentionally disabled until the runner is fully verified.',
        nextStep: 'Enable MPM_AUTOMATION_SCHEDULER_ENABLED=true after bridge verification.'
      }
    ]
  };
}

export function buildDataContractRows({
  automationRuns,
  getRunRecord,
  getJobDetails,
  getBusinessImpact
}) {
  return siteAutomationRegistry.map((job) => {
    const run = getRunRecord(automationRuns, job.id);
    const consumers = [
      ...(job.blocks || []).map((blockedId) => getJobDetails(blockedId)?.label || blockedId),
      ...Object.entries(siteAutomationSections)
        .filter(([, jobIds]) => jobIds.includes(job.id))
        .map(([sectionKey]) => `${sectionKey.charAt(0).toUpperCase()}${sectionKey.slice(1)} dashboard`)
    ];

    return {
      ...job,
      run,
      status: run?.lastStatus || 'missing',
      consumers: [...new Set(consumers)],
      contract: getBusinessImpact(job.id)
    };
  });
}

export function describeSourceType(source) {
  if (!source || source.configured === false || source.type === 'missing') return 'Missing source';
  if (source.type === 'file') return 'Local file';
  if (source.type === 'remote') return 'Remote feed';
  return 'Unknown source';
}

export function describeSourceControlModel(source) {
  if (!source || source.configured === false || source.type === 'missing') return 'Unconfigured';
  if (source.type === 'file') return 'Managed locally';
  if (source.type === 'remote') {
    const url = String(source.url || '').toLowerCase();
    if (url.includes('githubusercontent') || url.includes('github.com')) return 'External raw feed';
    if (url.includes('local-backfill')) return 'Local pipeline bridge';
    return 'External API';
  }
  return 'Unknown';
}

export function buildSourceGovernanceRows(sections) {
  const catalogEntries = Array.isArray(sections?.catalogs?.entries) ? sections.catalogs.entries : [];
  const imageEntries = Array.isArray(sections?.images?.entries) ? sections.images.entries : [];
  const readinessEntries = Array.isArray(sections?.readiness?.entries) ? sections.readiness.entries : [];
  const imageMap = new Map(imageEntries.map((entry) => [entry.game, entry]));
  const readinessMap = new Map(readinessEntries.map((entry) => [entry.game, entry]));

  return catalogEntries.map((entry) => {
    const source = entry?.source || { configured: false, type: 'missing' };
    const imageEntry = imageMap.get(entry.game) || null;
    const readinessEntry = readinessMap.get(entry.game) || null;
    const sourceReady = source.type === 'remote' || (source.type === 'file' && source.exists);
    const feeds = ['Catalog'];

    if (imageEntry) feeds.push('Images');
    if (readinessEntry) feeds.push('Readiness');

    return {
      game: entry.game,
      status: sourceReady ? 'ok' : 'missing',
      sourceType: describeSourceType(source),
      controlModel: describeSourceControlModel(source),
      upstream: source.path || source.url || source.envVar || 'Not configured',
      feeds,
      cards: Number(entry?.cards?.count || 0),
      sets: Number(entry?.sets?.count || 0),
      nextRisk: !sourceReady
        ? 'This game cannot refresh cleanly until its source is configured and reachable.'
        : source.type === 'file'
          ? 'Local source file must stay present before backfill/catalog/image jobs run.'
          : 'External provider drift, schema changes, or rate limits can disrupt refreshes.'
    };
  });
}

export function buildCapabilityConfidenceRows({
  sections,
  automationRuns,
  controlStatus,
  buildSourceGovernanceRowsImpl,
  buildServiceLevelRows,
  formatDate
}) {
  const sourceRows = buildSourceGovernanceRowsImpl(sections);
  const serviceRows = buildServiceLevelRows(automationRuns, controlStatus);
  const serviceRowMap = new Map(serviceRows.map((row) => [row.id, row]));
  const sectionStatus = (sectionKey) => String(sections?.[sectionKey]?.status || sections?.[sectionKey]?.overallStatus || 'missing').toLowerCase();

  const capabilityConfig = [
    { id: 'catalog', label: 'Catalog', sectionKey: 'catalogs', sourceFeed: 'Catalog', jobs: ['card-backfill-refresh', 'catalog-refresh'] },
    { id: 'images', label: 'Images', sectionKey: 'images', sourceFeed: 'Images', jobs: ['image-repair-sync'] },
    { id: 'pricing', label: 'Pricing', sectionKey: 'pricing', sourceFeed: null, jobs: ['pricing-refresh'] },
    { id: 'homepage', label: 'Homepage', sectionKey: 'homepage', sourceFeed: null, jobs: ['homepage-upcoming-releases'] },
    { id: 'readiness', label: 'Readiness', sectionKey: 'readiness', sourceFeed: 'Readiness', jobs: ['system-health-report'] }
  ];

  return capabilityConfig.map((capability) => {
    const relatedSources = capability.sourceFeed
      ? sourceRows.filter((row) => row.feeds.includes(capability.sourceFeed))
      : [];
    const relatedJobs = capability.jobs
      .map((jobId) => serviceRowMap.get(jobId))
      .filter(Boolean);
    const sourcesMissing = relatedSources.filter((row) => row.status !== 'ok');
    const section = sectionStatus(capability.sectionKey);
    const runStatuses = relatedJobs.map((row) => row.status);
    const hasMissing = section === 'missing' || sourcesMissing.length > 0 || runStatuses.some((status) => status === 'missing' || status === 'failed');
    const hasWatch = section === 'degraded' || runStatuses.some((status) => status === 'stale' || status === 'running');
    const status = hasMissing ? 'missing' : hasWatch ? 'stale' : 'ok';
    const proofLabel = status === 'ok' ? 'trusted' : status === 'stale' ? 'watching' : 'unproven';
    const freshestRun = relatedJobs
      .map((row) => row.run?.lastSucceededAt || null)
      .filter(Boolean)
      .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] || null;

    return {
      ...capability,
      status,
      proofLabel,
      section,
      sourceCoverage: relatedSources.length,
      missingSources: sourcesMissing.length,
      jobsHealthy: relatedJobs.filter((row) => row.status === 'ok').length,
      totalJobs: relatedJobs.length,
      freshestRun,
      evidence: status === 'ok'
        ? `Section is green, ${relatedJobs.length}/${Math.max(relatedJobs.length, 1)} linked jobs are within SLA, and the latest proof was ${formatDate(freshestRun)}.`
        : status === 'stale'
          ? 'Capability is alive but not yet fully trustworthy. At least one linked job is stale/running or the section is degraded.'
          : 'Capability is not yet trustworthy. A required source, section, or linked job is missing or failed.',
      nextStep: status === 'ok'
        ? 'No action needed beyond routine scheduled runs.'
        : status === 'stale'
          ? `Stabilize ${capability.label.toLowerCase()} by rerunning the linked pipeline chain and confirming the section returns to green.`
          : `Repair upstream dependencies for ${capability.label.toLowerCase()} before treating this capability as launch-ready.`
    };
  });
}
