"use client";

import { useEffect, useRef, useState } from "react";
import { Etichetta } from "@/components/ui";
import { Icone, type NomeIcona } from "@/components/icone";
import { ModuloAzione } from "@/components/modulo-azione";
import {
  bandisciSubito,
  creaBando,
  liberaIndirizzo,
  revocaBando,
  revocaEccezione,
} from "../azioni";
import { ConsoleRegistro } from "./console-registro";
import { Origine, type BersaglioBando } from "./riga-registro";
import { nomePaese, siglaPaese } from "@/lib/geo";
import { sottorete } from "@/lib/rete";
import type { SchedaRete } from "@/lib/rete-inversa";
import type { Istantanea, TipoEvento } from "@/lib/sorveglianza";
import type { TipoBando } from "@/generated/prisma/client";

/**
 * Sorveglianza del perimetro: cosa arriva, da dove, cosa è stato respinto.
 *
 * I dati non vengono dal server component ma da una chiamata periodica: il
 * quadro cambia di secondo in secondo, e una pagina renderizzata una volta
 * sola mostrerebbe una fotografia già vecchia nel momento in cui la si
 * guarda. L'aggiornamento si ferma quando la scheda passa in secondo piano
 * — nessuno legge un pannello che non sta guardando, e ogni giro è lavoro
 * sul server che si stava misurando.
 *
 * ---
 *
 * Sulla disposizione, che è cambiata per un motivo preciso.
 *
 * Il modulo di esclusione stava in fondo, sotto la console. La console è
 * un'area che scorre per conto suo, alta cinquecento pixel: si premeva
 * l'indirizzo dentro quella finestra e il modulo compariva fuori campo, in
 * un punto della pagina che nessuno stava guardando. Da telefono il gesto
 * era indistinguibile da un pulsante rotto — si toccava, e non succedeva
 * niente di visibile. Adesso il modulo sta in cima, la pagina ci scorre
 * sopra da sola e la riga si accende: tre segnali per la stessa cosa,
 * perché uno solo si può non vedere.
 */

const INTERVALLO_MS = 5000;

type Provvedimento = {
  id: string;
  tipo: TipoBando;
  valore: string;
  motivo: string;
  creatoIl: number;
  scadeIl: number | null;
};

type Eccezione = {
  id: string;
  ip: string;
  motivo: string;
  creatoIl: number;
  scadeIl: number | null;
};

type Dati = Istantanea & {
  /** utenteId → nome leggibile, tradotto dal server. */
  nomi: Record<string, string>;
  /** ip → esito della risoluzione inversa, per il marcatore VPN. */
  rete: Record<string, SchedaRete>;
  elenchi: {
    ip: number;
    sottoreti: number;
    dispositivi: number;
    account: number;
    eccezioni: number;
    aggiornatoIl: number;
  };
  provvedimenti: {
    bandi: Provvedimento[];
    eccezioni: Eccezione[];
    ricorsiAperti: number;
  };
  flussi: { connessioni: number; soggetti: number; massimoSingolo: number };
  carico: {
    utenti: number;
    abbonatiAttivi: number;
    attivazioniInAttesa: number;
    richiesteAperte: number;
    messaggiDaLeggere: number;
    letturaMs: number;
    erroreDatabase: string | null;
  };
  processo: {
    pid: number;
    node: string;
    attivoDaSecondi: number;
    memoriaMb: number;
    heapUsatoMb: number;
    heapTotaleMb: number;
  };
};

/* ------------------------------ Vocabolario ------------------------------ */

const ETICHETTE: Record<TipoEvento, string> = {
  sonda: "Sonda",
  iniezione: "Firma d'attacco",
  origine: "Origine non valida",
  frequenza: "Frequenza IP",
  frequenza_utente: "Frequenza utente",
  gate: "Password cantiere",
  webhook: "Webhook",
  flussi: "Connessioni SSE",
  accesso: "Accesso negato",
  esclusione: "Escluso dallo staff",
  quarantena: "In quarantena",
};

const ICONE_EVENTO: Record<TipoEvento, NomeIcona> = {
  sonda: "mirino",
  iniezione: "code",
  origine: "link",
  frequenza: "impulso",
  frequenza_utente: "utenti",
  gate: "shield",
  webhook: "telegram",
  flussi: "rete",
  accesso: "allarme",
  esclusione: "divieto",
  quarantena: "divieto",
};

const ETICHETTA_BANDO: Record<TipoBando, string> = {
  IP: "Indirizzo",
  SOTTORETE: "Rete",
  DISPOSITIVO: "Dispositivo",
};

const TITOLO_BERSAGLIO: Record<BersaglioBando, string> = {
  IP: "Escludi questo indirizzo",
  SOTTORETE: "Escludi questa rete",
  DISPOSITIVO: "Escludi questo dispositivo",
};

/**
 * Non tutti gli eventi pesano uguale. Un segreto del webhook sbagliato è
 * qualcuno che ha trovato l'indirizzo e sta provando a inventarsi un
 * aggiornamento; una sonda su /wp-admin è rumore di fondo di internet.
 * Il colore dice dove guardare per primo.
 */
const GRAVITA: Record<TipoEvento, "alta" | "media" | "bassa"> = {
  webhook: "alta",
  gate: "alta",
  accesso: "alta",
  iniezione: "alta",
  origine: "media",
  frequenza_utente: "media",
  flussi: "media",
  quarantena: "media",
  esclusione: "media",
  frequenza: "bassa",
  sonda: "bassa",
};

function coloreGravita(tipo: TipoEvento) {
  const gravita = GRAVITA[tipo];
  if (gravita === "alta") return "text-[var(--allarme)]";
  if (gravita === "media") return "text-[var(--accento)]";
  return "text-[var(--testo-tenue)]";
}

