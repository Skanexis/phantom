"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import {
  richiediOperatore,
  richiediSviluppatore,
  richiediStaff,
} from "@/lib/sessione";
import {
  etichetteAmbito,
  etichetteStato,
  etichetteStatoAbbonamento,
} from "@/lib/telegram-bot";
import { escapeHtml, notificaAdmin, notificaUtente } from "@/lib/notifiche";
import { liberaIp } from "@/lib/sorveglianza";
import {
  aggiungiEccezioneLocale,
  aggiungiLocale,
  identificativoValido,
  togliEccezioneLocale,
  togliLocale,
  type EsitoAzione,
  type FamigliaBando,
} from "@/lib/bandi";
import { sottoreteBandibile } from "@/lib/rete";
import { eStaff } from "@/lib/permessi";
import { dataBreve, scadenzaDaPeriodo } from "@/lib/abbonamenti";
import { linkRichiesta } from "@/lib/richieste";
import { LUNGHEZZA_MASSIMA, inviaMessaggioAdmin } from "@/lib/messaggi";
import { PREFISSO_ABBONAMENTO, codiceUnico } from "@/lib/codici";
import type {
  Ruolo,
  StatoAbbonamentoUtente,
  StatoRichiesta,
  TipoBando,
} from "@/generated/prisma/client";

const statiRichiesta = [
  "NUOVA",
  "IN_LAVORAZIONE",
  "IN_ATTESA_CLIENTE",
  "COMPLETATA",
  "ANNULLATA",
] as const;

/**
 * Ruoli assegnabili dal pannello: DEVELOPER resta fuori di proposito.
 * Chi lo detiene lo mantiene finché non lo cambia lo script da console, e
 * nessuno lo ottiene passando dal sito.
 */
const RUOLI_ASSEGNABILI_DA_PANNELLO = ["UTENTE", "SUPPORTO", "ADMIN"] as const;

const statiAbbonamento = [
  "IN_ATTESA",
  "ATTIVO",
  "SOSPESO",
  "SCADUTO",
  "ANNULLATO",
] as const;

/**
 * Tre porte, tre livelli di accesso:
 * - contenuto del sito (prezzi, piani, testi…) solo a DEVELOPER;
 * - operazioni su richieste/sottoscrizioni ad ADMIN e DEVELOPER;
 * - messaggistica al cliente aperta a tutto lo staff, incluso SUPPORTO.
 */
async function assicuraSviluppatore() {
  const utente = await richiediSviluppatore();
  if (!utente) throw new Error("Accesso negato.");
  return utente;
}

async function assicuraOperatore() {
  const utente = await richiediOperatore();
  if (!utente) throw new Error("Accesso negato.");
  return utente;
}

async function assicuraStaff() {
  const utente = await richiediStaff();
  if (!utente) throw new Error("Accesso negato.");
  return utente;
}

function stringa(dati: FormData, chiave: string) {
  return String(dati.get(chiave) ?? "").trim();
}

function numero(dati: FormData, chiave: string, predefinito = 0) {
  const valore = Number(dati.get(chiave));
  return Number.isFinite(valore) ? valore : predefinito;
}

function booleano(dati: FormData, chiave: string) {
  return dati.get(chiave) === "on" || dati.get(chiave) === "true";
}

function rinfresca() {
  revalidatePath("/admin");
  revalidatePath("/");
}

