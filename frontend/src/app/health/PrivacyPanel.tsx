import React, { useState } from 'react';
import { useApiData, useMutation } from '../api.js';
import { Button, Notice, Pill } from '../ui.js';
import { useA } from '../useA.js';

/** Privacy controls for the patient-owned record: the assistant switch, a way to the share list and the deleted documents. */
export const PrivacySection: React.FC<{ navigate: (route: string) => void }> = ({ navigate }) => {
  const A = useA();
  const P = A.health.privacy;
  const status = useApiData<{ configured: boolean; consent: boolean; provider: string | null }>('/api/assistant/status');
  const { run, pending } = useMutation();
  const [override, setOverride] = useState<boolean | null>(null);
  const [failed, setFailed] = useState(false);

  const st = status.state.status === 'ready' ? status.state.data : null;
  const on = override ?? !!st?.consent;

  const toggle = async () => {
    setFailed(false);
    const res = await run('/api/assistant/consent', 'POST', { allowed: !on });
    if (res.ok) setOverride(!on);
    else setFailed(true);
  };

  return (
    <div className="na-stack">
      <div className="na-stack">
        <div className="na-row na-row--between">
          <strong>{P.assistantTitle}</strong>
          <Pill tone={st?.configured ? (on ? 'ok' : 'neutral') : 'neutral'}>{!st?.configured ? P.assistantUnavailable : on ? P.turnOn : P.turnOff}</Pill>
        </div>
        <p className="na-muted">{!st?.configured ? P.assistantUnavailable : on ? P.assistantOn : P.assistantOff}</p>
        {st?.configured && (
          <div>
            <Button small variant={on ? 'quiet' : 'primary'} onClick={() => void toggle()} disabled={pending}>
              {on ? P.turnOff : P.turnOn}
            </Button>
          </div>
        )}
        {failed && (
          <Notice tone="danger" icon="alert" live>
            {A.health.common.failed}
          </Notice>
        )}
      </div>
      <div className="na-stack">
        <strong>{P.sharesTitle}</strong>
        <p className="na-muted">{P.sharesBody}</p>
        <div>
          <Button small onClick={() => navigate('patient/sharing')}>
            {P.openShares}
          </Button>
        </div>
      </div>
      <div className="na-stack">
        <strong>{P.trashTitle}</strong>
        <p className="na-muted">{P.trashBody}</p>
        <div>
          <Button small onClick={() => navigate('patient/documents?trash=1')}>
            {P.openTrash}
          </Button>
        </div>
      </div>
      <div className="na-stack">
        <strong>{P.storageTitle}</strong>
        <p className="na-muted">{P.storageBody}</p>
      </div>
    </div>
  );
};
