// Aviso de nueva versión: consulta la última release pública en GitHub.
export const REPO = "marianoog1969/note-labeler";
export const RELEASES_URL = `https://github.com/${REPO}/releases/latest`;

function parse(v: string): number[] {
  return v.replace(/^v/i, "").split(".").map((x) => parseInt(x, 10) || 0);
}

export function isNewer(remote: string, local: string): boolean {
  const a = parse(remote), b = parse(local);
  for (let i = 0; i < 3; i++) {
    if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0);
  }
  return false;
}

/** Devuelve la versión nueva (p. ej. "0.8.0") o null si no hay o falla la consulta. */
export async function checkUpdate(current: string): Promise<string | null> {
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 6000);
    const r = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
      signal: ctl.signal,
      headers: { Accept: "application/vnd.github+json" },
    });
    clearTimeout(t);
    if (!r.ok) return null;
    const tag: string = (await r.json()).tag_name ?? "";
    return tag && isNewer(tag, current) ? tag.replace(/^v/i, "") : null;
  } catch {
    return null;
  }
}
