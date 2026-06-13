// Tiny in-memory cache for search responses. Keyed by full URL+params string;
// scoped to the page lifetime (lost on full reload — that's fine for now).
// Used by Search.jsx and category list pages so repeated navigations between
// the same query don't re-hit the network.
//
// Hits return immediately (Promise.resolve(value)). Misses fire the network
// call and store the result. There's a 5-minute TTL so stock changes still
// flow through if the user lingers.

const TTL_MS = 5 * 60 * 1000;
const cache = new Map(); // key → { value, expiresAt }

function buildKey(url, params) {
    if (!params) return url;
    const sortedKeys = Object.keys(params).sort();
    const qs = sortedKeys
        .filter((k) => params[k] !== undefined && params[k] !== null && params[k] !== "")
        .map((k) => `${k}=${encodeURIComponent(String(params[k]))}`)
        .join("&");
    return qs ? `${url}?${qs}` : url;
}

export function searchCacheGet(url, params) {
    const key = buildKey(url, params);
    const hit = cache.get(key);
    if (!hit) return null;
    if (hit.expiresAt < Date.now()) {
        cache.delete(key);
        return null;
    }
    return hit.value;
}

export function searchCacheSet(url, params, value) {
    const key = buildKey(url, params);
    cache.set(key, { value, expiresAt: Date.now() + TTL_MS });
    // Cap the cache to avoid unbounded growth.
    if (cache.size > 200) {
        const oldest = cache.keys().next().value;
        cache.delete(oldest);
    }
}

export function searchCacheClear() {
    cache.clear();
}