function slugifica(testo: string) {
  return testo
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/* ---------------------------------- Abbonamenti --------------------------------- */

export async function aggiornaAbbonamento(dati: FormData) {
  await assicuraSviluppatore();

  const id = stringa(dati, "id");
  const prezzoEuro = numero(dati, "prezzo", -1);
  if (!id || prezzoEuro < 0) return;

  await prisma.abbonamento.update({
    where: { id },
    data: {
      nome: stringa(dati, "nome") || undefined,
      sottotitolo: stringa(dati, "sottotitolo") || null,
      descrizione: stringa(dati, "descrizione") || undefined,
      prezzoCentesimi: Math.round(prezzoEuro * 100),
      periodo: stringa(dati, "periodo") || undefined,
      ordine: numero(dati, "ordine"),
      attivo: booleano(dati, "attivo"),
      inEvidenza: booleano(dati, "inEvidenza"),
    },
  });

  rinfresca();
}

export async function creaAbbonamento(dati: FormData) {
  await assicuraSviluppatore();

  const nome = stringa(dati, "nome");
  if (!nome) return;

  const slugBase = stringa(dati, "slug") || slugifica(nome);

  // Lo slug è unico: aggiungo un suffisso se già occupato.
  let slug = slugBase || `piano-${Date.now()}`;
  if (await prisma.abbonamento.findUnique({ where: { slug } })) {
    slug = `${slug}-${Date.now().toString(36)}`;
  }

  const ultimo = await prisma.abbonamento.findFirst({
    orderBy: { ordine: "desc" },
  });

  await prisma.abbonamento.create({
    data: {
      slug,
      nome,
      descrizione: stringa(dati, "descrizione") || "Descrizione da completare.",
      prezzoCentesimi: Math.round(numero(dati, "prezzo") * 100),
      ordine: (ultimo?.ordine ?? 0) + 1,
      attivo: false,
    },
  });

  rinfresca();
}

export async function eliminaAbbonamento(dati: FormData) {
  await assicuraSviluppatore();
  const id = stringa(dati, "id");
  if (!id) return;

  const sottoscrizioni = await prisma.abbonamentoUtente.count({
    where: { abbonamentoId: id },
  });

  // Con sottoscrizioni collegate lo disattivo soltanto: cancellarlo
  // romperebbe lo storico degli utenti.
  if (sottoscrizioni > 0) {
    await prisma.abbonamento.update({
      where: { id },
      data: { attivo: false },
    });
  } else {
    await prisma.abbonamento.delete({ where: { id } });
  }

  rinfresca();
}

export async function aggiungiFunzionalita(dati: FormData) {
  await assicuraSviluppatore();

  const abbonamentoId = stringa(dati, "abbonamentoId");
  const testo = stringa(dati, "testo");
  if (!abbonamentoId || !testo) return;

  const ultima = await prisma.funzionalitaAbbonamento.findFirst({
    where: { abbonamentoId },
    orderBy: { ordine: "desc" },
  });

  await prisma.funzionalitaAbbonamento.create({
    data: { abbonamentoId, testo, ordine: (ultima?.ordine ?? 0) + 1 },
  });

  rinfresca();
}

export async function eliminaFunzionalita(dati: FormData) {
  await assicuraSviluppatore();
  const id = stringa(dati, "id");
  if (!id) return;
  await prisma.funzionalitaAbbonamento.delete({ where: { id } });
  rinfresca();
}

/* ------------------------------ Sottoscrizioni utenti ----------------------------- */

export async function aggiornaStatoSottoscrizione(dati: FormData) {
  await assicuraOperatore();

  const id = stringa(dati, "id");
  const stato = stringa(dati, "stato") as StatoAbbonamentoUtente;
  if (!id || !statiAbbonamento.includes(stato)) return;

  const precedente = await prisma.abbonamentoUtente.findUnique({
    where: { id },
    include: { abbonamento: true },
  });
  if (!precedente) return;

  // Data di scadenza esplicita dal pannello, altrimenti calcolata dal
  // periodo del piano: "mese" e "anno" non possono valere entrambi 30 giorni.
  const scadenzaManuale = stringa(dati, "scadeIl");
  const inizio = new Date();

  const sottoscrizione = await prisma.abbonamentoUtente.update({
    where: { id },
    data: {
      stato,
      ...(stato === "ATTIVO"
        ? {
            inizioIl: precedente.stato === "ATTIVO" ? undefined : inizio,
            scadeIl: scadenzaManuale
              ? new Date(`${scadenzaManuale}T23:59:59`)
              : scadenzaDaPeriodo(precedente.abbonamento.periodo, inizio),
          }
        : scadenzaManuale
          ? { scadeIl: new Date(`${scadenzaManuale}T23:59:59`) }
          : {}),
    },
    include: { utente: true, abbonamento: true },
  });

  // Conferma di un cambio piano: la nota creata dall'API porta l'id della
  // sottoscrizione da chiudere, che va annullata solo ora — non prima, per
  // non lasciare il cliente senza servizio durante l'attesa.
  if (stato === "ATTIVO") {
    const precedenteId = precedente.note?.match(/\(([^)]+)\)\s*$/)?.[1];
    if (precedenteId && precedenteId !== id) {
      await prisma.abbonamentoUtente
        .updateMany({
          where: {
            id: precedenteId,
            utenteId: sottoscrizione.utenteId,
            stato: { in: ["ATTIVO", "SOSPESO", "IN_ATTESA"] },
          },
          data: { stato: "ANNULLATO" },
        })
        .catch(() => undefined);
    }
  }

  const scadenza = dataBreve(sottoscrizione.scadeIl);

  await notificaUtente({
    utenteId: sottoscrizione.utenteId,
    telegramId: sottoscrizione.utente.telegramId,
    titolo: `Abbonamento${sottoscrizione.codice ? ` ${sottoscrizione.codice}` : ""} · ${etichetteStatoAbbonamento[stato]}`,
    testo: `Il piano ${sottoscrizione.abbonamento.nome} è ora: ${etichetteStatoAbbonamento[stato]}.${
      stato === "ATTIVO" && scadenza ? ` Rinnovo il ${scadenza}.` : ""
    }`,
    url: "/area-personale?scheda=abbonamento",
    messaggioTelegram: [
      `<b>Aggiornamento abbonamento</b>${sottoscrizione.codice ? ` · <code>${escapeHtml(sottoscrizione.codice)}</code>` : ""}`,
      "",
      `Piano: <b>${escapeHtml(sottoscrizione.abbonamento.nome)}</b>`,
      `Stato: <b>${escapeHtml(etichetteStatoAbbonamento[stato])}</b>`,
      ...(stato === "ATTIVO" && scadenza
        ? [`Rinnovo: <b>${escapeHtml(scadenza)}</b>`]
        : []),
    ].join("\n"),
  });

  revalidatePath("/admin");
  revalidatePath("/area-personale");
}

