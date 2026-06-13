import { useEffect } from "react";
import { useLocation } from "react-router-dom";

/**
 * Scrolls the window to the top whenever the route changes. Mounted once
 * inside <BrowserRouter> so it sees pathname/search updates from React Router.
 *
 * Why this is more involved than `window.scrollTo(0, 0)`:
 *
 *   1. Modern browsers default to `history.scrollRestoration = 'auto'` which
 *      remembers the previous scroll position when you re-enter a route via
 *      the back button. We force it to 'manual' once on mount so React Router
 *      navigations always land at the top.
 *
 *   2. Different browsers honour different scroll targets — `window`,
 *      `document.scrollingElement`, `document.documentElement`, and
 *      `document.body` are all touched defensively.
 *
 *   3. The scroll has to happen AFTER React commits the new route's DOM,
 *      otherwise the old page's height can cap the new scrollTop. We use a
 *      double `requestAnimationFrame` so we're past commit AND past the
 *      browser's first paint of the new content.
 *
 *   4. Anchor links (`#section-x`) bypass this so deep-links keep working.
 */
export default function ScrollToTop() {
    const { pathname, hash } = useLocation();
    useEffect(() => {
        if (typeof window === "undefined") return;
        if ("scrollRestoration" in window.history) {
            try { window.history.scrollRestoration = "manual"; } catch { /* ignore */ }
        }
        if (hash) return; // let the browser handle anchor scrolls

        const reset = () => {
            try { window.scrollTo({ top: 0, left: 0, behavior: "instant" }); }
            catch { window.scrollTo(0, 0); }
            // Belt-and-braces for browsers where window.scrollTo doesn't
            // affect the actual scrolling element.
            if (document.scrollingElement) document.scrollingElement.scrollTop = 0;
            if (document.documentElement) document.documentElement.scrollTop = 0;
            if (document.body) document.body.scrollTop = 0;
        };

        // Reset immediately for the first paint, then again after the new
        // route's content commits, then once more on the next frame so we
        // beat any late-running layout that might bounce us down.
        reset();
        const r1 = requestAnimationFrame(() => {
            reset();
            const r2 = requestAnimationFrame(reset);
            return () => cancelAnimationFrame(r2);
        });
        return () => cancelAnimationFrame(r1);
    }, [pathname, hash]);
    return null;
}
