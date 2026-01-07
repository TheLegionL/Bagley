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

I comandi si eseguono con il prefisso `!`. L'elenco che segue indica il grado minimo necessario.

| Comando                         | Grado | Descrizione                                                         |
|---------------------------------|-------|---------------------------------------------------------------------|
| `!help`                         | 0     | Mostra i comandi disponibili per il proprio grado.                  |
| `!grade`                        | 0     | Mostra il livello di permessi dell'utente.                          |
| `!whitelist list`               | 2     | Visualizza la whitelist attuale con menzioni e indici.              |
| `!whitelist add @utente`        | 3     | Aggiunge uno o più utenti alla whitelist.                           |
| `!whitelist remove 2 @utente`   | 3     | Rimuove utenti usando indici, menzioni o JID.                       |
| `!whitelist clear`              | 3     | Svuota completamente la whitelist.                                  |
| `!reload whitelist`             | 3     | Ricarica la whitelist dal file sul disco.                           |
| `!promote /promote @utente`     | 1     | Promuove gli utenti indicati a admin del gruppo.                    |
| `!demote /demote @utente`       | 1     | Rimuove i privilegi admin dagli utenti indicati.                    |
| `!kick /kick @utente`           | 1     | Espelle gli utenti menzionati dal gruppo.                           |
| `!ban @utente`                  | 1     | Rimuove gli utenti menzionati dal gruppo (richiede admin WhatsApp). |

È possibile usare JID testuali al posto delle menzioni per i comandi che accettano utenti.
Per `!whitelist remove` puoi anche indicare solo l'indice mostrato da `!whitelist list` (es. `!whitelist remove 2`).

## Integrazione AI

- La funzione AI si attiva quando un messaggio contiene la parola **Bagley** oppure quando un utente risponde direttamente a un messaggio inviato dal bot.
- Se l'API key non è configurata, il bot informa l'utente che la funzione AI non è attiva.
- L'AI è pensata per fornire risposte rapide e in italiano, con particolare attenzione a consigli di moderazione.

## Consigli operativi

- Assicurarsi che Bagley sia admin nel gruppo per poter eseguire operazioni come `!ban`.
- Aggiornare `config/whitelist.json` con prudenza: il file è caricato in memoria e serve il comando `!reload whitelist` per rilevare modifiche manuali.
- In caso di problemi con l'autenticazione, eliminare la cartella `auth_info_multi` e ripetere la scansione del QR code.
