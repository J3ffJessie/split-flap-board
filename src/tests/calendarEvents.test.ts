import { describe, expect, it } from 'vitest';
import { findUrgentEvent, formatEventForBoard, type DisplayEvent } from '../calendar/events.js';

function makeEvent(overrides: Partial<DisplayEvent> = {}): DisplayEvent {
  return {
    summary: 'Standup',
    start: '2024-06-01T09:00:00Z',
    end: '2024-06-01T09:30:00Z',
    all_day: false,
    is_urgent: false,
    start_local: '09:00',
    ...overrides,
  };
}

describe('formatEventForBoard', () => {
  it('prefixes timed events with the local start time', () => {
    expect(formatEventForBoard(makeEvent())).toBe('09:00 Standup');
  });

  it('omits the time for all-day events', () => {
    expect(formatEventForBoard(makeEvent({ all_day: true, summary: 'Holiday' }))).toBe('Holiday');
  });
});

describe('findUrgentEvent', () => {
  it('returns null when nothing is urgent', () => {
    const events = [makeEvent({ is_urgent: false }), makeEvent({ is_urgent: false })];
    expect(findUrgentEvent(events)).toBeNull();
  });

  it('returns the first urgent event', () => {
    const urgent = makeEvent({ is_urgent: true, summary: 'Urgent one' });
    const events = [makeEvent({ is_urgent: false }), urgent, makeEvent({ is_urgent: true, summary: 'Urgent two' })];
    expect(findUrgentEvent(events)).toBe(urgent);
  });

  it('returns null for an empty list', () => {
    expect(findUrgentEvent([])).toBeNull();
  });
});