/** Proroga rapida: sposta la scadenza in avanti di un ciclo del piano. */
export async function prorogaSottoscrizione(dati: FormData) {
  await assicuraOperatore();

  const id = stringa(dati, "id");
  if (!id) return;

  const sottoscrizione = await prisma.abbonamentoUtente.findUnique({
    where: { id },
    include: { abbonamento: true, utente: true },
  });
  if (!sottoscrizione) return;

  // Si riparte dalla scadenza attuale se è nel futuro, altrimenti da oggi:
  // prorogare un abbonamento già scaduto non deve regalare i giorni persi.
  const base =
    sottoscrizione.scadeIl && sottoscrizione.scadeIl > new Date()
      ? sottoscrizione.scadeIl
      : new Date();

  const nuova = scadenzaDaPeriodo(sottoscrizione.abbonamento.periodo, base);

  await prisma.abbonamentoUtente.update({
    where: { id },
    data: { stato: "ATTIVO", scadeIl: nuova },
  });

  await notificaUtente({
    utenteId: sottoscrizione.utenteId,
    telegramId: sottoscrizione.utente.telegramId,
    titolo: "Abbonamento rinnovato",
    testo: `Il piano ${sottoscrizione.abbonamento.nome} è rinnovato fino al ${dataBreve(nuova)}.`,
    url: "/area-personale?scheda=abbonamento",
    messaggioTelegram: `<b>Abbonamento rinnovato</b>\n\nPiano: <b>${escapeHtml(sottoscrizione.abbonamento.nome)}</b>\nValido fino al: <b>${escapeHtml(dataBreve(nuova) ?? "")}</b>`,
  });

  revalidatePath("/admin");
  revalidatePath("/area-personale");
}

/** Assegnazione diretta di un piano a un utente, senza richiesta dal sito. */
export async function assegnaAbbonamento(dati: FormData) {
  await assicuraOperatore();

  const abbonamentoId = stringa(dati, "abbonamentoId");
  const riferimento = stringa(dati, "utente");
  if (!abbonamentoId || !riferimento) return;

  const piano = await prisma.abbonamento.findUnique({
    where: { id: abbonamentoId },
  });
  if (!piano) return;

  // L'admin identifica l'utente come lo conosce: @username o ID Telegram.
  const pulito = riferimento.replace(/^@/, "");
  const utente = await prisma.utente.findFirst({
    where: {
      OR: [{ telegramId: pulito }, { username: pulito }],
    },
  });
  if (!utente) return;

  // Chiudo eventuali piani aperti: l'assegnazione manuale li sostituisce.
  await prisma.abbonamentoUtente.updateMany({
    where: { utenteId: utente.id, stato: { in: ["IN_ATTESA", "ATTIVO"] } },
    data: { stato: "ANNULLATO" },
  });

  const inizio = new Date();
  const scadenzaManuale = stringa(dati, "scadeIl");
  const scadeIl = scadenzaManuale
    ? new Date(`${scadenzaManuale}T23:59:59`)
    : scadenzaDaPeriodo(piano.periodo, inizio);

  const codice = await codiceUnico(PREFISSO_ABBONAMENTO, async (valore) =>
    Boolean(
      await prisma.abbonamentoUtente.findUnique({ where: { codice: valore } }),
    ),
  );

  await prisma.abbonamentoUtente.create({
    data: {
      codice,
      utenteId: utente.id,
      abbonamentoId,
      stato: "ATTIVO",
      inizioIl: inizio,
      scadeIl,
      note: "Assegnato dal pannello admin",
    },
  });

  await notificaUtente({
    utenteId: utente.id,
    telegramId: utente.telegramId,
    titolo: `Abbonamento ${codice} attivato`,
    testo: `Il piano ${piano.nome} è attivo fino al ${dataBreve(scadeIl)}.`,
    url: "/area-personale?scheda=abbonamento",
    messaggioTelegram: [
      `<b>Abbonamento attivato</b> · <code>${escapeHtml(codice)}</code>`,
      "",
      `Piano: <b>${escapeHtml(piano.nome)}</b>`,
      `Valido fino al: <b>${escapeHtml(dataBreve(scadeIl) ?? "")}</b>`,
    ].join("\n"),
  });

  revalidatePath("/admin");
  revalidatePath("/area-personale");
}

/* --------------------------------- Richieste -------------------------------- */

export async function aggiornaStatoRichiesta(dati: FormData) {
  await assicuraOperatore();

  const id = stringa(dati, "id");
  const stato = stringa(dati, "stato") as StatoRichiesta;
  const nota = stringa(dati, "nota");
  if (!id || !statiRichiesta.includes(stato)) return;

  const richiesta = await prisma.richiesta.update({
    where: { id },
    data: {
      stato,
      noteAdmin: nota || undefined,
      storico: { create: { stato, nota: nota || null } },
    },
    include: { utente: true },
  });

  if (richiesta.utente) {
    // Annullando, la richiesta sparisce dall'area personale: la notifica
    // resta l'unica traccia per il cliente e deve bastare da sola.
    const annullata = stato === "ANNULLATA";
    const ambito = etichetteAmbito[richiesta.ambito] ?? richiesta.ambito;

    await notificaUtente({
      utenteId: richiesta.utente.id,
      telegramId: richiesta.utente.telegramId,
      titolo: annullata
        ? `Richiesta${richiesta.codice ? ` ${richiesta.codice}` : ""} annullata`
        : `Richiesta${richiesta.codice ? ` ${richiesta.codice}` : ""} · ${etichetteStato[stato]}`,
      testo: annullata
        ? `La richiesta ${richiesta.codice ?? ""} (${ambito}) è stata annullata e non compare più fra le tue richieste.${nota ? ` Motivo: ${nota}` : ""}`
        : `Lo stato della tua richiesta è ora: ${etichetteStato[stato]}.${nota ? ` Nota: ${nota}` : ""}`,
      url: annullata
        ? "/area-personale?scheda=richieste"
        : linkRichiesta(richiesta.codice),
      messaggioTelegram: [
        annullata
          ? `<b>Richiesta annullata</b>${richiesta.codice ? ` · <code>${escapeHtml(richiesta.codice)}</code>` : ""}`
          : `<b>Aggiornamento richiesta</b>${richiesta.codice ? ` · <code>${escapeHtml(richiesta.codice)}</code>` : ""}`,
        "",
        `Ambito: ${escapeHtml(ambito)}`,
        ...(annullata
          ? []
          : [`Nuovo stato: <b>${escapeHtml(etichetteStato[stato])}</b>`]),
        ...(nota
          ? ["", annullata ? `Motivo: ${escapeHtml(nota)}` : escapeHtml(nota)]
          : []),
        "",
        annullata
          ? "<i>La richiesta non compare più nell'area personale. Scrivici se vuoi riaprirla.</i>"
          : "<i>Rispondi a questo messaggio per scriverci.</i>",
      ].join("\n"),
    });
  }

  revalidatePath("/admin");
  revalidatePath("/area-personale");
}

