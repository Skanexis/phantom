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
  /**
   * Vero mentre il blocco è staccato: cade con gravità e ruota, e non
   * viene richiamato verso casa finché la saldatura non lo raggiunge.
   */
  staccato: boolean;
  /** Rotazione del frammento, solo mentre è staccato. */
  angolo: number;
  velocitaAngolare: number;
  /** Da 1 a 0 subito dopo il riaggancio: è il lampo della saldatura. */
  saldatura: number;
  /** Punto da cui è arrivata la riparazione, per tracciare l'arco. */
  sorgenteX: number;
  sorgenteY: number;
};

/** Scintilla effimera sprigionata dal punto di saldatura. */
type Scintilla = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  vita: number;
};

/**
 * Arco di saldatura: il lampo che collega la testa di riparazione al
 * blocco appena rimesso. Dura pochi fotogrammi ed è ciò che rende
 * leggibile *da dove* arriva la riparazione.
 */
type Arco = {
  daX: number;
  daY: number;
  aX: number;
  aY: number;
  vita: number;
};

/**
 * Onda che ripara: parte dal centro del cedimento e cresce. I blocchi
 * tornano a posto quando l'onda li raggiunge, non tutti insieme — così la
 * riparazione si vede procedere invece di essere un rimbalzo unico.
 */
