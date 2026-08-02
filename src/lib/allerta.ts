/**
 * Spedizione degli avvisi di sorveglianza su Telegram.
 *
 * Sta a parte da `sorveglianza.ts` per una ragione strutturale, non
 * estetica: quel modulo gira nel perimetro, sul percorso di ogni singola
 * richiesta, e non deve conoscere né il database né la rete. Qui invece si
 * può fare entrambe le cose, perché questo codice non gira mai dentro una
 * richiesta dell'utente — lo chiama un compito periodico (vedi
 * `src/instrumentation.ts`).
 *
 * I destinatari sono i soli DEVELOPER. Non è una scelta di comodo: negli
 * avvisi ci sono indirizzi IP, user-agent e percorsi richiesti, cioè dati
 * personali di chi visita il sito. ADMIN e SUPPORTO gestiscono clienti e
 * pratiche, e per farlo non hanno alcun bisogno di sapere da quale
 * indirizzo si è collegato qualcuno.
 */

import { prisma } from "@/lib/prisma";
import { inviaMessaggio } from "@/lib/telegram-bot";
import { prelevaAllerte, vigila, type Allerta } from "@/lib/sorveglianza";

/**
 * I destinatari cambiano di rado — un ruolo si assegna da console — e
 * rileggerli a ogni giro sarebbe una interrogazione al minuto per sempre.
 */
const VALIDITA_DESTINATARI_MS = 5 * 60_000;

/**
 * Quanti avvisi entrano in un messaggio: oltre, si riassume.
 *
 * Alzato da otto a venti quando le sonde sono entrate nel canale: ogni
 * sondaggio produce ora un avviso proprio, senza raffreddamento, e con il
 * tetto precedente una scansione di routine avrebbe riempito il messaggio
 * di «…e altri N» facendo sparire dietro quel numero gli avvisi che
 * contano. Il limite vero non è qui ma dall'altra parte: Telegram accetta
 * un ritmo finito di messaggi verso la stessa chat, e un messaggio ogni
 * venti secondi con venti voci dentro è il modo di restarci sotto senza
 * perdere nulla.
 */
const MAX_IN_MESSAGGIO = 20;

type Cache = { chatId: string[]; scadenza: number };

let destinatari: Cache | null = null;

/**
 * Chat a cui spedire. In caso di errore del database si restituisce
 * l'ultimo elenco noto invece di niente: un guasto alla lettura dei ruoli
 * non deve rendere muto proprio il canale che avvisa dei guasti.
 */
async function chatDegliSviluppatori(): Promise<string[]> {
  const adesso = Date.now();
  if (destinatari && destinatari.scadenza > adesso) return destinatari.chatId;

  try {
    const utenti = await prisma.utente.findMany({
      where: { ruolo: "DEVELOPER" },
      select: { telegramId: true },
    });

    const chatId = utenti
      .map((utente) => utente.telegramId)
      .filter((valore): valore is string => Boolean(valore));

    destinatari = { chatId, scadenza: adesso + VALIDITA_DESTINATARI_MS };
    return chatId;
  } catch {
    return destinatari?.chatId ?? [];
  }
}

/** Telegram interpreta `<` e `&` come markup: qui il testo è testo. */
function scuda(valore: string) {
  return valore
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function componi(allerte: Allerta[], perse: number): string {
  const alte = allerte.filter((voce) => voce.gravita === "alta").length;
  const intestazione =
    alte > 0
      ? `🔴 <b>Sorveglianza — ${alte} ${alte === 1 ? "allarme" : "allarmi"}</b>`
      : `🟡 <b>Sorveglianza — ${allerte.length} ${allerte.length === 1 ? "avviso" : "avvisi"}</b>`;

  const corpo = allerte.slice(0, MAX_IN_MESSAGGIO).map((voce) => {
    const ora = new Date(voce.quando).toLocaleTimeString("it-IT", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    const segno = voce.gravita === "alta" ? "🔴" : "🟡";
    const dettagli = voce.righe
      .map((riga) => `   <code>${scuda(riga)}</code>`)
      .join("\n");
    return `${segno} <b>${scuda(voce.titolo)}</b>\n   ${ora}\n${dettagli}`;
  });

  const code: string[] = [];
  if (allerte.length > MAX_IN_MESSAGGIO) {
    code.push(`…e altri ${allerte.length - MAX_IN_MESSAGGIO} avvisi.`);
  }
  if (perse > 0) {
    // Dichiarato invece che taciuto: un messaggio che nasconde di essere
    // incompleto è peggio di nessun messaggio.
    code.push(`⚠️ ${perse} avvisi scartati: coda piena.`);
  }
  code.push("Pannello: /admin → Sorveglianza");

  return [intestazione, "", corpo.join("\n\n"), "", code.join("\n")].join("\n");
}

/**
 * Un giro di controllo: valuta il perimetro, svuota la coda e spedisce.
 *
 * Non solleva mai: gira dentro un timer di sistema, e un'eccezione qui
 * significherebbe un rifiuto non gestito che in Node può abbattere il
 * processo — cioè il monitoraggio che spegne il sito.
 */
export async function giroDiControllo(): Promise<number> {
  try {
    vigila();

    const { allerte, perse } = prelevaAllerte();
    if (allerte.length === 0 && perse === 0) return 0;

    const chat = await chatDegliSviluppatori();
    if (chat.length === 0) return 0;

    const testo = componi(allerte, perse);
    await Promise.all(chat.map((chatId) => inviaMessaggio(chatId, testo)));

    return allerte.length;
  } catch (eccezione) {
    console.error("[sorveglianza] giro di controllo fallito:", eccezione);
    return 0;
  }
}
