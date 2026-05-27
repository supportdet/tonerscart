import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import api, { formatApiError } from "../lib/api";
import { toast } from "sonner";
import { ArrowLeft, ChevronRight, ShoppingCart, Zap, Shield, CheckCircle2, MapPin, Loader2, Quote } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useCart } from "../context/CartContext";
import { Skeleton } from "../components/ui/skeleton";
import PageMeta from "../components/PageMeta";
import OrderRequestDialog from "../components/OrderRequestDialog";
import AuthRequiredDialog from "../components/AuthRequiredDialog";
import { colorSwatch, isLightSwatch } from "../lib/colors";
import { useCity } from "../context/CityContext";

const fmtMoney = (n) => `₹${Math.round(Number(n) || 0).toLocaleString("en-IN")}`;

export default function ProductDetail({ kind = "toner" }) {
    const { id } = useParams();
    const navigate = useNavigate();
    const { user } = useAuth();
    const { addItem } = useCart();

    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [selectedVariant, setSelectedVariant] = useState(null);
    const [qty, setQty] = useState(1);
    const [activeImg, setActiveImg] = useState(0);
    const [orderDialog, setOrderDialog] = useState(false);
    const [authDialog, setAuthDialog] = useState(null); // {intent: 'buy'|'cart'|'quote'}
    const [quoting, setQuoting] = useState(false);

    const endpoint = kind === "printer" ? `/printers/${id}/public` : kind === "paper" ? `/papers/${id}/public` : `/listings/${id}/public`;

    useEffect(() => {
        let alive = true;
        setLoading(true);
        api.get(endpoint)
            .then((r) => { if (alive) { setData(r.data); setActiveImg(0); setSelectedVariant((r.data?.variants?.[0]) || null); } })
            .catch((e) => { toast.error(formatApiError(e)); })
            .finally(() => { if (alive) setLoading(false); });
        return () => { alive = false; };
    }, [id, endpoint]);

    const images = useMemo(() => {
        if (!data) return [];
        const arr = Array.isArray(data.image_urls) ? data.image_urls.filter(Boolean) : [];
        if (arr.length === 0 && data.image_url) return [data.image_url];
        return arr;
    }, [data]);

    const displayPrice = useMemo(() => {
        if (!data) return 0;
        if (selectedVariant) return Number(selectedVariant.price);
        if (data?.variants?.length) return Math.min(...data.variants.map((v) => Number(v.price)));
        return Number(data.price ?? data.price_per_ream ?? 0);
    }, [data, selectedVariant]);

    const displayStock = useMemo(() => {
        if (!data) return 0;
        if (selectedVariant) return Number(selectedVariant.stock);
        return Number(data.stock ?? 0);
    }, [data, selectedVariant]);

    const productTitle = useMemo(() => {
        if (!data) return "";
        if (kind === "printer") return `${data.brand} ${data.model_number || data.name || ""}`.trim();
        if (kind === "paper")   return `${data.brand} ${data.size} · ${data.gsm} GSM`;
        return `${data.brand} ${data.model_number}`.trim();
    }, [data, kind]);

    const breadcrumb = useMemo(() => {
        if (kind === "printer") return [{ label: "Home", to: "/" }, { label: "Printers", to: "/printers" }, { label: productTitle }];
        if (kind === "paper")   return [{ label: "Home", to: "/" }, { label: "Papers", to: "/papers" }, { label: productTitle }];
        return [{ label: "Home", to: "/" }, { label: "Toners", to: "/search" }, { label: productTitle }];
    }, [kind, productTitle]);

    const requireAuth = (intent) => {
        if (user && user.id && user.email) return true;
        setAuthDialog({ intent });
        return false;
    };

    // DEBUG: force a console trace if user shape differs from expectation in dev
    if (typeof window !== "undefined" && window.__TC_DEBUG_AUTH__) {
        // eslint-disable-next-line no-console
        console.log("[ProductDetail] user state:", user, "authDialog:", authDialog);
    }

    const onAddToCart = () => {
        if (!data) return;
        if (displayStock <= 0) { toast.error("Out of stock"); return; }
        const product = {
            id: data.id,
            price: displayPrice,
            stock: displayStock,
            brand: data.brand,
            model_number: data.model_number || data.name,
            color: selectedVariant?.color || data.color,
            variant_id: selectedVariant?.id || null,
            toner_type: data.toner_type,
            image_url: images[0] || data.image_url,
            supplier_name: data.supplier_name,
            supplier_city: data.supplier_city,
            kind,
        };
        addItem(product, qty);
        toast.success(`Added ${qty} × ${productTitle} to cart`);
    };

    const onBuyNow = () => {
        if (displayStock <= 0) { toast.error("Out of stock"); return; }
        if (!requireAuth("buy")) return;
        setOrderDialog(true);
    };

    const onQuotation = async () => {
        if (!requireAuth("quote")) return;
        setQuoting(true);
        try {
            await api.post("/quotation", {
                listing_id: data.id,
                listing_type: kind,
                qty,
            });
            toast.success("Quotation request sent — check your inbox shortly.");
        } catch (e) { toast.error(formatApiError(e)); }
        finally { setQuoting(false); }
    };

    // Resume intent after sign in
    useEffect(() => {
        if (!user || !authDialog) return;
        const intent = authDialog.intent;
        setAuthDialog(null);
        setTimeout(() => {
            if (intent === "buy")  setOrderDialog(true);
            if (intent === "cart") onAddToCart();
            if (intent === "quote") onQuotation();
        }, 80);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user]);

    if (loading) {
        return (
            <div className="bg-white min-h-screen">
                <div className="tc-container py-8" data-testid="product-detail-loading">
                    <Skeleton className="h-4 w-64 mb-4" />
                    <div className="grid lg:grid-cols-[45%_55%] gap-10">
                        <div><Skeleton className="aspect-square w-full rounded-2xl" /></div>
                        <div className="space-y-4">
                            <Skeleton className="h-6 w-2/3" /><Skeleton className="h-10 w-1/3" /><Skeleton className="h-32 w-full" />
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    if (!data) {
        return (
            <div className="tc-container py-20 text-center text-[#6E6E73]" data-testid="product-detail-empty">
                Product not found.
            </div>
        );
    }

    const stockLabel = displayStock <= 0
        ? { txt: "Out of stock", cls: "text-red-600 bg-red-50 border-red-200" }
        : displayStock <= 5
            ? { txt: `Only ${displayStock} left`, cls: "text-orange-600 bg-orange-50 border-orange-200" }
            : { txt: `${displayStock} in stock`, cls: "text-emerald-700 bg-emerald-50 border-emerald-200" };

    return (
        <div className="bg-white min-h-screen" data-testid="product-detail-page">
            <PageMeta
                title={`${productTitle} — TonersCart`}
                description={`Buy ${productTitle} online from verified suppliers across India. Real stock, transparent pricing.`}
                path={`/${kind}/${id}`}
            />

            <div className="tc-container pt-6">
                <nav aria-label="Breadcrumb" className="text-[12px] text-[#6E6E73] flex items-center gap-1.5 mb-3" data-testid="breadcrumbs">
                    {breadcrumb.map((c, i) => (
                        <React.Fragment key={i}>
                            {i > 0 && <ChevronRight size={11} className="text-[#C8C8CD]" />}
                            {c.to ? <Link to={c.to} className="hover:text-[#0A0A0B] hover:underline">{c.label}</Link> : <span className="text-[#0A0A0B] font-medium truncate max-w-[60vw]">{c.label}</span>}
                        </React.Fragment>
                    ))}
                </nav>
                <button onClick={() => navigate(-1)} className="inline-flex items-center gap-1.5 px-3 h-11 sm:h-9 -ml-3 sm:ml-0 text-[13px] text-[#0A0A0B] hover:text-[#00B7C7] transition" data-testid="back-button">
                    <ArrowLeft size={15} /> Back
                </button>
            </div>

            <div className="tc-container pt-4 pb-16">
                <div className="grid lg:grid-cols-[45%_55%] gap-10">
                    {/* LEFT — Image gallery (45%) */}
                    <div>
                        <div className="aspect-square w-full rounded-2xl border border-black/[0.07] bg-[#FAFAFB] overflow-hidden grid place-items-center" data-testid="product-image-main">
                            {images[activeImg] ? (
                                <img src={images[activeImg]} alt={productTitle} className="w-full h-full object-contain" />
                            ) : (
                                <div className="text-[12px] text-[#86868B]">No image uploaded</div>
                            )}
                        </div>
                        {images.length > 1 && (
                            <div className="mt-3 flex items-center gap-2" data-testid="product-image-thumbs">
                                {images.map((src, i) => (
                                    <button
                                        key={i}
                                        onClick={() => setActiveImg(i)}
                                        className={`h-14 w-14 rounded-lg border-2 overflow-hidden bg-white grid place-items-center transition ${i === activeImg ? "border-[#0A0A0B]" : "border-[#E5E5E7] hover:border-[#86868B]"}`}
                                        data-testid={`product-thumb-${i}`}
                                    >
                                        <img src={src} alt={`view ${i + 1}`} className="w-full h-full object-contain" loading="lazy" />
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* RIGHT — content (55%, LEFT-aligned per Wave 14) */}
                    <div className="flex flex-col items-start text-left justify-start min-h-[460px]">
                        {data.toner_type && (
                            <span className={`inline-block text-[10.5px] tracking-[0.16em] uppercase font-semibold px-2.5 py-1 rounded-full border ${data.toner_type === "Original" ? "bg-emerald-50 border-emerald-200 text-emerald-700" : data.toner_type === "Refilled" ? "bg-orange-50 border-orange-200 text-orange-700" : "bg-blue-50 border-blue-200 text-blue-700"}`} data-testid="product-type-badge">
                                {data.toner_type}
                            </span>
                        )}
                        {kind === "printer" && data.condition && (
                            <span className="inline-block text-[10.5px] tracking-[0.16em] uppercase font-semibold px-2.5 py-1 rounded-full border bg-[#FFF8E0] border-[#F5E5A6] text-[#8C6A00]" data-testid="product-condition-badge">{data.condition}</span>
                        )}

                        <h1 className="mt-4 text-[#0A0A0B] leading-[1.1] tracking-[-0.02em]" style={{ fontFamily: "'Roboto', Helvetica, Arial, sans-serif", fontWeight: 700, fontSize: "clamp(22px, 3vw, 32px)" }} data-testid="product-title">
                            <span className="text-[#86868B] block text-[14px] font-medium tracking-[0.18em] uppercase mb-1">{data.brand}</span>
                            <span className="text-[#0A0A0B]">{kind === "paper" ? `${data.size} · ${data.gsm} GSM` : (data.model_number || data.name)}</span>
                        </h1>

                        {/* Compatibility shoutout (toners) */}
                        {kind === "toner" && data.compatible_models && (
                            <div className="mt-4 inline-flex items-start gap-2 bg-[#FFF8E0] border border-[#F5E5A6] rounded-lg px-3 py-2 text-[12.5px] text-[#5C4A00]" data-testid="product-compatibility">
                                <CheckCircle2 size={14} className="mt-0.5 text-[#8C6A00] shrink-0" />
                                <div><span className="font-semibold">Compatible with:</span> {data.compatible_models}</div>
                            </div>
                        )}

                        {/* Variant swatches */}
                        {data.variants && data.variants.length > 0 && (
                            <div className="mt-5" data-testid="variant-swatches">
                                <div className="text-[10.5px] tracking-[0.16em] uppercase font-semibold text-[#86868B]">
                                    {data.variants.length} {data.variants.length === 1 ? "colour" : "colours"} available
                                </div>
                                <div className="mt-2 flex items-center flex-wrap gap-2.5">
                                    {data.variants.map((v) => (
                                        <button
                                            key={v.id}
                                            onClick={() => setSelectedVariant(v)}
                                            className={`relative h-9 px-2.5 rounded-full border inline-flex items-center gap-2 transition ${selectedVariant?.id === v.id ? "border-[#0A0A0B] bg-white shadow-sm" : "border-[#E5E5E7] hover:border-[#86868B]"}`}
                                            title={v.color}
                                            data-testid={`swatch-${v.id}`}
                                        >
                                            <span
                                                className={`inline-block w-5 h-5 rounded-full border ${isLightSwatch(v.color) ? "border-[#C8C8CD]" : "border-black/10"}`}
                                                style={colorSwatch(v.color).startsWith("linear") ? { background: colorSwatch(v.color) } : { backgroundColor: colorSwatch(v.color) }}
                                            />
                                            <span className="text-[12.5px] font-semibold text-[#0A0A0B]">{v.color}</span>
                                        </button>
                                    ))}
                                </div>
                                {selectedVariant && (<div className="mt-2 text-[12px] text-[#6E6E73]" data-testid="selected-color-line">Selected: <strong className="text-[#0A0A0B]">{selectedVariant.color}</strong></div>)}
                            </div>
                        )}

                        {/* Price + stock — left aligned */}
                        <div className="mt-6 flex items-end justify-start gap-4">
                            <div className="text-[#0A0A0B] leading-none" style={{ fontFamily: "'Roboto', Helvetica, Arial, sans-serif", fontWeight: 700, fontSize: "clamp(24px, 3vw, 36px)" }} data-testid="product-price">{fmtMoney(displayPrice)}</div>
                            <span className={`text-[11.5px] font-semibold px-2.5 py-1 rounded-full border ${stockLabel.cls}`} data-testid="product-stock">{stockLabel.txt}</span>
                        </div>
                        {(data.gst_rate ?? 18) > 0 && (
                            <div className="text-[11.5px] text-[#86868B] mt-1.5" data-testid="product-gst-hint">
                                + {data.gst_rate ?? 18}% GST applied at checkout
                            </div>
                        )}

                        {/* Delivery info */}
                        <DeliveryInfo data={data} />

                        {/* Supplier */}
                        <div className="mt-4 flex items-center gap-2 text-[13px] text-[#3a3a40]" data-testid="product-supplier">
                            <Shield size={14} className="text-emerald-600" />
                            <span>Sold by <strong className="text-[#0A0A0B]">{data.supplier_name || "Verified supplier"}</strong></span>
                            {data.supplier_city && (<><MapPin size={12} className="ml-1 text-[#86868B]" /><span>{data.supplier_city}</span></>)}
                        </div>

                        {/* Qty stepper — left aligned */}
                        <div className="mt-6 flex items-center justify-start gap-3">
                            <div className="text-[11px] tracking-[0.16em] uppercase font-semibold text-[#86868B]">Quantity</div>
                            <div className="inline-flex items-center bg-white border border-[#D2D2D7] rounded-full overflow-hidden">
                                <button onClick={() => setQty((q) => Math.max(1, q - 1))} className="w-9 h-9 grid place-items-center hover:bg-black/5 text-[15px]" data-testid="qty-decrement">−</button>
                                <input type="number" min="1" value={qty} onChange={(e) => setQty(Math.max(1, parseInt(e.target.value || "1", 10)))} className="w-12 h-9 text-center font-mono text-[14px] outline-none" data-testid="qty-input" />
                                <button onClick={() => setQty((q) => q + 1)} className="w-9 h-9 grid place-items-center hover:bg-black/5 text-[15px]" data-testid="qty-increment">+</button>
                            </div>
                        </div>

                        {/* CTAs — left aligned */}
                        <div className="mt-5 flex flex-wrap items-center justify-start gap-3">
                            <button onClick={onAddToCart} disabled={displayStock <= 0} className="inline-flex items-center gap-2 px-5 py-3 rounded-full bg-[#0A0A0B] text-white text-[13.5px] font-semibold hover:bg-[#1D1D1F] disabled:opacity-40 disabled:cursor-not-allowed transition" data-testid="add-to-cart-btn">
                                <ShoppingCart size={15} /> Add to cart
                            </button>
                            <button onClick={onBuyNow} disabled={displayStock <= 0} className="inline-flex items-center gap-2 px-5 py-3 rounded-full bg-[#F5C400] text-[#0A0A0B] text-[13.5px] font-semibold hover:bg-[#FFD90A] disabled:opacity-40 disabled:cursor-not-allowed transition shadow-sm" data-testid="buy-now-btn">
                                <Zap size={15} /> Buy now
                            </button>
                            <button onClick={onQuotation} disabled={quoting} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full border border-[#D2D2D7] text-[12.5px] font-semibold text-[#0A0A0B] hover:bg-black/[0.03] disabled:opacity-50 transition" data-testid="get-quotation-btn">
                                {quoting ? <Loader2 size={13} className="animate-spin" /> : <Quote size={13} />} Get quotation
                            </button>
                        </div>

                        <div className="mt-3 text-[11.5px] text-[#86868B] leading-snug text-left max-w-[480px]" data-testid="delivery-note">
                            Delivery within city included. Intercity delivery charges to be confirmed by supplier before dispatch.
                        </div>

                        {/* Specs (left-aligned for readability) */}
                        <div className="w-full mt-8 text-left">
                            <SpecsBlock kind={kind} data={data} selectedVariant={selectedVariant} />
                        </div>
                    </div>
                </div>
            </div>

            {orderDialog && (
                <OrderRequestDialog
                    onClose={() => setOrderDialog(false)}
                    product={data ? {
                        id: data.id,
                        price: displayPrice,
                        stock: displayStock,
                        brand: data.brand,
                        model_number: data.model_number || data.name,
                        color: selectedVariant?.color || data.color,
                        toner_type: data.toner_type,
                        image_url: images[0] || data.image_url,
                        supplier_name: data.supplier_name,
                        supplier_city: data.supplier_city,
                        variant_id: selectedVariant?.id || null,
                    } : null}
                    initialQty={qty}
                />
            )}

            <AuthRequiredDialog
                open={!!authDialog}
                onClose={() => setAuthDialog(null)}
                intent={authDialog?.intent}
            />
        </div>
    );
}

function DeliveryInfo({ data }) {
    const { city: buyerCity } = useCity();
    const dealerCity = (data.supplier_city || data.city || "").trim();
    const buyer = (buyerCity || "").trim();
    const charge = Number(data.intercity_delivery_charge || 0);
    if (!dealerCity) return null;
    const same = buyer && dealerCity && buyer.toLowerCase() === dealerCity.toLowerCase();
    if (same) {
        return (<div className="mt-2 text-[12.5px] font-semibold text-emerald-700 inline-flex items-center gap-1" data-testid="delivery-same-city">✅ Free delivery to {dealerCity}</div>);
    }
    if (charge > 0) {
        return (<div className="mt-2 text-[12.5px] text-[#6E6E73]" data-testid="delivery-intercity">🚚 Intercity delivery to {buyer || "your city"}: +₹{charge.toLocaleString("en-IN")}</div>);
    }
    return (<div className="mt-2 text-[12.5px] text-orange-700" data-testid="delivery-warning">⚠️ Delivery only within {dealerCity}</div>);
}

function SpecsBlock({ kind, data, selectedVariant }) {
    const rows = [];
    if (kind === "toner") {
        rows.push(["Brand", data.brand]);
        if (data.model_number) rows.push(["Model number", data.model_number]);
        // Page yield — always shown (key buying signal for toners)
        rows.push(["Page yield", data.page_yield ? `${Number(data.page_yield).toLocaleString("en-IN")} pages` : "—"]);
        rows.push(["Type", data.toner_type]);
        rows.push(["Colour", selectedVariant?.color || data.color]);
        if (data.compatible_models) rows.push(["Compatible models", data.compatible_models]);
        if (data.oem_part_number) rows.push(["OEM part number", data.oem_part_number]);
        if (data.cartridge_weight) rows.push(["Cartridge weight", `${data.cartridge_weight} g`]);
        if (data.pack_size) rows.push(["Pack size", `${data.pack_size} cartridge${data.pack_size === 1 ? "" : "s"}`]);
        if (data.warranty) rows.push(["Warranty", data.warranty]);
    } else if (kind === "printer") {
        rows.push(["Brand", data.brand]);
        rows.push(["Model", data.model_number || data.name]);
        if (data.condition) rows.push(["Condition", data.condition]);
        if (data.color) rows.push(["Print colour", data.color]);
        if (data.category) rows.push(["Category", data.category]);
        const usages = Array.isArray(data.usage_types) && data.usage_types.length > 0
            ? data.usage_types
            : (data.usage_type ? [data.usage_type] : []);
        if (usages.length) rows.push(["Best for", usages.join(" · ")]);
        if (data.print_speed_ppm) rows.push(["Print speed", `${data.print_speed_ppm} PPM`]);
        if (data.duty_cycle) rows.push(["Monthly duty cycle", `${data.duty_cycle} pages`]);
        if (data.monthly_volume_recommended) rows.push(["Recommended volume", `Up to ${Number(data.monthly_volume_recommended).toLocaleString("en-IN")} pages`]);
        if (data.monthly_volume_min || data.monthly_volume_max) rows.push(["Volume capacity", `${data.monthly_volume_min || 0} – ${data.monthly_volume_max || 0} pages / month`]);
        if (data.max_resolution) rows.push(["Max print resolution", data.max_resolution]);
        if (data.connectivity?.length) rows.push(["Connectivity", (Array.isArray(data.connectivity) ? data.connectivity : [data.connectivity]).join(" · ")]);
        if (data.paper_sizes?.length) rows.push(["Paper sizes", (Array.isArray(data.paper_sizes) ? data.paper_sizes : [data.paper_sizes]).join(" · ")]);
        if (data.mobile_printing?.length) rows.push(["Mobile printing", (Array.isArray(data.mobile_printing) ? data.mobile_printing : [data.mobile_printing]).join(" · ")]);
        if (data.special_features?.length) rows.push(["Special features", (Array.isArray(data.special_features) ? data.special_features : [data.special_features]).join(" · ")]);
        if (data.display_type) rows.push(["Display", data.display_type]);
        if (data.dimensions) rows.push(["Dimensions (L×W×H)", data.dimensions]);
        if (data.weight_kg) rows.push(["Weight", `${data.weight_kg} kg`]);
        if (data.printer_warranty) rows.push(["Warranty", data.printer_warranty]);
    } else {
        rows.push(["Brand", data.brand]);
        rows.push(["Size", data.size]);
        rows.push(["GSM", data.gsm]);
        if (data.reams_per_box) rows.push(["Reams per box", data.reams_per_box]);
        if (data.brightness) rows.push(["Brightness", data.brightness]);
        if (data.thickness_microns) rows.push(["Thickness", `${data.thickness_microns} µ`]);
        if (data.acid_free !== undefined && data.acid_free !== null) rows.push(["Acid free", data.acid_free ? "Yes" : "No"]);
        if (data.suitable_for?.length) rows.push(["Suitable for", (Array.isArray(data.suitable_for) ? data.suitable_for : [data.suitable_for]).join(" · ")]);
    }
    const visible = rows.filter(([, v]) => v !== undefined && v !== null && v !== "" && v !== 0);
    if (!visible.length) return null;
    return (
        <section className="mt-10" data-testid="product-specs">
            <h2 className="text-[#0A0A0B] text-[16px] mb-3" style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 600 }}>Product specifications</h2>
            <div className="bg-white border border-[#E8E8EC] rounded-[12px] overflow-hidden">
                <dl>
                    {visible.map(([k, v], i) => (
                        <div key={k} className={`grid grid-cols-12 px-4 py-3 ${i > 0 ? "border-t border-[#E8E8EC]" : ""}`} data-testid={`spec-row-${k.toLowerCase().replace(/\s+/g, "-")}`} style={{ fontFamily: "'Inter', sans-serif" }}>
                            <dt className="col-span-5 sm:col-span-4 text-[13px] text-[#6E6E73]" style={{ fontWeight: 500 }}>{k}</dt>
                            <dd className="col-span-7 sm:col-span-8 text-[13px] text-[#0A0A0B]" style={{ fontWeight: 600 }}>{v}</dd>
                        </div>
                    ))}
                </dl>
            </div>
        </section>
    );
}
