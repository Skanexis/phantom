import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
});
const prisma = new PrismaClient({ adapter });

const abbonamenti = [
  {
    slug: "bot-telegram",
    nome: "Bot Telegram",
    sottotitolo: "Il tuo business dentro Telegram",
    descrizione:
      "Un bot Telegram completo con vetrina, menu e verifica utenti. Tutto gestibile dal pannello amministrativo, senza toccare una riga di codice.",
    prezzoCentesimi: 4900,
    ordine: 1,
    inEvidenza: false,
    funzionalita: [
      "Bot Telegram dedicato",
      "Vetrina prodotti o servizi",
      "Menu di navigazione personalizzato",
      "Sistema Clean Chat",
      "Verifica obbligatoria degli utenti",
      "Pannello amministrativo incluso",
    ],
  },
  {
    slug: "catalogo-base",
    nome: "Catalogo Base",
    sottotitolo: "Il primo passo verso la vendita online",
    descrizione:
      "Catalogo digitale con gestione autonoma di prodotti e categorie. Ideale per iniziare a vendere in modo strutturato.",
    prezzoCentesimi: 9900,
    ordine: 2,
    inEvidenza: false,
    funzionalita: [
      "Tutto ciò che è incluso nel piano Bot Telegram",
      "Catalogo prodotti illimitato",
      "Gestione categorie e disponibilità",
      "Schede prodotto con immagini",
      "Statistiche di base",
      "Supporto via Telegram",
    ],
  },
  {
    slug: "catalogo-avanzato",
    nome: "Catalogo Avanzato",
    sottotitolo: "Per chi cresce sul serio",
    descrizione:
      "Catalogo esteso con gestione ordini, promozioni e integrazioni. Il piano scelto dalla maggior parte dei clienti.",
    prezzoCentesimi: 19900,
    ordine: 3,
    inEvidenza: true,
    funzionalita: [
      "Tutto ciò che è incluso nel piano Base",
      "Gestione completa degli ordini",
      "Codici sconto e promozioni",
      "Notifiche automatiche ai clienti",
      "Statistiche avanzate",
      "Integrazioni personalizzate",
      "Supporto prioritario",
    ],
  },
  {
    slug: "catalogo-massimo",
    nome: "Catalogo Massimo",
    sottotitolo: "Tutta la potenza della piattaforma",
    descrizione:
      "L'insieme completo delle funzionalità, con personalizzazioni su misura e assistenza dedicata.",
    prezzoCentesimi: 39900,
    ordine: 4,
    inEvidenza: false,
    funzionalita: [
      "Tutto ciò che è incluso nel piano Avanzato",
      "Funzionalità su misura per il tuo business",
      "Automazioni dei processi interni",
      "Integrazione con sistemi esterni e CRM",
      "Account manager dedicato",
      "Assistenza prioritaria 7 giorni su 7",
      "Aggiornamenti e sviluppi inclusi",
    ],
  },
];

const servizi = [
  {
    titolo: "Siti web",
    descrizione:
      "Siti vetrina, landing page e piattaforme su misura. Veloci, curati nei dettagli e pensati per convertire.",
    icona: "globe",
    ordine: 1,
  },
  {
    titolo: "Applicazioni",
    descrizione:
      "Applicazioni web e mobili costruite su misura, scalabili e pronte a crescere insieme al tuo progetto.",
    icona: "app",
    ordine: 2,
  },
  {
    titolo: "Automazione",
    descrizione:
      "Eliminiamo il lavoro ripetitivo automatizzando i processi aziendali e collegando gli strumenti che già usi.",
    icona: "bolt",
    ordine: 3,
  },
  {
    titolo: "Bot Telegram",
    descrizione:
      "Bot e Mini App Telegram per vendere, assistere i clienti e gestire la community direttamente in chat.",
    icona: "chat",
    ordine: 4,
  },
];

const vantaggi = [
  {
    titolo: "Consegna rapida",
    descrizione:
      "Processi collaudati e tempi certi: dal primo confronto al progetto online in tempi brevi.",
    icona: "rocket",
    ordine: 1,
  },
  {
    titolo: "Tutto gestibile da te",
    descrizione:
      "Ogni progetto include un pannello amministrativo: prezzi, testi e contenuti si modificano senza sviluppatori.",
    icona: "sliders",
    ordine: 2,
  },
  {
    titolo: "Mobile first",
    descrizione:
      "Progettiamo prima per lo schermo del telefono, dove i tuoi clienti passano davvero il loro tempo.",
    icona: "phone",
    ordine: 3,
  },
  {
    titolo: "Supporto continuo",
    descrizione:
      "Non spariamo dopo la consegna: restiamo al tuo fianco con assistenza e miglioramenti costanti.",
    icona: "shield",
    ordine: 4,
  },
];

