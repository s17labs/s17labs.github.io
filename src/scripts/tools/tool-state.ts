/* Shared state persistence + URL sharing for s17 Labs Tools.
   Only small option objects belong here — never files, images, or results.
   Hash state wins over localStorage so a shared link always reproduces the
   sender's settings, even on a different device. */

const HASH_KEY = 's';

function readRaw(key: string): string | null {
  const match = location.hash.match(new RegExp(`(?:^#|&)${HASH_KEY}=([^&]+)`));
  if (match) {
    try {
      return decodeURIComponent(match[1]);
    } catch {
      /* fall through to storage */
    }
  }
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Merge a saved option object over the tool's defaults. Unknown keys are
    ignored and every value is type-checked against the default's type. */
export function restoreToolState<T extends Record<string, unknown>>(key: string, defaults: T): T {
  const raw = readRaw(key);
  if (!raw) return { ...defaults };
  try {
    const saved = JSON.parse(raw) as Record<string, unknown>;
    const result = { ...defaults };
    for (const name of Object.keys(defaults) as (keyof T & string)[]) {
      if (!(name in saved)) continue;
      const value = saved[name];
      const fallback = defaults[name];
      if (Array.isArray(fallback)) {
        if (Array.isArray(value)) (result[name] as unknown[]) = value;
      } else if (typeof fallback === 'number') {
        if (typeof value === 'number' && Number.isFinite(value)) (result[name] as unknown) = value;
      } else if (typeof fallback === 'boolean') {
        if (typeof value === 'boolean') (result[name] as unknown) = value;
      } else if (typeof fallback === 'string') {
        if (typeof value === 'string') (result[name] as unknown) = value;
      }
    }
    return result;
  } catch {
    return { ...defaults };
  }
}

export interface WatchOptions {
  /** Root that contains the controls. Defaults to document. */
  root?: ParentNode;
  /** Events that mean "settings changed". Defaults to input + change. */
  events?: string[];
  debounceMs?: number;
}

/** Persist the tool's current options whenever a control changes.
    Large payloads stay in localStorage only — URLs must remain shareable. */
export function watchToolState<T extends object>(
  key: string,
  collect: () => T,
  { root = document, events = ['input', 'change'], debounceMs = 350 }: WatchOptions = {},
): void {
  let timer: ReturnType<typeof setTimeout> | undefined;

  const persist = (): void => {
    const state = collect();
    let serialized: string;
    try {
      serialized = JSON.stringify(state);
    } catch {
      return;
    }
    try {
      localStorage.setItem(key, serialized);
    } catch {
      /* storage disabled — sharing via hash may still work */
    }
    // Keep the URL short and readable. Text-heavy tools fall back to storage.
    if (serialized.length <= 2000) {
      history.replaceState(null, '', `${location.pathname}#${HASH_KEY}=${encodeURIComponent(serialized)}`);
    }
  };

  for (const event of events) {
    root.addEventListener(event, () => {
      clearTimeout(timer);
      timer = setTimeout(persist, debounceMs);
    });
  }
}
