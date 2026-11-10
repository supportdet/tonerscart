// Vercel Edge Middleware — serves AI / search crawlers a fully rendered HTML
// snapshot of product pages by proxying to the Railway backend `/seo/{kind}/{id}`
// endpoint. Regular human visitors keep hitting the normal React SPA.
//
// Deploy note: this file must sit at the Vercel project root ("frontend/" on
// our repo). Vercel picks it up automatically — no vercel.json change needed.
// Set `BACKEND_URL` in Vercel → Project → Settings → Environment Variables to
// your Railway origin (e.g. https://api.tonerscart.com) so the middleware
// knows where to fetch the prerendered page from.

export const config = {
    // Match the SPA product routes only.
    matcher: [
        "/toner/:id*",
        "/printer/:id*",
        "/consumable/:id*",
        "/paper/:id*",
        "/scanner/:id*",
    ],
};

// Keep this list lower-cased. Matched against the request User-Agent.
const BOT_SIGNATURES = [
    "googlebot",
    "bingbot",
    "slurp",             // Yahoo
    "duckduckbot",
    "baiduspider",
    "yandexbot",
    "sogou",
    "exabot",
    "facebot",
    "facebookexternalhit",
    "twitterbot",
    "linkedinbot",
    "embedly",
    "quora link preview",
    "showyoubot",
    "outbrain",
    "pinterest",
    "slackbot",
    "vkshare",
    "w3c_validator",
    "redditbot",
    "applebot",
    "whatsapp",
    "flipboard",
    "tumblr",
    "bitlybot",
    "skypeuripreview",
    "nuzzel",
    "discordbot",
    "google page speed",
    "qwantify",
    "chat-gpt-user",
    "chatgpt-user",
    "gptbot",
    "oai-searchbot",
    "perplexitybot",
    "anthropic-ai",
    "claudebot",
    "claude-web",
    "ccbot",            // Common Crawl (used by many LLMs)
    "google-extended",
    "cohere-ai",
    "bytespider",
    "ahrefsbot",
    "semrushbot",
    "mj12bot",
    "dotbot",
    "petalbot",
    "amazonbot",
    "applebot-extended",
];

function isBot(ua) {
    if (!ua) return false;
    const low = ua.toLowerCase();
    return BOT_SIGNATURES.some((sig) => low.includes(sig));
}

function kindFromPath(pathname) {
    const parts = pathname.split("/").filter(Boolean);
    if (parts.length < 2) return null;
    return { kind: parts[0], id: parts[1] };
}

export default async function middleware(request) {
    const ua = request.headers.get("user-agent") || "";
    if (!isBot(ua)) return; // normal user → SPA

    const url = new URL(request.url);
    const target = kindFromPath(url.pathname);
    if (!target) return;

    const backend = process.env.BACKEND_URL;
    if (!backend) {
        // No backend configured — fall through to SPA rather than 500.
        return;
    }

    const seoUrl = `${backend.replace(/\/$/, "")}/seo/${encodeURIComponent(target.kind)}/${encodeURIComponent(target.id)}`;

    try {
        const resp = await fetch(seoUrl, {
            headers: {
                "User-Agent": ua,
                Accept: "text/html",
            },
            // Vercel Edge supports caching via `next` revalidate; omit to use default.
        });
        const body = await resp.text();
        return new Response(body, {
            status: resp.status,
            headers: {
                "Content-Type": resp.headers.get("content-type") || "text/html; charset=utf-8",
                "Cache-Control": "public, max-age=600, s-maxage=600",
                "X-Prerendered": "tonerscart-seo",
            },
        });
    } catch (e) {
        // On failure let the request fall through to the SPA so the bot still
        // receives *something* rather than a 5xx.
        return;
    }
}
