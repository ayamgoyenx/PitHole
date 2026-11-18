import { createContext, useContext } from 'react';
export const LocaleContext = createContext(null);
export function useI18n() { return useContext(LocaleContext); }
