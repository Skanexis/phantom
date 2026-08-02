import { Navigazione } from "@/components/navigazione";
import { PiedePagina } from "@/components/piede-pagina";
import { TransizionePagina } from "@/components/transizione-pagina";

/**
 * Guscio condiviso da tutte le pagine del sito pubblico (home, richiesta,
 * area personale, admin, exchange, supporto) — non da /manutenzione, che
 * resta fuori da questo gruppo con la sua schermata a sé.
 *
 * Prima ogni pagina renderizzava Navigazione e PiedePagina per conto suo:
 * a ogni cambio pagina l'intera intestazione si smontava e rimontava da
 * zero, notifiche e tema compresi. Qui restano montate una volta sola e
 * solo il contenuto in mezzo si dissolve da una pagina all'altra.
 */
export default function LayoutSito({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-full flex-col">
      <Navigazione />
      <TransizionePagina>{children}</TransizionePagina>
      <PiedePagina />
    </div>
  );
}
