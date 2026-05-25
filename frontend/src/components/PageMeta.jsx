import React from "react";
import { Helmet } from "react-helmet-async";

/**
 * Lightweight SEO helper — sets <title>, meta description, keywords,
 * Open Graph + Twitter cards, canonical, and optional JSON-LD.
 *
 *   <PageMeta title="…" description="…" path="/search" />
 */
export default function PageMeta({
    title,
    description,
    keywords,
    path = "/",
    image = "/logo.png",
    jsonLd,
}) {
    const base = "https://www.tonerscart.com";
    const url = `${base}${path}`;
    return (
        <Helmet>
            <title>{title}</title>
            <meta name="description" content={description} />
            {keywords && <meta name="keywords" content={keywords} />}

            <link rel="canonical" href={url} />

            {/* Open Graph */}
            <meta property="og:type" content="website" />
            <meta property="og:title" content={title} />
            <meta property="og:description" content={description} />
            <meta property="og:url" content={url} />
            <meta property="og:image" content={`${base}${image}`} />

            {/* Twitter */}
            <meta name="twitter:card" content="summary_large_image" />
            <meta name="twitter:title" content={title} />
            <meta name="twitter:description" content={description} />
            <meta name="twitter:image" content={`${base}${image}`} />

            {jsonLd && (
                <script type="application/ld+json">
                    {JSON.stringify(jsonLd)}
                </script>
            )}
        </Helmet>
    );
}
