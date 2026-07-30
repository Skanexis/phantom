"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

export type UtenteSessione = {
  id: string;
  nome: string | null;
  cognome: string | null;
  username: string | null;
  ruolo: "UTENTE" | "ADMIN";
};

type ContestoTelegram = {
  pronto: boolean;
  dentroTelegram: boolean;
  utente: UtenteSessione | null;
  aggiorna: () => Promise<void>;
  esci: () => Promise<void>;
};

const Contesto = createContext<ContestoTelegram>({
  pronto: false,
  dentroTelegram: false,
  utente: null,
  aggiorna: async () => {},
  esci: async () => {},
});

export const useTelegram = () => useContext(Contesto);

type WebApp = {
  ready: () => void;
  expand: () => void;
  initData: string;
  colorScheme?: "light" | "dark";
  setHeaderColor?: (colore: string) => void;
  setBackgroundColor?: (colore: string) => void;
  openTelegramLink?: (url: string) => void;
  HapticFeedback?: {
    impactOccurred?: (stile: string) => void;
    notificationOccurred?: (tipo: string) => void;
  };
};

declare global {
  interface Window {
    Telegram?: { WebApp?: WebApp };
  }
}

/** Vibrazione leggera sui gesti principali, se disponibile in Telegram. */
export function vibra(tipo: "leggero" | "successo" | "errore" = "leggero") {
  const haptic = window.Telegram?.WebApp?.HapticFeedback;
  if (!haptic) return;
  if (tipo === "leggero") haptic.impactOccurred?.("light");
  else haptic.notificationOccurred?.(tipo === "successo" ? "success" : "error");
}

export function TelegramProvider({ children }: { children: React.ReactNode }) {
  const [stato, setStato] = useState<{
    pronto: boolean;
    dentroTelegram: boolean;
    utente: UtenteSessione | null;
  }>({
    pronto: false,
    dentroTelegram: false,
    utente: null,
  });

  const aggiorna = useCallback(async () => {
    const webApp = window.Telegram?.WebApp;
    const initData = webApp?.initData ?? "";
    const dentroTelegram = Boolean(initData);

    try {
      // Dentro Telegram: autenticazione automatica con initData firmato.
      if (dentroTelegram) {
        const risposta = await fetch("/api/auth/telegram", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ initData }),
        });
        const dati = await risposta.json().catch(() => null);
        setStato({
          pronto: true,
          dentroTelegram,
          utente: risposta.ok ? (dati?.utente ?? null) : null,
        });
        return;
      }

      // Da browser: nessun login implicito, si legge solo la sessione esistente.
      const risposta = await fetch("/api/auth/sessione");
      const dati = await risposta.json().catch(() => null);
      setStato({
        pronto: true,
        dentroTelegram: false,
        utente: dati?.utente ?? null,
      });
    } catch {
      setStato({ pronto: true, dentroTelegram, utente: null });
    }
  }, []);

  const esci = useCallback(async () => {
    try {
      await fetch("/api/auth/sessione", { method: "DELETE" });
    } catch {
      // Anche se la chiamata fallisce azzero lo stato locale.
    }
    setStato((precedente) => ({ ...precedente, utente: null }));
  }, []);

  useEffect(() => {
    const webApp = window.Telegram?.WebApp;
    if (webApp) {
      webApp.ready();
      webApp.expand();
    }
    // Rimandato di un tick: evita il setState sincrono durante l'effect.
    const id = setTimeout(aggiorna, 0);
    return () => clearTimeout(id);
  }, [aggiorna]);

  return (
    <Contesto.Provider value={{ ...stato, aggiorna, esci }}>
      {children}
    </Contesto.Provider>
  );
}
