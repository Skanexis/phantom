"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";
import {
  BottonePieno,
  BottoneVuoto,
  Etichetta,
  Freccia,
} from "@/components/ui";

const SCATTO = [0.16, 1, 0.3, 1] as const;

export function SezioneHero({
  badge,
  titolo,
  sottotitolo,
  ctaPrimaria,
  ctaSecondaria,
}: {
  badge: string;
  titolo: string;
  sottotitolo: string;
  ctaPrimaria: string;
  ctaSecondaria: string;
}) {
  const ridotto = useReducedMotion();
  const righe = spezzaInRighe(titolo);

  return (
    <section className="reticolo relative border-b border-[var(--bordo)]">
      <div className="colonne relative mx-auto w-full max-w-[1400px] px-4 sm:px-8">
        {/* Barra di stato superiore */}
        <div className="flex items-center justify-between border-b border-[var(--bordo)] py-3">
          <Etichetta>{badge}</Etichetta>
          <Orologio />
        </div>

        {/* Una colonna sola.
            Qui accanto c'era una "scheda tecnica": il sottotitolo più tre
            righe di dati (Ambiti 04, Consegna 5–30 gg, Pannello incluso).
            È stata tolta per due motivi che vanno insieme. Il primo è di
            sostanza: quei valori erano scritti nel codice, quindi
            invecchiavano da soli — "Ambiti 04" restava 04 anche
            aggiungendo un servizio dal pannello, e nessuno se ne sarebbe
            accorto. Il secondo è di attenzione: sopra la piega la pagina
            deve portare a una cosa sola, e tre dati non modificabili
            competevano con i pulsanti senza aggiungere niente. */}
        <div className="py-14 sm:py-24">
          <div className="max-w-4xl">
            <h1 className="display text-[clamp(2.75rem,11vw,8.5rem)]">
              {righe.map((riga, indiceRiga) => (
                <span key={indiceRiga} className="block overflow-hidden">
                  <motion.span
                    initial={{ y: ridotto ? 0 : "100%" }}
                    animate={{ y: 0 }}
                    transition={{
                      duration: ridotto ? 0.01 : 0.75,
                      delay: ridotto ? 0 : indiceRiga * 0.09,
                      ease: SCATTO,
                    }}
                    className="block"
                  >
                    {riga}
                  </motion.span>
                </span>
              ))}
            </h1>

            {/* Il sottotitolo resta, ma sotto il titolo invece che in una
                colonna a fianco: è testo modificabile dal pannello
                (`hero.sottotitolo`), e toglierlo avrebbe reso muto un campo
                che qualcuno continua a compilare. Quello che è sparito è la
                tabella di dati scritti nel codice, che invece non era
                modificabile da nessuna parte. */}
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: ridotto ? 0 : 0.4, duration: 0.5 }}
              className="mono mt-8 max-w-2xl text-[13px] leading-[1.75] text-[var(--testo-tenue)] sm:text-[14px]"
            >
              {sottotitolo}
            </motion.p>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: ridotto ? 0 : 0.5, duration: 0.5 }}
              className="mt-10 flex flex-col gap-3 sm:flex-row"
            >
              <BottonePieno href="/richiesta">
                {ctaPrimaria}
                <Freccia className="h-3.5 w-3.5" />
              </BottonePieno>
              <BottoneVuoto href="#abbonamenti">{ctaSecondaria}</BottoneVuoto>
            </motion.div>
          </div>
        </div>
      </div>

      {/* Nastro scorrevole a piè di sezione */}
      <div className="overflow-hidden border-t border-[var(--bordo)] bg-[var(--accento)]">
        <div className="nastro flex w-max">
          {Array.from({ length: 2 }).map((_, blocco) => (
            <div key={blocco} className="flex shrink-0">
              {[
                "SITI WEB",
                "APPLICAZIONI",
                "AUTOMAZIONE",
                "BOT TELEGRAM",
                "MINI APP",
                "INTEGRAZIONI",
              ].map((voce) => (
                <span
                  key={`${blocco}-${voce}`}
                  className="mono flex items-center gap-6 px-6 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--accento-testo)]"
                >
                  {voce}
                  <span aria-hidden="true">✳</span>
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/** Divide il titolo in 2–3 righe bilanciate, per un blocco tipografico compatto. */
function spezzaInRighe(titolo: string) {
  const parole = titolo.split(" ").filter(Boolean);
  if (parole.length <= 2) return parole;

  const numeroRighe = parole.length >= 6 ? 3 : 2;
  const perRiga = Math.ceil(parole.length / numeroRighe);

  const righe: string[] = [];
  for (let i = 0; i < parole.length; i += perRiga) {
    righe.push(parole.slice(i, i + perRiga).join(" "));
  }
  return righe;
}

/** Orologio tecnico: monta solo lato client per evitare disallineamenti. */
function Orologio() {
  const [ora, setOra] = useState<string | null>(null);

  useEffect(() => {
    const aggiorna = () =>
      setOra(
        new Date().toLocaleTimeString("it-IT", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        }),
      );
    aggiorna();
    const id = setInterval(aggiorna, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <span className="mono text-[11px] tracking-[0.1em] text-[var(--testo-debole)]">
      {ora ?? "--:--:--"}
    </span>
  );
}
