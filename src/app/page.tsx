import Link from "next/link";
import { Navigazione } from "@/components/navigazione";
import { SezioneHero } from "@/components/sezione-hero";
import { Rivela, Scaglionato, Voce } from "@/components/animazioni";
import { Icona } from "@/components/icone";
import { FaqLista } from "@/components/faq-lista";
import { PiedePagina } from "@/components/piede-pagina";
import { CaroselloAbbonamenti } from "@/components/carosello-abbonamenti";
import {
  BottonePieno,
  Etichetta,
  Freccia,
  TitoloSezione,
} from "@/components/ui";
import { caricaDatiHomepage, formattaPrezzo, testo } from "@/lib/contenuti";

export const dynamic = "force-dynamic";

const ambitiSuMisura = [
  { etichetta: "Sito web", ambito: "SITO_WEB", codice: "01" },
  { etichetta: "Applicazione", ambito: "APPLICAZIONE", codice: "02" },
  { etichetta: "Automazione", ambito: "AUTOMAZIONE", codice: "03" },
];

export default async function Home() {
  const { contenuti, servizi, vantaggi, abbonamenti, automazioni, faq, contatti } =
    await caricaDatiHomepage();

  const automazioniScegliibili = automazioni.filter((a) => a.selezionabile);
  const automazioneInclusa = automazioni.find((a) => !a.selezionabile);

  return (
    <div className="flex min-h-full flex-col">
      <Navigazione />

      <main className="flex-1">
        <SezioneHero
          badge={testo(contenuti, "hero.badge")}
          titolo={testo(contenuti, "hero.titolo")}
          sottotitolo={testo(contenuti, "hero.sottotitolo")}
          ctaPrimaria={testo(contenuti, "hero.cta.primaria")}
          ctaSecondaria={testo(contenuti, "hero.cta.secondaria")}
        />

        {/* 01 — Chi siamo */}
        <Sezione>
          <Rivela>
            <div className="grid gap-8 lg:grid-cols-[240px_1fr] lg:gap-16">
              <div className="border-t border-[var(--bordo)] pt-5">
                <Etichetta className="text-[var(--accento)]">01</Etichetta>
                <p className="mono mt-3 text-[12px] uppercase tracking-[0.12em]">
                  {testo(contenuti, "azienda.titolo")}
                </p>
              </div>
              <p className="text-[20px] leading-[1.45] tracking-[-0.01em] sm:text-[28px]">
                {testo(contenuti, "azienda.testo")}
              </p>
            </div>
          </Rivela>
        </Sezione>

        {/* 02 — Servizi */}
        <Sezione id="servizi">
          <Rivela>
            <TitoloSezione
              numero="02"
              titolo={testo(contenuti, "servizi.titolo")}
              descrizione={testo(contenuti, "servizi.sottotitolo")}
            />
          </Rivela>

          <Scaglionato className="mt-12 grid border-t border-[var(--bordo)] sm:grid-cols-2">
            {servizi.map((servizio, indice) => (
              <Voce key={servizio.id}>
                <article className="group relative h-full border-b border-r border-[var(--bordo)] p-7 transition-colors hover:bg-[var(--sfondo-alt)] sm:p-9">
                  <div className="flex items-start justify-between">
                    <Icona
                      nome={servizio.icona}
                      className="h-7 w-7 text-[var(--testo)] transition-colors group-hover:text-[var(--accento)]"
                    />
                    <Etichetta>{String(indice + 1).padStart(2, "0")}</Etichetta>
                  </div>
                  <h3 className="display mt-10 text-[26px] sm:text-[32px]">
                    {servizio.titolo}
                  </h3>
                  <p className="mono mt-3 text-[12.5px] leading-[1.7] text-[var(--testo-tenue)]">
                    {servizio.descrizione}
                  </p>
                </article>
              </Voce>
            ))}
          </Scaglionato>
        </Sezione>

        {/* 03 — Vantaggi */}
        <Sezione>
          <Rivela>
            <TitoloSezione
              numero="03"
              titolo={testo(contenuti, "vantaggi.titolo")}
              descrizione={testo(contenuti, "vantaggi.sottotitolo")}
            />
          </Rivela>

          <Scaglionato className="mt-12 border-t border-[var(--bordo)]">
            {vantaggi.map((vantaggio, indice) => (
              <Voce key={vantaggio.id}>
                <div className="group grid items-baseline gap-3 border-b border-[var(--bordo)] py-6 transition-colors hover:bg-[var(--sfondo-alt)] sm:grid-cols-[80px_260px_1fr] sm:gap-8 sm:py-7">
                  <Etichetta className="group-hover:text-[var(--accento)]">
                    {String(indice + 1).padStart(2, "0")}
                  </Etichetta>
                  <h3 className="text-[19px] font-semibold tracking-[-0.01em] sm:text-[21px]">
                    {vantaggio.titolo}
                  </h3>
                  <p className="mono text-[12.5px] leading-[1.7] text-[var(--testo-tenue)]">
                    {vantaggio.descrizione}
                  </p>
                </div>
              </Voce>
            ))}
          </Scaglionato>
        </Sezione>

        {/* 04 — Abbonamenti */}
        <Sezione id="abbonamenti">
          <Rivela>
            <TitoloSezione
              numero="04"
              titolo={testo(contenuti, "abbonamenti.titolo")}
              descrizione={testo(contenuti, "abbonamenti.sottotitolo")}
            />
          </Rivela>

          <CaroselloAbbonamenti
            piani={abbonamenti.map((piano) => ({
              id: piano.id,
              slug: piano.slug,
              nome: piano.nome,
              sottotitolo: piano.sottotitolo,
              descrizione: piano.descrizione,
              prezzo: formattaPrezzo(piano.prezzoCentesimi, piano.valuta),
              periodo: piano.periodo,
              inEvidenza: piano.inEvidenza,
              funzionalita: piano.funzionalita,
            }))}
          />
        </Sezione>

        {/* 05 — Automatizzati con noi */}
        <Sezione id="automazioni">
          <Rivela>
            <TitoloSezione
              numero="05"
              titolo={testo(contenuti, "automazioni.titolo")}
              descrizione={testo(contenuti, "automazioni.kicker")}
            />
          </Rivela>

          <Scaglionato className="mt-12 grid border-t border-[var(--bordo)] sm:grid-cols-3">
            {automazioniScegliibili.map((funzione, indice) => (
              <Voce key={funzione.id}>
                <Link
                  href={`/richiesta?ambito=AUTOMAZIONE&funzione=${funzione.slug}`}
                  className="group relative flex h-full flex-col border-b border-r border-[var(--bordo)] p-7 transition-colors hover:bg-[var(--accento)] sm:p-9"
                >
                  <div className="flex items-start justify-between">
                    <Icona
                      nome={funzione.icona}
                      className="h-7 w-7 transition-colors group-hover:text-[var(--accento-testo)]"
                    />
                    <Etichetta className="group-hover:text-[var(--accento-testo)]">
                      {String(indice + 1).padStart(2, "0")}
                    </Etichetta>
                  </div>
                  <h3 className="display mt-10 text-[22px] sm:text-[26px] group-hover:text-[var(--accento-testo)]">
                    {funzione.titolo}
                  </h3>
                  <p className="mono mt-3 flex-1 text-[12.5px] leading-[1.7] text-[var(--testo-tenue)] group-hover:text-[var(--accento-testo)]">
                    {funzione.descrizione}
                  </p>
                  <span className="mono mt-6 flex items-center gap-2 text-[11px] uppercase tracking-[0.12em] group-hover:text-[var(--accento-testo)]">
                    Richiedi questa automazione
                    <Freccia className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
                  </span>
                </Link>
              </Voce>
            ))}
          </Scaglionato>

          {automazioneInclusa && (
            <Rivela>
              <div className="superficie superficie--evidenza mt-6 flex flex-wrap items-start gap-4 p-6 sm:p-7">
                <Icona
                  nome={automazioneInclusa.icona}
                  className="h-6 w-6 shrink-0 text-[var(--accento)]"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-3">
                    <h3 className="text-[17px] font-semibold tracking-[-0.01em]">
                      {automazioneInclusa.titolo}
                    </h3>
                    <span className="mono border border-[var(--accento)] px-2 py-0.5 text-[10px] uppercase tracking-[0.1em] text-[var(--accento)]">
                      Incluso in ogni automazione
                    </span>
                  </div>
                  <p className="mono mt-2 text-[12.5px] leading-[1.7] text-[var(--testo-tenue)]">
                    {automazioneInclusa.descrizione}
                  </p>
                </div>
              </div>
            </Rivela>
          )}

          <Rivela>
            <div className="mt-12 flex flex-col items-center gap-6 border-t border-[var(--bordo)] pt-10 text-center">
              <p className="display max-w-2xl text-[24px] sm:text-[36px]">
                {testo(contenuti, "automazioni.tagline")}
              </p>
              <BottonePieno href="/richiesta?ambito=AUTOMAZIONE">
                {testo(contenuti, "automazioni.cta")}
                <Freccia className="h-3.5 w-3.5" />
              </BottonePieno>
            </div>
          </Rivela>
        </Sezione>

        {/* 06 — Su misura */}
        <Sezione id="su-misura">
          <Rivela>
            <div className="border border-[var(--bordo)]">
              <div className="border-b border-[var(--bordo)] p-7 sm:p-12">
                <Etichetta className="text-[var(--accento)]">06</Etichetta>
                <h2 className="display mt-5 max-w-3xl text-[34px] sm:text-[64px]">
                  {testo(contenuti, "sumisura.titolo")}
                </h2>
                <p className="mono mt-5 max-w-xl text-[13px] leading-[1.75] text-[var(--testo-tenue)]">
                  {testo(contenuti, "sumisura.sottotitolo")}
                </p>
              </div>

              <div className="grid sm:grid-cols-3">
                {ambitiSuMisura.map((voce, indice) => (
                  <Link
                    key={voce.ambito}
                    href={`/richiesta?ambito=${voce.ambito}`}
                    className={`group flex items-center justify-between p-6 transition-colors hover:bg-[var(--accento)] sm:p-7 ${
                      indice < ambitiSuMisura.length - 1
                        ? "border-b border-[var(--bordo)] sm:border-b-0 sm:border-r"
                        : ""
                    }`}
                  >
                    <span>
                      <span className="etichetta block group-hover:text-[var(--accento-testo)]">
                        {voce.codice}
                      </span>
                      <span className="mt-2 block text-[19px] font-semibold tracking-[-0.01em] group-hover:text-[var(--accento-testo)]">
                        {voce.etichetta}
                      </span>
                    </span>
                    <Freccia className="h-4 w-4 transition-transform group-hover:translate-x-1 group-hover:text-[var(--accento-testo)]" />
                  </Link>
                ))}
              </div>
            </div>
          </Rivela>
        </Sezione>

        {/* 07 — FAQ */}
        <Sezione id="faq">
          <Rivela>
            <TitoloSezione
              numero="07"
              titolo={testo(contenuti, "faq.titolo")}
            />
          </Rivela>
          <div className="mt-12">
            <FaqLista voci={faq} />
          </div>
        </Sezione>

        {/* 08 — Contatti */}
        <Sezione id="contatti">
          <Rivela>
            <div className="border-t border-[var(--bordo)] pt-5">
              <Etichetta className="text-[var(--accento)]">08</Etichetta>
              <h2 className="display mt-5 text-[clamp(2.25rem,8vw,6rem)]">
                {testo(contenuti, "contatti.titolo")}
              </h2>
              <p className="mono mt-4 max-w-lg text-[13px] leading-[1.7] text-[var(--testo-tenue)]">
                {testo(contenuti, "contatti.sottotitolo")}
              </p>
            </div>
          </Rivela>

          <Scaglionato className="mt-10 grid border-t border-[var(--bordo)] sm:grid-cols-2">
            {contatti.map((contatto) => (
              <Voce key={contatto.id}>
                <a
                  href={contatto.url ?? "#"}
                  target={
                    contatto.url?.startsWith("http") ? "_blank" : undefined
                  }
                  rel="noreferrer"
                  className="group flex items-center justify-between border-b border-r border-[var(--bordo)] p-7 transition-colors hover:bg-[var(--accento)]"
                >
                  <span className="flex items-center gap-4">
                    <Icona
                      nome={contatto.icona}
                      className="h-5 w-5 group-hover:text-[var(--accento-testo)]"
                    />
                    <span>
                      <span className="etichetta block group-hover:text-[var(--accento-testo)]">
                        {contatto.etichetta}
                      </span>
                      <span className="mono mt-1.5 block text-[14px] group-hover:text-[var(--accento-testo)]">
                        {contatto.valore}
                      </span>
                    </span>
                  </span>
                  <Freccia className="h-4 w-4 transition-transform group-hover:translate-x-1 group-hover:text-[var(--accento-testo)]" />
                </a>
              </Voce>
            ))}
          </Scaglionato>

          <Rivela>
            <div className="mt-12 flex justify-center">
              <BottonePieno href="/richiesta">
                Avvia un progetto
                <Freccia className="h-3.5 w-3.5" />
              </BottonePieno>
            </div>
          </Rivela>
        </Sezione>
      </main>

      <PiedePagina />
    </div>
  );
}

function Sezione({ children, id }: { children: React.ReactNode; id?: string }) {
  return (
    <section
      id={id}
      className="colonne relative mx-auto w-full max-w-[1400px] scroll-mt-14 px-4 py-16 sm:px-8 sm:py-24"
    >
      {children}
    </section>
  );
}
