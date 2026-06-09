import React from "react";
import { useParams } from "react-router-dom";
import ProductDetail from "./ProductDetail";
import TonerModelPage from "./TonerModelPage";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * `/toner/:id` is shared between dealer-listing detail pages (UUID) and the
 * programmatic toner-model SEO pages (slug, e.g. hp-q2612a). A UUID routes to
 * the product detail page; anything else is treated as a toner model slug.
 */
export default function TonerRoute() {
    const { id } = useParams();
    return UUID_RE.test(id || "") ? <ProductDetail kind="toner" /> : <TonerModelPage />;
}
