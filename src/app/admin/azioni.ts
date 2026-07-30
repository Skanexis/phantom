"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { richiediAdmin } from "@/lib/sessione";
import {
  etichetteStato,
  etichetteStatoAbbonamento,
} from "@/lib/telegram-bot";
import { escapeHtml, notificaUtente } from "@/lib/notifiche";
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

  const sottoscrizione = await prisma.abbonamentoUtente.update({
    where: { id },
    data: {
      stato,
      // L'attivazione fa partire il periodo di un mese.
      ...(stato === "ATTIVO"
        ? {
            inizioIl: new Date(),
            scadeIl: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          }
        : {}),
    },
    include: { utente: true, abbonamento: true },
  });

  await notificaUtente({
    utenteId: sottoscrizione.utenteId,
    telegramId: sottoscrizione.utente.telegramId,
    titolo: "Aggiornamento abbonamento",
    testo: `Il piano ${sottoscrizione.abbonamento.nome} è ora: ${etichetteStatoAbbonamento[stato]}.`,
    url: "/area-personale",
    messaggioTelegram: `<b>Aggiornamento abbonamento</b>\n\nPiano: <b>${escapeHtml(sottoscrizione.abbonamento.nome)}</b>\nStato: <b>${escapeHtml(etichetteStatoAbbonamento[stato])}</b>`,
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
