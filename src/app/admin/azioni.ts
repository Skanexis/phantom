"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { richiediAdmin } from "@/lib/sessione";
import { etichetteStato, etichetteStatoAbbonamento } from "@/lib/telegram-bot";
import { escapeHtml, notificaUtente } from "@/lib/notifiche";
import { dataBreve, scadenzaDaPeriodo } from "@/lib/abbonamenti";
import type {
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

const statiAbbonamento = [
  "IN_ATTESA",
  "ATTIVO",
  "SOSPESO",
  "SCADUTO",
  "ANNULLATO",
] as const;

/** Ogni azione passa da qui: nessuna scrittura senza ruolo ADMIN. */
async function assicuraAdmin() {
  const admin = await richiediAdmin();
  if (!admin) throw new Error("Accesso negato.");
  return admin;
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

/* ---------------------------------- Abbonamenti --------------------------------- */

export async function aggiornaAbbonamento(dati: FormData) {
  await assicuraAdmin();

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
  await assicuraAdmin();

  const nome = stringa(dati, "nome");
  if (!nome) return;

  const slugBase =
    stringa(dati, "slug") ||
    nome
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

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
  await assicuraAdmin();
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
  await assicuraAdmin();

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
  await assicuraAdmin();
  const id = stringa(dati, "id");
  if (!id) return;
  await prisma.funzionalitaAbbonamento.delete({ where: { id } });
  rinfresca();
}

/* ------------------------------ Sottoscrizioni utenti ----------------------------- */

export async function aggiornaStatoSottoscrizione(dati: FormData) {
  await assicuraAdmin();

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
    titolo: "Aggiornamento abbonamento",
    testo: `Il piano ${sottoscrizione.abbonamento.nome} è ora: ${etichetteStatoAbbonamento[stato]}.${
      stato === "ATTIVO" && scadenza ? ` Rinnovo il ${scadenza}.` : ""
    }`,
    url: "/area-personale",
    messaggioTelegram: `<b>Aggiornamento abbonamento</b>\n\nPiano: <b>${escapeHtml(sottoscrizione.abbonamento.nome)}</b>\nStato: <b>${escapeHtml(etichetteStatoAbbonamento[stato])}</b>${
      stato === "ATTIVO" && scadenza ? `\nRinnovo: ${escapeHtml(scadenza)}` : ""
    }`,
  });

  revalidatePath("/admin");
  revalidatePath("/area-personale");
}

/** Proroga rapida: sposta la scadenza in avanti di un ciclo del piano. */
export async function prorogaSottoscrizione(dati: FormData) {
  await assicuraAdmin();

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
    url: "/area-personale",
    messaggioTelegram: `<b>Abbonamento rinnovato</b>\n\nPiano: <b>${escapeHtml(sottoscrizione.abbonamento.nome)}</b>\nValido fino al: <b>${escapeHtml(dataBreve(nuova) ?? "")}</b>`,
  });

  revalidatePath("/admin");
  revalidatePath("/area-personale");
}

/** Assegnazione diretta di un piano a un utente, senza richiesta dal sito. */
export async function assegnaAbbonamento(dati: FormData) {
  await assicuraAdmin();

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

  await prisma.abbonamentoUtente.create({
    data: {
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
    titolo: "Abbonamento attivato",
    testo: `Il piano ${piano.nome} è attivo fino al ${dataBreve(scadeIl)}.`,
    url: "/area-personale",
    messaggioTelegram: `<b>Abbonamento attivato</b>\n\nPiano: <b>${escapeHtml(piano.nome)}</b>\nValido fino al: <b>${escapeHtml(dataBreve(scadeIl) ?? "")}</b>`,
  });

  revalidatePath("/admin");
  revalidatePath("/area-personale");
}

/* --------------------------------- Richieste -------------------------------- */

export async function aggiornaStatoRichiesta(dati: FormData) {
  await assicuraAdmin();

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
    await notificaUtente({
      utenteId: richiesta.utente.id,
      telegramId: richiesta.utente.telegramId,
      titolo: "Aggiornamento richiesta",
      testo: `Lo stato della tua richiesta è ora: ${etichetteStato[stato]}.${nota ? ` Nota: ${nota}` : ""}`,
      url: "/area-personale",
      messaggioTelegram: `<b>Aggiornamento richiesta</b>\n\nNuovo stato: <b>${escapeHtml(etichetteStato[stato])}</b>${nota ? `\n\n${escapeHtml(nota)}` : ""}`,
    });
  }

  revalidatePath("/admin");
  revalidatePath("/area-personale");
}

export async function eliminaRichiesta(dati: FormData) {
  await assicuraAdmin();
  const id = stringa(dati, "id");
  if (!id) return;
  await prisma.richiesta.delete({ where: { id } });
  revalidatePath("/admin");
}

/* --------------------------------- Contenuti -------------------------------- */

export async function aggiornaContenuto(dati: FormData) {
  await assicuraAdmin();

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
  await assicuraAdmin();

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
  await assicuraAdmin();
  const id = stringa(dati, "id");
  if (!id) return;
  await prisma.servizio.delete({ where: { id } });
  rinfresca();
}

export async function salvaVantaggio(dati: FormData) {
  await assicuraAdmin();

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

export async function eliminaVantaggio(dati: FormData) {
  await assicuraAdmin();
  const id = stringa(dati, "id");
  if (!id) return;
  await prisma.vantaggio.delete({ where: { id } });
  rinfresca();
}

export async function salvaFaq(dati: FormData) {
  await assicuraAdmin();

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
  await assicuraAdmin();
  const id = stringa(dati, "id");
  if (!id) return;
  await prisma.faq.delete({ where: { id } });
  rinfresca();
}

export async function salvaContatto(dati: FormData) {
  await assicuraAdmin();

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
  await assicuraAdmin();
  const id = stringa(dati, "id");
  if (!id) return;
  await prisma.contatto.delete({ where: { id } });
  rinfresca();
}
