import React, { createContext, useContext, useEffect, useState } from "react";

const STORAGE_KEY = "tc_city";
const SET_KEY = "tc_city_set";
const DEFAULT_CITY = "Bangalore";

const CityContext = createContext(null);

export const CityProvider = ({ children }) => {
    const [city, setCityState] = useState(() => {
        try { return localStorage.getItem(STORAGE_KEY) || DEFAULT_CITY; }
        catch { return DEFAULT_CITY; }
    });
    // Whether the user (or GPS) has explicitly confirmed a city. Drives the
    // "Set your location" prompt on the homepage.
    const [citySet, setCitySet] = useState(() => {
        try { return localStorage.getItem(SET_KEY) === "1"; }
        catch { return false; }
    });
    const [gpsRequested, setGpsRequested] = useState(false);
    // Coachmark that points at the navbar city selector. Only shown when GPS
    // was denied/unavailable (or returned an unknown city) AND the user hasn't
    // picked a city or dismissed the hint before.
    const [locPrompt, setLocPrompt] = useState(false);

    const setCity = (c, explicit = true) => {
        setCityState(c);
        if (explicit) {
            setCitySet(true);
            setLocPrompt(false);
            try { localStorage.setItem(SET_KEY, "1"); } catch { /* ignore */ }
        }
    };

    const dismissLocationPrompt = () => {
        setLocPrompt(false);
        try { localStorage.setItem("tc_loc_dismissed_v1", "1"); } catch { /* ignore */ }
    };

    const maybeShowPrompt = () => {
        try {
            if (localStorage.getItem(SET_KEY) === "1") return;
            if (localStorage.getItem("tc_loc_dismissed_v1") === "1") return;
        } catch { /* ignore */ }
        setLocPrompt(true);
    };

    useEffect(() => {
        try { localStorage.setItem(STORAGE_KEY, city); } catch { /* ignore */ }
    }, [city]);

    // First session → ask the browser for location. Returning visitors who
    // never set a city → show the coachmark hint (no re-prompt of the OS dialog).
    useEffect(() => {
        try {
            const asked = localStorage.getItem("tc_gps_asked_v1");
            if (!asked) {
                const t = setTimeout(() => {
                    try { localStorage.setItem("tc_gps_asked_v1", "1"); } catch { /* ignore */ }
                    requestGps();
                }, 1200);
                return () => clearTimeout(t);
            }
            const t = setTimeout(() => maybeShowPrompt(), 1200);
            return () => clearTimeout(t);
        } catch { /* ignore */ }
        // eslint-disable-next-line
    }, []);

    const requestGps = () => {
        if (gpsRequested) return;
        setGpsRequested(true);
        if (!("geolocation" in navigator)) { maybeShowPrompt(); return; }
        navigator.geolocation.getCurrentPosition(
            async (pos) => {
                try {
                    const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${pos.coords.latitude}&lon=${pos.coords.longitude}&zoom=10&addressdetails=1`, {
                        headers: { "Accept": "application/json" },
                    });
                    const j = await r.json();
                    const detected = j?.address?.city || j?.address?.town || j?.address?.state_district || j?.address?.county;
                    const known = detected && KNOWN_CITIES.find((c) => detected.toLowerCase().includes(c.toLowerCase()));
                    if (known) { setCity(known); return; }
                    maybeShowPrompt(); // located, but not a city we serve from the list
                } catch { maybeShowPrompt(); }
            },
            () => { maybeShowPrompt(); }, // permission denied / error
            { timeout: 8000, maximumAge: 60_000 * 60 * 24 }
        );
    };

    return (
        <CityContext.Provider value={{ city, setCity, citySet, requestGps, locPrompt, dismissLocationPrompt }}>
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
