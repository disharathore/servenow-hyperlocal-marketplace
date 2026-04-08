'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { addMonths, eachDayOfInterval, endOfMonth, format, isValid, startOfMonth, startOfWeek, endOfWeek } from 'date-fns';
import AppWrapperLayout from '@/app/_components/AppWrapperLayout';
import { workerApi } from '@/lib/api';
import { useAuthStore } from '@/lib/store';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const TIME_OPTIONS = [
  '06:00', '07:00', '08:00', '09:00', '10:00', '11:00', '12:00',
  '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00',
];

interface WeeklySlot {
  day_of_week: number;
  start_time: string;
  end_time: string;
}

interface BlockedSlot {
  id: string;
  date: string;
  time_slot: string;
}

export default function WorkerAvailabilityPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const [month, setMonth] = useState(new Date());
  const [slots, setSlots] = useState<WeeklySlot[]>([]);
  const [blocked, setBlocked] = useState<BlockedSlot[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [selectedSlot, setSelectedSlot] = useState('09:00-12:00');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user) {
      router.push('/login');
      return;
    }
    if (user.role !== 'worker') {
      router.push('/');
      return;
    }
    if (!user.worker_profile_id) {
      router.push('/worker/setup');
      return;
    }

    workerApi.getAvailability()
      .then((res) => {
        const recurring = (res.data?.recurring || []) as WeeklySlot[];
        const blockedSlots = (res.data?.blocked || []) as BlockedSlot[];
        setSlots(recurring.map((x) => ({ ...x, start_time: String(x.start_time).slice(0, 5), end_time: String(x.end_time).slice(0, 5) })));
        setBlocked(blockedSlots);
      })
      .catch(() => setError('Could not load availability right now.'));
  }, [user, router]);

  const calendarDays = useMemo(() => {
    const first = startOfWeek(startOfMonth(month), { weekStartsOn: 0 });
    const last = endOfWeek(endOfMonth(month), { weekStartsOn: 0 });
    return eachDayOfInterval({ start: first, end: last });
  }, [month]);

  const slotOptionsForDate = useMemo(() => {
    const targetDow = new Date(`${selectedDate}T00:00:00`).getDay();
    return slots
      .filter((s) => s.day_of_week === targetDow)
      .map((s) => `${s.start_time}-${s.end_time}`);
  }, [slots, selectedDate]);

  function formatBlockedDate(value: string) {
    const normalized = String(value || '').slice(0, 10);
    const date = new Date(`${normalized}T00:00:00`);
    if (!normalized || !isValid(date)) return 'Invalid date';
    return format(date, 'EEE, dd MMM yyyy');
  }

  async function saveRecurringAvailability() {
    setError('');
    setLoading(true);
    try {
      if (!slots.length) {
        setError('Please keep at least one weekly slot.');
        return;
      }
      await workerApi.updateAvailability(slots);
    } catch {
      setError('Could not save weekly availability.');
    } finally {
      setLoading(false);
    }
  }

  async function addBlockedSlot() {
    setError('');
    setLoading(true);
    try {
      const res = await workerApi.addBlockedSlot(selectedDate, selectedSlot);
      setBlocked((prev) => [res.data as BlockedSlot, ...prev]);
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(message || 'Could not block this slot.');
    } finally {
      setLoading(false);
    }
  }

  async function removeBlockedSlot(id: string) {
    setLoading(true);
    try {
      await workerApi.removeBlockedSlot(id);
      setBlocked((prev) => prev.filter((b) => b.id !== id));
    } catch {
      setError('Could not remove blocked slot.');
    } finally {
      setLoading(false);
    }
  }

  function addWeeklySlot(day: number) {
    setSlots((prev) => [...prev, { day_of_week: day, start_time: '09:00', end_time: '12:00' }]);
  }

  function updateWeeklySlot(idx: number, patch: Partial<WeeklySlot>) {
    setSlots((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  }

  function removeWeeklySlot(idx: number) {
    setSlots((prev) => prev.filter((_, i) => i !== idx));
  }

  return (
    <AppWrapperLayout>
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Set Availability</h1>
            <p className="text-sm text-gray-500">Define weekly slots and block specific date/time slots.</p>
          </div>
          <button type="button" onClick={saveRecurringAvailability} disabled={loading} className="btn-primary">
            {loading ? 'Saving...' : 'Save Weekly Slots'}
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <section className="card p-4 space-y-3">
            <h2 className="font-semibold text-gray-900">Weekly availability</h2>
            {slots.map((slot, idx) => (
              <div key={`${slot.day_of_week}-${idx}`} className="grid grid-cols-12 gap-2 items-center">
                <select className="input col-span-4" value={slot.day_of_week} onChange={(e) => updateWeeklySlot(idx, { day_of_week: Number(e.target.value) })}>
                  {DAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
                </select>
                <select className="input col-span-3" value={slot.start_time} onChange={(e) => updateWeeklySlot(idx, { start_time: e.target.value })}>
                  {TIME_OPTIONS.map((t) => <option key={t}>{t}</option>)}
                </select>
                <select className="input col-span-3" value={slot.end_time} onChange={(e) => updateWeeklySlot(idx, { end_time: e.target.value })}>
                  {TIME_OPTIONS.map((t) => <option key={t}>{t}</option>)}
                </select>
                <button type="button" className="col-span-2 text-red-600 text-sm" onClick={() => removeWeeklySlot(idx)}>Remove</button>
              </div>
            ))}
            <div className="flex flex-wrap gap-2 pt-2">
              {DAYS.map((d, i) => (
                <button key={d} type="button" className="text-xs px-2 py-1 rounded border border-gray-200 hover:border-blue-400" onClick={() => addWeeklySlot(i)}>
                  + {d}
                </button>
              ))}
            </div>
          </section>

          <section className="card p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-gray-900">Calendar</h2>
              <div className="flex gap-2">
                <button type="button" className="btn-secondary text-sm" onClick={() => setMonth((m) => addMonths(m, -1))}>Prev</button>
                <button type="button" className="btn-secondary text-sm" onClick={() => setMonth((m) => addMonths(m, 1))}>Next</button>
              </div>
            </div>
            <p className="text-sm font-medium text-gray-700">{format(month, 'MMMM yyyy')}</p>
            <div className="grid grid-cols-7 gap-1 text-xs text-center text-gray-500">
              {DAYS.map((d) => <div key={d} className="py-1">{d}</div>)}
              {calendarDays.map((d) => {
                const value = format(d, 'yyyy-MM-dd');
                const isSelected = value === selectedDate;
                const inCurrent = d.getMonth() === month.getMonth();
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setSelectedDate(value)}
                    className={`py-2 rounded ${isSelected ? 'bg-blue-600 text-white' : inCurrent ? 'bg-gray-50 text-gray-700 hover:bg-blue-50' : 'text-gray-300 bg-gray-50'}`}
                  >
                    {format(d, 'd')}
                  </button>
                );
              })}
            </div>

            <div className="border-t pt-3 space-y-2">
              <label className="block text-sm text-gray-600">Selected date</label>
              <input className="input" type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} />
              <label className="block text-sm text-gray-600">Time slot</label>
              <select className="input" value={selectedSlot} onChange={(e) => setSelectedSlot(e.target.value)}>
                {(slotOptionsForDate.length ? slotOptionsForDate : ['09:00-12:00']).map((s) => <option key={s}>{s}</option>)}
              </select>
              <button type="button" className="btn-primary w-full" disabled={loading} onClick={addBlockedSlot}>
                Block Selected Slot
              </button>
            </div>
          </section>
        </div>

        <section className="card p-4">
          <h2 className="font-semibold text-gray-900 mb-3">Blocked slots</h2>
          {blocked.length === 0 ? (
            <p className="text-sm text-gray-500">No blocked slots yet.</p>
          ) : (
            <div className="space-y-2">
              {blocked.map((b) => (
                <div key={b.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                  <p className="text-sm text-gray-700">{formatBlockedDate(b.date)} · {b.time_slot || 'All day'}</p>
                  <button type="button" className="text-sm text-red-600" onClick={() => removeBlockedSlot(b.id)}>Remove</button>
                </div>
              ))}
            </div>
          )}
        </section>

        {error && <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-red-600 text-sm">{error}</div>}
      </div>
    </AppWrapperLayout>
  );
}
