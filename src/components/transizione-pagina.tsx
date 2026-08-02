"use client";

import { usePathname } from "next/navigation";

/**
 * Incrocio fra una pagina e la successiva: senza, Next sostituiva il
 * contenuto di scatto non appena i dati erano pronti — nessun errore, solo
 * un cambio secco che si percepiva come un piccolo lampo.
 *
 * Vive nel layout condiviso sopra Navigazione e PiedePagina, così è solo il
 * contenuto centrale a dissolversi: l'intestazione resta ferma invece di
 * rimontarsi a ogni cambio pagina.
 *
 * ---
 *
 * Perché una animazione CSS e non `AnimatePresence mode="wait"`, che è la
 * scelta ovvia e che stava qui prima.
 *
 * Quel modo non monta la pagina nuova finché la vecchia non ha finito di
 * uscire, quindi qualcuno deve tenere il conto di chi sta uscendo e di chi
 * è in attesa. Se una seconda navigazione parte mentre l'uscita è ancora in
 * corso — cosa che succede appena si naviga a ritmo normale, e tanto più
 * verso una rotta lenta come /admin, che interroga il database una dozzina
 * di volte — quella contabilità può restare appesa: l'uscente è già andato,
 * l'entrante non viene mai reso. Il risultato è esattamente ciò che si
 * vedeva: intestazione e piede al loro posto, in mezzo il vuoto, e nessun
 * errore da nessuna parte perché tecnicamente non ne è successo nessuno.
 *
 * Con `key={pathname}` React rimonta il contenuto da solo, e l'animazione è
 * una regola CSS che parte al montaggio. Non c'è nessuno stato da tenere,
 * quindi non c'è niente che possa restare appeso. Soprattutto: se
 * l'animazione non parte — preferenze di sistema, browser che la salta,
 * fotogramma perso — l'elemento resta nel suo stato naturale, cioè
 * *visibile*. Il caso peggiore è una pagina che compare senza dissolvenza,
 * non una pagina che non compare.
 */
export function TransizionePagina({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div key={pathname} className="transizione-pagina flex flex-1 flex-col">
      {children}
    </div>
  );
}
