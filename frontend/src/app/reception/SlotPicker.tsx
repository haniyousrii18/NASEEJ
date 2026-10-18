import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useRequest } from '../api.js';
import { useA } from '../useA.js';

export interface Slot {
  start_time: string;
  end_time: string;
  available: boolean;
}

interface Availability {
  working: boolean;
  slots: Slot[];
}

/**
 * The free slots of one doctor on one day, as confirmed by the server. `reloadKey` forces a refetch (after a
 * booking was refused because someone else took the slot first). `preferredTime` is selected once, when it is free.
 */
export const SlotPicker: React.FC<{
  doctorId: string;
  date: string;
  value: Slot | null;
  onChange: (slot: Slot | null) => void;
  reloadKey?: number;
  preferredTime?: string;
}> = ({ doctorId, date, value, onChange, reloadKey = 0, preferredTime }) => {
  const A = useA();
  const B = A.reception.book;
  const request = useRequest();
  const [data, setData] = useState<Availability | null>(null);
  const [loading, setLoading] = useState(false);
  const seq = useRef(0);
  const preferred = useRef(preferredTime);
  const change = useRef(onChange);
  change.current = onChange;

  const load = useCallback(async () => {
    if (!doctorId) return setData(null);
    const mine = ++seq.current;
    setLoading(true);
    change.current(null);
    const res = await request<Availability>(`/api/appointments/availability?clinicianId=${doctorId}&date=${date}`);
    if (mine !== seq.current) return;
    setLoading(false);
    setData(res.ok ? res.data : null);
    if (res.ok && preferred.current) {
      const hit = res.data.slots.find((s) => s.start_time === preferred.current && s.available);
      preferred.current = undefined;
      if (hit) change.current(hit);
    }
  }, [doctorId, date, request]);

  useEffect(() => {
    void load();
    return () => {
      seq.current += 1;
    };
  }, [load, reloadKey]);

  return (
    <fieldset className="na-fieldset">
      <legend className="na-label">{B.slots}</legend>
      {loading && <p className="na-muted">{B.loading}</p>}
      {!loading && data && !data.working && <p className="na-muted">{B.notWorking}</p>}
      {!loading && data && data.working && data.slots.length === 0 && <p className="na-muted">{B.noSlots}</p>}
      <div className="na-chips" role="group" aria-label={B.slots}>
        {data?.slots.map((s) => (
          <button
            key={s.start_time}
            type="button"
            aria-pressed={value?.start_time === s.start_time}
            className="na-chip na-ltr"
            disabled={!s.available}
            title={s.available ? undefined : B.taken}
            onClick={() => onChange(s)}
          >
            {s.start_time}
          </button>
        ))}
      </div>
    </fieldset>
  );
};
