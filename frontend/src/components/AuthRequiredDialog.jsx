import React from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "./ui/dialog";
import { Button } from "./ui/button";
import { LogIn, UserPlus } from "lucide-react";

const COPY = {
    buy:   { title: "Sign in to place the order", body: "Sign in or create a free TonersCart account to send this order to the seller. Your selection will be kept ready after sign in." },
    cart:  { title: "Sign in to use cart",        body: "Sign in or create a free TonersCart account to add this product to your cart." },
    quote: { title: "Sign in for a quotation",    body: "Sign in or create a free TonersCart account — we will email the quotation to your verified inbox." },
};

export default function AuthRequiredDialog({ open, onClose, intent }) {
    const navigate = useNavigate();
    const location = useLocation();
    const goto = (path) => {
        const next = encodeURIComponent(location.pathname + location.search);
        onClose?.();
        navigate(`${path}?next=${next}`);
    };
    const copy = COPY[intent] || COPY.cart;
    return (
        <Dialog open={open} onOpenChange={(o) => !o && onClose?.()}>
            <DialogContent className="max-w-md" data-testid="auth-required-dialog">
                <DialogHeader>
                    <DialogTitle>{copy.title}</DialogTitle>
                </DialogHeader>
                <p className="text-[13.5px] text-[#3a3a40] leading-relaxed">{copy.body}</p>
                <DialogFooter className="flex sm:justify-end gap-2 mt-2">
                    <Button variant="outline" onClick={() => goto("/auth/signup")} data-testid="auth-dialog-signup">
                        <UserPlus size={14} className="mr-1.5" /> Create account
                    </Button>
                    <Button onClick={() => goto("/auth/login")} className="btn-cta" data-testid="auth-dialog-login">
                        <LogIn size={14} className="mr-1.5" /> Sign in
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