const faq = [
  {
    domanda: "Quanto tempo serve per realizzare il progetto?",
    risposta:
      "Un bot Telegram o un catalogo base sono operativi in pochi giorni. Per progetti su misura definiamo insieme una tempistica precisa dopo il primo confronto.",
    ordine: 1,
  },
  {
    domanda: "Posso modificare i contenuti da solo?",
    risposta:
      "Sì. Ogni piano include un pannello amministrativo dal quale puoi modificare testi, prezzi, prodotti e funzionalità senza alcuna competenza tecnica.",
    ordine: 2,
  },
  {
    domanda: "Posso cambiare piano in un secondo momento?",
    risposta:
      "Certo. Puoi passare a un piano superiore o inferiore in qualsiasi momento: i tuoi dati e le configurazioni restano intatti.",
    ordine: 3,
  },
  {
    domanda: "Come funziona lo sviluppo su misura?",
    risposta:
      "Compili il modulo indicando l'ambito e le tue esigenze. Riceviamo la richiesta, ti contattiamo per approfondire e prepariamo un preventivo dettagliato.",
    ordine: 4,
  },
  {
    domanda: "Devo pagare subito?",
    risposta:
      "No. La richiesta non comporta alcun impegno: prima definiamo insieme obiettivi, tempi e costi.",
    ordine: 5,
  },
];

const contatti = [
  {
    etichetta: "Telegram",
    valore: "@phantomlab",
    url: "https://t.me/phantomlab",
    icona: "telegram",
    ordine: 1,
  },
  {
    etichetta: "Email",
    valore: "info@phantomlab.it",
    url: "mailto:info@phantomlab.it",
    icona: "mail",
    ordine: 2,
  },
];

const contenuti = [
  { chiave: "hero.badge", valore: "Studio di sviluppo digitale", gruppo: "hero" },
  { chiave: "hero.titolo", valore: "Costruiamo prodotti digitali che lavorano per te", gruppo: "hero" },
  {
    chiave: "hero.sottotitolo",
    valore:
      "Phantom Lab progetta siti, applicazioni, automazioni e bot Telegram su misura. Dalla prima idea al prodotto online, con un pannello che resta nelle tue mani.",
    gruppo: "hero",
  },
  { chiave: "hero.cta.primaria", valore: "Richiedi un progetto", gruppo: "hero" },
  { chiave: "hero.cta.secondaria", valore: "Scopri gli abbonamenti", gruppo: "hero" },
  { chiave: "azienda.titolo", valore: "Chi siamo", gruppo: "azienda" },
  {
    chiave: "azienda.testo",
    valore:
      "Siamo un team di sviluppo specializzato in prodotti digitali su misura. Uniamo tecnologia moderna e attenzione al dettaglio per costruire strumenti che semplificano davvero il lavoro quotidiano dei nostri clienti.",
    gruppo: "azienda",
  },
  { chiave: "servizi.titolo", valore: "Cosa facciamo", gruppo: "servizi" },
  { chiave: "servizi.sottotitolo", valore: "Quattro aree, un unico standard di qualità.", gruppo: "servizi" },
  { chiave: "vantaggi.titolo", valore: "Perché Phantom Lab", gruppo: "vantaggi" },
  { chiave: "vantaggi.sottotitolo", valore: "Il valore che ricevi al di là del codice.", gruppo: "vantaggi" },
  { chiave: "abbonamenti.titolo", valore: "Abbonamenti mensili", gruppo: "abbonamenti" },
  {
    chiave: "abbonamenti.sottotitolo",
    valore: "Soluzioni pronte all'uso, attive da subito e senza vincoli.",
    gruppo: "abbonamenti",
  },
  { chiave: "sumisura.titolo", valore: "Sviluppo su misura", gruppo: "sumisura" },
  {
    chiave: "sumisura.sottotitolo",
    valore:
      "Hai un'idea che non rientra negli abbonamenti? Raccontacela: costruiamo la soluzione attorno alle tue esigenze.",
    gruppo: "sumisura",
  },
  { chiave: "faq.titolo", valore: "Domande frequenti", gruppo: "faq" },
  { chiave: "contatti.titolo", valore: "Parliamone", gruppo: "contatti" },
  {
    chiave: "contatti.sottotitolo",
    valore: "Scrivici: rispondiamo in giornata e senza impegno.",
    gruppo: "contatti",
  },
];

async function main() {
  for (const piano of abbonamenti) {
    const { funzionalita, ...dati } = piano;
    const creato = await prisma.abbonamento.upsert({
      where: { slug: dati.slug },
      update: dati,
      create: dati,
    });
    await prisma.funzionalitaAbbonamento.deleteMany({ where: { abbonamentoId: creato.id } });
    await prisma.funzionalitaAbbonamento.createMany({
      data: funzionalita.map((testo, indice) => ({
        abbonamentoId: creato.id,
        testo,
        ordine: indice + 1,
      })),
    });
  }

  for (const contenuto of contenuti) {
    await prisma.contenutoSito.upsert({
      where: { chiave: contenuto.chiave },
      update: { valore: contenuto.valore, gruppo: contenuto.gruppo },
      create: contenuto,
    });
  }

  if ((await prisma.servizio.count()) === 0) {
    await prisma.servizio.createMany({ data: servizi });
  }
  if ((await prisma.vantaggio.count()) === 0) {
    await prisma.vantaggio.createMany({ data: vantaggi });
  }
  if ((await prisma.faq.count()) === 0) {
    await prisma.faq.createMany({ data: faq });
  }
  if ((await prisma.contatto.count()) === 0) {
    await prisma.contatto.createMany({ data: contatti });
  }

  console.log("Seed completato.");
}

main()
  .catch((errore) => {
    console.error(errore);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
