/**
 * QuoteRotation — mixes locally-authored quotes with API-fetched quotes
 * into a single interleaved queue for the board to cycle through.
 */

import { invoke } from '@tauri-apps/api/core';

export interface RotationQuote {
  text: string;
  author: string | null;
  source: 'local' | 'api';
}

interface LocalQuoteDto {
  id: string;
  text: string;
  author: string | null;
}

interface ApiQuotesResultDto {
  quotes: { text: string; author: string | null }[];
  from_cache: boolean;
}

/**
 * Alternate local and API quotes local, api, local, api, ...
 * Any leftover from the longer list is appended in order at the end.
 */
export function interleave(local: RotationQuote[], api: RotationQuote[]): RotationQuote[] {
  const result: RotationQuote[] = [];
  const max = Math.max(local.length, api.length);
  for (let i = 0; i < max; i++) {
    if (i < local.length) result.push(local[i]);
    if (i < api.length) result.push(api[i]);
  }
  return result;
}

export function formatForBoard(quote: RotationQuote): string {
  return quote.author ? `${quote.text} - ${quote.author}` : quote.text;
}

async function loadLocalQuotes(): Promise<RotationQuote[]> {
  const dtos = await invoke<LocalQuoteDto[]>('list_local_quotes');
  return dtos.map((d) => ({ text: d.text, author: d.author, source: 'local' as const }));
}

async function loadApiQuotes(): Promise<{ quotes: RotationQuote[]; fromCache: boolean }> {
  const result = await invoke<ApiQuotesResultDto>('fetch_api_quotes');
  return {
    quotes: result.quotes.map((q) => ({ text: q.text, author: q.author, source: 'api' as const })),
    fromCache: result.from_cache,
  };
}

export class QuoteRotation {
  private queue: RotationQuote[] = [];
  private index = 0;
  /** True when the last refresh had to fall back to cached API quotes (offline/API down). */
  apiOffline = false;

  async refresh(): Promise<void> {
    const [local, apiResult] = await Promise.all([loadLocalQuotes(), loadApiQuotes()]);
    this.apiOffline = apiResult.fromCache;
    this.queue = interleave(local, apiResult.quotes);
    this.index = 0;
  }

  /** Returns the next quote in rotation, looping back to the start. Null if the queue is empty. */
  next(): RotationQuote | null {
    if (this.queue.length === 0) return null;
    const quote = this.queue[this.index % this.queue.length];
    this.index++;
    return quote;
  }
}
