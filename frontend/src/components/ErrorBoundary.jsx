import React from "react";
import { AlertTriangle, Home } from "lucide-react";

/** Top-level error boundary. Catches React render crashes and shows a
 *  branded "Something went wrong" screen instead of a blank page.
 *  Logs the error to console for production telemetry pipelines to pick up. */
export default class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, message: "" };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, message: error?.message || "Unknown error" };
    }

    componentDidCatch(error, info) {
        // Surface details to anything listening on console (Sentry/LogRocket, etc.)
        // eslint-disable-next-line no-console
        console.error("TonersCart ErrorBoundary caught:", error, info?.componentStack);
    }

    reset = () => {
        this.setState({ hasError: false, message: "" });
        if (typeof window !== "undefined") window.location.assign("/");
    };

    render() {
        if (!this.state.hasError) return this.props.children;
        return (
            <div className="min-h-[70vh] bg-white grid place-items-center px-6" data-testid="error-boundary-page">
                <div className="max-w-md text-center">
                    <div className="mx-auto w-14 h-14 rounded-full bg-amber-50 border border-amber-200 grid place-items-center">
                        <AlertTriangle size={26} className="text-amber-600" />
                    </div>
                    <h1 className="mt-5 text-[#0A0A0B]" style={{ fontFamily: "'Montserrat', sans-serif", fontSize: "clamp(24px, 3.4vw, 36px)", fontWeight: 300, letterSpacing: "-0.02em" }}>
                        Something went wrong
                    </h1>
                    <p className="mt-3 text-[14px] text-[#6E6E73]">
                        We hit an unexpected bug. The team has been notified. You can head back home and try again.
                    </p>
                    <div className="mt-5 inline-flex items-center gap-1.5 text-[11px] text-[#86868B] bg-[#F4F4F6] rounded-md px-2.5 py-1 font-mono" data-testid="error-boundary-message">
                        {this.state.message}
                    </div>
                    <div className="mt-6">
                        <button onClick={this.reset} className="btn-cta inline-flex items-center gap-1.5" data-testid="error-boundary-home-btn">
                            <Home size={14} /> Go home
                        </button>
                    </div>
                </div>
            </div>
        );
    }
}
