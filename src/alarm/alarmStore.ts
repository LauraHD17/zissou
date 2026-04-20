// Active alarm registry. One alarm at a time keeps the UI honest — if multiple
// conditions trip simultaneously (anchor drag + MOB), the most recent wins
// and the older one is still queryable via state. v1: anchor only; MOB will
// register here too.

import { defineMemoryStore } from '../storage/localStore';

export type AlarmKind = 'anchor-drag' | 'mob';

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

export function raiseAlarm(kind: AlarmKind, message: string): void {
  const current = alarmStore.read();
  if (current && current.kind === kind && !current.acknowledged) {
    // Already raised; just refresh the message in case the distance changed.
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