/**
 * Messaggio dell'amministrazione al cliente.
 *
 * Restituisce il messaggio creato invece di limitarsi a rivalidare: la
 * conversazione lo aggiunge subito, senza ricaricare l'intero pannello.
 */
export async function inviaMessaggioAlCliente(
  richiestaId: string,
  testo: string,
  soloSulSito = false,
) {
  await assicuraStaff();

  const pulito = testo.trim();
  if (!richiestaId || !pulito) return null;

  const messaggio = await inviaMessaggioAdmin({
    richiestaId,
    testo: pulito.slice(0, LUNGHEZZA_MASSIMA),
    soloSulSito,
  });
  if (!messaggio) return null;

  revalidatePath("/admin");
  revalidatePath("/area-personale");

  return {
    id: messaggio.id,
    testo: messaggio.testo,
    daAdmin: true,
    creatoIl: messaggio.creatoIl.toISOString(),
  };
}

export async function eliminaRichiesta(dati: FormData) {
  await assicuraOperatore();
  const id = stringa(dati, "id");
  if (!id) return;
  await prisma.richiesta.delete({ where: { id } });
  revalidatePath("/admin");
}

/* --------------------------------- Contenuti -------------------------------- */

export async function aggiornaContenuto(dati: FormData) {
  await assicuraSviluppatore();

  const chiave = stringa(dati, "chiave");
  if (!chiave) return;

  await prisma.contenutoSito.update({
    where: { chiave },
    data: { valore: String(dati.get("valore") ?? "") },
  });

  rinfresca();
}

/* ---------------------------- Servizi, vantaggi, FAQ --------------------------- */

export async function salvaServizio(dati: FormData) {
  await assicuraSviluppatore();

  const id = stringa(dati, "id");
  const titolo = stringa(dati, "titolo");
  if (!titolo) return;

  const valori = {
    titolo,
    descrizione: stringa(dati, "descrizione"),
    icona: stringa(dati, "icona") || "code",
    ordine: numero(dati, "ordine"),
    attivo: booleano(dati, "attivo"),
  };

  if (id) {
    await prisma.servizio.update({ where: { id }, data: valori });
  } else {
    await prisma.servizio.create({ data: { ...valori, attivo: true } });
  }

  rinfresca();
}

export async function eliminaServizio(dati: FormData) {
  await assicuraSviluppatore();
  const id = stringa(dati, "id");
  if (!id) return;
  await prisma.servizio.delete({ where: { id } });
  rinfresca();
}

export async function salvaVantaggio(dati: FormData) {
  await assicuraSviluppatore();

  const id = stringa(dati, "id");
  const titolo = stringa(dati, "titolo");
  if (!titolo) return;

  const valori = {
    titolo,
    descrizione: stringa(dati, "descrizione"),
    icona: stringa(dati, "icona") || "spark",
    ordine: numero(dati, "ordine"),
    attivo: booleano(dati, "attivo"),
  };

  if (id) {
    await prisma.vantaggio.update({ where: { id }, data: valori });
  } else {
    await prisma.vantaggio.create({ data: { ...valori, attivo: true } });
  }

  rinfresca();
}

export async function salvaAutomazione(dati: FormData) {
  await assicuraSviluppatore();

  const id = stringa(dati, "id");
  const titolo = stringa(dati, "titolo");
  if (!titolo) return;

  const valori = {
    titolo,
    descrizione: stringa(dati, "descrizione"),
    icona: stringa(dati, "icona") || "bolt",
    selezionabile: booleano(dati, "selezionabile"),
    ordine: numero(dati, "ordine"),
    attivo: booleano(dati, "attivo"),
  };

  if (id) {
    await prisma.automazione.update({ where: { id }, data: valori });
  } else {
    // Lo slug si genera dal titolo una sola volta, alla creazione: serve
    // per collegare il modulo di richiesta alla funzione scelta.
    let slug = slugifica(titolo) || `automazione-${Date.now()}`;
    if (await prisma.automazione.findUnique({ where: { slug } })) {
      slug = `${slug}-${Date.now().toString(36)}`;
    }
    await prisma.automazione.create({
      data: { ...valori, slug, attivo: true },
    });
  }

  rinfresca();
}

export async function eliminaAutomazione(dati: FormData) {
  await assicuraSviluppatore();
  const id = stringa(dati, "id");
  if (!id) return;
  await prisma.automazione.delete({ where: { id } });
  rinfresca();
}

