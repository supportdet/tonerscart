import React, { createContext, useContext, useEffect, useState } from "react";

const STORAGE_KEY = "tc_city";
const DEFAULT_CITY = "Bangalore";

const CityContext = createContext(null);

export const CityProvider = ({ children }) => {
    const [city, setCity] = useState(() => {
        try { return localStorage.getItem(STORAGE_KEY) || DEFAULT_CITY; }
        catch { return DEFAULT_CITY; }
    });
    const [gpsRequested, setGpsRequested] = useState(false);

    useEffect(() => {
        try { localStorage.setItem(STORAGE_KEY, city); } catch { /* ignore */ }
    }, [city]);

    // Auto-request GPS on the very first session (only once)
    useEffect(() => {
        try {
            const asked = localStorage.getItem("tc_gps_asked_v1");
            if (asked) return;
            const t = setTimeout(() => {
                localStorage.setItem("tc_gps_asked_v1", "1");
                requestGps();
            }, 1500);
            return () => clearTimeout(t);
        } catch { /* ignore */ }
        // eslint-disable-next-line
    }, []);

    const requestGps = () => {
        if (gpsRequested) return;
        setGpsRequested(true);
        if (!("geolocation" in navigator)) return;
        navigator.geolocation.getCurrentPosition(
            async (pos) => {
                try {
                    const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${pos.coords.latitude}&lon=${pos.coords.longitude}&zoom=10&addressdetails=1`, {
                        headers: { "Accept": "application/json" },
                    });
                    const j = await r.json();
                    const detected = j?.address?.city || j?.address?.town || j?.address?.state_district || j?.address?.county;
                    if (detected) {
                        const known = KNOWN_CITIES.find((c) => detected.toLowerCase().includes(c.toLowerCase()));
                        if (known) setCity(known);
                    }
                } catch { /* keep default */ }
            },
            () => { /* permission denied — keep default */ },
            { timeout: 8000, maximumAge: 60_000 * 60 * 24 }
        );
    };

    return (
        <CityContext.Provider value={{ city, setCity, requestGps }}>
            {children}
        </CityContext.Provider>
    );
};

export const useCity = () => useContext(CityContext);

export const KNOWN_CITIES = [
    "Bangalore", "Delhi", "Mumbai", "Chennai", "Pune", "Hyderabad", "Kolkata",
    "Ahmedabad", "Jaipur", "Lucknow", "Chandigarh", "Surat", "Indore", "Nagpur",
    "Coimbatore", "Kochi", "Bhopal", "Noida", "Gurgaon", "Faridabad", "Vadodara",
    "Ludhiana", "Visakhapatnam", "Thane", "Patna",
];
