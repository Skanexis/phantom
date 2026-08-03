import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { GIORNI_CONSERVAZIONE } from "@/lib/registro-db";
import type { Prisma } from "@/generated/prisma/client";

/**
 * Interrogazione dell'archivio delle richieste, condivisa da due schede.
 *
 * Logs mostra tutto il traffico; DEV.LOGS mostra solo l'attività di chi ha
 * un ruolo. Sono la stessa domanda con un filtro in più, e tenerne una copia
 * per scheda significherebbe che il giorno in cui si aggiunge un campo, o si
 * corregge la paginazione, una delle due resta indietro senza che nulla lo
 * segnali.
 *
 * ---
 *
 * Sulla paginazione, che è la scelta che decide se queste schede restano
 * usabili fra sei mesi.
 *
 * Si scorre per **cursore** e non con `skip`. Con un OFFSET il database deve
 * comunque attraversare tutte le righe saltate: alla prima pagina non si
 * nota, alla ventesima su un archivio di milioni di righe si aspetta. Il
 * cursore riparte esattamente da dove si era arrivati, e ogni pagina costa
 * quanto la prima.
 *
 * Per lo stesso motivo non si calcola nessun totale. `count()` con filtri su
 * un archivio annuale è una scansione, e servirebbe solo a scrivere «di
 * 3.412.907» sotto l'elenco. Si chiede una riga in più di quelle che
 * servono: se torna, c'è un'altra pagina, ed è tutta l'informazione che
 * serve davvero.
 */

/** Righe per pagina. Il tetto è la difesa contro un `limite=100000`. */
const LIMITE_PREDEFINITO = 100;
const LIMITE_MASSIMO = 200;

/** Righe massime in un'esportazione CSV. */
const MASSIMO_CSV = 20_000;

const LIVELLI = new Set(["info", "avviso", "allarme", "critico"]);

/**
 * Ruoli filtrabili. Elenco chiuso e non "qualunque stringa": il valore
 * arriva da fuori e finisce in una query, e un elenco aperto significa
 * accettare filtri che nessun indice copre.
 */
const RUOLI = new Set(["UTENTE", "SUPPORTO", "ADMIN", "DEVELOPER"]);

/** I ruoli che la scheda DEV.LOGS considera «personale». */
export const RUOLI_STAFF = ["SUPPORTO", "ADMIN", "DEVELOPER"];

function pulisci(valore: string | null, massimo: number): string | undefined {
  if (!valore) return undefined;
  const testo = valore.trim().slice(0, massimo);
  return testo || undefined;
}

function data(valore: string | null): Date | undefined {
  if (!valore) return undefined;
  const quando = new Date(valore);
  return Number.isNaN(quando.getTime()) ? undefined : quando;
}

/**
 * Traduce i parametri della richiesta in un filtro Prisma.
 *
 * Ogni campo è un elenco chiuso o un confronto su colonna indicizzata: non
 * si accetta nulla che possa diventare una scansione completa per errore.
 *
 * `ruoliImposti` non arriva dalla richiesta ma dal chiamante, e non è
 * negoziabile: è il modo in cui DEV.LOGS resta DEV.LOGS anche se qualcuno
 * aggiunge `?ruolo=UTENTE` all'indirizzo.
 */
export function componiFiltro(
  parametri: URLSearchParams,
  ruoliImposti?: string[],
): Prisma.RegistroRichiestaWhereInput {
  const dove: Prisma.RegistroRichiestaWhereInput = {};

  const da = data(parametri.get("da"));
  const a = data(parametri.get("a"));
  if (da || a) dove.quando = { ...(da && { gte: da }), ...(a && { lte: a }) };

  const ip = pulisci(parametri.get("ip"), 45);
  if (ip) dove.ip = ip;

  const rete = pulisci(parametri.get("sottorete"), 50);
  if (rete) dove.sottorete = rete;

  const livelli = (parametri.get("livello") ?? "")
    .split(",")
    .map((voce) => voce.trim())
    .filter((voce) => LIVELLI.has(voce));
  if (livelli.length > 0) dove.livello = { in: livelli };

  const metodo = pulisci(parametri.get("metodo"), 12);
  if (metodo) dove.metodo = metodo.toUpperCase();

  const esito = pulisci(parametri.get("esito"), 40);
  if (esito) dove.esito = esito;

  const stato = Number(parametri.get("stato"));
  if (Number.isInteger(stato) && stato >= 100 && stato <= 599) {
    dove.stato = stato;
  }

  const utente = pulisci(parametri.get("utente"), 60);
  if (utente) dove.utenteId = utente;

  const paese = pulisci(parametri.get("paese"), 2);
  if (paese) dove.paese = paese.toUpperCase();

  const tipo = pulisci(parametri.get("tipo"), 30);
  if (tipo) dove.tipo = tipo;

  const dispositivo = pulisci(parametri.get("dispositivo"), 32);
  if (dispositivo) dove.dispositivo = dispositivo;

  // Il ruolo imposto vince sempre su quello chiesto: chi apre DEV.LOGS
  // guarda l'attività dello staff e basta.
  if (ruoliImposti && ruoliImposti.length > 0) {
    dove.ruolo = { in: ruoliImposti };
  } else {
    const ruolo = pulisci(parametri.get("ruolo"), 20);
    if (ruolo && RUOLI.has(ruolo)) dove.ruolo = ruolo;
  }

  // La ricerca libera resta sul percorso: è il campo su cui ha senso, ha un
  // indice, e un `contains` su di esso è comunque limitato dalla finestra
  // temporale che l'interfaccia impone sempre.
  const percorso = pulisci(parametri.get("percorso"), 200);
  if (percorso) dove.percorso = { contains: percorso, mode: "insensitive" };

  if (parametri.get("soloEventi") === "1") dove.tipo = { not: null };

  return dove;
}

