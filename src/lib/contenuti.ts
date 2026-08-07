import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";

export type MappaContenuti = Record<string, string>;

/**
 * Etichetta con cui si invalida tutto il contenuto pubblico del sito.
 *
 * Una sola per tutto, e non una per tabella: le azioni del pannello
 * modificano una cosa alla volta ma chi guarda la home le vede insieme, e
 * un'etichetta per tabella significherebbe soltanto più occasioni di
 * dimenticarne una — con il risultato che una modifica resta invisibile
 * senza che nulla lo spieghi. Ricostruire l'insieme costa sette
 * interrogazioni su tabelle minuscole.
 */
export const TAG_CONTENUTI = "contenuti-sito";

export function testo(mappa: MappaContenuti, chiave: string, predefinito = "") {
  return mappa[chiave] ?? predefinito;
}

export function formattaPrezzo(centesimi: number, valuta = "EUR") {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: valuta,
    minimumFractionDigits: centesimi % 100 === 0 ? 0 : 2,
  }).format(centesimi / 100);
}

/**
 * Legge dal database tutto ciò che serve alla home.
 *
 * Ogni `select` è esplicito, e non è pignoleria. Il risultato passa da
 * `unstable_cache`, che serializza in JSON: una colonna `DateTime` tornerebbe
 * come stringa mantenendo però il tipo `Date` in TypeScript — un errore che
 * il compilatore non vede e che si manifesta a runtime, magari mesi dopo,
 * sul primo `.getTime()`. Chiedendo solo i campi che la pagina disegna il
 * problema non può nascere, e la copia in cache resta piccola.
 */
async function leggiDatiHomepage() {
  const [contenuti, servizi, vantaggi, abbonamenti, automazioni, faq, contatti] =
    await Promise.all([
      prisma.contenutoSito.findMany({ select: { chiave: true, valore: true } }),
      prisma.servizio.findMany({
        where: { attivo: true },
        orderBy: { ordine: "asc" },
        select: { id: true, titolo: true, descrizione: true, icona: true },
      }),
      prisma.vantaggio.findMany({
        where: { attivo: true },
        orderBy: { ordine: "asc" },
        select: { id: true, titolo: true, descrizione: true },
      }),
      prisma.abbonamento.findMany({
        where: { attivo: true },
        orderBy: { ordine: "asc" },
        select: {
          id: true,
          slug: true,
          nome: true,
          sottotitolo: true,
          descrizione: true,
          prezzoCentesimi: true,
          valuta: true,
          periodo: true,
          inEvidenza: true,
          funzionalita: {
            orderBy: { ordine: "asc" },
            select: { id: true, testo: true, inclusa: true },
          },
        },
      }),
      prisma.automazione.findMany({
        where: { attivo: true },
        orderBy: { ordine: "asc" },
        select: {
          id: true,
          slug: true,
          titolo: true,
          descrizione: true,
          icona: true,
          selezionabile: true,
        },
      }),
      prisma.faq.findMany({
        where: { attiva: true },
        orderBy: { ordine: "asc" },
        select: { id: true, domanda: true, risposta: true },
      }),
      prisma.contatto.findMany({
        where: { attivo: true },
        orderBy: { ordine: "asc" },
        select: {
          id: true,
          etichetta: true,
          valore: true,
          url: true,
          icona: true,
        },
      }),
    ]);

  return {
    contenuti: Object.fromEntries(
      contenuti.map((riga) => [riga.chiave, riga.valore]),
    ) as MappaContenuti,
    servizi,
    vantaggi,
    abbonamenti,
    automazioni,
    faq,
    contatti,
  };
}

/**
 * Gli stessi dati, ma da una copia che si invalida quando cambiano.
 *
 * Perché a etichetta e non a tempo. La home era una pagina rigenerata ogni
 * ora (`revalidate = 3600`) e le azioni del pannello chiamavano
 * `revalidatePath("/")` per rigenerarla subito. Sulla carta funziona; nei
 * fatti quella catena ha un anello che non si può ispezionare — se la
 * rigenerazione non avviene, non lo dice nessuno, e chi ha appena
 * modificato un contatto vede la pagina vecchia senza sapere se ha
 * sbagliato lui, se deve aspettare, o se è rotto qualcosa.
 *
 * Adesso la pagina non è più in cache: viene ricostruita a ogni richiesta,
 * quindi ciò che si vede è sempre l'ultima lettura. In cache stanno i
 * *dati*, con un'etichetta che le azioni del pannello invalidano
 * esplicitamente (vedi `rinfresca` in admin/azioni.ts). Il costo per
 * richiesta resta zero interrogazioni, ma è sparito il livello che poteva
 * conservare una pagina intera senza dirlo.
 *
 * `revalidate: 300` è la rete di sicurezza, non il meccanismo: se un giorno
 * qualcuno aggiungesse un'azione dimenticandosi l'etichetta, la modifica
 * comparirebbe comunque entro cinque minuti invece di non comparire mai.
 */
export const caricaDatiHomepage = unstable_cache(
  leggiDatiHomepage,
  ["dati-homepage"],
  { tags: [TAG_CONTENUTI], revalidate: 300 },
);

