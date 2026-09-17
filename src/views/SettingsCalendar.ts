/**
 * SettingsCalendar — configure a Google OAuth client and connect/disconnect
 * Google Calendar. Talks to the Rust-side commands in
 * src-tauri/src/calendar_oauth.rs and src-tauri/src/calendar_api.rs.
 */

import { invoke } from '@tauri-apps/api/core';

export class SettingsCalendarPanel {
  readonly element: HTMLElement;

  private clientIdInput: HTMLInputElement;
  private clientSecretInput: HTMLInputElement;
  private statusEl: HTMLElement;
  private errorEl: HTMLElement;
  private connectBtn: HTMLButtonElement;
  private disconnectBtn: HTMLButtonElement;

  constructor() {
    this.element = document.createElement('section');
    this.element.className = 'settings-calendar';
    this.element.setAttribute('aria-label', 'Connect Google Calendar');

    const heading = document.createElement('h2');
    heading.className = 'settings-heading';
    heading.textContent = 'Google Calendar';
    this.element.appendChild(heading);

    const help = document.createElement('p');
    help.className = 'settings-help';
    help.textContent =
      'Create a "Desktop app" OAuth client in Google Cloud Console (APIs & Services > Credentials), ' +
      'enable the Google Calendar API, and paste its Client ID and Secret below.';
    this.element.appendChild(help);

    this.errorEl = document.createElement('p');
    this.errorEl.className = 'settings-error';
    this.errorEl.setAttribute('role', 'alert');
    this.element.appendChild(this.errorEl);

    this.statusEl = document.createElement('p');
    this.statusEl.className = 'calendar-status';
    this.element.appendChild(this.statusEl);

    const form = document.createElement('form');
    form.className = 'calendar-form';

    this.clientIdInput = document.createElement('input');
    this.clientIdInput.type = 'text';
    this.clientIdInput.placeholder = 'Client ID';
    this.clientIdInput.autocomplete = 'off';

    this.clientSecretInput = document.createElement('input');
    this.clientSecretInput.type = 'password';
    this.clientSecretInput.placeholder = 'Client Secret';
    this.clientSecretInput.autocomplete = 'off';

    const saveBtn = document.createElement('button');
    saveBtn.type = 'submit';
    saveBtn.textContent = 'Save Client Credentials';

    form.appendChild(this.clientIdInput);
    form.appendChild(this.clientSecretInput);
    form.appendChild(saveBtn);

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      await this.handleSaveConfig();
    });

    this.element.appendChild(form);

    const actions = document.createElement('div');
    actions.className = 'calendar-actions';

    this.connectBtn = document.createElement('button');
    this.connectBtn.type = 'button';
    this.connectBtn.textContent = 'Connect Google Calendar';
    this.connectBtn.addEventListener('click', () => void this.handleConnect());

    this.disconnectBtn = document.createElement('button');
    this.disconnectBtn.type = 'button';
    this.disconnectBtn.textContent = 'Disconnect';
    this.disconnectBtn.addEventListener('click', () => void this.handleDisconnect());

    actions.appendChild(this.connectBtn);
    actions.appendChild(this.disconnectBtn);
    this.element.appendChild(actions);

    void this.refreshStatus();
  }

  private async handleSaveConfig(): Promise<void> {
    this.errorEl.textContent = '';
    try {
      await invoke('save_calendar_client_config', {
        clientId: this.clientIdInput.value,
        clientSecret: this.clientSecretInput.value,
      });
      this.clientIdInput.value = '';
      this.clientSecretInput.value = '';
      this.statusEl.textContent = 'Client credentials saved. Click "Connect Google Calendar" next.';
    } catch (err) {
      this.errorEl.textContent = String(err);
    }
  }

  private async handleConnect(): Promise<void> {
    this.errorEl.textContent = '';
    this.connectBtn.disabled = true;
    this.connectBtn.textContent = 'Waiting for browser sign-in…';
    try {
      await invoke('start_calendar_auth');
      await this.refreshStatus();
    } catch (err) {
      this.errorEl.textContent = String(err);
    } finally {
      this.connectBtn.disabled = false;
      this.connectBtn.textContent = 'Connect Google Calendar';
    }
  }

  private async handleDisconnect(): Promise<void> {
    this.errorEl.textContent = '';
    try {
      await invoke('disconnect_calendar');
      await this.refreshStatus();
    } catch (err) {
      this.errorEl.textContent = String(err);
    }
  }

  async refreshStatus(): Promise<void> {
    try {
      const status = await invoke<{ connected: boolean }>('calendar_connection_status');
      this.statusEl.textContent = status.connected ? 'Connected.' : 'Not connected.';
      this.disconnectBtn.hidden = !status.connected;
    } catch (err) {
      this.errorEl.textContent = String(err);
    }
  }
}
