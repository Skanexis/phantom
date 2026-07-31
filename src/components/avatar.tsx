"use client";

import { useState } from "react";

/**
 * Foto profilo Telegram con ripiego sulle iniziali.
 *
 * L'URL della foto arriva da Telegram e può sparire o essere bloccato dalla
 * CSP: senza ripiego resterebbe un riquadro vuoto. Le iniziali funzionano
 * sempre, quindi sono il comportamento di base e la foto un miglioramento.
 */
export function Avatar({
  nome,
  urlFoto,
  dimensione = 44,
}: {
  nome: string | null;
  urlFoto?: string | null;
  dimensione?: number;
}) {
  const [caduta, setCaduta] = useState(false);

  const iniziali = (nome ?? "?")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((parte) => parte.charAt(0).toUpperCase())
    .join("");

  const stile = { width: dimensione, height: dimensione };

  if (urlFoto && !caduta) {
    return (
      // <img> e non next/image: l'host della foto cambia senza preavviso e
      // configurare remotePatterns per ogni CDN di Telegram è una battaglia
      // persa. Qui l'ottimizzazione non serve, l'immagine è minuscola.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={urlFoto}
        alt=""
        width={dimensione}
        height={dimensione}
        onError={() => setCaduta(true)}
        referrerPolicy="no-referrer"
        className="shrink-0 border border-[var(--bordo)] object-cover"
        style={stile}
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      style={stile}
      className="mono flex shrink-0 items-center justify-center border border-[var(--bordo)] bg-[var(--sfondo-alt)] text-[13px] font-bold tracking-[0.04em] text-[var(--accento)]"
    >
      {iniziali}
    </span>
  );
}
