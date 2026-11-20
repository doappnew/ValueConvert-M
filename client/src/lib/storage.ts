const PREFIX = "vc:";

/** localStorage peut être absent ou lever une exception (navigation privée, WebView) : on ne s'y fie jamais. */
export function readPref(key: string): string | null {
  try {
    return window.localStorage.getItem(PREFIX + key);
  } catch {
    return null;
  }
}

export function writePref(key: string, value: string): void {
  try {
    window.localStorage.setItem(PREFIX + key, value);
  } catch {
    /* ignoré : la préférence ne sera pas conservée */
  }
}
