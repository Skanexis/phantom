import { prisma } from "@/lib/prisma";

export type MappaContenuti = Record<string, string>;

export async function caricaContenuti(): Promise<MappaContenuti> {
  const righe = await prisma.contenutoSito.findMany();
  return Object.fromEntries(righe.map((riga) => [riga.chiave, riga.valore]));
}

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

export async function caricaDatiHomepage() {
  const [contenuti, servizi, vantaggi, abbonamenti, automazioni, faq, contatti] =
    await Promise.all([
      caricaContenuti(),
      prisma.servizio.findMany({
        where: { attivo: true },
        orderBy: { ordine: "asc" },
      }),
      prisma.vantaggio.findMany({
        where: { attivo: true },
        orderBy: { ordine: "asc" },
      }),
      prisma.abbonamento.findMany({
        where: { attivo: true },
        orderBy: { ordine: "asc" },
        include: {
          funzionalita: { orderBy: { ordine: "asc" } },
        },
      }),
      prisma.automazione.findMany({
        where: { attivo: true },
        orderBy: { ordine: "asc" },
      }),
      prisma.faq.findMany({
        where: { attiva: true },
        orderBy: { ordine: "asc" },
      }),
      prisma.contatto.findMany({
        where: { attivo: true },
        orderBy: { ordine: "asc" },
      }),
    ]);

  return { contenuti, servizi, vantaggi, abbonamenti, automazioni, faq, contatti };
}
