import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

const CartContext = createContext(null);
const STORAGE_KEY = "tc_cart_v1";

function loadInitial() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed;
    } catch { return []; }
}

export const CartProvider = ({ children }) => {
    const [items, setItems] = useState(loadInitial);

    useEffect(() => {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(items)); } catch {}
    }, [items]);

    const addItem = (product, qty = 1) => {
        if (!product?.id) return;
        const safeQty = Math.max(1, Math.min(qty, product.stock ?? 9999));
        setItems((prev) => {
            const ix = prev.findIndex((it) => it.id === product.id);
            if (ix >= 0) {
                const next = [...prev];
                const newQty = Math.min(next[ix].qty + safeQty, product.stock ?? 9999);
                next[ix] = { ...next[ix], qty: newQty, product };
                return next;
            }
            return [...prev, { id: product.id, qty: safeQty, product }];
        });
    };

    const setQty = (id, qty) => {
        setItems((prev) => prev
            .map((it) => it.id === id ? { ...it, qty: Math.max(1, Math.min(qty, it.product?.stock ?? 9999)) } : it)
            .filter((it) => it.qty > 0)
        );
    };

    const remove = (id) => setItems((prev) => prev.filter((it) => it.id !== id));
    const clear = () => setItems([]);

    const count = useMemo(() => items.reduce((n, it) => n + it.qty, 0), [items]);
    const subtotal = useMemo(() => items.reduce((s, it) => s + Number(it.product?.price || 0) * it.qty, 0), [items]);

    return (
        <CartContext.Provider value={{ items, addItem, setQty, remove, clear, count, subtotal }}>
            {children}
        </CartContext.Provider>
    );
};

export const useCart = () => useContext(CartContext) || { items: [], count: 0, subtotal: 0, addItem: () => {}, setQty: () => {}, remove: () => {}, clear: () => {} };
