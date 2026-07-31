/**
 * Formattazione del tempo, condivisa fra notifiche, messaggi e richieste.
 * Una data secca ("14/03") non dice se sia successo un'ora fa o tre mesi fa:
 * è la distanza dal presente l'informazione che serve leggendo un elenco.
 */

const MINUTO = 60 * 1000;
const ORA = 60 * MINUTO;
const GIORNO = 24 * ORA;

/** "adesso", "5 min fa", "3 ore fa", "ieri", poi la data. */
export function tempoRelativo(valore: Date | string, ora = new Date()) {
  const data = typeof valore === "string" ? new Date(valore) : valore;
  const scarto = ora.getTime() - data.getTime();

  if (scarto < MINUTO) return "adesso";
  if (scarto < ORA) return `${Math.floor(scarto / MINUTO)} min fa`;
  if (scarto < GIORNO) {
    const ore = Math.floor(scarto / ORA);
    return ore === 1 ? "un'ora fa" : `${ore} ore fa`;
  }

  const giorni = Math.floor(scarto / GIORNO);
  if (giorni === 1) return "ieri";
  if (giorni < 7) return `${giorni} giorni fa`;

  // Oltre la settimana la data assoluta torna più utile del conteggio:
  // "23 giorni fa" richiede un calcolo mentale che nessuno fa.
  return data.toLocaleDateString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    ...(data.getFullYear() === ora.getFullYear() ? {} : { year: "numeric" }),
  });
}

/** Etichetta del separatore di giornata dentro una conversazione. */
export function etichettaGiorno(valore: Date | string, ora = new Date()) {
  const data = typeof valore === "string" ? new Date(valore) : valore;

  const soloGiorno = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

  const scarto = (soloGiorno(ora) - soloGiorno(data)) / GIORNO;

  if (scarto === 0) return "Oggi";
  if (scarto === 1) return "Ieri";
  if (scarto < 7) {
    const nome = data.toLocaleDateString("it-IT", { weekday: "long" });
    return nome.charAt(0).toUpperCase() + nome.slice(1);
  }

  return data.toLocaleDateString("it-IT", {
    day: "2-digit",
    month: "long",
    ...(data.getFullYear() === ora.getFullYear() ? {} : { year: "numeric" }),
  });
}

/** Vero se la data cade nelle ultime 24 ore: alimenta il bollino "Novità". */
export function recente(valore: Date | string, ora = new Date()) {
  const data = typeof valore === "string" ? new Date(valore) : valore;
  return ora.getTime() - data.getTime() < GIORNO;
}

/** Saluto secondo l'ora locale di chi legge. */
export function saluto(ora = new Date()) {
  const h = ora.getHours();
  if (h < 5) return "Buonanotte";
  if (h < 13) return "Buongiorno";
  if (h < 18) return "Buon pomeriggio";
  return "Buonasera";
}
