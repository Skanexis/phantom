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
  const { sincronizzaBandi, sincronizzaBandiSePassatoIlTempo } = await import(
    "@/lib/bandi-db"
  );
  const { scaricaRegistro, potaRegistro } = await import("@/lib/registro-db");
  const { risolviInCoda } = await import("@/lib/rete-inversa");
  const { leggiDecisioni } = await import("@/lib/crowdsec");

  // Subito, non al primo intervallo: fra l'avvio del processo e i venti
  // secondi successivi il perimetro avrebbe gli elenchi vuoti, cioè un
  // riavvio equivarrebbe a un condono per tutti i bloccati.
  void sincronizzaBandi();

  /**
   * Un solo battito per tutti i compiti, e ciascuno decide se gli tocca.
   *
   * L'alternativa — un `setInterval` per compito — avrebbe significato
   * quattro timer con quattro cadenze da tenere allineate a mano. Qui il
   * ritmo è uno solo e la frequenza vive accanto al compito che la
   * riguarda: gli avvisi e lo scarico del registro a ogni giro, la lettura
   * degli elenchi ogni cinque minuti, la potatura una volta l'ora.
   */
  const timer = setInterval(() => {
    void giroDiControllo();
    void sincronizzaBandiSePassatoIlTempo();
    // L'archivio delle richieste: la coda in memoria si svuota qui, fuori
    // da qualunque richiesta dell'utente. La potatura decide da sé se è
    // ora — non gira davvero a ogni giro.
    void scaricaRegistro();
    void potaRegistro();
    // Il DNS inverso per il pannello: qui e non dentro la richiesta, così
    // nessuno aspetta un server DNS per vedere una schermata.
    void risolviInCoda();
    // Le decisioni di CrowdSec, se c'è. Blocca nel firewall, quindi senza
    // questa lettura i suoi provvedimenti non comparirebbero da nessuna
    // parte: il pacchetto muore prima di lasciare traccia.
    void leggiDecisioni();
  }, INTERVALLO_MS);

  // Senza questo il timer tiene vivo il ciclo di eventi e il processo non
  // termina più da solo: PM2 aspetterebbe il timeout prima di ucciderlo a
  // ogni riavvio, allungando ogni deploy senza motivo.
  timer.unref?.();

  console.log(
    `[sorveglianza] vigilanza attiva, un giro ogni ${INTERVALLO_MS / 1000}s`,
  );
}
