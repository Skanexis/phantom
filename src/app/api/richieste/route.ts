import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { leggiSessione } from "@/lib/sessione";
import { etichetteAmbito } from "@/lib/telegram-bot";
import { escapeHtml, notificaAdmin, notificaUtente } from "@/lib/notifiche";
import { PREFISSO_RICHIESTA, codiceUnico } from "@/lib/codici";
import { riferimentoUtente } from "@/lib/utenti";
import { linkRichiesta } from "@/lib/richieste";
import { STATI_VISIBILI, statoEffettivo } from "@/lib/abbonamenti";
import { vociTipoSupporto } from "@/lib/supporto";
import {
  calcolaCommissione,
  formattaEuro,
  voceCriptovaluta,
  voceDirezione,
} from "@/lib/scambio";

const schema = z.object({
  ambito: z.enum([
    "SITO_WEB",
    "APPLICAZIONE",
    "AUTOMAZIONE",
    "SUPPORTO",
    "EXCHANGE",
  ]),
  nomeContatto: z.string().trim().min(2).max(80).optional(),
  budget: z.string().trim().max(60).optional(),
  messaggio: z.string().trim().max(2000).optional(),
  tipoSupporto: z.enum(["PROBLEMA", "DOMANDA", "MIGLIORAMENTO"]).optional(),
  direzioneScambio: z
    .enum(["CRIPTO_CONTANTI", "CONTANTI_CRIPTO", "CRIPTO_BONIFICO", "BONIFICO_CRIPTO"])
    .optional(),
  criptovaluta: z.enum(["BTC", "USDC"]).optional(),
  importoCentesimi: z.number().int().min(1000).max(100_000_000).optional(),
});

