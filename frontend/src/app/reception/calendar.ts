import { addDays } from '../format.js';
import type { Language } from '../../i18n/translations.js';

/** Pure calendar helpers for the reception schedule. Dates are "YYYY-MM-DD", times "HH:MM". */

export interface ScheduleWindow {
  clinician_id: string;
  day_of_week: number; // 0 = Sunday
  start_time: string;
  end_time: string;
  slot_duration_minutes: number;
}

const pad = (n: number) => String(n).padStart(2, '0');
const minutesOf = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const clock = (min: number) => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;

/** 0 = Sunday, like Date#getDay and the server's day_of_week. */
export const weekdayOf = (iso: string) => new Date(`${iso}T00:00:00`).getDay();

/** The first day of the week: Saturday in Arabic (Egypt), Monday otherwise. */
export const firstDayOf = (lang: Language) => (lang === 'ar' ? 6 : 1);

export function weekStart(iso: string, firstDay: number): string {
  return addDays(iso, -((weekdayOf(iso) - firstDay + 7) % 7));
}

export const weekDays = (iso: string, firstDay: number): string[] => {
  const start = weekStart(iso, firstDay);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
};

export function monthBounds(iso: string): { from: string; to: string } {
  const [y, m] = iso.split('-').map(Number);
  return { from: `${y}-${pad(m)}-01`, to: `${y}-${pad(m)}-${pad(new Date(y, m, 0).getDate())}` };
}

/** The first day of the month `n` months from `iso`'s month. */
export function shiftMonth(iso: string, n: number): string {
  const [y, m] = iso.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`;
}

/** Weeks of a month as rows of seven cells; days outside the month are null. */
export function monthWeeks(iso: string, firstDay: number): Array<Array<string | null>> {
  const { from, to } = monthBounds(iso);
  const cells: Array<string | null> = Array((weekdayOf(from) - firstDay + 7) % 7).fill(null);
  for (let d = from; d <= to; d = addDays(d, 1)) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  return Array.from({ length: cells.length / 7 }, (_, i) => cells.slice(i * 7, i * 7 + 7));
}

/** The working windows of one doctor on one weekday. */
export const windowsFor = (all: ScheduleWindow[], clinicianId: string, dow: number) =>
  all.filter((w) => w.clinician_id === clinicianId && w.day_of_week === dow);

/** Every slot start the windows produce, "HH:MM". */
export function slotStarts(windows: ScheduleWindow[]): string[] {
  const out: string[] = [];
  for (const w of windows) {
    const step = Math.max(5, Number(w.slot_duration_minutes) || 30);
    for (let m = minutesOf(w.start_time); m + step <= minutesOf(w.end_time); m += step) out.push(clock(m));
  }
  return out;
}

export const covers = (windows: ScheduleWindow[], time: string) =>
  windows.some((w) => w.start_time.slice(0, 5) <= time && time < w.end_time.slice(0, 5));

/** Sorted, de-duplicated row times: the slots doctors work plus any time that already holds a booking. */
export function timeRows(windows: ScheduleWindow[], bookedTimes: string[]): string[] {
  return [...new Set([...slotStarts(windows), ...bookedTimes.map((t) => t.slice(0, 5))])].sort();
}
