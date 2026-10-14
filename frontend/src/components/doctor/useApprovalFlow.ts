import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Shared state for an explicit approval dialog. "done" is only reached after the API call resolves,
 * a second trigger is ignored while one is running, and a failure leaves the record untouched.
 */
export function useApprovalFlow(open: boolean, key: string | undefined, run: () => Promise<void>) {
  const [stage, setStage] = useState<'review' | 'done'>('review');
  const [working, setWorking] = useState(false);
  const [failed, setFailed] = useState(false);
  const inFlight = useRef(false);

  useEffect(() => {
    if (open) {
      setStage('review');
      setWorking(false);
      setFailed(false);
      inFlight.current = false;
    }
  }, [open, key]);

  const approve = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setWorking(true);
    setFailed(false);
    try {
      await run();
      setStage('done');
    } catch {
      setFailed(true);
      inFlight.current = false;
    } finally {
      setWorking(false);
    }
  }, [run]);

  return { stage, working, failed, approve };
}
