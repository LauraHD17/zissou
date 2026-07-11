// Active alarm registry. One alarm at a time keeps the UI honest — if multiple
// conditions trip simultaneously (anchor drag + MOB), the most recent wins
// and the older one is still queryable via state. v1: anchor only; MOB will
// register here too.

import { defineMemoryStore } from '../storage/localStore';

export type AlarmKind = 'anchor-drag' | 'mob' | 'anchorage-drying' | 'hazard-proximity';

export interface ActiveAlarm {
  kind: AlarmKind;
  message: string;
  raisedAt: number;
  acknowledged: boolean;
}

// Ephemeral — alarms must not re-arm on page reload.
const alarmStore = defineMemoryStore<ActiveAlarm | null>(null);

export function useActiveAlarm() {
  return alarmStore.use();
}

export function readActiveAlarm(): ActiveAlarm | null {
  return alarmStore.read();
}

export function raiseAlarm(input: { kind: AlarmKind; message: string }): void {
  const { kind, message } = input;
  const current = alarmStore.read();
  if (current && current.kind === kind) {
    // Same episode — refresh the message (distance may have changed) but
    // preserve acknowledged/raisedAt, otherwise watches that re-raise every
    // tick would resurrect an acknowledged alarm one second after the
    // operator dismissed it. A new episode starts only after the owning
    // watch clears the alarm (condition went false).
    alarmStore.set({ ...current, message });
    return;
  }
  alarmStore.set({ kind, message, raisedAt: Date.now(), acknowledged: false });
}

export function acknowledgeAlarm(): void {
  alarmStore.update((prev) => (prev ? { ...prev, acknowledged: true } : prev));
}

export function clearAlarm(): void {
  alarmStore.set(null);
}
