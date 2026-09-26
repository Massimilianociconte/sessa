import type { CheckoutPolicySettings } from "@/lib/commerce/checkout-policy";
import type { LegalInfo } from "@/lib/services/commerce-settings";

/**
 * Testi legali generati dalle bozze in docs/legal e dal comportamento reale
 * del sito (pagamenti, scadenze, annulli, cookie, conservazione dati).
 * I dati aziendali arrivano dalle impostazioni: finché mancano, compaiono
 * segnaposto evidenti e la checklist di lancio blocca il checkout.
 * Prima della pubblicazione definitiva i testi vanno validati da un legale.
 */
export type LegalBlock = { type: "p"; text: string } | { type: "ul"; items: string[] } | { type: "table"; head: string[]; rows: string[][] };
export type LegalSection = { id: string; title: string; blocks: LegalBlock[] };
export type LegalDocument = { title: string; intro: string; sections: LegalSection[] };

type Context = {
  legal: LegalInfo;
  policy: CheckoutPolicySettings & { termsVersion: string };
  cancelHours: number;
  siteUrl: string;
};

const MISSING = "[dato in configurazione]";

function v(value: string): string {
  return value.trim() || MISSING;
}

function company(ctx: Context): string {
  const l = ctx.legal;
  return `${v(l["legal.companyName"])}, sede legale ${v(l["legal.registeredOffice"])}, P.IVA ${v(l["legal.vatNumber"])}${
    l["legal.taxCode"] ? `, C.F. ${l["legal.taxCode"]}` : ""
  }, REA ${v(l["legal.rea"])}, PEC ${v(l["legal.pec"])}`;
}

const p = (text: string): LegalBlock => ({ type: "p", text });
const ul = (...items: string[]): LegalBlock => ({ type: "ul", items });

export function legalNotes(ctx: Context): LegalDocument {
  return {
    title: "Note legali",
    intro: "Informazioni sul gestore del sito ai sensi dell'art. 7 del D.Lgs. 70/2003 e dell'art. 49 del Codice del Consumo.",
    sections: [
      {
        id: "gestore",
        title: "Gestore del sito",
        blocks: [
          p(`Il sito ${ctx.siteUrl} è gestito da ${company(ctx)}.`),
          ul(
            `Assistenza clienti: ${v(ctx.legal["legal.supportEmail"])}${ctx.legal["legal.supportPhone"] ? ` · ${ctx.legal["legal.supportPhone"]}` : ""}`,
            `Richieste privacy: ${v(ctx.legal["legal.privacyEmail"])}`
          )
        ]
      },
      {
        id: "proprieta",
        title: "Proprietà intellettuale",
        blocks: [
          p("Il marchio Sessa 1930, i testi, le fotografie, la firma grafica e gli elementi visivi del sito sono protetti dalla normativa sulla proprietà intellettuale. Ogni uso non autorizzato è vietato.")
        ]
      }
    ]
  };
}