/* -------------------------------- Formati -------------------------------- */

function orario(quando: number) {
  return new Date(quando).toLocaleTimeString("it-IT", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function giorno(quando: number) {
  return new Date(quando).toLocaleDateString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });
}

function durata(millisecondi: number) {
  const minuti = Math.floor(millisecondi / 60000);
  if (minuti < 1) return "meno di un minuto";
  if (minuti < 60) return `${minuti} min`;
  const ore = Math.floor(minuti / 60);
  if (ore < 24) return `${ore}h ${minuti % 60}m`;
  return `${Math.floor(ore / 24)}g ${ore % 24}h`;
}

/** Migliaia separate: 12480 diventa illeggibile in una griglia di numeri. */
function cifra(valore: number) {
  return valore.toLocaleString("it-IT");
}

/* ------------------------------- Mattoni --------------------------------- */

function Sezione({
  icona,
  titolo,
  nota,
  accento,
  riferimento,
  children,
}: {
  icona: NomeIcona;
  titolo: string;
  nota?: string;
  accento?: boolean;
  riferimento?: React.Ref<HTMLElement>;
  children: React.ReactNode;
}) {
  const Icona = Icone[icona];
  return (
    <section ref={riferimento} className="border border-[var(--bordo)]">
      {/* min-w-0 sui due blocchi: senza, una nota lunga non va a capo e
          spinge il titolo fuori dal riquadro invece di scendere sotto. */}
      <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 border-b border-[var(--bordo)] px-3 py-3 sm:px-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <Icona
            className={`h-4 w-4 shrink-0 ${
              accento ? "text-[var(--allarme)]" : "text-[var(--accento)]"
            }`}
          />
          <Etichetta>{titolo}</Etichetta>
        </div>
        {nota && (
          <span className="mono min-w-0 text-[10.5px] break-words text-[var(--testo-debole)]">
            {nota}
          </span>
        )}
      </header>
      <div className="p-3 sm:p-4">{children}</div>
    </section>
  );
}

/** Griglia di numeri: il mattone che si ripete in quasi ogni sezione. */
function Cifre({
  voci,
  colonne = "sm:grid-cols-4",
}: {
  voci: {
    valore: string | number;
    etichetta: string;
    acceso?: boolean;
    tenue?: boolean;
  }[];
  colonne?: string;
}) {
  return (
    <div className={`grid grid-cols-2 gap-px bg-[var(--bordo)] ${colonne}`}>
      {voci.map((voce) => (
        <div key={voce.etichetta} className="min-w-0 bg-[var(--sfondo)] p-3">
          {/* clamp e tabular-nums: una cifra a sette caratteri usciva dalla
              cella su schermo stretto, e le colonne di numeri ballavano
              perché le glifi non avevano larghezza fissa. */}
          <span
            className={`display block text-[clamp(1rem,4.5vw,1.5rem)] leading-tight tabular-nums ${
              voce.acceso
                ? "text-[var(--allarme)]"
                : voce.tenue
                  ? "text-[var(--testo-tenue)]"
                  : ""
            }`}
          >
            {typeof voce.valore === "number" ? cifra(voce.valore) : voce.valore}
          </span>
          <Etichetta className="mt-1 block">{voce.etichetta}</Etichetta>
        </div>
      ))}
    </div>
  );
}

/** Bandierina testuale del paese, con il nome per chi non vede la sigla. */
function Paese({ codice }: { codice: string | null | undefined }) {
  return (
    <span
      aria-label={nomePaese(codice)}
      title={nomePaese(codice)}
      className="mono shrink-0 text-[10px] text-[var(--testo-debole)]"
    >
      {siglaPaese(codice)}
    </span>
  );
}

/**
 * I tre bersagli di un indirizzo, in fila: l'indirizzo, la sua rete, e —
 * dove c'è — il dispositivo. Compare accanto a ogni IP del pannello, così
 * la decisione si prende dove si sta già guardando invece di dover
 * ricopiare un valore in un modulo da un'altra parte.
 */
function Bersagli({
  ip,
  dispositivo,
  onScegli,
}: {
  ip: string;
  dispositivo?: string | null;
  onScegli: (tipo: BersaglioBando, valore: string) => void;
}) {
  const rete = sottorete(ip);
  const classe =
    "mono shrink-0 border border-[var(--bordo)] px-1.5 py-0.5 text-[9.5px] tracking-[0.06em] text-[var(--testo-debole)] uppercase transition-colors hover:border-[var(--allarme)] hover:text-[var(--allarme)]";

  return (
    <span className="flex flex-wrap items-center gap-1">
      <button
        type="button"
        onClick={() => onScegli("IP", ip)}
        title={`Escludi ${ip}`}
        className={classe}
      >
        IP
      </button>
      {rete && (
        <button
          type="button"
          onClick={() => onScegli("SOTTORETE", rete)}
          title={`Escludi la rete ${rete}`}
          className={classe}
        >
          /{rete.split("/")[1]}
        </button>
      )}
      {dispositivo && (
        <button
          type="button"
          onClick={() => onScegli("DISPOSITIVO", dispositivo)}
          title={`Escludi il dispositivo ${dispositivo}`}
          className={classe}
        >
          ⬡
        </button>
      )}
    </span>
  );
}

/* -------------------------------- Pannello -------------------------------- */

