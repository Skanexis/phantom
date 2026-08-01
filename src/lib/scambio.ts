/**
 * Configurazione condivisa del servizio Exchange: la stessa lista guida il
 * selettore nel modulo, i badge in area personale e nel pannello admin.
 *
 * Niente tassi cripto/fiat qui dentro: senza un listino prezzi in tempo
 * reale, inventare un cambio sarebbe fuorviante. Il calcolatore lavora solo
 * sull'importo in euro dichiarato dal cliente, l'unico numero certo prima
 * della conferma della transazione.
 */
export const COMMISSIONE_PERCENTUALE = 10;

export const DIREZIONI_SCAMBIO = [
  {
    valore: "CRIPTO_CONTANTI",
    etichetta: "Criptovalute → Contanti",
    da: "cripto",
    a: "contanti",
  },
  {
    valore: "CONTANTI_CRIPTO",
    etichetta: "Contanti → Criptovalute",
    da: "contanti",
    a: "cripto",
  },
  {
    valore: "CRIPTO_BONIFICO",
    etichetta: "Criptovalute → Bonifico bancario",
    da: "cripto",
    a: "bonifico",
  },
  {
    valore: "BONIFICO_CRIPTO",
    etichetta: "Bonifico bancario → Criptovalute",
    da: "bonifico",
    a: "cripto",
  },
] as const;

export type DirezioneScambioValore = (typeof DIREZIONI_SCAMBIO)[number]["valore"];

export const CRIPTOVALUTE = [
  { valore: "BTC", etichetta: "Bitcoin" },
  { valore: "USDC", etichetta: "USD Coin" },
] as const;

export type CriptovalutaValore = (typeof CRIPTOVALUTE)[number]["valore"];

export function voceDirezione(valore: string | null | undefined) {
  return DIREZIONI_SCAMBIO.find((v) => v.valore === valore) ?? null;
}

export function voceCriptovaluta(valore: string | null | undefined) {
  return CRIPTOVALUTE.find((v) => v.valore === valore) ?? null;
}

/** Applica la commissione fissa: stessa funzione lato form (anteprima) e
 * lato server (valore salvato), per non poter mai andare fuori sincrono. */
export function calcolaCommissione(importoCentesimi: number) {
  const commissioneCentesimi = Math.round(
    (importoCentesimi * COMMISSIONE_PERCENTUALE) / 100,
  );
  return {
    commissioneCentesimi,
    nettoCentesimi: importoCentesimi - commissioneCentesimi,
  };
}

/** Nessuna dipendenza da Prisma: a differenza di formattaPrezzo in
 * lib/contenuti.ts, questa si può importare anche lato client. */
export function formattaEuro(centesimi: number) {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
  }).format(centesimi / 100);
}
