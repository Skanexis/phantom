import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { JetBrains_Mono, Archivo } from "next/font/google";
import { TelegramProvider } from "@/components/telegram-provider";
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
        <Script
          src="https://telegram.org/js/telegram-web-app.js"
          strategy="beforeInteractive"
        />
        {/* Applica il tema prima del primo paint per evitare il lampo di colore. */}
        <script dangerouslySetInnerHTML={{ __html: scriptTemaIniziale }} />
      </head>
      <body className="min-h-full flex flex-col">
        <TemaProvider>
          <TelegramProvider>{children}</TelegramProvider>
        </TemaProvider>
      </body>
    </html>
  );
}
