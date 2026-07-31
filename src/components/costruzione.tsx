"use client";

import { useEffect, useRef } from "react";

/**
 * Il marchio che si costruisce da solo, blocco per blocco.
 *
 * I pezzi arrivano dai bordi e si incastrano al loro posto; a intervalli
 * una porzione cede, i blocchi si staccano e vengono rimessi — il sito è
 * in costruzione e in riparazione insieme, e si vede.
 *
 * Tutto su canvas e senza librerie: la CSP del sito vieta gli script di
 * terze parti, e un'animazione di questo tipo su elementi DOM
 * significherebbe centinaia di nodi animati contemporaneamente.
 */

type Blocco = {
  /** Posizione a riposo, quella definitiva dentro il marchio. */
  destinazioneX: number;
  destinazioneY: number;
  x: number;
  y: number;
  /** Velocità corrente, usata per l'inerzia dell'atterraggio. */
  vx: number;
  vy: number;
  /** Ritardo prima di partire, in millisecondi dall'inizio della fase. */
  ritardo: number;
  /** Quando > 0 il blocco è staccato e sta tornando: alimenta il colore. */
  rottura: number;
};

const PAROLE = ["PHANTOM", "LAB"];

/** Lato del singolo blocco e passo di campionamento, in pixel logici. */
function passoPerLarghezza(larghezza: number) {
  if (larghezza < 380) return 4;
  if (larghezza < 700) return 5;
  return 6;
}