export function salesConditions(ctx: Context): LegalDocument {
  const { policy } = ctx;
  const cash = (policy.cashMaxCents / 100).toFixed(2).replace(".", ",");
  return {
    title: "Condizioni generali di vendita",
    intro: `Versione ${policy.termsVersion}. Disciplinano gli acquisti sul sito ${ctx.siteUrl} da parte di consumatori.`,
    sections: [
      {
        id: "venditore",
        title: "1. Venditore",
        blocks: [p(`Il venditore è ${company(ctx)}. Contatti: ${v(ctx.legal["legal.supportEmail"])}.`)]
      },
      {
        id: "prodotti",
        title: "2. Prodotti e informazioni alimentari",
        blocks: [
          p("Sessa 1930 vende prodotti di pasticceria freschi e confezionati. Ogni scheda prodotto indica denominazione, prezzo, varianti, ingredienti, allergeni e modalità di conservazione, visibili prima dell'acquisto (Reg. UE 1169/2011)."),
          p("Chi ha allergie o intolleranze deve leggere la scheda e, in caso di dubbio, contattare la sede prima di ordinare. Le fotografie sono illustrative: le piccole differenze dovute alla lavorazione artigianale non costituiscono difetto.")
        ]
      },
      {
        id: "sedi",
        title: "3. Sedi, disponibilità e fasce",
        blocks: [
          p("Catalogo, prezzi, disponibilità, orari e modalità di ritiro o consegna dipendono dalla sede scelta. Il ritiro e la consegna locale avvengono nella fascia oraria selezionata al checkout, secondo gli orari, le chiusure e i tempi di preparazione della sede."),
          p("Se dopo l'ordine un prodotto risultasse indisponibile, la sede contatta il cliente per proporre sostituzione, nuova data o rimborso dell'importo pagato.")
        ]
      },
      {
        id: "prezzi",
        title: "4. Prezzi e costi di consegna",
        blocks: [
          p("I prezzi sono in euro e comprendono l'IVA. I costi di consegna, se previsti, sono indicati prima della conferma dell'ordine. I prodotti freschi viaggiano solo con la consegna locale della sede nei CAP serviti; i prodotti confezionati indicati come spedibili possono viaggiare con corriere."),
          p("Nelle riduzioni di prezzo il prezzo precedente è il più basso applicato nei trenta giorni precedenti (D.Lgs. 26/2023).")
        ]
      },
      {
        id: "ordine",
        title: "5. Conclusione del contratto",
        blocks: [
          p("Prima di inviare l'ordine il cliente può verificare e correggere prodotti, quantità, sede, fascia, indirizzo e pagamento. Il contratto si conclude quando il cliente invia l'ordine con il pulsante \"Ordina con obbligo di pagamento\" e riceve l'email di conferma con il riepilogo, che costituisce conferma su supporto durevole."),
          p("L'ordine può essere rifiutato o annullato in caso di dati incompleti, pagamento non riuscito, indisponibilità, uso improprio di codici promozionali o errore manifesto di prezzo; gli importi eventualmente pagati vengono rimborsati.")
        ]
      },
      {
        id: "pagamenti",
        title: "6. Pagamenti",
        blocks: [
          ul(
            "Carta e wallet (Apple Pay, Google Pay) tramite Stripe: i dati della carta sono trattati da Stripe e non vengono conservati da Sessa 1930; l'ordine risulta pagato solo dopo la conferma del circuito.",
            `Bonifico bancario: disponibile per ritiri o consegne ad almeno ${policy.bankTransferMinBusinessDays} giorni lavorativi. L'importo deve risultare accreditato entro ${policy.bankTransferReservationBusinessDays} giorni lavorativi e comunque 24 ore prima della fascia; altrimenti l'ordine viene annullato e il cliente avvisato via email.`,
            `Pagamento in sede al ritiro: disponibile solo per il ritiro, per importi fino a ${cash} € e ritiri entro ${policy.cashMaxAdvanceDays} giorni; è richiesto un numero di telefono.`,
            "Gift card Sessa 1930: il credito si scala dal totale; l'eventuale residuo si paga con un altro metodo."
          ),
          p("Il pagamento con carta non completato entro il tempo di prenotazione comporta l'annullamento dell'ordine senza addebiti.")
        ]
      },
      {
        id: "ritiro-consegna",
        title: "7. Ritiro e consegna",
        blocks: [
          p("Per il ritiro è sufficiente il codice ordine. Per la consegna il cliente fornisce indirizzo e telefono corretti. I prodotti freschi vanno ritirati o ricevuti nella fascia scelta: ritardi o mancato ritiro possono comprometterne la qualità e non danno diritto a rimborso, salvo diverso accordo con la sede.")
        ]
      },
      {
        id: "recesso",
        title: "8. Diritto di recesso",
        blocks: [
          p("Per i contratti a distanza il consumatore ha in generale 14 giorni per recedere. Il recesso è escluso per i prodotti che rischiano di deteriorarsi o scadere rapidamente, per quelli preparati su misura o personalizzati e per i prodotti sigillati aperti dopo la consegna per motivi igienici (art. 59 Codice del Consumo): è il caso della pasticceria fresca."),
          p(`Per i prodotti confezionati a lunga conservazione spediti con corriere, il recesso si esercita scrivendo a ${v(ctx.legal["legal.supportEmail"])} entro 14 giorni dalla consegna, restituendo la confezione integra e sigillata; le spese di restituzione sono a carico del cliente e il rimborso avviene entro 14 giorni con lo stesso mezzo di pagamento.`),
          p("Restano sempre fermi i diritti del cliente se il prodotto è diverso da quanto ordinato, danneggiato o non conforme (garanzia legale, artt. 128 ss. Codice del Consumo).")
        ]
      },
      {
        id: "annullamento",
        title: "9. Annullamento e rimborsi",
        blocks: [
          p(`Il cliente registrato può annullare l'ordine dall'area personale fino a ${ctx.cancelHours} ore prima della fascia e prima dell'inizio della preparazione; negli altri casi deve contattare la sede. Gli ordini pagati con carta sono rimborsati automaticamente sulla stessa carta; quelli pagati con bonifico o in sede vengono rimborsati dalla sede con lo stesso mezzo.`),
          p("I tempi di accredito dipendono dal circuito o dalla banca (di norma 5-10 giorni lavorativi).")
        ]
      },
      {
        id: "promozioni",
        title: "10. Codici sconto, referral e gift card",
        blocks: [
          p("I codici promozionali non sono convertibili in denaro, non sono cumulabili (un codice per ordine), possono essere limitati per sede, prodotto, periodo, importo minimo o cliente e possono essere revocati in caso di abuso. Il premio referral viene riconosciuto quando l'ordine dell'invitato è pagato e ritirato o consegnato. Le gift card non sono rimborsabili in denaro e sono utilizzabili fino alla scadenza indicata.")
        ]
      },
      {
        id: "reclami",
        title: "11. Reclami, legge applicabile e foro",
        blocks: [
          p(`Reclami e segnalazioni: dall'area personale (sezione ordini) o scrivendo a ${v(ctx.legal["legal.supportEmail"])} con codice ordine, foto e descrizione. Si applica la legge italiana; per il consumatore è competente il foro del luogo di residenza o domicilio. Il consumatore può rivolgersi agli organismi di risoluzione alternativa delle controversie (ADR) competenti.`)
        ]
      }
    ]
  };
}