export async function eliminaVantaggio(dati: FormData) {
  await assicuraSviluppatore();
  const id = stringa(dati, "id");
  if (!id) return;
  await prisma.vantaggio.delete({ where: { id } });
  rinfresca();
}

export async function salvaFaq(dati: FormData) {
  await assicuraSviluppatore();

  const id = stringa(dati, "id");
  const domanda = stringa(dati, "domanda");
  if (!domanda) return;

  const valori = {
    domanda,
    risposta: stringa(dati, "risposta"),
    ordine: numero(dati, "ordine"),
    attiva: booleano(dati, "attiva"),
  };

  if (id) {
    await prisma.faq.update({ where: { id }, data: valori });
  } else {
    await prisma.faq.create({ data: { ...valori, attiva: true } });
  }

  rinfresca();
}

export async function eliminaFaq(dati: FormData) {
  await assicuraSviluppatore();
  const id = stringa(dati, "id");
  if (!id) return;
  await prisma.faq.delete({ where: { id } });
  rinfresca();
}

export async function salvaContatto(dati: FormData) {
  await assicuraSviluppatore();

  const id = stringa(dati, "id");
  const etichetta = stringa(dati, "etichetta");
  if (!etichetta) return;

  const valori = {
    etichetta,
    valore: stringa(dati, "valore"),
    url: stringa(dati, "url") || null,
    icona: stringa(dati, "icona") || "link",
    ordine: numero(dati, "ordine"),
    attivo: booleano(dati, "attivo"),
  };

  if (id) {
    await prisma.contatto.update({ where: { id }, data: valori });
  } else {
    await prisma.contatto.create({ data: { ...valori, attivo: true } });
  }

  rinfresca();
}

export async function eliminaContatto(dati: FormData) {
  await assicuraSviluppatore();
  const id = stringa(dati, "id");
  if (!id) return;
  await prisma.contatto.delete({ where: { id } });
  rinfresca();
}

/* ------------------------------- Sorveglianza ------------------------------- */

/**
 * Toglie un indirizzo dalla quarantena automatica.
 *
 * Serve perché la quarantena sbaglia: dietro un unico IP pubblico può
 * esserci un ufficio intero, e basta una persona che insiste su una
 * password dimenticata per chiudere fuori i colleghi. Senza questo
 * comando l'unico rimedio sarebbe aspettare mezz'ora o riavviare il
 * processo — cioè far cadere le notifiche di tutti per liberarne uno.
 */
export async function liberaIndirizzo(dati: FormData): Promise<EsitoAzione> {
  await assicuraSviluppatore();
  const ip = stringa(dati, "ip");
  if (!ip) return { ok: false, messaggio: "Manca l'indirizzo." };
  liberaIp(ip);
  revalidatePath("/admin");
  return { ok: true, messaggio: `${ip} è di nuovo libero di passare.` };
}

/* ----------------------------------- Ruoli ---------------------------------- */

/**
 * Solo DEVELOPER può cambiare ruolo a un altro utente, e solo fra
 * UTENTE/SUPPORTO/ADMIN: DEVELOPER non si assegna né si toglie da qui,
 * in nessuna delle due direzioni — resta un'operazione da console.
 */
export async function impostaRuoloUtente(dati: FormData) {
  await assicuraSviluppatore();

  const riferimento = stringa(dati, "utente");
  const nuovoRuolo = stringa(dati, "ruolo") as Ruolo;
  if (
    !riferimento ||
    !RUOLI_ASSEGNABILI_DA_PANNELLO.includes(
      nuovoRuolo as (typeof RUOLI_ASSEGNABILI_DA_PANNELLO)[number],
    )
  ) {
    return;
  }

  const pulito = riferimento.replace(/^@/, "");
  const utente = await prisma.utente.findFirst({
    where: { OR: [{ telegramId: pulito }, { username: pulito }] },
  });
  if (!utente || utente.ruolo === "DEVELOPER") return;

  await prisma.utente.update({
    where: { id: utente.id },
    data: { ruolo: nuovoRuolo },
  });

  revalidatePath("/admin");
}

/* ---------------------------------- Utenti ---------------------------------- */

/**
 * Tre poteri distinti sulla stessa scheda, e la distinzione è il punto:
 *
 * - SUPPORTO vede e **segnala**: incontra i clienti tutto il giorno ed è il
 *   primo ad accorgersi di un problema, ma non decide le sanzioni;
 * - ADMIN **blocca l'account**: è una decisione sul cliente, reversibile e
 *   con un nome sopra;
 * - DEVELOPER **bandisce indirizzo e dispositivo**: colpisce chi un account
 *   non ce l'ha, o se n'è già fatto un altro, e può prendere dentro persone
 *   estranee — per questo sta al livello più stretto.
 */

