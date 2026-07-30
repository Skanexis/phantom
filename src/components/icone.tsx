type ProprietaIcona = { className?: string };

/* Icone geometriche a tratto netto: nessuna curva morbida, coerenti col reticolo. */
const base = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.25,
  strokeLinecap: "square" as const,
  strokeLinejoin: "miter" as const,
  viewBox: "0 0 24 24",
};

export const Icone = {
  globe: (p: ProprietaIcona) => (
    <svg {...base} {...p}>
      <rect x="3" y="3" width="18" height="18" />
      <path d="M3 9h18M3 15h18M12 3v18" />
    </svg>
  ),
  app: (p: ProprietaIcona) => (
    <svg {...base} {...p}>
      <rect x="6" y="2" width="12" height="20" />
      <path d="M6 6h12M6 18h12" />
    </svg>
  ),
  bolt: (p: ProprietaIcona) => (
    <svg {...base} {...p}>
      <path d="M13 2 5 13h6l-1 9 8-11h-6z" />
    </svg>
  ),
  chat: (p: ProprietaIcona) => (
    <svg {...base} {...p}>
      <path d="M3 4h18v13H8l-5 4z" />
      <path d="M7 9h10M7 12h6" />
    </svg>
  ),
  rocket: (p: ProprietaIcona) => (
    <svg {...base} {...p}>
      <path d="M12 2 17 9v9H7V9z" />
      <path d="M7 18 4 22M17 18l3 4M12 9v4" />
    </svg>
  ),
  sliders: (p: ProprietaIcona) => (
    <svg {...base} {...p}>
      <path d="M3 7h18M3 17h18" />
      <rect x="14" y="4" width="4" height="6" />
      <rect x="6" y="14" width="4" height="6" />
    </svg>
  ),
  phone: (p: ProprietaIcona) => (
    <svg {...base} {...p}>
      <rect x="7" y="2" width="10" height="20" />
      <path d="M10 19h4" />
    </svg>
  ),
  shield: (p: ProprietaIcona) => (
    <svg {...base} {...p}>
      <path d="M12 2 20 5v7l-8 10-8-10V5z" />
      <path d="m8 11 3 3 5-5" />
    </svg>
  ),
  telegram: (p: ProprietaIcona) => (
    <svg {...base} {...p}>
      <path d="M2 11 22 3l-4 18-6-5-3 4-1-6z" />
      <path d="m9 14 9-9" />
    </svg>
  ),
  mail: (p: ProprietaIcona) => (
    <svg {...base} {...p}>
      <rect x="2" y="5" width="20" height="14" />
      <path d="m2 6 10 7 10-7" />
    </svg>
  ),
  code: (p: ProprietaIcona) => (
    <svg {...base} {...p}>
      <path d="m8 7-5 5 5 5M16 7l5 5-5 5M14 4l-4 16" />
    </svg>
  ),
  spark: (p: ProprietaIcona) => (
    <svg {...base} {...p}>
      <path d="M12 2v20M2 12h20M5 5l14 14M19 5 5 19" />
    </svg>
  ),
  link: (p: ProprietaIcona) => (
    <svg {...base} {...p}>
      <path d="M10 14 21 3M15 3h6v6" />
      <path d="M18 14v7H3V6h7" />
    </svg>
  ),
  check: (p: ProprietaIcona) => (
    <svg {...base} {...p}>
      <path d="m3 12 6 6L21 6" />
    </svg>
  ),
  freccia: (p: ProprietaIcona) => (
    <svg {...base} {...p}>
      <path d="M3 12h18M14 5l7 7-7 7" />
    </svg>
  ),
} as const;

export type NomeIcona = keyof typeof Icone;

export function Icona({
  nome,
  className,
}: {
  nome: string;
  className?: string;
}) {
  const Componente = Icone[nome as NomeIcona] ?? Icone.spark;
  return <Componente className={className} />;
}
