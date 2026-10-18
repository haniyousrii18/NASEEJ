import { describe, expect, it } from 'vitest';
import { covers, monthBounds, monthWeeks, shiftMonth, slotStarts, timeRows, weekDays, weekStart, windowsFor, type ScheduleWindow } from '../src/app/reception/calendar.js';

const SAT = 6;
const MON = 1;
const win = (over: Partial<ScheduleWindow> = {}): ScheduleWindow => ({
  clinician_id: 'd1',
  day_of_week: 5,
  start_time: '09:00:00',
  end_time: '11:00:00',
  slot_duration_minutes: 30,
  ...over,
});

describe('week and month helpers', () => {
  it('starts the week on the chosen day', () => {
    // 2026-10-16 is a Friday.
    expect(weekStart('2026-10-16', SAT)).toBe('2026-10-10');
    expect(weekStart('2026-10-16', MON)).toBe('2026-10-12');
    expect(weekStart('2026-10-10', SAT)).toBe('2026-10-10');
    expect(weekDays('2026-10-16', MON)).toEqual(['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18']);
  });

  it('bounds and shifts months, including leap years and year ends', () => {
    expect(monthBounds('2026-10-16')).toEqual({ from: '2026-10-01', to: '2026-10-31' });
    expect(monthBounds('2028-02-10')).toEqual({ from: '2028-02-01', to: '2028-02-29' });
    expect(shiftMonth('2026-12-15', 1)).toBe('2027-01-01');
    expect(shiftMonth('2026-01-31', -1)).toBe('2025-12-01');
  });

  it('lays a month out in full weeks with padding outside the month', () => {
    const weeks = monthWeeks('2026-10-16', MON); // 1 Oct 2026 is a Thursday
    expect(weeks.every((w) => w.length === 7)).toBe(true);
    expect(weeks[0].slice(0, 3)).toEqual([null, null, null]);
    expect(weeks[0][3]).toBe('2026-10-01');
    expect(weeks.flat().filter(Boolean)).toHaveLength(31);
    const last = weeks[weeks.length - 1];
    expect(last[last.length - 1]).toBeNull();
  });
});

describe('schedule slots', () => {
  it('derives slot starts from windows and their slot length', () => {
    expect(slotStarts([win()])).toEqual(['09:00', '09:30', '10:00', '10:30']);
    expect(slotStarts([win({ start_time: '09:00', end_time: '09:50', slot_duration_minutes: 20 })])).toEqual(['09:00', '09:20']);
  });

  it('knows which times a doctor works', () => {
    const windows = [win(), win({ start_time: '13:00', end_time: '14:00' })];
    expect(covers(windows, '10:30')).toBe(true);
    expect(covers(windows, '11:00')).toBe(false);
    expect(covers(windows, '13:00')).toBe(true);
  });

  it('filters windows by doctor and weekday', () => {
    const all = [win(), win({ clinician_id: 'd2' }), win({ day_of_week: 1 })];
    expect(windowsFor(all, 'd1', 5)).toHaveLength(1);
  });

  it('keeps a booking that sits outside the working slots visible as its own row', () => {
    expect(timeRows([win()], ['10:00:00', '12:15:00'])).toEqual(['09:00', '09:30', '10:00', '10:30', '12:15']);
  });
});
