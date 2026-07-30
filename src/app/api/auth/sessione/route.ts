import { NextResponse } from "next/server";
import { utenteCorrente } from "@/lib/sessione";
import { eliminaSessione } from "@/lib/sessione";

/** Restituisce l'utente della sessione corrente, se esiste. */
export async function GET() {
  const utente = await utenteCorrente();

  if (!utente) return NextResponse.json({ utente: null });

  return NextResponse.json({
    utente: {
      id: utente.id,
      nome: utente.nome,
      cognome: utente.cognome,
      username: utente.username,
      ruolo: utente.ruolo,
    },
  });
}

/** Chiude la sessione corrente. */
export async function DELETE() {
  await eliminaSessione();
  return NextResponse.json({ ok: true });
}
