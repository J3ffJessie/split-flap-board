/**
 * SettingsQuotes — panel for managing the user's local quote list.
 * Talks to the Rust-side CRUD commands in src-tauri/src/quotes.rs.
 */

import { invoke } from '@tauri-apps/api/core';
import { parseBulkQuotes } from '../quotes/parseBulk.js';

export interface LocalQuote {
  id: string;
  text: string;
  author: string | null;
}

interface BulkAddResult {
  added: LocalQuote[];
  skipped: number;
}

export class SettingsQuotesPanel {
  readonly element: HTMLElement;

  private listEl: HTMLElement;
  private textInput: HTMLTextAreaElement;
  private authorInput: HTMLInputElement;
  private errorEl: HTMLElement;
  private editingId: string | null = null;
  private onQuotesChanged?: () => void;

  /** `onQuotesChanged` fires after any add/edit/delete/bulk-import so the
   * caller can invalidate its own cached quote rotation — without it, the
   * board's "Next Quote"/auto-cycle rotation only loads the local quote
   * list once and never notices changes made here until the app restarts. */
  constructor(onQuotesChanged?: () => void) {
    this.onQuotesChanged = onQuotesChanged;
    this.element = document.createElement('section');
    this.element.className = 'settings-quotes';
    this.element.setAttribute('aria-label', 'Manage local quotes');

    const heading = document.createElement('h2');
    heading.className = 'settings-heading';
    heading.textContent = 'Local Quotes';
    this.element.appendChild(heading);

    this.errorEl = document.createElement('p');
    this.errorEl.className = 'settings-error';
    this.errorEl.setAttribute('role', 'alert');
    this.element.appendChild(this.errorEl);

    this.listEl = document.createElement('ul');
    this.listEl.className = 'quote-list';
    this.element.appendChild(this.listEl);

    const form = document.createElement('form');
    form.className = 'quote-form';

    this.textInput = document.createElement('textarea');
    this.textInput.placeholder = 'Quote text';
    this.textInput.required = true;
    this.textInput.rows = 2;

    this.authorInput = document.createElement('input');
    this.authorInput.type = 'text';
    this.authorInput.placeholder = 'Author (optional)';

    const submitBtn = document.createElement('button');
    submitBtn.type = 'submit';
    submitBtn.textContent = 'Add Quote';

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.textContent = 'Cancel Edit';
    cancelBtn.hidden = true;
    cancelBtn.addEventListener('click', () => this.resetForm(submitBtn, cancelBtn));

    form.appendChild(this.textInput);
    form.appendChild(this.authorInput);
    const formButtons = document.createElement('div');
    formButtons.className = 'quote-form-buttons';
    formButtons.appendChild(submitBtn);
    formButtons.appendChild(cancelBtn);
    form.appendChild(formButtons);

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      await this.handleSubmit(submitBtn, cancelBtn);
    });

    this.element.appendChild(form);

    this.element.appendChild(this.buildBulkImportSection());

    void this.refresh();
  }

  private buildBulkImportSection(): HTMLElement {
    const section = document.createElement('div');
    section.className = 'quote-bulk-import';

    const heading = document.createElement('h3');
    heading.className = 'settings-subheading';
    heading.textContent = 'Bulk Import';
    section.appendChild(heading);

    const help = document.createElement('p');
    help.className = 'settings-help';
    help.textContent =
      'One quote per line. Add an author with a pipe: Quote text here | Author Name. ' +
      'A line with no pipe is added with no author.';
    section.appendChild(help);

    const bulkError = document.createElement('p');
    bulkError.className = 'settings-error';
    bulkError.setAttribute('role', 'alert');
    section.appendChild(bulkError);

    const bulkStatus = document.createElement('p');
    bulkStatus.className = 'settings-help';
    section.appendChild(bulkStatus);

    const textarea = document.createElement('textarea');
    textarea.className = 'quote-bulk-textarea';
    textarea.placeholder = 'Stay hungry, stay foolish. | Steve Jobs\nAnother quote with no author';
    textarea.rows = 6;

    const importBtn = document.createElement('button');
    importBtn.type = 'button';
    importBtn.textContent = 'Import Quotes';
    importBtn.addEventListener('click', async () => {
      bulkError.textContent = '';
      bulkStatus.textContent = '';

      const parsed = parseBulkQuotes(textarea.value);
      if (parsed.length === 0) {
        bulkError.textContent = 'Paste at least one non-empty line first.';
        return;
      }

      try {
        const result = await invoke<BulkAddResult>('bulk_add_local_quotes', { entries: parsed });
        textarea.value = '';
        bulkStatus.textContent =
          result.skipped > 0
            ? `Added ${result.added.length} quote(s), skipped ${result.skipped} blank line(s).`
            : `Added ${result.added.length} quote(s).`;
        await this.refresh();
        this.onQuotesChanged?.();
      } catch (err) {
        bulkError.textContent = String(err);
      }
    });

    section.appendChild(textarea);
    section.appendChild(importBtn);
    return section;
  }

  private resetForm(submitBtn: HTMLButtonElement, cancelBtn: HTMLButtonElement): void {
    this.editingId = null;
    this.textInput.value = '';
    this.authorInput.value = '';
    submitBtn.textContent = 'Add Quote';
    cancelBtn.hidden = true;
  }

  private async handleSubmit(submitBtn: HTMLButtonElement, cancelBtn: HTMLButtonElement): Promise<void> {
    const text = this.textInput.value;
    const author = this.authorInput.value || null;
    this.errorEl.textContent = '';

    try {
      if (this.editingId) {
        await invoke('update_local_quote', { id: this.editingId, text, author });
      } else {
        await invoke('add_local_quote', { text, author });
      }
      this.resetForm(submitBtn, cancelBtn);
      await this.refresh();
      this.onQuotesChanged?.();
    } catch (err) {
      this.errorEl.textContent = String(err);
    }
  }

  private startEdit(quote: LocalQuote, submitBtn: HTMLButtonElement, cancelBtn: HTMLButtonElement): void {
    this.editingId = quote.id;
    this.textInput.value = quote.text;
    this.authorInput.value = quote.author ?? '';
    submitBtn.textContent = 'Save Changes';
    cancelBtn.hidden = false;
    this.textInput.focus();
  }

  private async handleDelete(id: string): Promise<void> {
    this.errorEl.textContent = '';
    try {
      await invoke('delete_local_quote', { id });
      await this.refresh();
      this.onQuotesChanged?.();
    } catch (err) {
      this.errorEl.textContent = String(err);
    }
  }

  async refresh(): Promise<void> {
    let quotes: LocalQuote[];
    try {
      quotes = await invoke<LocalQuote[]>('list_local_quotes');
    } catch (err) {
      this.errorEl.textContent = String(err);
      return;
    }

    this.listEl.innerHTML = '';
    const submitBtn = this.element.querySelector('button[type="submit"]') as HTMLButtonElement;
    const cancelBtn = this.element.querySelector('.quote-form-buttons button[type="button"]') as HTMLButtonElement;

    if (quotes.length === 0) {
      const empty = document.createElement('li');
      empty.className = 'quote-empty';
      empty.textContent = 'No local quotes yet — add one below.';
      this.listEl.appendChild(empty);
      return;
    }

    for (const quote of quotes) {
      const item = document.createElement('li');
      item.className = 'quote-item';

      const text = document.createElement('span');
      text.className = 'quote-text';
      text.textContent = quote.author ? `"${quote.text}" — ${quote.author}` : `"${quote.text}"`;
      item.appendChild(text);

      const actions = document.createElement('span');
      actions.className = 'quote-actions';

      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.textContent = 'Edit';
      editBtn.addEventListener('click', () => this.startEdit(quote, submitBtn, cancelBtn));

      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.textContent = 'Delete';
      deleteBtn.addEventListener('click', () => void this.handleDelete(quote.id));

      actions.appendChild(editBtn);
      actions.appendChild(deleteBtn);
      item.appendChild(actions);

      this.listEl.appendChild(item);
    }
  }
}