/** Segnalazione di un account a chi può agire. Aperta a tutto lo staff. */
export async function segnalaUtente(dati: FormData) {
  const autore = await assicuraStaff();

  const utenteId = stringa(dati, "utenteId");
  const motivo = stringa(dati, "motivo").slice(0, 500);
  if (!utenteId || motivo.length < 5) return;

  const bersaglio = await prisma.utente.findUnique({
    where: { id: utenteId },
    select: { id: true, username: true, telegramId: true },
  });
  if (!bersaglio) return;

  // Una segnalazione già aperta sullo stesso account non ne genera una
  // seconda: sotto un cliente molesto lo staff ne aprirebbe una a testa, e
  // il pannello degli admin diventerebbe l'elenco di chi se n'è accorto
  // invece dell'elenco dei casi da decidere.
  const gia = await prisma.segnalazione.findFirst({
    where: { utenteId, stato: { in: ["APERTA", "PRESA_IN_CARICO"] } },
    select: { id: true, motivo: true },
  });
  if (gia) {
    // Il testo si accoda, ma con un tetto: senza, ogni nuova segnalazione
    // sullo stesso account allungava la stessa riga all'infinito, e chi
    // avesse voluto riempire il database avrebbe dovuto solo premere
    // "invia" un po' di volte. Duemila caratteri sono già più di quanto
    // un admin legga prima di decidere.
    const aggiornato =
      `${gia.motivo}\n\n— ${autore.telegramId}: ${motivo}`.slice(0, 2000);

    await prisma.segnalazione.update({
      where: { id: gia.id },
      data: { motivo: aggiornato },
    });
    rinfresca();
    return;
  }

  await prisma.segnalazione.create({
    data: { utenteId, autoreId: autore.id, motivo },
  });

  const nome = bersaglio.username
    ? `@${bersaglio.username}`
    : bersaglio.telegramId;

  await notificaAdmin(
    `<b>Segnalazione su ${escapeHtml(nome)}</b>\n\n${escapeHtml(motivo)}\n\nDa: ${escapeHtml(autore.username ? `@${autore.username}` : autore.telegramId)}`,
    { segnalazione: true },
  );

  rinfresca();
}

/** Chiude una segnalazione. Solo chi può anche agire di conseguenza. */
export async function chiudiSegnalazione(dati: FormData) {
  await assicuraOperatore();

  const id = stringa(dati, "id");
  const esito = stringa(dati, "esito").slice(0, 300);
  if (!id) return;

  await prisma.segnalazione.update({
    where: { id },
    data: { stato: "CHIUSA", esito: esito || null, chiusoIl: new Date() },
  });

  rinfresca();
}

/**
 * Blocca o sblocca un account.
 *
 * Il ruolo non viene toccato: un account bloccato lo conserva e lo ritrova
 * intatto allo sblocco. Degradarlo a UTENTE "per sicurezza" perderebbe
 * l'informazione per sempre, e il giorno del ripensamento nessuno saprebbe
 * più cosa era prima.
 */
export async function cambiaBloccoUtente(dati: FormData) {
  const operatore = await assicuraOperatore();

  const utenteId = stringa(dati, "utenteId");
  const blocca = booleano(dati, "blocca");
  const motivo = stringa(dati, "motivo").slice(0, 300);
  if (!utenteId) return;

  const bersaglio = await prisma.utente.findUnique({
    where: { id: utenteId },
    select: { id: true, ruolo: true, telegramId: true },
  });
  if (!bersaglio) return;

  // Nessuno blocca sé stesso: è l'errore di distrazione che costa una
  // sessione sul server per rimediare, e non ha nessun uso legittimo.
  if (bersaglio.id === operatore.id) return;

  /**
   * Chi sta sopra blocca chi sta sotto, mai un pari grado.
   *
   * Senza questa riga un ADMIN poteva bloccare un altro ADMIN: due account
   * dello stesso livello con il potere di chiudersi fuori a vicenda, dove
   * vince chi preme per primo. Non è un caso di scuola — basta un account
   * di staff compromesso per far fuori tutti gli altri e restare solo in
   * casa, e il rimedio sarebbe una sessione sul server.
   *
   * DEVELOPER resta fuori portata per tutti, come per l'assegnazione dei
   * ruoli: l'ultimo livello di accesso non si chiude dal pannello.
   */
  const bersaglioEStaff = eStaff(bersaglio.ruolo);
  if (bersaglio.ruolo === "DEVELOPER") return;
  if (bersaglioEStaff && operatore.ruolo !== "DEVELOPER") return;

  await prisma.utente.update({
    where: { id: utenteId },
    data: blocca
      ? {
          bloccato: true,
          bloccatoIl: new Date(),
          motivoBlocco: motivo || "nessun motivo indicato",
          bloccatoDaId: operatore.id,
        }
      : {
          bloccato: false,
          bloccatoIl: null,
          motivoBlocco: null,
          bloccatoDaId: null,
        },
  });

  // Il perimetro lavora su una copia in memoria: senza questa riga
  // l'effetto arriverebbe al giro di sincronizzazione successivo, e chi
  // preme "blocca" vedrebbe la persona continuare a navigare.
  if (blocca) {
    aggiungiLocale("account", utenteId, {
      motivo: motivo || "nessun motivo indicato",
      scadeIl: null,
    });
  } else togliLocale("account", utenteId);

  // Avvisato solo lo sblocco. Al blocco la persona se ne accorge da sola
  // alla richiesta successiva, e mandarle un messaggio significherebbe
  // spiegarle di essere stata scoperta.
  if (!blocca) {
    await notificaUtente({
      utenteId,
      telegramId: bersaglio.telegramId,
      titolo: "Accesso ripristinato",
      testo: "Il tuo account è di nuovo attivo.",
    });
  }

  rinfresca();
}

/** A quale elenco in memoria corrisponde ogni tipo di bando. */
const FAMIGLIA: Record<TipoBando, FamigliaBando> = {
  IP: "ip",
  SOTTORETE: "sottoreti",
  DISPOSITIVO: "dispositivi",
};

const NOME_TIPO: Record<TipoBando, string> = {
  IP: "indirizzo",
  SOTTORETE: "rete",
  DISPOSITIVO: "dispositivo",
};

