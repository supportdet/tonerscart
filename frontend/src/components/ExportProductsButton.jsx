import React, { useState } from "react";
import { Button } from "./ui/button";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import api from "../lib/api";

/**
 * Downloads the authenticated user's product + price list as an XLSX file.
 * Admin → every product on the marketplace.
 * Supplier → only their own listings.
 */
export default function ExportProductsButton({ disabled, label = "Download Excel", testId = "export-products-btn" }) {
    const [loading, setLoading] = useState(false);

    const onClick = async () => {
        if (loading) return;
        setLoading(true);
        try {
            const res = await api.get("/export/products.xlsx", { responseType: "blob" });
            const blob = new Blob([res.data], {
                type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            });
            // Pull filename out of Content-Disposition when available.
            let fname = `tonerscart-products-${new Date().toISOString().slice(0, 10)}.xlsx`;
            const cd = res.headers?.["content-disposition"] || res.headers?.["Content-Disposition"];
            if (cd) {
                const m = /filename="?([^";]+)"?/i.exec(cd);
                if (m && m[1]) fname = m[1];
            }
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = fname;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
            toast.success("Excel ready — check your Downloads folder");
        } catch (e) {
            const msg = e?.response?.status === 403
                ? "You need admin or supplier access to export."
                : "Could not generate the Excel file. Please try again.";
            toast.error(msg);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Button
            type="button"
            variant="outline"
            className="h-12 px-6 text-[14px] inline-flex items-center gap-2"
            disabled={disabled || loading}
            onClick={onClick}
            data-testid={testId}
        >
            {loading ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
            {loading ? "Preparing…" : label}
        </Button>
    );
}