export function MarchioCostruito() {
  const contenitore = useRef<HTMLDivElement>(null);
  const tela = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const elemento = contenitore.current;
    const canvas = tela.current;
    if (!elemento || !canvas) return;

    const contesto = canvas.getContext("2d");
    if (!contesto) return;

    const ridotto = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    let blocchi: Blocco[] = [];
    let larghezza = 0;
    let altezza = 0;
    let lato = 4;
    let animazione = 0;
    let inizioFase = 0;
    let prossimaRottura = 0;
    let vivo = true;

    /** Colori presi dal tema: la pagina esiste in chiaro e in scuro. */
    const stile = getComputedStyle(document.documentElement);
    const accento = stile.getPropertyValue("--accento").trim() || "#d6ff3f";
    const testo = stile.getPropertyValue("--testo").trim() || "#f5f5f0";

    /**
     * Ricava le posizioni dei blocchi disegnando il testo fuori schermo e
     * leggendo quali pixel sono coperti. È l'unico modo per far combaciare
     * la griglia con la forma reale delle lettere del carattere del sito.
     */
    function calcolaBlocchi() {
      const rettangolo = elemento!.getBoundingClientRect();
      larghezza = Math.max(1, Math.floor(rettangolo.width));
      altezza = Math.max(1, Math.floor(rettangolo.height));

      const passo = passoPerLarghezza(larghezza);
      lato = Math.max(2, passo - 1);

      const fuori = document.createElement("canvas");
      fuori.width = larghezza;
      fuori.height = altezza;
      const ctx = fuori.getContext("2d", { willReadFrequently: true });
      if (!ctx) return;

      // Carattere del sito, letto dall'elemento reale: scriverlo a mano
      // qui significherebbe divergere al primo cambio di tipografia.
      const famiglia =
        getComputedStyle(elemento!).fontFamily || "system-ui, sans-serif";

      // Interlinea compatta: le due parole devono leggersi come un blocco
      // unico, come nel resto del sito.
      const rapportoInterlinea = 0.86;

      // La dimensione va limitata su entrambi gli assi. Adattandola alla
      // sola larghezza, su uno schermo largo e basso il marchio esce dal
      // riquadro e viene tagliato in cima.
      const RIFERIMENTO = 100;
      ctx.font = `900 ${RIFERIMENTO}px ${famiglia}`;
      const larghezzaTesto = Math.max(
        ...PAROLE.map((p) => ctx.measureText(p).width),
      );

      const perLarghezza = (larghezza * 0.94 * RIFERIMENTO) / larghezzaTesto;
      const perAltezza =
        (altezza * 0.92) / (PAROLE.length * rapportoInterlinea);
      const dimensione = Math.floor(Math.min(perLarghezza, perAltezza));

      ctx.font = `900 ${dimensione}px ${famiglia}`;
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#ffffff";

      const interlinea = dimensione * rapportoInterlinea;
      const totale = interlinea * PAROLE.length;
      const partenzaY = (altezza - totale) / 2 + interlinea / 2;

      PAROLE.forEach((parola, riga) => {
        const larghezzaParola = ctx.measureText(parola).width;
        ctx.fillText(
          parola,
          (larghezza - larghezzaParola) / 2,
          partenzaY + riga * interlinea,
        );
      });

      const dati = ctx.getImageData(0, 0, larghezza, altezza).data;
      const nuovi: Blocco[] = [];

      for (let y = 0; y < altezza; y += passo) {
        for (let x = 0; x < larghezza; x += passo) {
          // Solo il canale alfa: il testo è bianco pieno su trasparente.
          const alfa = dati[(y * larghezza + x) * 4 + 3];
          if (alfa < 128) continue;

          nuovi.push({
            destinazioneX: x,
            destinazioneY: y,
            ...posizioneDiPartenza(x, y),
            vx: 0,
            vy: 0,
            // Ritardo legato alla colonna: il marchio si costruisce da
            // sinistra a destra invece di comparire tutto insieme.
            ritardo: (x / larghezza) * 900 + Math.random() * 260,
            rottura: 0,
          });
        }
      }

      blocchi = nuovi;
      inizioFase = performance.now();
      prossimaRottura = inizioFase + 3800;
    }

    /** Punto d'ingresso fuori dal riquadro, dal bordo più vicino. */
    function posizioneDiPartenza(x: number, y: number) {
      const daiLati = Math.random() < 0.65;
      if (daiLati) {
        return {
          x:
            x < larghezza / 2
              ? -60 - Math.random() * 220
              : larghezza + 60 + Math.random() * 220,
          y: y + (Math.random() - 0.5) * 120,
        };
      }
      return {
        x: x + (Math.random() - 0.5) * 160,
        y:
          y < altezza / 2
            ? -60 - Math.random() * 160
            : altezza + 60 + Math.random() * 160,
      };
    }

    function adattaTela() {
      // Il rapporto pixel è limitato a 2: oltre, su telefoni ad alta densità
      // si disegnerebbero quattro volte i pixel necessari senza differenza
      // visibile, con il ventilatore acceso.
      const rapporto = Math.min(window.devicePixelRatio || 1, 2);
      canvas!.width = Math.floor(larghezza * rapporto);
      canvas!.height = Math.floor(altezza * rapporto);
      canvas!.style.width = `${larghezza}px`;
      canvas!.style.height = `${altezza}px`;
      contesto!.setTransform(rapporto, 0, 0, rapporto, 0, 0);
    }

    /** Stacca una zona di blocchi: il pezzo "cede" e poi si rimette. */
    function rompiUnaZona(ora: number) {
      if (blocchi.length === 0) return;

      const centro = blocchi[Math.floor(Math.random() * blocchi.length)];
      const raggio = 26 + Math.random() * 46;

      for (const blocco of blocchi) {
        const dx = blocco.destinazioneX - centro.destinazioneX;
        const dy = blocco.destinazioneY - centro.destinazioneY;
        if (dx * dx + dy * dy > raggio * raggio) continue;

        const distanza = Math.sqrt(dx * dx + dy * dy) || 1;
        const spinta = 2.6 + Math.random() * 3.4;
        blocco.vx += (dx / distanza) * spinta;
        blocco.vy += (dy / distanza) * spinta - 1.4;
        blocco.rottura = 1;
      }

      // Intervallo variabile: a cadenza fissa diventerebbe un battito
      // prevedibile, che è esattamente ciò che stanca guardando.
      prossimaRottura = ora + 2600 + Math.random() * 3200;
    }

    function disegna(ora: number) {
      if (!vivo) return;

      const trascorso = ora - inizioFase;
      contesto!.clearRect(0, 0, larghezza, altezza);

      if (ora > prossimaRottura && trascorso > 2600) rompiUnaZona(ora);

      for (const blocco of blocchi) {
        if (trascorso < blocco.ritardo) continue;

        // Molla verso la destinazione con attrito: l'arrivo decelera da
        // solo, senza bisogno di curve di temporizzazione.
        const forzaX = (blocco.destinazioneX - blocco.x) * 0.12;
        const forzaY = (blocco.destinazioneY - blocco.y) * 0.12;
        blocco.vx = (blocco.vx + forzaX) * 0.82;
        blocco.vy = (blocco.vy + forzaY) * 0.82;
        blocco.x += blocco.vx;
        blocco.y += blocco.vy;

        if (blocco.rottura > 0)
          blocco.rottura = Math.max(0, blocco.rottura - 0.012);

        const scarto =
          Math.abs(blocco.destinazioneX - blocco.x) +
          Math.abs(blocco.destinazioneY - blocco.y);

        // Un blocco lontano dal posto è ancora "in lavorazione": resta
        // acceso finché non si assesta.
        contesto!.fillStyle =
          blocco.rottura > 0.02 ? accento : scarto > 1.5 ? accento : testo;

        contesto!.fillRect(
          Math.round(blocco.x),
          Math.round(blocco.y),
          lato,
          lato,
        );
      }

      animazione = requestAnimationFrame(disegna);
    }

    /** Stato finale immobile, per chi ha chiesto meno movimento. */
    function disegnaFermo() {
      contesto!.clearRect(0, 0, larghezza, altezza);
      contesto!.fillStyle = testo;
      for (const blocco of blocchi) {
        contesto!.fillRect(
          blocco.destinazioneX,
          blocco.destinazioneY,
          lato,
          lato,
        );
      }
    }

    function avvia() {
      calcolaBlocchi();
      adattaTela();

      if (ridotto) {
        disegnaFermo();
        return;
      }

      cancelAnimationFrame(animazione);
      animazione = requestAnimationFrame(disegna);
    }

    // I caratteri arrivano dopo il primo paint: campionare prima darebbe
    // la forma del carattere di ripiego, con un marchio sbagliato.
    let osservatore: ResizeObserver | null = null;

    document.fonts.ready.then(() => {
      if (!vivo) return;
      avvia();

      let ultimaLarghezza = larghezza;
      osservatore = new ResizeObserver(() => {
        const nuova = elemento.getBoundingClientRect().width;
        // Solo cambi reali: su mobile la barra degli indirizzi che si
        // ritrae cambia l'altezza in continuazione e rifare i calcoli a
        // ogni pixel farebbe ripartire l'animazione senza motivo.
        if (Math.abs(nuova - ultimaLarghezza) < 24) return;
        ultimaLarghezza = nuova;
        avvia();
      });
      osservatore.observe(elemento);
    });

    // A scheda nascosta il ciclo si ferma: nessun senso a disegnare per
    // nessuno, e sul telefono è batteria risparmiata.
    const allaVisibilita = () => {
      if (document.hidden) {
        cancelAnimationFrame(animazione);
      } else if (!ridotto && vivo) {
        animazione = requestAnimationFrame(disegna);
      }
    };
    document.addEventListener("visibilitychange", allaVisibilita);

    // Un tocco sul marchio provoca una rottura: la pagina risponde, invece
    // di limitarsi a scorrere.
    const alTocco = (evento: PointerEvent) => {
      if (ridotto || blocchi.length === 0) return;
      const rettangolo = canvas.getBoundingClientRect();
      const x = evento.clientX - rettangolo.left;
      const y = evento.clientY - rettangolo.top;

      for (const blocco of blocchi) {
        const dx = blocco.destinazioneX - x;
        const dy = blocco.destinazioneY - y;
        const distanza2 = dx * dx + dy * dy;
        if (distanza2 > 90 * 90) continue;
        const distanza = Math.sqrt(distanza2) || 1;
        const spinta = 9 * (1 - distanza / 90);
        blocco.vx += (dx / distanza) * spinta;
        blocco.vy += (dy / distanza) * spinta;
        blocco.rottura = 1;
      }
    };
    canvas.addEventListener("pointerdown", alTocco);

    return () => {
      vivo = false;
      cancelAnimationFrame(animazione);
      osservatore?.disconnect();
      document.removeEventListener("visibilitychange", allaVisibilita);
      canvas.removeEventListener("pointerdown", alTocco);
    };
  }, []);

  return (
    <div
      ref={contenitore}
      /* La classe "display" porta il carattere dei titoli: il campionamento
         lo legge da qui, così marchio e tipografia restano allineati. */
      className="display relative h-[38vh] max-h-[420px] min-h-[190px] w-full touch-none select-none"
      style={{ letterSpacing: 0 }}
    >
      <canvas ref={tela} className="absolute inset-0" aria-hidden="true" />
    </div>
  );
}

/**
 * Nastro di stato che scorre in orizzontale, come un cartello di cantiere.
 * Il contenuto è duplicato: la seconda copia entra mentre la prima esce,
 * così lo scorrimento non ha inizio né fine visibili.
 */
export function NastroCantiere({ voci }: { voci: string[] }) {
  const contenuto = [...voci, ...voci];

  return (
    <div className="relative overflow-hidden border-y border-[var(--bordo)] py-2.5">
      <div className="nastro flex w-max gap-8">
        {contenuto.map((voce, indice) => (
          <span
            key={`${voce}-${indice}`}
            className="mono flex shrink-0 items-center gap-8 text-[11px] tracking-[0.18em] whitespace-nowrap uppercase text-[var(--testo-tenue)]"
          >
            {voce}
            <span aria-hidden="true" className="text-[var(--accento)]">
              ◆
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}
