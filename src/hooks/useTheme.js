import { useState, useEffect } from 'react';

export const useTheme = () => {
    const [theme, setTheme] = useState(localStorage.getItem('theme') || 'coquette');
    
    useEffect(() => {
        const handler = () => {
            setTheme(localStorage.getItem('theme') || 'coquette');
        };
        window.addEventListener('themechange', handler);
        return () => window.removeEventListener('themechange', handler);
    }, []);
    
    return theme;
};
