/**
 * Avvio del compito periodico di sorveglianza.
 *
 * `register()` è l'unico punto in cui Next esegue codice all'avvio del
 * server, una volta sola per processo. Serve proprio qui: gli avvisi non
 * possono nascere dentro una richiesta — un attacco che satura il sito
 * spegnerebbe insieme a tutto il resto anche il meccanismo che dovrebbe
 * segnalarlo — e non possono nemmeno dipendere dal pannello aperto, perché
 * il momento in cui nessuno sta guardando è esattamente quello in cui
 * l'avviso conta.
 *
 * Il controllo del runtime non è una formalità: `register` viene invocata
 * anche per il runtime edge, dove non esistono né i timer di Node né il
 * client del database, e importare qui il dispaccio lo trascinerebbe in un
 * bundle in cui non può funzionare.
 */

const INTERVALLO_MS = 20_000;

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // Importazione dinamica e non in cima al file: in edge questo modulo
  // viene comunque valutato, e un `import` statico di Prisma lo farebbe
  // fallire prima ancora di arrivare al controllo qui sopra.
  const { giroDiControllo } = await import("@/lib/allerta");
  const { sincronizzaBandi } = await import("@/lib/bandi-db");

  // Subito, non al primo intervallo: fra l'avvio del processo e i venti
  // secondi successivi il perimetro avrebbe gli elenchi vuoti, cioè un
  // riavvio equivarrebbe a un condono per tutti i bloccati.
  void sincronizzaBandi();

  const timer = setInterval(() => {
    void giroDiControllo();
    void sincronizzaBandi();
  }, INTERVALLO_MS);

  // Senza questo il timer tiene vivo il ciclo di eventi e il processo non
  // termina più da solo: PM2 aspetterebbe il timeout prima di ucciderlo a
  // ogni riavvio, allungando ogni deploy senza motivo.
  timer.unref?.();

  console.log(
    `[sorveglianza] vigilanza attiva, un giro ogni ${INTERVALLO_MS / 1000}s`,
  );
}