/**
 * Bandisce un indirizzo, una rete o un dispositivo. Solo DEVELOPER.
 *
 * Restituisce un esito invece di uscire in silenzio. Prima ogni controllo
 * fallito era un `return` muto: la pagina si ricaricava identica, e un
 * bando non creato era indistinguibile da uno creato. Chi lo ha scoperto lo
 * ha scoperto il giorno in cui serviva.
 */
export async function creaBando(dati: FormData): Promise<EsitoAzione> {
  const autore = await assicuraSviluppatore();

  const tipo = stringa(dati, "tipo") as TipoBando;
  let valore = stringa(dati, "valore").slice(0, 100);
  const motivo = stringa(dati, "motivo").slice(0, 300);
  const giorni = numero(dati, "giorni", 0);

  if (!FAMIGLIA[tipo]) {
    return { ok: false, messaggio: "Tipo di esclusione sconosciuto." };
  }
  if (!valore) return { ok: false, messaggio: "Manca il valore da escludere." };

  /**
   * Forma del valore verificata prima di scriverlo.
   *
   * Non è una difesa contro l'iniezione — Prisma parametrizza — ma contro
   * un errore che non fa rumore: un IP scritto male, o un identificativo
   * incollato a metà, produce un bando che non corrisponderà mai a nulla.
   * Chi lo ha creato però lo vede in elenco e lo dà per fatto, e si accorge
   * che non funzionava solo quando serviva davvero.
   */
  if (tipo === "DISPOSITIVO" && !identificativoValido(valore)) {
    return {
      ok: false,
      messaggio:
        "Il marcatore del dispositivo deve essere di 32 caratteri esadecimali.",
    };
  }

  if (tipo === "SOTTORETE") {
    // La normalizzazione non è un dettaglio: il perimetro confronta per
    // uguaglianza, quindi 203.0.113.9/24 e 203.0.113.0/24 devono diventare
    // la stessa riga, altrimenti si creerebbero due bandi di cui uno non
    // corrisponderà mai a nessuno.
    const esame = sottoreteBandibile(valore);
    if (!esame.valida) {
      return { ok: false, messaggio: esame.motivo ?? "Rete non valida." };
    }
    valore = esame.normalizzata as string;
  }

  if (tipo === "IP") {
    if (!/^[0-9a-fA-F:.]{3,45}$/.test(valore)) {
      return { ok: false, messaggio: "Indirizzo in una forma non valida." };
    }
    // "sconosciuto" è il ripiego di ipClient quando il proxy non passa
    // l'intestazione: bandirlo chiuderebbe fuori chiunque arrivi in quella
    // condizione, cioè potenzialmente tutti insieme.
    if (valore === "sconosciuto") {
      return {
        ok: false,
        messaggio:
          "«sconosciuto» non è un indirizzo: è ciò che si legge quando il proxy non passa l'intestazione. Bandirlo chiuderebbe fuori chiunque si trovi in quella condizione.",
      };
    }
  }

  const scadeIl =
    giorni > 0 ? new Date(Date.now() + giorni * 24 * 60 * 60 * 1000) : null;
  const testo = motivo || "nessun motivo indicato";

  // upsert e non create: ribandire un indirizzo già in elenco è un gesto
  // normale — si allunga la scadenza o si corregge il motivo — e non deve
  // fallire per violazione di unicità.
  await prisma.bando.upsert({
    where: { tipo_valore: { tipo, valore } },
    create: { tipo, valore, motivo: testo, scadeIl, autoreId: autore.id },
    update: { motivo: testo, scadeIl, autoreId: autore.id },
  });

  aggiungiLocale(FAMIGLIA[tipo], valore, {
    motivo: testo,
    scadeIl: scadeIl ? scadeIl.getTime() : null,
  });
  rinfresca();

  return {
    ok: true,
    messaggio: `${NOME_TIPO[tipo]} ${valore} escluso${
      scadeIl ? ` per ${giorni} ${giorni === 1 ? "giorno" : "giorni"}` : " in modo permanente"
    }.`,
  };
}

/** Revoca un bando. La riga resta a database come storico. */
export async function revocaBando(dati: FormData): Promise<EsitoAzione> {
  await assicuraSviluppatore();

  const id = stringa(dati, "id");
  if (!id) return { ok: false, messaggio: "Manca l'identificativo." };

  // Tollerante sull'assenza: due schede aperte sullo stesso pannello, e la
  // seconda revoca trova la riga già sparita. Un'eccezione qui manderebbe
  // l'admin sul confine d'errore per un'operazione che in realtà è
  // riuscita — solo non da lui.
  const bando = await prisma.bando.delete({ where: { id } }).catch(() => null);
  if (!bando) return { ok: true, messaggio: "Esclusione già revocata." };

  togliLocale(FAMIGLIA[bando.tipo], bando.valore);
  rinfresca();

  return { ok: true, messaggio: `Esclusione di ${bando.valore} revocata.` };
}

/* -------------------------- Azioni rapide di bando ------------------------- */

/**
 * Bando in un gesto solo, dalla riga che lo ha suggerito.
 *
 * Il modulo completo — motivo, durata — resta per le decisioni ponderate.
 * Questa serve al caso opposto e più frequente: si sta guardando la console
 * mentre qualcosa succede, e il tempo che passa fra il vedere e il fermare
 * è tempo in cui la cosa continua. Il motivo si scrive dopo, modificando la
 * riga in elenco.
 */
