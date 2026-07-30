"use client";

import { createContext, useCallback, useContext, useState } from "react";

export type Tema = "chiaro" | "scuro";

const CHIAVE_ARCHIVIO = "phantomlab-tema";

type ContestoTema = {
  tema: Tema;
  alterna: () => void;
  imposta: (tema: Tema) => void;
};

const Contesto = createContext<ContestoTema>({
  tema: "scuro",
  alterna: () => {},
  imposta: () => {},
});

export const useTema = () => useContext(Contesto);

/**
 * Script inline eseguito prima del primo paint: senza questo la pagina
 * comparirebbe scura per un istante anche quando l'utente preferisce il chiaro.
 */
export const scriptTemaIniziale = `
(function () {
  try {
    var salvato = localStorage.getItem("${CHIAVE_ARCHIVIO}");
    var telegram = window.Telegram && window.Telegram.WebApp;
    var tema = salvato
      || (telegram && telegram.colorScheme === "light" ? "chiaro" : null)
      || (window.matchMedia("(prefers-color-scheme: light)").matches ? "chiaro" : "scuro");
    document.documentElement.setAttribute("data-tema", tema);
  } catch (e) {
    document.documentElement.setAttribute("data-tema", "scuro");
  }
})();
`;

const coloriChrome: Record<Tema, string> = {
  scuro: "#0a0a0a",
  chiaro: "#f2f2ef",
};

export function TemaProvider({ children }: { children: React.ReactNode }) {
  // Legge il tema già applicato dallo script inline: sul server non c'è
  // document, quindi si parte da "scuro" e l'idratazione allinea il resto.
  const [tema, setTema] = useState<Tema>(() => {
    if (typeof document === "undefined") return "scuro";
    const attuale = document.documentElement.getAttribute("data-tema");
    return attuale === "chiaro" ? "chiaro" : "scuro";
  });

  const imposta = useCallback((nuovo: Tema) => {
    setTema(nuovo);
    document.documentElement.setAttribute("data-tema", nuovo);
    try {
      localStorage.setItem(CHIAVE_ARCHIVIO, nuovo);
    } catch {
      // Archiviazione non disponibile: il tema resta valido per la sessione.
    }

    const webApp = window.Telegram?.WebApp;
    webApp?.setHeaderColor?.(coloriChrome[nuovo]);
    webApp?.setBackgroundColor?.(coloriChrome[nuovo]);
  }, []);

  const alterna = useCallback(() => {
    imposta(tema === "scuro" ? "chiaro" : "scuro");
  }, [tema, imposta]);

  return (
    <Contesto.Provider value={{ tema, alterna, imposta }}>
      {children}
    </Contesto.Provider>
  );
}