export function SezioneSorveglianza() {
  const [dati, setDati] = useState<Dati | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const [inPausa, setInPausa] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const pannelloBando = useRef<HTMLElement>(null);

  /**
   * Bozza di esclusione, riempita da un clic su una riga.
   *
   * Prima l'unico modo di bandire un dispositivo era copiare a mano
   * trentadue caratteri esadecimali da una riga di registro e incollarli in
   * un'altra scheda del pannello: un'operazione che si sbaglia, e che si
   * sbaglia in silenzio — un identificativo storto produce un bando che non
   * corrisponderà mai a nessuno. Il valore arriva qui direttamente dalla
   * riga che lo ha mostrato.
   */
  const [bozza, setBozza] = useState<{
    tipo: BersaglioBando;
    valore: string;
  } | null>(null);

  /** Minuto selezionato nel grafico: sul telefono il passaggio non esiste. */
  const [minutoScelto, setMinutoScelto] = useState<number | null>(null);

  const scegliBersaglio = (tipo: BersaglioBando, valore: string) => {
    setBozza({ tipo, valore });
    // Il pannello è in cima e la pagina può essere scorsa parecchio più in
    // basso: senza questo, la scelta resterebbe fuori campo — cioè
    // esattamente il difetto che questa riorganizzazione risolve.
    requestAnimationFrame(() => {
      pannelloBando.current?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    });
  };

  useEffect(() => {
    // Smontato il componente, le risposte ancora in volo non devono più
    // scrivere sullo stato: la richiesta parte prima e torna dopo.
    let vivo = true;

    const carica = async () => {
      try {
        const risposta = await fetch("/api/admin/sorveglianza", {
          cache: "no-store",
        });
        if (!risposta.ok) throw new Error(String(risposta.status));
        const corpo = await risposta.json();
        if (!vivo) return;
        setDati(corpo);
        setErrore(null);
      } catch {
        if (vivo) setErrore("Aggiornamento non riuscito.");
      }
    };

    void carica();

    const avvia = () => {
      if (timer.current) return;
      timer.current = setInterval(carica, INTERVALLO_MS);
    };
    const ferma = () => {
      if (!timer.current) return;
      clearInterval(timer.current);
      timer.current = null;
    };

    // La scheda nascosta non va aggiornata: il browser rallenterebbe
    // comunque l'intervallo, ma la richiesta continuerebbe a partire.
    const cambioVisibilita = () => {
      const nascosta = document.visibilityState === "hidden";
      setInPausa(nascosta);
      if (nascosta) ferma();
      else {
        void carica();
        avvia();
      }
    };

    avvia();
    document.addEventListener("visibilitychange", cambioVisibilita);

    return () => {
      vivo = false;
      ferma();
      document.removeEventListener("visibilitychange", cambioVisibilita);
    };
  }, []);

  if (!dati) {
    return (
      <p className="mono border border-[var(--bordo)] p-5 text-[12.5px] text-[var(--testo-tenue)]">
        {errore ?? "Lettura dello stato in corso…"}
      </p>
    );
  }

  const { minaccia, carico, processo, flussi, provvedimenti } = dati;
  const allarme = minaccia.livello === "allarme";
  const attenzione = minaccia.livello === "attenzione";
  const coloreMinaccia = allarme
    ? "text-[var(--allarme)]"
    : attenzione
      ? "text-[var(--accento)]"
      : "text-[var(--testo-tenue)]";

  const massimo = Math.max(...dati.traffico.map((r) => r.totale), 1);
  const dettaglioMinuto =
    minutoScelto !== null
      ? dati.traffico.find((riga) => riga.minuto === minutoScelto)
      : undefined;

  return (
    <div className="flex flex-col gap-4">
      {/* ---------------------------- Perimetro ---------------------------- */}
      <section
        className={`border p-4 sm:p-6 ${
          allarme
            ? "border-[var(--allarme)]"
            : attenzione
              ? "border-[var(--accento)]"
              : "border-[var(--bordo)]"
        }`}
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <Icone.impulso
              className={`mt-1 h-6 w-6 shrink-0 ${coloreMinaccia} ${
                allarme ? "animate-pulse" : ""
              }`}
            />
            <div className="min-w-0">
              <Etichetta>Stato del perimetro</Etichetta>
              <p
                className={`display mt-1 text-[clamp(1.5rem,5vw,2.4rem)] leading-none uppercase ${coloreMinaccia}`}
              >
                {minaccia.livello}
              </p>
              <p className="mono mt-2 text-[12px] break-words text-[var(--testo-tenue)]">
                {minaccia.motivo}
              </p>
            </div>
          </div>

          <div className="mono text-[10.5px] leading-[1.7] text-[var(--testo-debole)] sm:text-right">
            <span className="flex items-center gap-1.5 sm:justify-end">
              <span
                className={`inline-block h-1.5 w-1.5 rounded-full ${
                  inPausa
                    ? "bg-[var(--testo-debole)]"
                    : "animate-pulse bg-[var(--accento)]"
                }`}
              />
              {inPausa ? "in pausa" : `ogni ${INTERVALLO_MS / 1000}s`}
            </span>
            attivo da {durata(dati.adesso - dati.avvio)}
            <br />
            pid {processo.pid} · node {processo.node}
            {errore && (
              <>
                <br />
                <span className="text-[var(--allarme)]">{errore}</span>
              </>
            )}
          </div>
        </div>

        {provvedimenti.ricorsiAperti > 0 && (
          <p className="mono mt-4 border border-[var(--accento)] p-3 text-[11.5px] leading-[1.6] text-[var(--accento)]">
            {provvedimenti.ricorsiAperti}{" "}
            {provvedimenti.ricorsiAperti === 1
              ? "ricorso in attesa"
              : "ricorsi in attesa"}
            : qualcuno dice di essere stato bloccato per sbaglio. Li trovi
            nella scheda Ricorsi.
          </p>
        )}
      </section>

      {/* --------------------------- Esclusione ---------------------------- */}
      {/* In cima e non in fondo: vedi la nota in testa al file. */}
      <Sezione
        icona="divieto"
        titolo={bozza ? TITOLO_BERSAGLIO[bozza.tipo] : "Escludi"}
        nota={`in vigore: ${dati.elenchi.ip} IP · ${dati.elenchi.sottoreti} reti · ${dati.elenchi.dispositivi} dispositivi · ${dati.elenchi.account} account · ${dati.elenchi.eccezioni} eccezioni`}
        accento={Boolean(bozza)}
        riferimento={pannelloBando}
      >
        {!bozza ? (
          <p className="mono text-[11.5px] leading-[1.7] text-[var(--testo-tenue)]">
            Premi <span className="text-[var(--testo)]">IP</span>,{" "}
            <span className="text-[var(--testo)]">/24</span> o{" "}
            <span className="text-[var(--testo)]">⬡</span> accanto a un
            indirizzo, in qualunque elenco qui sotto, per prepararne
            l&apos;esclusione. Il modulo compare qui.
          </p>
        ) : (
          <div className={`evidenziata flex flex-col gap-3`}>
            <p className="mono border border-[var(--bordo)] p-3 text-[12px] break-all">
              <span className="text-[var(--testo-debole)]">
                {bozza.tipo === "IP"
                  ? "indirizzo "
                  : bozza.tipo === "SOTTORETE"
                    ? "rete "
                    : "dispositivo "}
              </span>
              {bozza.valore}
            </p>

            {bozza.tipo === "IP" && (
              <p className="mono text-[10.5px] leading-[1.7] text-[var(--testo-debole)]">
                Un indirizzo può essere condiviso da un intero ufficio o da
                una rete mobile: escluderlo può prendere dentro persone
                estranee. Se lo scopo è fermare qualcuno che cambia rete, il
                bando del dispositivo è più preciso.
              </p>
            )}

            {bozza.tipo === "SOTTORETE" && (
              <p className="mono text-[10.5px] leading-[1.7] text-[var(--allarme)]">
                Una rete /24 contiene fino a 254 indirizzi, una /16 oltre
                sessantacinquemila: il provvedimento colpisce anche chi non
                c&apos;entra. Chi resta chiuso fuori per sbaglio può
                segnalarlo dalla schermata di blocco, e il suo indirizzo si
                esenta dalla scheda Ricorsi senza revocare il bando.
              </p>
            )}

            {/* Due strade, e la differenza conta. Sopra il gesto immediato,
                per quando si sta guardando una cosa che succede adesso;
                sotto la decisione ponderata, con motivo e durata. Prima
                esisteva solo la seconda, e nel mezzo di una raffica
                significava compilare un modulo. */}
            <div className="flex flex-wrap gap-2">
              <ModuloAzione azione={bandisciSubito} className="contents">
                {({ inCorso }) => (
                  <>
                    <input type="hidden" name="tipo" value={bozza.tipo} />
                    <input type="hidden" name="valore" value={bozza.valore} />
                    <button
                      type="submit"
                      disabled={inCorso}
                      className="mono spinta min-h-11 border border-[var(--allarme)] bg-[var(--allarme)] px-5 text-[11px] tracking-[0.12em] text-white uppercase disabled:opacity-50"
                    >
                      {inCorso ? "Escludo…" : "Escludi subito"}
                    </button>
                  </>
                )}
              </ModuloAzione>
              <button
                type="button"
                onClick={() => setBozza(null)}
                className="mono spinta min-h-11 border border-[var(--bordo)] px-4 text-[11px] tracking-[0.12em] uppercase"
              >
                Annulla
              </button>
            </div>

            <ModuloAzione
              azione={creaBando}
              className="flex flex-col gap-2 border-t border-[var(--bordo)] pt-3"
            >
              {({ inCorso }) => (
                <>
                  <input type="hidden" name="tipo" value={bozza.tipo} />
                  <input type="hidden" name="valore" value={bozza.valore} />
                  <span className="mono text-[10px] tracking-[0.12em] text-[var(--testo-debole)] uppercase">
                    …oppure con motivo e durata
                  </span>
                  <div className="flex flex-wrap gap-2">
                    <input
                      name="motivo"
                      placeholder="Motivo — lo legge anche chi è bloccato"
                      aria-label="Motivo dell'esclusione"
                      className="mono min-h-11 min-w-[180px] flex-1 border border-[var(--bordo)] bg-[var(--sfondo)] px-3 text-[12px] outline-none focus:border-[var(--accento)]"
                    />
                    <input
                      name="giorni"
                      type="number"
                      min="0"
                      defaultValue="0"
                      aria-label="Giorni (0 = permanente)"
                      title="Giorni. 0 significa permanente."
                      className="mono min-h-11 w-24 border border-[var(--bordo)] bg-[var(--sfondo)] px-3 text-[12px] outline-none focus:border-[var(--accento)]"
                    />
                    <button
                      type="submit"
                      disabled={inCorso}
                      className="mono spinta min-h-11 border border-[var(--allarme)] px-5 text-[11px] tracking-[0.12em] text-[var(--allarme)] uppercase disabled:opacity-50"
                    >
                      {inCorso ? "…" : "Escludi"}
                    </button>
                  </div>
                </>
              )}
            </ModuloAzione>
          </div>
        )}
      </Sezione>

      {/* ------------------------- In tempo reale -------------------------- */}
      <Sezione
        icona="utenti"
        titolo="In tempo reale"
        nota={
          flussi.massimoSingolo > 0
            ? `punta di ${flussi.massimoSingolo} schede per un solo utente`
            : undefined
        }
      >
        <Cifre
          colonne="sm:grid-cols-3 lg:grid-cols-6"
          voci={[
            { valore: flussi.soggetti, etichetta: "Utenti collegati" },
            { valore: flussi.connessioni, etichetta: "Connessioni SSE" },
            { valore: dati.alMinuto, etichetta: "Richieste/min" },
            { valore: dati.ipAlMinuto, etichetta: "IP distinti/min" },
            {
              valore: dati.bloccateAlMinuto,
              etichetta: "Respinte/min",
              acceso: dati.bloccateAlMinuto > 0,
            },
            {
              valore: dati.quarantena.length,
              etichetta: "In quarantena",
              acceso: dati.quarantena.length > 0,
            },
          ]}
        />
      </Sezione>

      {/* ----------------------------- Console ----------------------------- */}
      <Sezione
        icona="registro"
        titolo="Console del traffico"
        nota={`${cifra(dati.totali.richieste)} richieste dall'avvio`}
        accento={dati.totali.perLivello.critico > 0}
      >
        <ConsoleRegistro
          righe={dati.registro}
          nomi={dati.nomi}
          rete={dati.rete}
          tracciate={dati.registroTracciato}
          puoBandire
          onBandisci={scegliBersaglio}
        />
      </Sezione>

      {/* ------------------------ Esclusioni in vigore --------------------- */}
      <Sezione
        icona="divieto"
        titolo={`Esclusioni in vigore (${provvedimenti.bandi.length})`}
        nota="lo staff collegato scavalca i bandi di rete, non quelli di account"
      >
        {provvedimenti.bandi.length === 0 ? (
          <p className="mono text-[12px] text-[var(--testo-tenue)]">
            Nessuna esclusione attiva.
          </p>
        ) : (
          <div className="divide-y divide-[var(--bordo)]">
            {provvedimenti.bandi.map((voce) => (
              <div
                key={voce.id}
                className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between sm:gap-4"
              >
                <div className="min-w-0">
                  <p className="mono text-[12.5px] break-all">
                    <span className="text-[var(--testo-debole)]">
                      {ETICHETTA_BANDO[voce.tipo]}
                    </span>{" "}
                    {voce.valore}
                  </p>
                  <p className="mono mt-1 text-[11px] break-words text-[var(--testo-tenue)]">
                    {voce.motivo}
                  </p>
                  <p className="mono mt-0.5 text-[10.5px] text-[var(--testo-debole)]">
                    dal {giorno(voce.creatoIl)} ·{" "}
                    {voce.scadeIl
                      ? `fino al ${giorno(voce.scadeIl)}`
                      : "permanente"}
                  </p>
                </div>
                <ModuloAzione
                  azione={revocaBando}
                  className="flex shrink-0 flex-col gap-2"
                >
                  {({ inCorso }) => (
                    <>
                      <input type="hidden" name="id" value={voce.id} />
                      <button
                        type="submit"
                        disabled={inCorso}
                        className="mono spinta min-h-11 border border-[var(--bordo)] px-4 text-[11px] tracking-[0.12em] uppercase disabled:opacity-50"
                      >
                        {inCorso ? "…" : "Revoca"}
                      </button>
                    </>
                  )}
                </ModuloAzione>
              </div>
            ))}
          </div>
        )}

        {provvedimenti.eccezioni.length > 0 && (
          <div className="mt-5 border-t border-[var(--bordo)] pt-4">
            <Etichetta className="block">
              Eccezioni ({provvedimenti.eccezioni.length})
            </Etichetta>
            <p className="mono mt-1.5 text-[10.5px] leading-[1.6] text-[var(--testo-debole)]">
              Indirizzi che passano nonostante il bando della loro rete.
              Nascono da un ricorso accolto.
            </p>
            <div className="mt-3 divide-y divide-[var(--bordo)]">
              {provvedimenti.eccezioni.map((voce) => (
                <div
                  key={voce.id}
                  className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between sm:gap-4"
                >
                  <div className="min-w-0">
                    <p className="mono text-[12.5px] break-all">{voce.ip}</p>
                    <p className="mono mt-0.5 text-[10.5px] break-words text-[var(--testo-debole)]">
                      {voce.motivo} · dal {giorno(voce.creatoIl)}
                    </p>
                  </div>
                  <ModuloAzione
                    azione={revocaEccezione}
                    className="flex shrink-0 flex-col gap-2"
                  >
                    {({ inCorso }) => (
                      <>
                        <input type="hidden" name="id" value={voce.id} />
                        <button
                          type="submit"
                          disabled={inCorso}
                          className="mono spinta min-h-11 border border-[var(--bordo)] px-4 text-[11px] tracking-[0.12em] uppercase disabled:opacity-50"
                        >
                          {inCorso ? "…" : "Revoca"}
                        </button>
                      </>
                    )}
                  </ModuloAzione>
                </div>
              ))}
            </div>
          </div>
        )}
      </Sezione>

      {/* ----------------------------- Account ----------------------------- */}
      <Sezione
        icona="utenti"
        titolo={`Account riconosciuti (${cifra(dati.utentiTracciati)})`}
        nota="l'indirizzo si lega all'account quando la sessione è attiva"
      >
        {dati.utenti.length === 0 ? (
          <p className="mono text-[12px] text-[var(--testo-tenue)]">
            Nessun account collegato da quando il processo è attivo. Il traffico
            anonimo resta identificato dal solo indirizzo.
          </p>
        ) : (
          /* Elenco su telefono, tabella su schermo largo. Una tabella a
             cinque colonne dentro un contenitore che scorre resta comunque
             illeggibile a 360 pixel: si vede una colonna per volta e si
             perde di vista la riga che si stava leggendo. */
          <div className="divide-y divide-[var(--bordo)] sm:hidden">
            {dati.utenti.map((riga) => (
              <div key={riga.utenteId} className="py-3 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <span className="mono text-[12.5px] font-semibold break-all">
                    {dati.nomi[riga.utenteId] ?? riga.telegramId}
                  </span>
                  <span className="mono text-[10px] text-[var(--testo-debole)]">
                    {riga.ruolo} · {orario(riga.ultimoVisto)}
                  </span>
                </div>
                <p className="mono mt-1 text-[11px]">
                  {cifra(riga.richieste)} richieste
                  {riga.eventi > 0 && (
                    <span className="text-[var(--allarme)]">
                      {" "}
                      · {riga.eventi} respinte
                    </span>
                  )}
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {riga.indirizzi.map((ip) => (
                    <span
                      key={ip}
                      className="mono border border-[var(--bordo)] px-1.5 py-0.5 text-[10px] break-all"
                    >
                      {ip}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {dati.utenti.length > 0 && (
          <div className="hidden overflow-x-auto sm:block">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-[var(--bordo)] text-left">
                  {["Account", "Ruolo", "Indirizzi", "Richieste", "Visto"].map(
                    (voce) => (
                      <th key={voce} className="pr-3 pb-2">
                        <Etichetta>{voce}</Etichetta>
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--bordo)]">
                {dati.utenti.map((riga) => (
                  <tr key={riga.utenteId}>
                    <td className="mono py-2 pr-3 text-[11.5px]">
                      {dati.nomi[riga.utenteId] ?? riga.telegramId}
                    </td>
                    <td className="mono py-2 pr-3 text-[11px] text-[var(--testo-tenue)]">
                      {riga.ruolo}
                    </td>
                    {/* Più di un indirizzo per lo stesso account non è di per
                        sé un problema — casa, telefono, ufficio — ma è la
                        prima cosa da guardare quando qualcosa non torna. */}
                    <td className="mono py-2 pr-3 text-[11px]">
                      <span className="flex flex-wrap gap-1">
                        {riga.indirizzi.map((ip) => (
                          <span
                            key={ip}
                            className="border border-[var(--bordo)] px-1.5 py-0.5 text-[10px]"
                          >
                            {ip}
                          </span>
                        ))}
                      </span>
                    </td>
                    <td className="mono py-2 pr-3 text-[11.5px]">
                      {cifra(riga.richieste)}
                      {riga.eventi > 0 && (
                        <span className="text-[var(--allarme)]">
                          {" "}
                          · {riga.eventi} respinte
                        </span>
                      )}
                    </td>
                    <td className="mono py-2 text-[11px] text-[var(--testo-debole)]">
                      {orario(riga.ultimoVisto)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Sezione>

      {/* ---------------------------- Traffico ----------------------------- */}
      <Sezione
        icona="grafico"
        titolo="Traffico dell'ultima ora"
        nota={`media ${dati.mediaAlMinuto}/min · punta ${cifra(dati.puntaOraria)}/min`}
      >
        <div
          className="flex h-28 items-end gap-px"
          role="img"
          aria-label={`Traffico dell'ultima ora, punta di ${dati.puntaOraria} richieste al minuto`}
        >
          {dati.traffico.map((riga) => {
            const altezza = (riga.totale / massimo) * 100;
            const quotaBloccate =
              riga.totale > 0 ? (riga.bloccate / riga.totale) * 100 : 0;
            const scelto = riga.minuto === minutoScelto;
            return (
              /* Il dettaglio si sceglie con un tocco e compare sotto, in una
                 riga fissa. Prima viveva in un fumetto su :hover — cioè non
                 esisteva affatto sul telefono, e sui due estremi del grafico
                 usciva comunque dallo schermo. */
              <button
                key={riga.minuto}
                type="button"
                onClick={() =>
                  setMinutoScelto(scelto ? null : riga.minuto)
                }
                aria-label={`${cifra(riga.totale)} richieste, ${riga.bloccate} respinte`}
                className="relative h-full flex-1"
              >
                <span
                  className={`absolute bottom-0 w-full transition-[height] duration-300 ${
                    scelto ? "bg-[var(--accento)]" : "bg-[var(--bordo-pieno)]"
                  }`}
                  style={{
                    height: `${Math.max(altezza, riga.totale > 0 ? 2 : 0)}%`,
                  }}
                >
                  {quotaBloccate > 0 && (
                    <span
                      className="absolute bottom-0 w-full bg-[var(--allarme)]"
                      style={{ height: `${quotaBloccate}%` }}
                    />
                  )}
                </span>
              </button>
            );
          })}
        </div>

        <div className="mono mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[10px] text-[var(--testo-debole)]">
          <span>60 min fa</span>
          <span className="flex items-center gap-3">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 bg-[var(--bordo-pieno)]" />
              servite
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 bg-[var(--allarme)]" />
              respinte
            </span>
          </span>
          <span>adesso</span>
        </div>

        <p
          aria-live="polite"
          className="mono mt-2 min-h-5 border-t border-[var(--bordo)] pt-2 text-[11px] text-[var(--testo-tenue)]"
        >
          {dettaglioMinuto
            ? `${orario(dettaglioMinuto.minuto * 60_000)} · ${cifra(dettaglioMinuto.totale)} richieste · ${dettaglioMinuto.bloccate} respinte · ${dettaglioMinuto.ipUnici} IP distinti`
            : "Tocca una barra per il dettaglio del minuto."}
        </p>
      </Sezione>

      {/* ----------------------------- Sistemi ----------------------------- */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Sezione
          icona="server"
          titolo="Processo"
          nota={`in piedi da ${durata(processo.attivoDaSecondi * 1000)}`}
        >
          <Cifre
            colonne="sm:grid-cols-4"
            voci={[
              { valore: `${processo.memoriaMb} MB`, etichetta: "Memoria (RSS)" },
              {
                valore: `${processo.heapUsatoMb}/${processo.heapTotaleMb}`,
                etichetta: "Heap MB",
              },
              { valore: dati.totali.richieste, etichetta: "Richieste totali" },
              {
                valore: dati.totali.eventi,
                etichetta: "Eventi totali",
                acceso: dati.totali.eventi > 0,
              },
            ]}
          />
          <p className="mono mt-3 text-[10.5px] leading-[1.6] text-[var(--testo-debole)]">
            Tracciati in memoria: {cifra(dati.ipTracciati)} indirizzi,{" "}
            {cifra(dati.sospettiTracciati)} sotto osservazione,{" "}
            {cifra(dati.percorsiTracciati)} percorsi. Ogni struttura ha un
            tetto e scarta le voci più vecchie: la memoria non cresce con il
            traffico.
          </p>
        </Sezione>

        <Sezione
          icona="database"
          titolo="Carico applicativo"
          nota={
            carico.erroreDatabase
              ? "database non raggiungibile"
              : `lettura in ${carico.letturaMs} ms`
          }
          accento={Boolean(carico.erroreDatabase)}
        >
          {carico.erroreDatabase ? (
            <p className="mono mb-3 border border-[var(--allarme)] p-3 text-[11.5px] break-all text-[var(--allarme)]">
              {carico.erroreDatabase}
            </p>
          ) : null}
          <Cifre
            colonne="sm:grid-cols-3"
            voci={[
              { valore: carico.utenti, etichetta: "Utenti" },
              { valore: carico.abbonatiAttivi, etichetta: "Abbonati attivi" },
              {
                valore: carico.attivazioniInAttesa,
                etichetta: "Da attivare",
                acceso: carico.attivazioniInAttesa > 0,
              },
              { valore: carico.richiesteAperte, etichetta: "Pratiche aperte" },
              {
                valore: carico.messaggiDaLeggere,
                etichetta: "Messaggi da leggere",
                acceso: carico.messaggiDaLeggere > 0,
              },
              {
                valore: dati.totali.quarantene,
                etichetta: "Quarantene applicate",
                tenue: dati.totali.quarantene === 0,
              },
            ]}
          />
          <p className="mono mt-3 text-[10.5px] leading-[1.6] text-[var(--testo-debole)]">
            Aggiornato al massimo ogni 30 secondi: sono cifre che cambiano
            lentamente, e interrogare il database a ogni giro farebbe pesare
            il monitoraggio più di ciò che monitora.
          </p>
        </Sezione>
      </div>

      {/* ---------------------------- Quarantena --------------------------- */}
      {dati.quarantena.length > 0 && (
        <Sezione
          icona="divieto"
          titolo={`Indirizzi in quarantena (${dati.quarantena.length})`}
          nota="automatica e temporanea; lo staff collegato non viene mai bloccato"
          accento
        >
          <div className="divide-y divide-[var(--bordo)]">
            {dati.quarantena.map((voce) => (
              <div
                key={voce.ip}
                className="flex flex-col gap-3 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="mono flex flex-wrap items-center gap-2 text-[13px] font-semibold break-all">
                    {voce.ip}
                    <Bersagli ip={voce.ip} onScegli={scegliBersaglio} />
                  </p>
                  <p className="mono mt-1 text-[11px] break-words text-[var(--testo-tenue)]">
                    {voce.motivo}
                  </p>
                  <p className="mono mt-0.5 flex items-center gap-1.5 text-[10.5px] text-[var(--testo-debole)]">
                    <Icone.orologio className="h-3 w-3 shrink-0" />
                    si sblocca fra {durata(Math.max(voce.fino - dati.adesso, 0))}
                  </p>
                </div>
                <ModuloAzione
                  azione={liberaIndirizzo}
                  className="flex shrink-0 flex-col gap-2"
                >
                  {({ inCorso }) => (
                    <>
                      <input type="hidden" name="ip" value={voce.ip} />
                      <button
                        type="submit"
                        disabled={inCorso}
                        className="mono spinta min-h-11 border border-[var(--bordo)] px-4 text-[11px] tracking-[0.12em] uppercase disabled:opacity-50"
                      >
                        {inCorso ? "…" : "Libera"}
                      </button>
                    </>
                  )}
                </ModuloAzione>
              </div>
            ))}
          </div>
        </Sezione>
      )}

      {/* --------------------------- Chi insiste --------------------------- */}
      {dati.sospetti.length > 0 && (
        <Sezione
          icona="allarme"
          titolo={`Indirizzi con eventi (${cifra(dati.sospettiTracciati)})`}
          nota="ordinati per numero di tentativi respinti"
        >
          <div className="divide-y divide-[var(--bordo)]">
            {dati.sospetti.map((voce) => (
              <div key={voce.ip} className="py-3 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <span className="mono flex min-w-0 flex-wrap items-center gap-2 text-[13px] font-semibold">
                    {voce.inQuarantena && (
                      <Icone.divieto className="h-3.5 w-3.5 shrink-0 text-[var(--allarme)]" />
                    )}
                    <span className="break-all">{voce.ip}</span>
                    <Origine rete={dati.rete[voce.ip]} />
                    <Bersagli ip={voce.ip} onScegli={scegliBersaglio} />
                  </span>
                  <span className="mono text-[11px] text-[var(--testo-tenue)]">
                    {voce.eventi} respinte su {cifra(voce.richieste)} richieste
                    · {orario(voce.ultimo)}
                  </span>
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {Object.entries(voce.tipi).map(([tipo, quanti]) => (
                    <span
                      key={tipo}
                      className={`mono border border-[var(--bordo)] px-1.5 py-0.5 text-[10px] ${coloreGravita(tipo as TipoEvento)}`}
                    >
                      {ETICHETTE[tipo as TipoEvento]} ×{quanti}
                    </span>
                  ))}
                </div>
                {voce.agente && (
                  <p className="mono mt-1 truncate text-[10px] text-[var(--testo-debole)]">
                    {voce.agente}
                  </p>
                )}
              </div>
            ))}
          </div>
        </Sezione>
      )}

      {/* ------------------------------ Eventi ----------------------------- */}
      <Sezione
        icona="registro"
        titolo={`Giornale degli eventi (${cifra(dati.eventiUltimaOra)} nell'ultima ora)`}
        nota={
          dati.totali.eventi > 0
            ? `${cifra(dati.totali.eventi)} dall'avvio`
            : undefined
        }
      >
        {Object.keys(dati.perTipo).length > 0 && (
          <div className="mb-3 flex flex-wrap gap-2">
            {Object.entries(dati.perTipo)
              .sort((a, b) => b[1] - a[1])
              .map(([tipo, quanti]) => {
                const Icona = Icone[ICONE_EVENTO[tipo as TipoEvento]];
                return (
                  <span
                    key={tipo}
                    className={`mono flex items-center gap-1.5 border border-[var(--bordo)] px-2 py-1 text-[10px] tracking-[0.08em] uppercase ${coloreGravita(tipo as TipoEvento)}`}
                  >
                    <Icona className="h-3 w-3 shrink-0" />
                    {ETICHETTE[tipo as TipoEvento]} · {quanti}
                  </span>
                );
              })}
          </div>
        )}

        {dati.eventi.length === 0 ? (
          <p className="mono py-2 text-[12.5px] text-[var(--testo-tenue)]">
            Nessun evento da quando il processo è attivo. È la situazione
            normale: qui compare solo ciò che è stato respinto.
          </p>
        ) : (
          <div className="max-h-[420px] divide-y divide-[var(--bordo)] overflow-y-auto">
            {dati.eventi.map((evento) => {
              const Icona = Icone[ICONE_EVENTO[evento.tipo]];
              return (
                <div key={evento.id} className="flex gap-3 py-2.5 first:pt-0">
                  <Icona
                    className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${coloreGravita(evento.tipo)}`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <span className="mono text-[11px] text-[var(--testo-debole)]">
                        {orario(evento.quando)}
                      </span>
                      <span
                        className={`mono text-[11px] font-semibold tracking-[0.08em] uppercase ${coloreGravita(evento.tipo)}`}
                      >
                        {ETICHETTE[evento.tipo]}
                      </span>
                      <span className="mono text-[12px] break-all">
                        {evento.ip}
                      </span>
                      <Bersagli ip={evento.ip} onScegli={scegliBersaglio} />
                    </div>
                    <p className="mono mt-1 text-[11.5px] break-all text-[var(--testo-tenue)]">
                      {evento.metodo} {evento.percorso}
                      {evento.dettaglio ? ` — ${evento.dettaglio}` : ""}
                    </p>
                    {evento.agente && (
                      <p className="mono mt-0.5 truncate text-[10.5px] text-[var(--testo-debole)]">
                        {evento.agente}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Sezione>

      {/* --------------------- Percorsi e indirizzi ------------------------ */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Sezione icona="mirino" titolo="Percorsi più richiesti">
          {dati.percorsi.length === 0 ? (
            <p className="mono text-[12px] text-[var(--testo-tenue)]">
              Nessun traffico registrato.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {dati.percorsi.map((voce) => {
                const quota = (voce.quante / dati.percorsi[0].quante) * 100;
                return (
                  <div key={voce.percorso} className="min-w-0">
                    <div className="mono flex items-baseline justify-between gap-3 text-[11.5px]">
                      <span className="truncate">{voce.percorso || "/"}</span>
                      <span className="shrink-0 tabular-nums text-[var(--testo-tenue)]">
                        {cifra(voce.quante)}
                      </span>
                    </div>
                    <div
                      className="mt-1 h-1 bg-[var(--bordo-pieno)]"
                      style={{ width: `${Math.max(quota, 1)}%` }}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </Sezione>

        <Sezione
          icona="rete"
          titolo="Indirizzi per volume"
          nota={`${cifra(dati.ipTracciati)} in memoria`}
        >
          {/* Anche qui elenco su telefono e tabella su schermo largo: quattro
              colonne più i bersagli non stanno in 360 pixel. */}
          <div className="divide-y divide-[var(--bordo)]">
            {dati.indirizzi.map((riga) => (
              <div key={riga.ip} className="py-2.5 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <span className="mono flex min-w-0 flex-wrap items-center gap-1.5 text-[11.5px]">
                    <Paese codice={riga.paese} />
                    <span className="break-all">{riga.ip}</span>
                    <Origine rete={dati.rete[riga.ip]} />
                    <Bersagli
                      ip={riga.ip}
                      dispositivo={riga.dispositivo}
                      onScegli={scegliBersaglio}
                    />
                  </span>
                  <span className="mono shrink-0 text-[10.5px] tabular-nums text-[var(--testo-debole)]">
                    {cifra(riga.richieste)} richieste
                    {riga.bloccate > 0 && (
                      <span className="text-[var(--allarme)]">
                        {" "}
                        · {riga.bloccate} respinte
                      </span>
                    )}{" "}
                    · {orario(riga.ultimoVisto)}
                  </span>
                </div>
                {riga.dispositivo && (
                  <p
                    title={`Dispositivo ${riga.dispositivo}`}
                    className="mono mt-0.5 text-[10px] text-[var(--testo-debole)]"
                  >
                    ⬡{riga.dispositivo.slice(0, 12)}
                  </p>
                )}
              </div>
            ))}
          </div>
        </Sezione>
      </div>

      <p className="mono text-[10.5px] leading-[1.7] text-[var(--testo-debole)]">
        Il quadro qui sopra vive nella memoria del processo e un riavvio lo
        azzera: è voluto — scrivere ogni evento a database, proprio mentre
        arriva un flusso ostile, aggraverebbe il problema che si sta
        osservando. L&apos;archivio duraturo è la scheda Logs, che riceve le
        stesse righe a lotti e le conserva per un anno. Le richieste al
        webhook di Telegram non sono conteggiate: arrivano da pochi indirizzi
        e a raffica, e falserebbero ogni media.
      </p>
    </div>
  );
}
