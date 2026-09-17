/**
 * Calendar events — fetches upcoming Google Calendar events (via the Rust
 * `fetch_calendar_events` command) and picks out which one, if any, should
 * preempt the board right now.
 */

import { invoke } from '@tauri-apps/api/core';

export interface DisplayEvent {
  summary: string;
  start: string;
  end: string;
  all_day: boolean;
  is_urgent: boolean;
  start_local: string;
}

export interface CalendarEventsResult {
  events: DisplayEvent[];
  from_cache: boolean;
}

/** Resolves the IANA zone Rust needs to re-derive the correct UTC offset per
 * event — read fresh on every call so a system timezone change takes effect
 * on the next fetch, with no restart and no cached zone to go stale. */
export function resolveLocalTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return 'UTC';
  }
}

export async function fetchUpcomingEvents(): Promise<CalendarEventsResult> {
  return invoke<CalendarEventsResult>('fetch_calendar_events', { tzName: resolveLocalTimeZone() });
}

export function formatEventForBoard(event: DisplayEvent): string {
  return event.all_day ? event.summary : `${event.start_local} ${event.summary}`;
}

/** The first urgent (starting soon or in-progress) event, or null. Events
 * arrive pre-sorted by start time, so the first match is also the soonest. */
export function findUrgentEvent(events: DisplayEvent[]): DisplayEvent | null {
  return events.find((e) => e.is_urgent) ?? null;
}
