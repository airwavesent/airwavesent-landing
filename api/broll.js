import { getCache } from '@vercel/functions';

// Only the exact deployment hostname is accepted. Vercel Authentication must
// remain enabled for all deployment URLs; custom domains are denied here.
// Access through the authenticated Vercel connector, never a public proxy.
export const searches = Object.freeze({
  overwhelmed: 'stressed woman laptop',
  confused: 'confused person computer',
  frustrated: 'frustrated office worker',
  relieved: 'relaxing woman',
  confident: 'confident business woman',
  celebrating: 'celebrating success',
  planning: 'planning notebook',
  editing: 'video editing computer',
  uploading: 'typing laptop',
  scheduling: 'calendar planning'
});

export function createHandler({ cache, fetcher = fetch, env = process.env, clock = Date.now }) {
  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (!env.VERCEL_URL || req.headers.host !== env.VERCEL_URL || env.VERCEL !== '1') {
      return res.status(404).json({ error: 'Not found' });
    }
    if (req.method !== 'GET') return res.status(405).json({ error: 'GET required' });
    const category = req.query?.category;
    if (category === 'status') {
      return res.status(200).json({ provider: 'Pixabay', configured: Boolean(env.PIXABAY_API_KEY), categories: Object.keys(searches) });
    }
    if (typeof category !== 'string' || !Object.hasOwn(searches, category)) {
      return res.status(400).json({ error: 'Choose a supported category', categories: Object.keys(searches) });
    }
    if (!env.PIXABAY_API_KEY) return res.status(503).json({ error: 'PIXABAY_API_KEY missing' });
    const cacheKey = `airwaves-pixabay-v1:${category}`;
    let cached;
    try { cached = await cache.get(cacheKey); }
    catch { return res.status(503).json({ error: 'Result cache unavailable; search paused' }); }
    if (cached && clock() - Date.parse(cached.fetched_at) < 86400000) {
      return res.status(200).json({ ...cached, cache_hit: true });
    }
    try {
      const url = new URL('https://pixabay.com/api/videos/');
      url.search = new URLSearchParams({ key: env.PIXABAY_API_KEY, q: searches[category], video_type: 'film', safesearch: 'true', per_page: '12', page: '1' }).toString();
      const response = await fetcher(url, { signal: AbortSignal.timeout(15000), redirect: 'error' });
      // Never return/log the upstream body, error object, or key-bearing URL.
      if (!response.ok) return res.status(502).json({ error: 'Pixabay request failed', upstream_status: response.status });
      const raw = await response.json();
      if (!Array.isArray(raw.hits)) return res.status(502).json({ error: 'Unexpected Pixabay response' });
      const safeURL = (value, host) => {
        try { const u = new URL(value); return u.protocol === 'https:' && u.hostname === host && !u.username && !u.password && !u.search ? u.href : null; }
        catch { return null; }
      };
      const hits = raw.hits.map(h => ({
        id: h.id, source_page: safeURL(h.pageURL, 'pixabay.com'), creator: h.user,
        tags: h.tags, duration: h.duration, type: h.type,
        files: Object.entries(h.videos || {}).map(([quality, v]) => ({
          quality, url: safeURL(v.url, 'cdn.pixabay.com'), thumbnail: safeURL(v.thumbnail, 'cdn.pixabay.com'),
          width: v.width, height: v.height, bytes: v.size, portrait: v.height > v.width
        })).filter(v => v.url && v.bytes > 0 && v.bytes <= 100000000)
      })).filter(h => h.source_page && h.files.length);
      const result = { provider: 'Pixabay', category, query: searches[category], fetched_at: new Date(clock()).toISOString(), cache_seconds: 86400, total: raw.totalHits, hits };
      await cache.set(cacheKey, result, { ttl: 86400, name: `pixabay-${category}` });
      return res.status(200).json({ ...result, cache_hit: false });
    } catch { return res.status(502).json({ error: 'Pixabay search or cache write failed; no secret details logged' }); }
  };
}

export default createHandler({ cache: getCache() });