type Riparazione = {
  x: number;
  y: number;
  raggio: number;
  raggioMassimo: number;
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
    let scintille: Scintilla[] = [];
    let riparazioni: Riparazione[] = [];
    let archi: Arco[] = [];
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
    // Punta della saldatura: più chiara dell'accento in entrambi i temi,
    // così il picco di calore si distingue dal resto senza introdurre un
    // colore estraneo alla tavolozza.
    const incandescente = "#ffffff";

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
            staccato: false,
            angolo: 0,
            velocitaAngolare: 0,
            saldatura: 0,
            sorgenteX: 0,
            sorgenteY: 0,
          });
        }
      }

      blocchi = nuovi;
      scintille = [];
      riparazioni = [];
      archi = [];
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

    /**
     * Fa cedere una porzione del marchio.
     *
     * La forma del cedimento cambia ogni volta: una zona che esplode, una
     * banda che scivola, una colonna che frana. Una sola forma ripetuta si
     * riconosce dopo due giri e smette di attirare l'attenzione.
     */
    function rompiUnaZona(ora: number) {
      if (blocchi.length === 0) return;

      const seme = blocchi[Math.floor(Math.random() * blocchi.length)];
      const centroX = seme.destinazioneX;
      const centroY = seme.destinazioneY;
      const forma = Math.floor(Math.random() * 3);

      // Le misure seguono la dimensione del marchio: in pixel fissi lo
      // stesso cedimento cancella metà logo sul telefono e sfiora appena
      // una lettera sul desktop.
      const raggio = larghezza * (0.05 + Math.random() * 0.06);
      const spessore = altezza * (0.03 + Math.random() * 0.05);
      let colpiti = 0;

      for (const blocco of blocchi) {
        if (blocco.staccato) continue;

        const dx = blocco.destinazioneX - centroX;
        const dy = blocco.destinazioneY - centroY;

        let dentro = false;
        if (forma === 0) {
          // Cedimento a cratere.
          dentro = dx * dx + dy * dy <= raggio * raggio;
        } else if (forma === 1) {
          // Banda orizzontale: una fascia del marchio si sfila di lato.
          dentro = Math.abs(dy) <= spessore;
        } else {
          // Colonna verticale: una fetta frana verso il basso.
          dentro = Math.abs(dx) <= spessore;
        }

        if (!dentro) continue;

        colpiti += 1;
        blocco.staccato = true;
        blocco.saldatura = 0;
        blocco.velocitaAngolare = (Math.random() - 0.5) * 0.34;

        if (forma === 0) {
          const distanza = Math.sqrt(dx * dx + dy * dy) || 1;
          const spinta = 2.2 + Math.random() * 3.6;
          blocco.vx += (dx / distanza) * spinta;
          blocco.vy += (dy / distanza) * spinta - 1.6;
        } else if (forma === 1) {
          const verso = Math.random() < 0.5 ? -1 : 1;
          blocco.vx += verso * (2.4 + Math.random() * 3.2);
          blocco.vy += (Math.random() - 0.5) * 1.6;
        } else {
          blocco.vx += (Math.random() - 0.5) * 1.8;
          blocco.vy += 1.4 + Math.random() * 2.2;
        }
      }

      if (colpiti === 0) return;

      // L'onda di riparazione parte dopo una pausa: il pezzo deve restare
      // rotto abbastanza da vedersi, altrimenti sembra un tremolio.
      const raggioMassimo =
        forma === 0 ? raggio + larghezza * 0.08 : Math.max(larghezza, altezza);

      setTimeout(
        () => {
          if (!vivo) return;
          riparazioni.push({
            x: centroX,
            y: centroY,
            raggio: 0,
            raggioMassimo,
          });
        },
        520 + Math.random() * 380,
      );

      // Intervallo variabile: a cadenza fissa diventerebbe un battito
      // prevedibile, che è esattamente ciò che stanca guardando.
      prossimaRottura = ora + 3000 + Math.random() * 3400;
    }

    /**
     * Avanza le onde di riparazione e libera i blocchi che raggiungono.
     * Un blocco liberato torna verso casa e, arrivato, lampeggia.
     */
    function avanzaRiparazioni() {
      for (let i = riparazioni.length - 1; i >= 0; i -= 1) {
        const onda = riparazioni[i];
        // Anche l'avanzamento segue la scala: a passo fisso la saldatura
        // striscerebbe sul desktop e sfreccerebbe sul telefono.
        onda.raggio += Math.max(2.5, larghezza * 0.009);

        for (const blocco of blocchi) {
          if (!blocco.staccato) continue;

          const dx = blocco.destinazioneX - onda.x;
          const dy = blocco.destinazioneY - onda.y;
          if (dx * dx + dy * dy > onda.raggio * onda.raggio) continue;

          // Riagganciato: da qui torna a casa con la molla e smette di
          // ruotare, così l'atterraggio è netto. La sorgente resta in
          // memoria per tracciare l'arco al momento dell'incastro.
          blocco.staccato = false;
          blocco.velocitaAngolare = 0;
          blocco.sorgenteX = onda.x;
          blocco.sorgenteY = onda.y;
        }

        // Scintille lungo il fronte dell'onda: la testa di saldatura
        // lavora mentre avanza, non solo quando incastra un blocco.
        if (onda.raggio > 2 && scintille.length < 200) {
          const angolo = Math.random() * Math.PI * 2;
          scintille.push({
            x: onda.x + Math.cos(angolo) * onda.raggio,
            y: onda.y + Math.sin(angolo) * onda.raggio,
            vx: Math.cos(angolo) * 0.8,
            vy: Math.sin(angolo) * 0.8 - 0.3,
            vita: 0.7,
          });
        }

        if (onda.raggio > onda.raggioMassimo) riparazioni.splice(i, 1);
      }
    }

    /** Scintille al punto di saldatura, poche e di vita breve. */
    function accendiScintille(x: number, y: number) {
      if (scintille.length > 160) return;
      const quante = 2 + Math.floor(Math.random() * 3);
      for (let i = 0; i < quante; i += 1) {
        const angolo = Math.random() * Math.PI * 2;
        const velocita = 0.6 + Math.random() * 1.8;
        scintille.push({
          x,
          y,
          vx: Math.cos(angolo) * velocita,
          vy: Math.sin(angolo) * velocita - 0.5,
          vita: 1,
        });
      }
    }

    function disegna(ora: number) {
      if (!vivo) return;

      const trascorso = ora - inizioFase;
      contesto!.clearRect(0, 0, larghezza, altezza);

      if (ora > prossimaRottura && trascorso > 2600) rompiUnaZona(ora);
      avanzaRiparazioni();

      // Le onde di saldatura, sotto ai blocchi: un anello sottile che si
      // allarga e sbiadisce mentre percorre la zona da rimettere.
      for (const onda of riparazioni) {
        const forza = 1 - onda.raggio / onda.raggioMassimo;
        if (forza <= 0) continue;

        // Anello a segmenti anziché continuo: una circonferenza piena
        // sembra un'onda sonora, i tratti leggono come uno strumento che
        // percorre il bordo del guasto.
        const segmenti = 20;
        const rotazione = (ora / 420) % (Math.PI * 2);
        contesto!.strokeStyle = accento;
        contesto!.lineWidth = 1.4;
        contesto!.globalAlpha = Math.max(0, forza) * 0.65;

        for (let s = 0; s < segmenti; s += 1) {
          const da = rotazione + (s / segmenti) * Math.PI * 2;
          contesto!.beginPath();
          contesto!.arc(onda.x, onda.y, onda.raggio, da, da + 0.14);
          contesto!.stroke();
        }
        contesto!.globalAlpha = 1;
      }

      // Archi di saldatura: tratto sottile e brevissimo dalla testa al
      // blocco appena incastrato.
      for (let i = archi.length - 1; i >= 0; i -= 1) {
        const arco = archi[i];
        arco.vita -= 0.14;
        if (arco.vita <= 0) {
          archi.splice(i, 1);
          continue;
        }

        contesto!.strokeStyle = incandescente;
        contesto!.globalAlpha = arco.vita * 0.75;
        contesto!.lineWidth = 1;
        contesto!.beginPath();
        contesto!.moveTo(arco.daX, arco.daY);
        contesto!.lineTo(arco.aX, arco.aY);
        contesto!.stroke();
        contesto!.globalAlpha = 1;
      }

      for (const blocco of blocchi) {
        if (trascorso < blocco.ritardo) continue;

        const distanzaDaCasa =
          Math.abs(blocco.destinazioneX - blocco.x) +
          Math.abs(blocco.destinazioneY - blocco.y);

        if (blocco.staccato) {
          // Frammento libero: cade e ruota, senza richiamo verso casa.
          blocco.vy += 0.16;
          blocco.vx *= 0.99;
          blocco.x += blocco.vx;
          blocco.y += blocco.vy;
          blocco.angolo += blocco.velocitaAngolare;
        } else {
          // Molla verso la destinazione con attrito: l'arrivo decelera da
          // solo, senza bisogno di curve di temporizzazione.
          const forzaX = (blocco.destinazioneX - blocco.x) * 0.12;
          const forzaY = (blocco.destinazioneY - blocco.y) * 0.12;
          blocco.vx = (blocco.vx + forzaX) * 0.82;
          blocco.vy = (blocco.vy + forzaY) * 0.82;
          blocco.x += blocco.vx;
          blocco.y += blocco.vy;
          blocco.angolo *= 0.8;

          // Appena rientrato dopo un volo: lampo di saldatura e scintille,
          // una volta sola per rientro.
          if (distanzaDaCasa < 1.2 && blocco.saldatura === 0) {
            const velocita = Math.abs(blocco.vx) + Math.abs(blocco.vy);
            if (velocita > 0.5) {
              blocco.saldatura = 1;
              accendiScintille(blocco.destinazioneX, blocco.destinazioneY);

              // L'arco parte dalla testa di riparazione e arriva al blocco:
              // rende visibile la provenienza dell'intervento.
              if (blocco.sorgenteX || blocco.sorgenteY) {
                archi.push({
                  daX: blocco.sorgenteX,
                  daY: blocco.sorgenteY,
                  aX: blocco.destinazioneX + lato / 2,
                  aY: blocco.destinazioneY + lato / 2,
                  vita: 1,
                });
              }
            }
          }
        }

        if (blocco.saldatura > 0) {
          blocco.saldatura = Math.max(0, blocco.saldatura - 0.045);
        }

        // Raffreddamento della saldatura: bianco incandescente, poi
        // accento, poi il colore normale. È la sequenza che rende il lampo
        // leggibile come metallo che si raffredda invece di un semplice
        // cambio di tinta.
        const inMovimento = blocco.staccato || distanzaDaCasa > 1.5;
        contesto!.fillStyle =
          blocco.saldatura > 0.62
            ? incandescente
            : blocco.saldatura > 0.02 || inMovimento
              ? accento
              : testo;

        // La rotazione costa un salvataggio di contesto per blocco: la si
        // paga solo sui frammenti in volo, che sono una minoranza.
        if (blocco.angolo > 0.01 || blocco.angolo < -0.01) {
          const mezzo = lato / 2;
          contesto!.save();
          contesto!.translate(blocco.x + mezzo, blocco.y + mezzo);
          contesto!.rotate(blocco.angolo);
          contesto!.fillRect(-mezzo, -mezzo, lato, lato);
          contesto!.restore();
        } else if (blocco.saldatura > 0.02) {
          // Durante il lampo il blocco è leggermente più grande: la
          // saldatura si legge senza introdurre un terzo colore.
          contesto!.fillRect(
            Math.round(blocco.x) - 1,
            Math.round(blocco.y) - 1,
            lato + 2,
            lato + 2,
          );
        } else {
          contesto!.fillRect(
            Math.round(blocco.x),
            Math.round(blocco.y),
            lato,
            lato,
          );
        }
      }

      // Scintille sopra a tutto: sono l'ultimo dettaglio della saldatura.
      contesto!.fillStyle = accento;
      for (let i = scintille.length - 1; i >= 0; i -= 1) {
        const scintilla = scintille[i];
        scintilla.x += scintilla.vx;
        scintilla.y += scintilla.vy;
        scintilla.vy += 0.06;
        scintilla.vita -= 0.035;

        if (scintilla.vita <= 0) {
          scintille.splice(i, 1);
          continue;
        }

        contesto!.globalAlpha = scintilla.vita;
        contesto!.fillRect(scintilla.x, scintilla.y, 1.5, 1.5);
      }
      contesto!.globalAlpha = 1;

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

      // Proporzionale al marchio, come per i cedimenti automatici.
      const raggioTocco = larghezza * 0.12;

      for (const blocco of blocchi) {
        const dx = blocco.destinazioneX - x;
        const dy = blocco.destinazioneY - y;
        const distanza2 = dx * dx + dy * dy;
        if (distanza2 > raggioTocco * raggioTocco) continue;
        const distanza = Math.sqrt(distanza2) || 1;
        const spinta = 8 * (1 - distanza / raggioTocco);
        blocco.vx += (dx / distanza) * spinta;
        blocco.vy += (dy / distanza) * spinta;
        blocco.staccato = true;
        blocco.saldatura = 0;
        blocco.velocitaAngolare = (Math.random() - 0.5) * 0.3;
      }

      // La saldatura parte dal punto toccato: il pezzo si rimette da solo
      // poco dopo, come per i cedimenti automatici.
      setTimeout(() => {
        if (!vivo) return;
        riparazioni.push({
          x,
          y,
          raggio: 0,
          raggioMassimo: raggioTocco + larghezza * 0.06,
        });
      }, 480);
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
