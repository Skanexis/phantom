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
import { escapeHtml, notificaUtente } from "@/lib/notifiche";
import { liberaIp } from "@/lib/sorveglianza";
import { dataBreve, scadenzaDaPeriodo } from "@/lib/abbonamenti";
import { linkRichiesta } from "@/lib/richieste";
import { LUNGHEZZA_MASSIMA, inviaMessaggioAdmin } from "@/lib/messaggi";
import { PREFISSO_ABBONAMENTO, codiceUnico } from "@/lib/codici";
import type {
  Ruolo,
  StatoAbbonamentoUtente,
  StatoRichiesta,
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
export async function liberaIndirizzo(dati: FormData) {
  await assicuraSviluppatore();
  const ip = stringa(dati, "ip");
  if (!ip) return;
  liberaIp(ip);
  revalidatePath("/admin");
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
