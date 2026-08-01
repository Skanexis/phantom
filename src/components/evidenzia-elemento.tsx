"use client";

import { useEffect, useRef } from "react";

/**
 * Porta in vista il proprio contenuto e lo segna per un istante, per chi
 * arriva da un link esterno puntato a un elemento preciso (es. una
 * notifica che rimanda a una richiesta specifica in un elenco lungo).
 */
export function EvidenziaElemento({
  attivo,
  children,
  className = "",
}: {
  attivo: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  const riferimento = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!attivo || !riferimento.current) return;
    // Rimandato di un tick: la scheda che lo contiene deve prima aprirsi.
    const ridotto = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const id = setTimeout(() => {
      riferimento.current?.scrollIntoView({
        behavior: ridotto ? "instant" : "smooth",
        block: "center",
      });
    }, 260);
    return () => clearTimeout(id);
  }, [attivo]);

  return (
    <div
      ref={riferimento}
      className={`${className} ${attivo ? "evidenziata" : ""}`}
    >
      {children}
    </div>
  );
}
