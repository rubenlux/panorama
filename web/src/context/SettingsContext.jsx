import React, { createContext, useContext, useState, useEffect } from 'react';
import { apiJson } from '../api';

const SettingsContext = createContext();

export function SettingsProvider({ children }) {
    const [settings, setSettings] = useState({});
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        apiJson('/settings')
            .then(res => {
                setSettings(res.settings || {});
                // Apply Favicon immediately if exists
                if (res.settings?.site_favicon) {
                    let link = document.querySelector("link[rel~='icon']");
                    if (!link) {
                        link = document.createElement('link');
                        link.rel = 'icon';
                        document.getElementsByTagName('head')[0].appendChild(link);
                    }
                    link.href = res.settings.site_favicon;
                }
                // Apply Site Title if set
                if (res.settings?.site_title) {
                    document.title = res.settings.site_title;
                }
            })
            .catch(console.error)
            .finally(() => setLoading(false));
    }, []);

    return (
        <SettingsContext.Provider value={{ settings, loading }}>
            {children}
        </SettingsContext.Provider>
    );
}

export function useSettings() {
    return useContext(SettingsContext);
}
