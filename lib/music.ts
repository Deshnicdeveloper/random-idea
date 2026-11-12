// Background music under the preacher's voice.
// With EPIDEMIC_API_KEY set, the server picks a calm instrumental piano track from Epidemic Sound.
// Without it (or if anything fails) the browser plays its own generated soft keys instead.
//
// Licensing: Epidemic's free developer key is for prototyping only (50 downloads, no going live).
// Production needs a paid Epidemic partnership. The built-in keys need no licence.

export interface MusicTrack {
  source: "epidemic";
  url: string; // time-limited CDN link
  title: string;
  artist: string;
}

const API = "https://api.epidemicsound.com/v0";
const SEARCH_TERMS = ["calm piano worship", "soft piano ambient", "peaceful piano"];
// Epidemic allows caching for up to 60 minutes; each new link counts as a download.
const CACHE_MS = 55 * 60 * 1000;

const g = globalThis as unknown as { __music?: { track: MusicTrack; until: number } };

export function musicConfigured(): boolean {
  return Boolean(process.env.EPIDEMIC_API_KEY);
}

async function api<T>(path: string): Promise<T> {
  const r = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${process.env.EPIDEMIC_API_KEY}`, Accept: "application/json" },
    cache: "no-store",
  });
  if (!r.ok) throw new Error(`Epidemic ${path.split("?")[0]} -> ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json() as Promise<T>;
}

interface SearchTrack {
  id: string;
  title: string;
  mainArtists?: { name?: string }[] | string[];
  hasVocals?: boolean;
  isPreviewOnly?: boolean;
  length?: number;
}

const artistName = (t: SearchTrack) =>
  (t.mainArtists ?? []).map((a) => (typeof a === "string" ? a : a?.name ?? "")).filter(Boolean).join(", ");

export async function backgroundTrack(): Promise<MusicTrack | null> {
  if (!musicConfigured()) return null;
  const cached = g.__music;
  if (cached && cached.until > Date.now()) return cached.track;

  for (const term of SEARCH_TERMS) {
    const res = await api<{ tracks?: SearchTrack[] }>(
      `/tracks/search?term=${encodeURIComponent(term)}&vocalType=NONE&limit=20`,
    );
    // Long, instrumental tracks only, so one loop covers a whole teaching. (isPreviewOnly is set on
    // every track for developer keys, yet /download still returns the full file, so it isn't used here.)
    const pool = (res.tracks ?? []).filter((t) => !t.hasVocals && (t.length ?? 0) >= 90);
    if (!pool.length) continue;
    const pick = pool[Math.floor(Math.random() * Math.min(pool.length, 8))];
    const dl = await api<{ url: string; expires?: string }>(`/tracks/${encodeURIComponent(pick.id)}/download?format=mp3&quality=normal`);
    const expires = dl.expires ? Date.parse(dl.expires) - 60_000 : Infinity;
    const track: MusicTrack = { source: "epidemic", url: dl.url, title: pick.title, artist: artistName(pick) };
    g.__music = { track, until: Math.min(Date.now() + CACHE_MS, expires) };
    return track;
  }
  return null;
}