export async function bandisciSubito(dati: FormData): Promise<EsitoAzione> {
  const modulo = new FormData();
  modulo.set("tipo", stringa(dati, "tipo"));
  modulo.set("valore", stringa(dati, "valore"));
  modulo.set(
    "motivo",
    stringa(dati, "motivo") || "esclusione rapida dalla sorveglianza",
  );
  modulo.set("giorni", stringa(dati, "giorni") || "0");
  return creaBando(modulo);
}

/* ----------------------------- Eccezioni di rete ---------------------------- */

/**
 * Esenta un indirizzo dal bando della sua sottorete.
 *
 * È la risposta a un ricorso accolto, e il motivo per cui il bando di rete
 * è uno strumento usabile: senza, l'unico modo di rimediare a un falso
 * positivo sarebbe revocare il provvedimento e riaprire la porta a ciò che
 * lo aveva causato.
 */
export async function creaEccezione(dati: FormData): Promise<EsitoAzione> {
  const autore = await assicuraSviluppatore();

  const ip = stringa(dati, "ip").slice(0, 45);
  const motivo = stringa(dati, "motivo").slice(0, 300);
  const giorni = numero(dati, "giorni", 0);
  const ricorsoId = stringa(dati, "ricorsoId") || null;

  if (!ip || ip === "sconosciuto" || !/^[0-9a-fA-F:.]{3,45}$/.test(ip)) {
    return { ok: false, messaggio: "Indirizzo in una forma non valida." };
  }

  const scadeIl =
    giorni > 0 ? new Date(Date.now() + giorni * 24 * 60 * 60 * 1000) : null;
  const testo = motivo || "ricorso accolto";

  await prisma.eccezioneRete.upsert({
    where: { ip },
    create: { ip, motivo: testo, scadeIl, autoreId: autore.id, ricorsoId },
    update: { motivo: testo, scadeIl, autoreId: autore.id, ricorsoId },
  });

  aggiungiEccezioneLocale(ip);
  rinfresca();

  return {
    ok: true,
    messaggio: `${ip} non è più coperto dal bando della sua rete.`,
  };
}

export async function revocaEccezione(dati: FormData): Promise<EsitoAzione> {
  await assicuraSviluppatore();

  const id = stringa(dati, "id");
  if (!id) return { ok: false, messaggio: "Manca l'identificativo." };

  const voce = await prisma.eccezioneRete
    .delete({ where: { id } })
    .catch(() => null);
  if (!voce) return { ok: true, messaggio: "Eccezione già revocata." };

  togliEccezioneLocale(voce.ip);
  rinfresca();

  return { ok: true, messaggio: `Eccezione per ${voce.ip} revocata.` };
}

/* --------------------------------- Ricorsi --------------------------------- */

/**
 * Decide un ricorso.
 *
 * Accogliere fa due cose in un gesto, ed è voluto: segna il ricorso e crea
 * l'eccezione per quell'indirizzo. Separarle avrebbe significato che ogni
 * ricorso accolto richiede un secondo passaggio da un'altra parte del
 * pannello — cioè che ogni tanto qualcuno lo dimentica, e la persona resta
 * bloccata dopo che le è stato dato ragione.
 */
export async function decidiRicorso(dati: FormData): Promise<EsitoAzione> {
  const autore = await assicuraSviluppatore();

  const id = stringa(dati, "id");
  const decisione = stringa(dati, "decisione");
  const nota = stringa(dati, "nota").slice(0, 500);

  if (!id) return { ok: false, messaggio: "Manca l'identificativo." };
  if (decisione !== "ACCOLTO" && decisione !== "RESPINTO") {
    return { ok: false, messaggio: "Decisione non riconosciuta." };
  }

  const ricorso = await prisma.ricorso.findUnique({ where: { id } });
  if (!ricorso) return { ok: false, messaggio: "Ricorso non trovato." };

  await prisma.ricorso.update({
    where: { id },
    data: {
      stato: decisione,
      decisoIl: new Date(),
      decisoDaId: autore.id,
      nota: nota || null,
    },
  });

  if (decisione === "RESPINTO") {
    rinfresca();
    return { ok: true, messaggio: "Ricorso respinto." };
  }

  // Accolto: l'indirizzo torna a passare. Per un bando di rete basta
  // l'eccezione; per un bando sul singolo indirizzo o sul dispositivo
  // l'eccezione non c'entra — lì il provvedimento va tolto, perché era
  // stato preso proprio su quel valore.
  if (ricorso.causa === "sottorete") {
    const modulo = new FormData();
    modulo.set("ip", ricorso.ip);
    modulo.set("motivo", `ricorso accolto${nota ? `: ${nota}` : ""}`);
    modulo.set("ricorsoId", ricorso.id);
    const esito = await creaEccezione(modulo);
    return esito.ok
      ? { ok: true, messaggio: `Ricorso accolto. ${esito.messaggio}` }
      : esito;
  }

  const tipo: TipoBando = ricorso.causa === "ip" ? "IP" : "DISPOSITIVO";
  const bando = await prisma.bando
    .delete({ where: { tipo_valore: { tipo, valore: ricorso.valore } } })
    .catch(() => null);
  if (bando) togliLocale(FAMIGLIA[tipo], bando.valore);

  rinfresca();
  return {
    ok: true,
    messaggio: `Ricorso accolto: esclusione di ${ricorso.valore} revocata.`,
  };
}
