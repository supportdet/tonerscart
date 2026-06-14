import React from "react";
import { useParams } from "react-router-dom";
import ProductDetail from "./ProductDetail";
import TonerModelPage from "./TonerModelPage";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * `/consumable/:id` is shared between dealer-listing detail pages (UUID) and
 * the programmatic ink/drum/ribbon SEO model pages (slug). A UUID routes to
 * ProductDetail; anything else is treated as a cartridge model slug and
 * rendered via the shared TonerModelPage (with pageKind="consumable").
 */
export default function ConsumableRoute() {
    const { id } = useParams();
    return UUID_RE.test(id || "")
        ? <ProductDetail kind="consumable" />
        : <TonerModelPage pageKind="consumable" />;
}