export async function POST(richiestaHttp: Request) {
  // Login obbligatorio: la richiesta deve essere sempre riconducibile
  // a un account, così l'utente può seguirne lo stato.
  const sessione = await leggiSessione();
  if (!sessione) {
    return NextResponse.json(
      { errore: "Collega il tuo account Telegram per inviare la richiesta." },
      { status: 401 },
    );
  }

  const corpo = await richiestaHttp.json().catch(() => null);
  const risultato = schema.safeParse(corpo);
  if (!risultato.success) {
    return NextResponse.json(
      { errore: "Controlla i campi del modulo e riprova." },
      { status: 400 },
    );
  }

  const dati = risultato.data;
  const supporto = dati.ambito === "SUPPORTO";
  const exchange = dati.ambito === "EXCHANGE";

  let voceScambio: ReturnType<typeof voceDirezione> = null;
  let voceCripto: ReturnType<typeof voceCriptovaluta> = null;

  if (exchange) {
    voceScambio = voceDirezione(dati.direzioneScambio ?? null);
    voceCripto = voceCriptovaluta(dati.criptovaluta ?? null);
    if (!voceScambio || !voceCripto || !dati.importoCentesimi) {
      return NextResponse.json(
        { errore: "Completa direzione, criptovaluta e importo." },
        { status: 400 },
      );
    }
  } else if (supporto) {
    // Il supporto è incluso negli abbonamenti: senza questo controllo lato
    // server, bastava conoscere l'endpoint per scrivere anche senza piano —
    // nascondere il bottone in interfaccia non è una vera protezione.
    if (!vociTipoSupporto(dati.tipoSupporto ?? null)) {
      return NextResponse.json(
        { errore: "Scegli il tipo di richiesta." },
        { status: 400 },
      );
    }
    if (!dati.messaggio || dati.messaggio.length < 10) {
      return NextResponse.json(
        { errore: "Controlla i campi del modulo e riprova." },
        { status: 400 },
      );
    }
    const sottoscrizioni = await prisma.abbonamentoUtente.findMany({
      where: { utenteId: sessione.utenteId, stato: { in: STATI_VISIBILI } },
    });
    const haPianoAttivo = sottoscrizioni.some(
      (s) => statoEffettivo(s) === "ATTIVO",
    );
    if (!haPianoAttivo) {
      return NextResponse.json(
        { errore: "Il supporto diretto richiede un abbonamento attivo." },
        { status: 403 },
      );
    }
  } else {
    if (!dati.nomeContatto || !dati.messaggio || dati.messaggio.length < 10) {
      return NextResponse.json(
        { errore: "Controlla i campi del modulo e riprova." },
        { status: 400 },
      );
    }
  }

  const utente = await prisma.utente.findUnique({
    where: { id: sessione.utenteId },
  });

  // Il recapito viene dal profilo Telegram: chiederlo di nuovo nel modulo
  // significava farsi dettare un dato che il sistema ha già, con il rischio
  // di un username scritto male. Per supporto ed exchange vale anche per il
  // nome: chi scrive è già autenticato, non serve ridigitarlo.
  const contatto = riferimentoUtente(utente);
  const nomeContatto =
    supporto || exchange
      ? (utente?.nome ?? utente?.username ?? "Cliente")
      : dati.nomeContatto!;

  // Per l'exchange il messaggio è facoltativo: senza note, il riepilogo
  // dell'operazione stessa fa già da descrizione.
  const messaggio =
    exchange && (!dati.messaggio || dati.messaggio.length === 0)
      ? `Cambio ${voceScambio!.etichetta} · ${dati.criptovaluta} · ${formattaEuro(dati.importoCentesimi!)}`
      : (dati.messaggio ?? "");

  const codice = await codiceUnico(PREFISSO_RICHIESTA, async (valore) =>
    Boolean(await prisma.richiesta.findUnique({ where: { codice: valore } })),
  );

  const richiesta = await prisma.richiesta.create({
    data: {
      codice,
      ambito: dati.ambito,
      tipoSupporto: supporto ? dati.tipoSupporto : null,
      direzioneScambio: exchange ? dati.direzioneScambio : null,
      criptovaluta: exchange ? dati.criptovaluta : null,
      importoCentesimi: exchange ? dati.importoCentesimi : null,
      nomeContatto,
      contatto,
      budget: dati.budget || null,
      messaggio,
      utenteId: sessione.utenteId,
      storico: {
        create: { stato: "NUOVA", nota: "Richiesta inviata dal cliente." },
      },
    },
  });

  const voceSupporto = supporto ? vociTipoSupporto(dati.tipoSupporto ?? null) : null;
  const etichetta =
    voceSupporto?.etichetta ??
    (exchange ? "Exchange" : (etichetteAmbito[dati.ambito] ?? dati.ambito));

  const rigaScambio = exchange
    ? `${voceScambio!.etichetta} · ${dati.criptovaluta} · ${formattaEuro(dati.importoCentesimi!)} (commissione ${formattaEuro(calcolaCommissione(dati.importoCentesimi!).commissioneCentesimi)})`
    : null;

  await notificaUtente({
    utenteId: sessione.utenteId,
    telegramId: sessione.telegramId,
    titolo: supporto || exchange
      ? `${etichetta} ${codice} ricevuta`
      : `Richiesta ${codice} ricevuta`,
    testo: exchange
      ? `La tua richiesta di cambio ${codice} è arrivata al team.`
      : supporto
        ? `Il tuo messaggio ${codice} (${etichetta}) è arrivato al team.`
        : `La tua richiesta ${codice} (${etichetta}) è stata inviata ed è in lavorazione.`,
    url: linkRichiesta(codice),
    messaggioTelegram: exchange
      ? [
          `<b>Richiesta di cambio ricevuta</b> · <code>${escapeHtml(codice)}</code>`,
          "",
          escapeHtml(rigaScambio!),
          "",
          `Grazie ${escapeHtml(nomeContatto)}! Confermiamo il tasso al momento della transazione e ti scriviamo qui per i dettagli.`,
        ].join("\n")
      : supporto
        ? [
            `<b>${escapeHtml(etichetta)} ricevuta</b> · <code>${escapeHtml(codice)}</code>`,
            "",
            `Grazie ${escapeHtml(nomeContatto)}! Il team l'ha ricevuta e ti risponde a breve.`,
            "",
            "<i>Puoi rispondere direttamente a questo messaggio per aggiungere dettagli.</i>",
          ].join("\n")
        : [
            `<b>Richiesta ricevuta</b> · <code>${escapeHtml(codice)}</code>`,
            "",
            `Grazie ${escapeHtml(nomeContatto)}! Abbiamo preso in carico la tua richiesta per <b>${escapeHtml(etichetta)}</b>.`,
            "",
            `Conserva il codice <b>${escapeHtml(codice)}</b>: lo usiamo in ogni comunicazione su questo progetto.`,
            "",
            "<i>Puoi rispondere direttamente a questo messaggio per scriverci.</i>",
          ].join("\n"),
  });

  await notificaAdmin(
    exchange
      ? [
          `<b>Richiesta di cambio</b> · <code>${escapeHtml(codice)}</code>`,
          "",
          `Cliente: ${escapeHtml(contatto)}`,
          escapeHtml(rigaScambio!),
          ...(dati.messaggio ? ["", escapeHtml(dati.messaggio)] : []),
        ].join("\n")
      : supporto
        ? [
            `<b>${escapeHtml(etichetta)}</b> · <code>${escapeHtml(codice)}</code>`,
            "",
            `Cliente: ${escapeHtml(contatto)}`,
            "",
            escapeHtml(messaggio),
          ].join("\n")
        : [
            `<b>Nuova richiesta</b> · <code>${escapeHtml(codice)}</code>`,
            "",
            `Ambito: <b>${escapeHtml(etichetta)}</b>`,
            `Nome: ${escapeHtml(nomeContatto)}`,
            `Cliente: ${escapeHtml(contatto)}`,
            `Budget: ${escapeHtml(dati.budget || "non indicato")}`,
            "",
            escapeHtml(messaggio),
          ].join("\n"),
    { richiestaId: richiesta.id, codice },
  );

  return NextResponse.json({ id: richiesta.id, codice }, { status: 201 });
}
