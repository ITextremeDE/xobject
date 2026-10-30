import { createContext, useContext, type ReactNode } from 'react';
import { defaultRegionalSettings, type RegionalSettings } from '@xobject/contracts';
const Regional = createContext<RegionalSettings>(defaultRegionalSettings);
export function RegionalProvider({ value, children }: { value: RegionalSettings; children: ReactNode }) { return <Regional.Provider value={value}>{children}</Regional.Provider>; }
export const useRegional = () => useContext(Regional);