export function privacyPolicy(ctx: Context): LegalDocument {
  return {
    title: "Informativa privacy",
    intro: "Informativa ai sensi degli artt. 13 e 14 del Regolamento UE 2016/679 (GDPR).",
    sections: [
      {
        id: "titolare",
        title: "1. Titolare del trattamento",
        blocks: [p(`Titolare è ${company(ctx)}. Per ogni richiesta sui dati personali: ${v(ctx.legal["legal.privacyEmail"])}.`)]
      },
      {
        id: "dati",
        title: "2. Dati trattati",
        blocks: [
          ul(
            "Dati di contatto e identificativi: nome, cognome, email, telefono.",
            "Dati dell'ordine: prodotti, sede, fascia di ritiro o consegna, indirizzo, importi, codici e gift card, note.",
            "Dati di fatturazione, se richiesti: ragione sociale o nome, partita IVA o codice fiscale, codice SDI o PEC, indirizzo.",
            "Dati di pagamento: esito e identificativi della transazione; i dati della carta sono trattati solo da Stripe.",
            "Dati dell'account e di sicurezza: password in forma non reversibile, sessioni, IP e dispositivo degli accessi, fattori di autenticazione.",
            "Dati tecnici e, solo con consenso, statistiche di navigazione (Google Analytics)."
          )
        ]
      },
      {
        id: "finalita",
        title: "3. Finalità e basi giuridiche",
        blocks: [
          {
            type: "table",
            head: ["Finalità", "Base giuridica"],
            rows: [
              ["Gestione di account, ordini, ritiri, consegne, pagamenti e rimborsi", "Esecuzione del contratto (art. 6.1.b)"],
              ["Obblighi fiscali e contabili", "Obbligo di legge (art. 6.1.c)"],
              ["Sicurezza dell'account e prevenzione di frodi e abusi", "Legittimo interesse (art. 6.1.f)"],
              ["Assistenza, reclami e segnalazioni", "Contratto e legittimo interesse"],
              ["Newsletter, offerte e promemoria carrello", "Consenso (art. 6.1.a), revocabile in ogni momento"],
              ["Statistiche di navigazione (Google Analytics)", "Consenso tramite banner cookie"]
            ]
          }
        ]
      },
      {
        id: "conservazione",
        title: "4. Conservazione",
        blocks: [
          ul(
            "Ordini e documenti contabili: 10 anni (art. 2220 c.c.); alla cancellazione dell'account vengono anonimizzati.",
            "Account: fino alla cancellazione richiesta dal cliente.",
            "Richieste di registrazione non confermate: 24 ore. Profili senza account né ordini: 30 giorni.",
            "Email transazionali: contenuto cancellato dopo l'invio; registro di invio 30 giorni.",
            "Registri tecnici e di sicurezza: fino a 12 mesi; registro delle operazioni del gestionale: 24 mesi.",
            "Consensi marketing: fino a revoca, con data e fonte per dimostrarli."
          )
        ]
      },
      {
        id: "destinatari",
        title: "5. Destinatari e trasferimenti",
        blocks: [
          p("I dati sono trattati dal personale autorizzato delle sedi coinvolte nell'ordine e da fornitori nominati responsabili del trattamento:"),
          ul(
            "Netlify (hosting del sito);",
            "Supabase (database, server nell'Unione Europea);",
            "Stripe (pagamenti con carta, anche come titolare autonomo per gli obblighi di legge sui pagamenti);",
            "fornitore del servizio email transazionale;",
            "Google (Analytics, solo con consenso);",
            "consulenti fiscali e legali."
          ),
          p("Alcuni fornitori possono trattare dati negli Stati Uniti: il trasferimento avviene sulla base del Data Privacy Framework UE-USA o delle clausole contrattuali standard della Commissione europea.")
        ]
      },
      {
        id: "diritti",
        title: "6. Diritti",
        blocks: [
          p(`Puoi chiedere accesso, rettifica, cancellazione, limitazione, portabilità e opposizione, e revocare il consenso in ogni momento, scrivendo a ${v(ctx.legal["legal.privacyEmail"])}. Dall'area personale puoi scaricare i tuoi dati, gestire il consenso marketing ed eliminare l'account. Puoi proporre reclamo al Garante per la protezione dei dati personali (garanteprivacy.it).`)
        ]
      },
      {
        id: "sicurezza",
        title: "7. Sicurezza",
        blocks: [
          p("Password non reversibili, sessioni revocabili, verifica in due passaggi e passkey, cifratura dei dati sensibili a riposo, accessi del personale limitati per ruolo e per sede, registro delle operazioni.")
        ]
      }
    ]
  };
}