const CAMPI = {
  id: true,
  quando: true,
  livello: true,
  metodo: true,
  percorso: true,
  ip: true,
  sottorete: true,
  paese: true,
  utenteId: true,
  telegramId: true,
  ruolo: true,
  dispositivo: true,
  agente: true,
  esito: true,
  stato: true,
  tipo: true,
  motivi: true,
  durataMs: true,
} as const;

/** Una cella CSV: virgolette raddoppiate, campo sempre citato. */
function cella(valore: unknown): string {
  if (valore === null || valore === undefined) return '""';
  return `"${String(valore).replace(/"/g, '""')}"`;
}

/**
 * Risponde con una pagina dell'archivio, o con l'esportazione CSV.
 *
 * Non verifica i permessi: lo fa la rotta che la chiama, ognuna a modo suo.
 * Tenerlo fuori da qui è voluto — una funzione che decide *anche* chi può
 * entrare invita a dimenticarsene nel punto in cui si aggiunge una rotta.
 */
export async function rispondiConRegistro(
  richiesta: NextRequest,
  ruoliImposti?: string[],
): Promise<NextResponse> {
  const parametri = richiesta.nextUrl.searchParams;
  const dove = componiFiltro(parametri, ruoliImposti);

  if (parametri.get("formato") === "csv") {
    const righe = await prisma.registroRichiesta.findMany({
      where: dove,
      orderBy: [{ quando: "desc" }, { id: "desc" }],
      take: MASSIMO_CSV,
      select: CAMPI,
    });

    const intestazione = Object.keys(CAMPI).join(",");
    const corpo = righe
      .map((riga) =>
        Object.keys(CAMPI)
          .map((campo) => cella((riga as Record<string, unknown>)[campo]))
          .join(","),
      )
      .join("\n");

    return new NextResponse(`${intestazione}\n${corpo}\n`, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="registro-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  }

  const limite = Math.min(
    Math.max(Number(parametri.get("limite")) || LIMITE_PREDEFINITO, 1),
    LIMITE_MASSIMO,
  );

  /**
   * Il cursore è l'id dell'ultima riga già ricevuta. `skip: 1` lo esclude
   * senza doverlo confrontare a mano con la data: l'ordinamento è
   * (quando desc, id desc) e l'id è univoco, quindi la posizione è esatta
   * anche fra righe scritte nello stesso millisecondo — che nel nostro caso
   * è la norma, visto che arrivano tutte dallo stesso lotto.
   */
  const cursore = Number(parametri.get("cursore"));
  const daCursore = Number.isInteger(cursore) && cursore > 0;

  const righe = await prisma.registroRichiesta.findMany({
    where: dove,
    orderBy: [{ quando: "desc" }, { id: "desc" }],
    take: limite + 1,
    ...(daCursore && { cursor: { id: cursore }, skip: 1 }),
    select: CAMPI,
  });

  const altre = righe.length > limite;
  const pagina = altre ? righe.slice(0, limite) : righe;

  return NextResponse.json({
    righe: pagina.map((riga) => ({
      ...riga,
      // Millisecondi e non Date: attraversano il confine server/client, e
      // una stringa ISO costringerebbe il client a riconvertirla riga per riga.
      quando: riga.quando.getTime(),
      motivi: riga.motivi ? riga.motivi.split(" · ") : [],
    })),
    altre,
    prossimoCursore: altre ? pagina[pagina.length - 1]?.id : null,
    giorniConservazione: GIORNI_CONSERVAZIONE,
  });
}
