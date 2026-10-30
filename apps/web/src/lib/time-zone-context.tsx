import { createContext, useContext, type ReactNode } from 'react';
const TimeZone = createContext('UTC');
export function TimeZoneProvider({ value, children }: { value: string; children: ReactNode }) { return <TimeZone.Provider value={value}>{children}</TimeZone.Provider>; }
export const useTimeZone = () => useContext(TimeZone);
