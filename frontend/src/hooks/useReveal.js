import { useEffect, useRef } from "react";

/** Adds an "in" class to elements with .tc-reveal when they enter viewport. */
export default function useReveal(deps = []) {
    const rootRef = useRef(null);
    useEffect(() => {
        const root = rootRef.current ?? document;
        const els = root.querySelectorAll(".tc-reveal");
        if (!("IntersectionObserver" in window)) {
            els.forEach((el) => el.classList.add("in"));
            return;
        }
        const io = new IntersectionObserver(
            (entries) => entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }),
            { rootMargin: "0px 0px -8% 0px", threshold: 0.08 }
        );
        els.forEach((el) => io.observe(el));
        return () => io.disconnect();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, deps);
    return rootRef;
}
