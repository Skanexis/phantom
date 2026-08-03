import { NextResponse, type NextRequest } from "next/server";
import { richiediSviluppatore } from "@/lib/sessione";
import { rispondiConRegistro } from "@/lib/registro-query";

/**
 * Archivio delle richieste: la scheda Logs.
 *
 * Riservata a DEVELOPER e non allo staff in generale, per la stessa ragione
 * della sorveglianza: qui dentro ci sono indirizzi IP e user-agent dei
 * visitatori, cioè dati personali che non servono a chi risponde ai
 * clienti. A chi non ha il ruolo la rotta risponde 404 — non deve nemmeno
 * risultare esistente.
 *
 * Filtri, paginazione ed esportazione stanno in `lib/registro-query.ts`,
 * condivisi con la scheda DEV.LOGS.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(richiesta: NextRequest) {
  const sviluppatore = await richiediSviluppatore();
  if (!sviluppatore) {
    return NextResponse.json({ errore: "Non trovato." }, { status: 404 });
  }

  return rispondiConRegistro(richiesta);
}
