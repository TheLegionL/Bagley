# Bagley – Bot WhatsApp con Baileys

Bagley è un bot WhatsApp scritto in Node.js che usa la libreria [Baileys](https://github.com/adiwajshing/Baileys) per collegarsi a WhatsApp Web multi-device. Il bot implementa una gerarchia di permessi per la gestione dei gruppi ed integra una risposta AI basata sulle API OpenAI.

## Requisiti

- Node.js 18 o superiore
- Un account WhatsApp da dedicare al bot
- Chiave API OpenAI (facoltativa ma necessaria per la funzione AI)

## Installazione

1. Installare le dipendenze:
   ```bash
   npm install
   ```

2. Configurare l'owner:
   - Copiare `config/owner.example.json` in `config/owner.json`.
   - Inserire il JID dell'owner (formato `numero@s.whatsapp.net`, senza `+` né spazi).

3. Configurare la whitelist (opzionale):
   - Modificare `config/whitelist.json` aggiungendo oggetti con `jid` (e facoltativamente `name`) dei membri da promuovere al **grado 2**.

4. Configurare l'AI (opzionale ma necessaria per le risposte intelligenti):
   - Copiare `config/openai.example.json` in `config/openai.json`.
   - Inserire la chiave API nel campo `apiKey`.

5. Avviare il bot:
   ```bash
   npm start
   ```

6. Alla prima esecuzione verrà mostrato un QR code in console: scansionarlo con l'app WhatsApp del numero dedicato al bot.

Le credenziali di sessione vengono salvate nella cartella `auth_info_multi` (esclusa da Git).

## Gerarchia dei permessi

| Grado | Ruolo                    | Descrizione                                                        |
|-------|--------------------------|--------------------------------------------------------------------|
| 0     | Membro                   | Utente standard, nessun privilegio speciale.                       |
| 1     | Admin del gruppo         | Rilevato automaticamente dai metadata del gruppo WhatsApp.         |
| 2     | Whitelist                | JID inclusi in `config/whitelist.json`, con privilegi elevati.     |
| 3     | Owner                    | JID configurato in `config/owner.json`, possiede tutti i poteri.   |

## Comandi disponibili

I comandi si eseguono con il prefisso `.`. L'elenco che segue indica il grado minimo necessario.

| Comando                         | Grado | Descrizione                                                         |
|---------------------------------|-------|---------------------------------------------------------------------|
| `.help`                         | 0     | Mostra i comandi disponibili per il proprio grado.                  |
| `.grade`                        | 0     | Mostra il livello di permessi dell'utente.                          |
| `.whitelist list`               | 2     | Visualizza la whitelist attuale con menzioni e indici.              |
| `.whitelist add @utente`        | 3     | Aggiunge uno o più utenti alla whitelist.                           |
| `.whitelist remove 2 @utente`   | 3     | Rimuove utenti usando indici, menzioni o JID.                       |
| `.whitelist clear`              | 3     | Svuota completamente la whitelist.                                  |
| `.reload whitelist`             | 3     | Ricarica la whitelist dal file sul disco.                           |
| `.promote /promote @utente`     | 1     | Promuove gli utenti indicati a admin del gruppo.                    |
| `.demote /demote @utente`       | 1     | Rimuove i privilegi admin dagli utenti indicati.                    |
| `.kick /kick @utente`           | 1     | Espelle gli utenti menzionati dal gruppo.                           |
| `.ban @utente`                  | 1     | Rimuove gli utenti menzionati dal gruppo (richiede admin WhatsApp). |

È possibile usare JID testuali al posto delle menzioni per i comandi che accettano utenti.
Per `.whitelist remove` puoi anche indicare solo l'indice mostrato da `.whitelist list` (es. `.whitelist remove 2`).

## Integrazione AI

- La funzione AI si attiva quando un messaggio contiene la parola **Bagley** oppure quando un utente risponde direttamente a un messaggio inviato dal bot.
- Se l'API key non è configurata, il bot informa l'utente che la funzione AI non è attiva.
- L'AI è pensata per fornire risposte rapide e in italiano, con particolare attenzione a consigli di moderazione.

## Consigli operativi

- Assicurarsi che Bagley sia admin nel gruppo per poter eseguire operazioni come `.ban`.
- Aggiornare `config/whitelist.json` con prudenza: il file è caricato in memoria e serve il comando `.reload whitelist` per rilevare modifiche manuali.
- In caso di problemi con l'autenticazione, eliminare la cartella `auth_info_multi` e ripetere la scansione del QR code.

## BagleyBank (valuta ฿)

Il sistema economico interno usa la valuta `฿` e salva i dati in `config/bank.json`. Tutte le attività del bot possono accreditare o scalare saldi personali.

Comandi principali (grado minimo 0 salvo diversa indicazione):

- `.account crea|elimina` crea o chiude il tuo conto (con bonus iniziale di ฿5000).
- `.saldo` mostra il saldo, eventuali prestiti in corso e la prossima rata automatica.
- `.dona @utente importo` trasferisce fondi a un altro conto.
- `.aumento <utente|me> importo` (grado 1) ricarica un conto.
- `.prestito importo` richiede un prestito a interesse variabile e lo accredita subito.
- `.paga importo` versa manualmente una rata per estinguere più velocemente il prestito.

I prestiti sono ripagati in 10 rate giornaliere automatiche; il bot prova a prelevare ogni giorno alle 00:00.

## Minigioco .fut con dati ESPN

Il comando `.fut` apre il centro scommesse Bagley FUT. Tutte le vincite vengono accreditate su BagleyBank.

Comandi disponibili:

- `.camp <numero>` seleziona uno dei campionati (Premier League, La Liga, Serie A, Bundesliga, Ligue 1).
- `.match` genera/mostra il match virtuale corrente del gruppo.
- `.bet <giocata> <importo>` piazza una puntata (A/B/X, over/under gol, cartellini, tiri, corner, GG/NG, marcatore, risultato esatto, ecc.).
- `.history` visualizza gli ultimi match simulati nel gruppo.
- `.leaderboard [global]` mostra la classifica dei migliori scommettitori del gruppo o globale.

Il bot crea quote dinamiche basate su “forza” squadra + un fattore random, simula il risultato allo scadere del countdown e accredita automaticamente i vincitori (al netto di una piccola fee di casa).
Ogni gara dura circa due minuti reali: dopo il kick-off riceverai aggiornamenti live (gol, occasioni, cartellini, risse o invasioni di campo, supplementari) fino al triplice fischio virtuale.

### Aggiornamento settimanale dei dati ESPN

1. Assicurati di avere Python installato e il pacchetto `requests` (`pip install requests`).
2. Esegui `npm run fut:update` per lanciare `scripts/update_fut_data.py`. Lo script scarica squadre, giocatori e statistiche dai servizi ESPN (tramite [cwendt94/espn-api](https://github.com/cwendt94/espn-api)) per i cinque campionati configurati.
3. Il file `config/fut-leagues.json` verrà sovrascritto con i dati aggiornati. Programma il comando una volta a settimana (cron, Task Scheduler o Termux) per mantenere fresche le rose.

Lo script usa tutte le API disponibili del progetto ESPN-API esponendo roster completi, in modo da poter aggiungere in futuro nuove attività che sfruttino i dati ufficiali.

## Avvio su Termux (Android)

Per eseguire Bagley su un dispositivo Android tramite Termux segui questi passi rapidi:

1. Installa Termux e i pacchetti necessari sul dispositivo:

   ```bash
   pkg update
   pkg install git nodejs python
   # Se il progetto usa 'sharp' per immagini
   pkg install vips
   ```

2. Clona o trasferisci il repository sul dispositivo e installa le dipendenze:

   ```bash
   git clone <repo-url> bagley
   cd bagley
   npm install --omit=dev
   ```

3. Prepara la configurazione come indicato nella sezione "Installazione" (copiare `config/*.example.json` in `config/` e compilare i campi).

4. Avvia Bagley con lo script helper (gestisce anche il wake-lock se disponibile):

   ```bash
   npm run start:termux
   ```

Note utili:
- Se l'installazione di `sharp` fallisce, prova a installare `vips` (`pkg install vips`) prima di rieseguire `npm install`.
- Per mantenere il bot in background considera l'uso di `tmux`, `termux-job-scheduler` o un gestore di sessioni simile.
