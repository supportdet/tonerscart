import React from "react";
import { Dialog, DialogContent } from "./ui/dialog";
import { Button } from "./ui/button";

/**
 * Funny-but-firm warning shown whenever a user attempts to select
 * "Refilled" anywhere in the app. Clicking OK reverts the selection
 * (caller is responsible for the actual revert through `onClose`).
 *
 *   <RefilledWarningDialog open={open} onClose={revertSelection} />
 */
export default function RefilledWarningDialog({ open, onClose }) {
    return (
        <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
            <DialogContent
                className="max-w-[460px] p-0 overflow-hidden border-0"
                data-testid="refilled-warning-dialog"
            >
                <div className="flex">
                    <div className="w-1.5 bg-[#F5C400] shrink-0" aria-hidden />
                    <div className="p-6 sm:p-7">
                        <div className="text-[18px] font-bold text-[#0A0A0B]" style={{ fontFamily: "'Montserrat', sans-serif" }}>
                            Whoa there! <span aria-hidden>🚨</span>
                        </div>
                        <p className="mt-3 text-[13.5px] leading-relaxed text-[#3a3a40]">
                            Refilled toners? Really? We respect the hustle, but we don&apos;t play that game here.
                            Refilled toners can fry your printer drum, smear ink everywhere, and void your warranty
                            faster than you can say &quot;why is everything purple&quot;. TonersCart only allows
                            <strong> Original </strong> and <strong> Compatible </strong> toners.
                            Your printer will thank you. <span aria-hidden>🙏</span>
                        </p>
                        <div className="mt-5 flex justify-end">
                            <Button
                                onClick={onClose}
                                className="bg-[#F5C400] hover:bg-[#FFD119] text-[#0A0A0B] font-semibold rounded-full px-5"
                                data-testid="refilled-warning-ok"
                            >
                                OK fine, I&apos;ll behave ✓
                            </Button>
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
