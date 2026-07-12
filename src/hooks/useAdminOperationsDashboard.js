import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { backend } from '@/services/backend';
import * as adminOperationsModel from '@/services/admin/adminOperationsModel';
import { buildAdminOperationsDashboardState } from '@/services/admin/adminOperationsDashboardService';

export function useAdminOperationsDashboard() {
  const [, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lastManualRefreshAt, setLastManualRefreshAt] = useState(null);
  const [manualRefreshPending, setManualRefreshPending] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);

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
    queryKey: ['admin-operations-health', refreshTick],
    queryFn: () => backend.app.getHealthStatus(),
    enabled: !loading,
    refetchInterval: 30000
  });

  const controlQuery = useQuery({
    queryKey: ['admin-automation-control-status', refreshTick],
    queryFn: () => backend.app.getAutomationControlStatus(),
    enabled: !loading,
    refetchInterval: 10000,
    retry: false
  });

  const runJobMutation = useMutation({
    mutationFn: (jobId) => backend.app.runAutomationJob(jobId),
    onSuccess: (payload, jobId) => {
      const job = adminOperationsModel.getJobDetails(jobId);
      toast.success(`${job?.label || 'Pipeline'} started`);
      controlQuery.refetch();
      healthQuery.refetch({ cancelRefetch: false });
      window.setTimeout(() => {
        controlQuery.refetch();
        healthQuery.refetch({ cancelRefetch: false });
      }, 3000);
    },
    onError: (error) => {
      toast.error(error?.message || 'Failed to start pipeline');
      controlQuery.refetch();
    }
  });

  const systemHealth = healthQuery.data?.systemHealth || null;
  const startingJobId = runJobMutation.isPending ? runJobMutation.variables : null;

  const {
    sections,
    generatedAt,
    automationRuns,
    controlStatus,
    serviceLevelRows,
    launchReadiness,
    sourceGovernanceRows,
    dataContractRows,
    capabilityConfidenceRows,
    operationIncidents,
    controlPlaneRows,
    runnerAuditSummary,
    recoveryPlaybook,
    dashboardAreas,
    summary,
    targetSummary,
    displayLastCheckedAt
  } = useMemo(() => buildAdminOperationsDashboardState({
    systemHealth,
    controlQuery: {
      data: controlQuery.data,
      dataUpdatedAt: controlQuery.dataUpdatedAt,
      healthDataUpdatedAt: healthQuery.dataUpdatedAt,
      isError: controlQuery.isError,
      error: controlQuery.error
    },
    lastManualRefreshAt
  }), [
    systemHealth,
    controlQuery.data,
    controlQuery.dataUpdatedAt,
    controlQuery.error,
    controlQuery.isError,
    healthQuery.dataUpdatedAt,
    lastManualRefreshAt
  ]);

  const handleRefresh = async () => {
    const previousGeneratedAt = generatedAt;
    setManualRefreshPending(true);
    const refreshStartedAt = Date.now();
    setLastManualRefreshAt(refreshStartedAt);
    setRefreshTick((current) => current + 1);

    const [healthResult, controlResult] = await Promise.allSettled([
      healthQuery.refetch({ cancelRefetch: true }),
      controlQuery.refetch({ cancelRefetch: true })
    ]);

    setManualRefreshPending(false);

    const healthFailed = healthResult.status === 'rejected';
    const controlFailed = controlResult.status === 'rejected';

    if (healthFailed && controlFailed) {
      toast.error('Refresh failed. The dashboard could not reach either operations data source.');
      return;
    }

    const refreshedGeneratedAt = healthResult.status === 'fulfilled'
      ? (healthResult.value.data?.systemHealth?.generatedAt || null)
      : previousGeneratedAt;

    if (refreshedGeneratedAt && previousGeneratedAt && refreshedGeneratedAt === previousGeneratedAt) {
      toast.success('Dashboard rechecked successfully. The live report file has not regenerated since the previous snapshot yet.');
      return;
    }

    if (controlFailed) {
      toast.success('Health snapshot refreshed. Manual control status is still unavailable.');
      return;
    }

    toast.success('Admin Operations refreshed successfully.');
  };

  return {
    loading,
    manualRefreshPending,
    healthQuery,
    controlQuery,
    systemHealth,
    sections,
    generatedAt,
    automationRuns,
    summary,
    dashboardAreas,
    controlStatus,
    startingJobId,
    serviceLevelRows,
    launchReadiness,
    sourceGovernanceRows,
    dataContractRows,
    capabilityConfidenceRows,
    operationIncidents,
    controlPlaneRows,
    runnerAuditSummary,
    recoveryPlaybook,
    displayLastCheckedAt,
    targetSummary,
    handleRefresh,
    runJob: (jobId) => runJobMutation.mutate(jobId)
  };
}
