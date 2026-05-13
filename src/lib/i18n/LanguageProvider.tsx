import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { Locale } from "./translations";
import { t as translate } from "./translations";

type Lang = "BM" | "EN";

interface LangContextValue {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: string) => string;
}

const STORAGE_KEY = "sp_lang";

const LangContext = createContext<LangContextValue | null>(null);

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [lang, setLangState] = useState<Lang>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === "EN" || saved === "BM") return saved;
    } catch {}
    return "EN";
  });

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, lang); } catch {}
  }, [lang]);

  const setLang = (l: Lang) => setLangState(l);

  const value = useMemo(() => ({
    lang,
    setLang,
    t: (key: string) => {
      const locale = lang === "EN" ? "en" : "bm";
      return translate(locale as any, key as any) ?? key;
    },
  }), [lang]);

  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
};

export function useLanguage() {
  const ctx = useContext(LangContext);
  if (!ctx) throw new Error("useLanguage must be used within LanguageProvider");
  return ctx;
}
