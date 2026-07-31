import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { JetBrains_Mono, Archivo } from "next/font/google";
import { TelegramProvider } from "@/components/telegram-provider";
import { FlussoProvider } from "@/components/flusso-provider";
import { AvvisiProvider } from "@/components/avvisi";
import { TemaProvider, scriptTemaIniziale } from "@/components/tema-provider";
import "./globals.css";

// Grotesque compatta per i titoli: peso e larghezza variabili.
const archivo = Archivo({
  variable: "--font-titolo",
  subsets: ["latin"],
  display: "swap",
});

// Monospace per etichette, dati e microtesto tecnico.
const mono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "PHANTOM LAB — Studio di sviluppo digitale",
  description:
    "Siti web, applicazioni, automazioni e bot Telegram su misura. Abbonamenti mensili e sviluppo personalizzato.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
    { media: "(prefers-color-scheme: light)", color: "#f2f2ef" },
  ],
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="it"
      className={`${archivo.variable} ${mono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        {/* Apre in anticipo la connessione TLS verso telegram.org, così il
            caricamento dello script non paga handshake e DNS da zero. */}
        <link rel="preconnect" href="https://telegram.org" />
        <link rel="dns-prefetch" href="https://telegram.org" />

        {/* Applica il tema prima del primo paint per evitare il lampo di colore. */}
        <script dangerouslySetInnerHTML={{ __html: scriptTemaIniziale }} />
      </head>
      <body className="min-h-full flex flex-col">
        {/* afterInteractive invece di beforeInteractive: con quest'ultimo il
            primo paint resta bloccato finché telegram.org non risponde, e
            fuori da Telegram lo script non serve comunque al rendering.
            TelegramProvider attende già l'oggetto window.Telegram. */}
        <Script
          src="https://telegram.org/js/telegram-web-app.js"
          strategy="afterInteractive"
        />
        <TemaProvider>
          <TelegramProvider>
            {/* Dentro TelegramProvider: il flusso si apre solo a sessione
                riconosciuta, altrimenti riceverebbe 401. */}
            <FlussoProvider>
              <AvvisiProvider>{children}</AvvisiProvider>
            </FlussoProvider>
          </TelegramProvider>
        </TemaProvider>
      </body>
    </html>
  );
}
