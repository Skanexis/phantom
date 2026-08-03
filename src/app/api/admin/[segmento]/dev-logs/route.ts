import crypto from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { richiediSviluppatore } from "@/lib/sessione";
import { RUOLI_STAFF, rispondiConRegistro } from "@/lib/registro-query";

/**
 * DEV.LOGS: l'attività di chi ha un ruolo, separata dal traffico dei
 * visitatori.
 *
 * Perché una scheda a parte e non un filtro nella scheda Logs: sono due
 * domande di natura diversa. Logs risponde a «cosa sta arrivando da fuori»,
 * ed è quasi tutto rumore fra cui cercare. Questa risponde a «cosa ha fatto
 * chi ha le chiavi», dove ogni riga conta e il volume è minuscolo. Confuse
 * nello stesso elenco, le seconde spariscono fra le prime.
 *
 * ---
 *
 * Sul segmento segreto nell'indirizzo, detto senza giri di parole.
 *
 * **Non è una misura di sicurezza, e non va trattata come tale.** Chi
 * protegge questa rotta è il controllo del ruolo qui sotto: senza sessione
 * da DEVELOPER non si entra, punto. Se un giorno quel controllo sparisse,
 * il segmento non salverebbe nulla — è una stringa che viaggia in chiaro
 * nell'URL, finisce nella cronologia del browser e nei log del proxy.
 *
 * Quello che aggiunge davvero è un'altra cosa, più modesta e comunque
 * utile: un indirizzo che nessun dizionario contiene non viene mai provato,
 * quindi questa rotta non compare nemmeno come tentativo nel giornale degli
 * eventi. È riduzione di rumore, non di rischio, e vale la pena solo perché
 * costa una variabile d'ambiente.
 *
 * Il confronto è a tempo costante come per il segreto del webhook e per la
 * password del cantiere: non perché qui l'attacco a tempo sia realistico,
 * ma perché avere due modi diversi di confrontare segreti nello stesso
 * progetto è il primo passo verso l'uso di quello sbagliato.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function confrontoSicuro(a: string, b: string): boolean {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  // timingSafeEqual esige la stessa lunghezza: confrontarle prima non
  // rivela nulla di utile, la lunghezza di un segmento si indovina comunque.
  if (bufferA.length !== bufferB.length) return false;
  return crypto.timingSafeEqual(bufferA, bufferB);
}

export async function GET(
  richiesta: NextRequest,
  { params }: { params: Promise<{ segmento: string }> },
) {
  const atteso = process.env.SEGMENTO_DEV_LOGS;

  /**
   * Senza variabile impostata la rotta non esiste: fallire chiusi.
   *
   * L'alternativa — accettare qualunque segmento quando la variabile manca
   * — renderebbe la rotta raggiungibile da chiunque proprio nel momento in
   * cui qualcuno dimentica di configurarla, cioè nel caso in cui serve di
   * più che funzioni bene.
   */
  if (!atteso || atteso.length < 16) {
    return NextResponse.json({ errore: "Non trovato." }, { status: 404 });
  }

  const { segmento } = await params;
  if (!confrontoSicuro(segmento, atteso)) {
    return NextResponse.json({ errore: "Non trovato." }, { status: 404 });
  }

  const sviluppatore = await richiediSviluppatore();
  if (!sviluppatore) {
    return NextResponse.json({ errore: "Non trovato." }, { status: 404 });
  }

  // I ruoli sono imposti qui e non presi dalla richiesta: aggiungere
  // `?ruolo=UTENTE` all'indirizzo non trasforma questa scheda nell'altra.
  return rispondiConRegistro(richiesta, RUOLI_STAFF);
}
