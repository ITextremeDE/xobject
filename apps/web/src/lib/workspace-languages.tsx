import { createContext, useContext, type ReactNode } from 'react';
import { languageCodes, type Language } from '@xobject/contracts';
const LabelLanguages = createContext<readonly Language[]>(languageCodes);
export function WorkspaceLanguageProvider({ languages = languageCodes, children }: { languages?: readonly Language[]; children: ReactNode }) {
  return <LabelLanguages.Provider value={languages}>{children}</LabelLanguages.Provider>;
}
export const useLabelLanguages = () => useContext(LabelLanguages);