export function cookiePolicy(): LegalDocument {
  return {
    title: "Cookie policy",
    intro: "Quali cookie usa lo shop Sessa 1930 e come gestire il consenso (Linee guida Garante privacy, 10 giugno 2021).",
    sections: [
      {
        id: "tecnici",
        title: "Cookie tecnici (sempre attivi)",
        blocks: [
          {
            type: "table",
            head: ["Nome", "Finalità", "Durata"],
            rows: [
              ["sessa_cart", "Mantenere il carrello", "30 giorni"],
              ["sessa_customer_session", "Sessione dell'area personale", "30 giorni"],
              ["sessa_dn", "Mostrare il tuo nome nel menu", "30 giorni"],
              ["sessa_loc", "Ricordare l'ultima sede scelta", "180 giorni"],
              ["sessa_consent_v1", "Ricordare le scelte sui cookie", "180 giorni"],
              ["sessa_ot_<codice>", "Accesso sicuro alla pagina dell'ordine senza token nell'indirizzo", "180 giorni"],
              ["sessa_ref", "Riconoscere l'invito di un amico (referral)", "30 giorni"],
              ["sessa_wa_ch", "Sicurezza dell'accesso con passkey", "5 minuti"],
              ["sessa_admin_session", "Sessione del gestionale (solo personale)", "7 giorni"]
            ]
          }
        ]
      },
      {
        id: "analytics",
        title: "Cookie statistici (solo con consenso)",
        blocks: [
          {
            type: "table",
            head: ["Nome", "Fornitore", "Finalità", "Durata"],
            rows: [
              ["_ga, _ga_<ID>", "Google Ireland Ltd", "Statistiche aggregate su pagine e acquisti, senza segnali pubblicitari", "fino a 24 mesi"]
            ]
          },
          p("Gli indirizzi inviati a Google Analytics sono ripuliti da codici e token; le pagine dell'area personale, del carrello, del checkout e degli ordini non vengono tracciate. Con il consenso il browser salva anche una piccola nota locale (sessa_evt_…) per non conteggiare due volte lo stesso acquisto.")
        ]
      },
      {
        id: "marketing",
        title: "Cookie di profilazione e marketing",
        blocks: [p("Non utilizzati.")]
      },
      {
        id: "consenso",
        title: "Gestione del consenso",
        blocks: [
          p("Al primo accesso il banner permette di accettare, rifiutare o personalizzare con la stessa evidenza. Puoi cambiare scelta in ogni momento dal link \"Preferenze cookie\" nel piè di pagina. Il rifiuto non impedisce di acquistare.")
        ]
      }
    ]
  };
}
