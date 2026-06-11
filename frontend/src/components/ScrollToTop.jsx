import { useEffect } from "react";
import { useLocation } from "react-router-dom";

/**
 * Scrolls the window to top whenever the route changes. Mounted once inside
 * <BrowserRouter> so it sees pathname/search updates from React Router.
 * Skips when the navigation is to an in-page anchor (#hash).
 */
export default function ScrollToTop() {
    const { pathname, hash } = useLocation();
    useEffect(() => {
        if (hash) return; // let the browser handle anchor scrolls
        try {
            window.scrollTo({ top: 0, left: 0, behavior: "instant" });
        } catch {
            window.scrollTo(0, 0);
        }
    }, [pathname, hash]);
    return null;
}
