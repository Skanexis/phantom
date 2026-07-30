"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTelegram } from "@/components/telegram-provider";

type MessaggioEvento = {
  id: string;
  testo: string;
  daAdmin: boolean;
  creatoIl: string;
};

type Evento = {
  tipo: string;
  nonLette?: number;
  richiestaId?: string;
  codice?: string;
  messaggio?: MessaggioEvento;
};

type Contesto = {
  /** Notifiche non lette, aggiornate in tempo reale. */
  nonLette: number;
  /** Forza un valore, per l'aggiornamento ottimista dopo "segna come lette". */
  impostaNonLette: (valore: number) => void;
  /** Registra un ascoltatore sugli eventi in arrivo. Restituisce la rimozione. */
  ascolta: (ascoltatore: (evento: Evento) => void) => () => void;
};

const ContestoFlusso = createContext<Contesto>({
  nonLette: 0,
  impostaNonLette: () => {},
  ascolta: () => () => {},
});

export const useFlusso = () => useContext(ContestoFlusso);

/**
 * Connessione SSE unica per tutta l'applicazione.
 *
 * Il badge si aggiornava solo al caricamento della pagina: un messaggio
 * dell'amministratore restava invisibile fino a un ricaricamento manuale.
 * Con un solo flusso condiviso, badge e conversazioni ricevono lo stesso
 * evento senza aprire una connessione ciascuno.
 */
export function FlussoProvider({ children }: { children: React.ReactNode }) {
  const [nonLette, setNonLette] = useState(0);
  const { utente } = useTelegram();
  // Gli ascoltatori stanno in un ref: aggiungerne uno non deve far
  // ricollegare il flusso.
  const ascoltatori = useRef(new Set<(evento: Evento) => void>());

  useEffect(() => {
    if (!utente) return;

    // EventSource riconnette da solo alla caduta della rete, rispettando
    // il "retry" inviato dal server: non serve un ciclo di ritentativi.
    const sorgente = new EventSource("/api/flusso");

    const gestisci = (evento: MessageEvent) => {
      let dati: Evento;
      try {
        dati = { tipo: evento.type, ...JSON.parse(evento.data) };
      } catch {
        return;
      }

      if (typeof dati.nonLette === "number") setNonLette(dati.nonLette);
      for (const ascoltatore of ascoltatori.current) ascoltatore(dati);
    };

    for (const tipo of ["stato", "notifica", "messaggio"]) {
      sorgente.addEventListener(tipo, gestisci);
    }

    return () => {
      for (const tipo of ["stato", "notifica", "messaggio"]) {
        sorgente.removeEventListener(tipo, gestisci);
      }
      sorgente.close();
    };
  }, [utente]);

  const valore = useMemo<Contesto>(
    () => ({
      // Derivato invece che azzerato in un effetto: uscendo dall'account il
      // badge deve sparire subito, senza un render intermedio col vecchio
      // conteggio.
      nonLette: utente ? nonLette : 0,
      impostaNonLette: setNonLette,
      ascolta: (ascoltatore) => {
        ascoltatori.current.add(ascoltatore);
        return () => {
          ascoltatori.current.delete(ascoltatore);
        };
      },
    }),
    [nonLette, utente],
  );

  return (
    <ContestoFlusso.Provider value={valore}>{children}</ContestoFlusso.Provider>
  );
}
