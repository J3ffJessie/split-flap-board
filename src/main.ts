/**
 * Split-Flap Desktop — main entry point.
 * Cycles through local+API quotes and upcoming Google Calendar events.
 */

import './styles.css';
import { FlapBoard } from './components/FlapBoard.js';
import { SettingsQuotesPanel } from './views/SettingsQuotes.js';
import { SettingsThemePanel } from './views/SettingsTheme.js';
import { initTheme } from './theme/palettes.js';
import { QuoteRotation, formatForBoard } from './quotes/rotation.js';
import { SettingsDisplayPanel, loadDisplayMode, applyDisplayMode } from './views/SettingsDisplay.js';
import { SettingsCalendarPanel } from './views/SettingsCalendar.js';
import { SettingsGeneralPanel } from './views/SettingsGeneral.js';
import { fetchUpcomingEvents, findUrgentEvent, formatEventForBoard, type DisplayEvent } from './calendar/events.js';
import { invoke } from '@tauri-apps/api/core';

initTheme();
void applyDisplayMode(loadDisplayMode()).catch(() => {
  // First launch or non-Tauri preview context — window stays at its default state.
});

window.addEventListener('DOMContentLoaded', () => {
  const app = document.getElementById('app')!;

  // Create board (20 characters wide)
  const board = new FlapBoard(20);
  app.appendChild(board.element);
  app.appendChild(board.ariaRegion);

  const label = document.getElementById('current-label')!;

  // Settings panel — lazily built, toggled visible
  const settingsBtn = document.getElementById('btn-settings')!;
  const settingsPanel = document.getElementById('settings-panel')!;
  let quotesPanel: SettingsQuotesPanel | null = null;
  let themePanel: SettingsThemePanel | null = null;
  let displayPanel: SettingsDisplayPanel | null = null;
  let calendarPanel: SettingsCalendarPanel | null = null;
  let generalPanel: SettingsGeneralPanel | null = null;

  settingsBtn.addEventListener('click', () => {
    const opening = settingsPanel.hidden;
    settingsPanel.hidden = !opening;
    settingsBtn.textContent = opening ? 'Close Settings' : 'Settings';

    if (opening) {
      if (!generalPanel) {
        generalPanel = new SettingsGeneralPanel();
        settingsPanel.appendChild(generalPanel.element);
      } else {
        void generalPanel.refresh();
      }
      if (!themePanel) {
        themePanel = new SettingsThemePanel();
        settingsPanel.appendChild(themePanel.element);
      }
      if (!displayPanel) {
        displayPanel = new SettingsDisplayPanel();
        settingsPanel.appendChild(displayPanel.element);
      }
      if (!quotesPanel) {
        quotesPanel = new SettingsQuotesPanel(() => {
          rotationLoaded = false;
        });
        settingsPanel.appendChild(quotesPanel.element);
      } else {
        void quotesPanel.refresh();
      }
      if (!calendarPanel) {
        calendarPanel = new SettingsCalendarPanel();
        settingsPanel.appendChild(calendarPanel.element);
      } else {
        void calendarPanel.refreshStatus();
      }
    }
  });

  // ── Calendar events cache ───────────────────────────────────────────────
  let cachedEvents: DisplayEvent[] = [];
  let eventIndex = 0;

  /** Shows the next cached calendar event on the board. Returns null if none are cached. */
  function showNextCachedEvent(): string | null {
    if (cachedEvents.length === 0) return null;
    const event = cachedEvents[eventIndex % cachedEvents.length];
    eventIndex++;
    const text = formatEventForBoard(event);
    board.setText(text);
    label.textContent = event.is_urgent ? 'Starting soon' : 'Upcoming event';
    return text;
  }

  // ── Quotes rotation — mixes local + API quotes ──────────────────────────
  const quoteBtn = document.getElementById('btn-quote')! as HTMLButtonElement;
  const rotation = new QuoteRotation();
  let rotationLoaded = false;

  async function ensureRotationLoaded(): Promise<void> {
    if (rotationLoaded) return;
    await rotation.refresh();
    rotationLoaded = true;
  }

  /** Shows the next quote on the board. Returns null if none are available. */
  function showNextQuote(): string | null {
    const quote = rotation.next();
    if (!quote) return null;
    const text = formatForBoard(quote);
    board.setText(text);
    const offlineNote = rotation.apiOffline ? ' (offline — cached)' : '';
    label.textContent = `${quote.source === 'local' ? 'Local' : 'API'} quote${offlineNote}`;
    return text;
  }

  quoteBtn.addEventListener('click', async () => {
    await ensureRotationLoaded();
    if (showNextQuote() === null) {
      board.setText('NO QUOTES AVAILABLE');
      label.textContent = 'Add a local quote or check your connection';
    }
  });

  const eventBtn = document.getElementById('btn-event')! as HTMLButtonElement;

  eventBtn.addEventListener('click', async () => {
    await refreshCachedEvents();
    if (showNextCachedEvent() === null) {
      board.setText('NO UPCOMING EVENTS');
      label.textContent = 'Connect Google Calendar in Settings';
    }
  });

  // ── Auto-cycle ───────────────────────────────────────────────────────────
  // Alternates quotes and events, skipping whichever source is empty. Dwell
  // time scales with how much text is on the board, so a multi-row entry
  // isn't swapped out before there's been time to actually read it.
  const autoBtn = document.getElementById('btn-auto')!;
  let autoTimer: ReturnType<typeof setTimeout> | null = null;
  let autoCyclePreferQuote = true;

  const MIN_DISPLAY_MS = 30000;
  const READING_MS_PER_CHAR = 60;

  function dwellTimeFor(text: string): number {
    return MIN_DISPLAY_MS + text.trim().length * READING_MS_PER_CHAR;
  }

  /** Shows the most urgent cached event, if any. Returns null if nothing is urgent. */
  function showUrgentEventIfAny(): string | null {
    const urgent = findUrgentEvent(cachedEvents);
    if (!urgent) return null;
    const text = formatEventForBoard(urgent);
    board.setText(text);
    label.textContent = 'Starting soon';
    return text;
  }

  function showNextAutoCycleEntry(): string {
    const urgentText = showUrgentEventIfAny();
    if (urgentText !== null) return urgentText;

    autoCyclePreferQuote = !autoCyclePreferQuote;
    const primary = autoCyclePreferQuote ? showNextQuote() : showNextCachedEvent();
    if (primary !== null) return primary;
    const fallback = autoCyclePreferQuote ? showNextCachedEvent() : showNextQuote();
    if (fallback !== null) return fallback;

    board.setText('NO CONTENT AVAILABLE');
    label.textContent = 'Add a local quote or connect Google Calendar in Settings';
    return 'NO CONTENT AVAILABLE';
  }

  function scheduleNextAutoCycle(): void {
    const shown = showNextAutoCycleEntry();
    autoTimer = setTimeout(scheduleNextAutoCycle, dwellTimeFor(shown));
  }

  autoBtn.addEventListener('click', async () => {
    if (autoTimer) {
      clearTimeout(autoTimer);
      autoTimer = null;
      autoBtn.textContent = 'Start Auto-Cycle';
    } else {
      await ensureRotationLoaded();
      scheduleNextAutoCycle();
      autoBtn.textContent = 'Stop Auto-Cycle';
    }
  });

  // ── Background event polling — preempts the board on its own ───────────
  // Runs regardless of auto-cycle state: as soon as a poll detects an
  // urgent event, it goes straight to the board. If auto-cycle is running,
  // its pending timer is restarted so the newly-shown event gets its own
  // full dwell time instead of being cut short by an already-scheduled tick.
  async function refreshCachedEvents(): Promise<void> {
    try {
      const status = await invoke<{ connected: boolean }>('calendar_connection_status');
      cachedEvents = status.connected ? (await fetchUpcomingEvents()).events : [];

      const urgentText = showUrgentEventIfAny();
      if (urgentText !== null && autoTimer) {
        clearTimeout(autoTimer);
        autoTimer = setTimeout(scheduleNextAutoCycle, dwellTimeFor(urgentText));
      }
    } catch {
      // Not configured, offline, or the token needs re-auth — keep showing
      // whatever was cached rather than erroring the whole board.
    }
  }

  void refreshCachedEvents();
  setInterval(() => void refreshCachedEvents(), 60_000);

  // Show initial content
  void (async () => {
    await ensureRotationLoaded();
    if (showNextQuote() === null && showNextCachedEvent() === null) {
      board.setText('SPLIT-FLAP DISPLAY');
      label.textContent = 'Add a local quote or connect Google Calendar in Settings';
    }
  })();
});
