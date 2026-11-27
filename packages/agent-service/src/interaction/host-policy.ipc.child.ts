import { HostApprovalPolicies } from './host-policy.ts';

const policies = new HostApprovalPolicies();

const run = async (): Promise<void> => {
  const mode = await policies.mode({ sessionId: 'session-1', directory: '/repo' });
  if (mode !== 'safety') throw new Error(`unexpected mode ${mode}`);
  const verdict = await policies.evaluate({
    sessionId: 'session-1',
    approval: {
      approvalId: 'approval-1', sessionId: 'session-1', turnId: 'turn-1', toolCallId: 'call-1',
      toolName: 'bash', actionType: 'bash_command', commandSummary: 'rm -rf build',
      details: { command: 'rm -rf build' }, status: 'pending', version: '1',
      epoch: 'epoch-1', workerGeneration: 'worker-1', requestedAt: 1,
    },
  });
  if (verdict !== 'accept') throw new Error(`unexpected verdict ${verdict}`);
};

process.send?.({ type: 'ready' });
run()
  .then(() => { policies.close(); process.exit(0); })
  .catch(() => { policies.close(); process.exit(1); });
