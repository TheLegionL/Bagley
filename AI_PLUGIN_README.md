# AI Plugin Universale

Un plugin completo e modulare per l'integrazione di funzionalità AI basate su OpenAI in chatbot WhatsApp e altre piattaforme.

## Caratteristiche

- ✅ **Generazione di risposte AI** con supporto per testo e immagini
- ✅ **Trascrizione audio** automatica
- ✅ **Gestione personalità** personalizzabili
- ✅ **Cronologia conversazioni** per contesto persistente
- ✅ **Supporto allegati** (audio, immagini)
- ✅ **Architettura modulare** e estensibile
- ✅ **Gestione errori** robusta
- ✅ **Configurazione flessibile**

## Installazione

```bash
npm install openai
```

## Utilizzo Base

```javascript
const { createAIService } = require('./ai-plugin');

// Crea il servizio AI con la tua chiave API
const aiService = createAIService('your-openai-api-key', {
  MAX_HISTORY_LENGTH: 12,
  DEFAULT_MODEL: 'gpt-4o-mini',
  DEFAULT_TEMPERATURE: 0.6
});

// Genera una risposta
const reply = await aiService.generateReply({
  messageText: 'Ciao, come stai?',
  authorName: 'Mario Rossi',
  chatName: 'Gruppo Amici',
  chatId: 'group123@g.us'
});

console.log(reply); // Risposta dell'AI
```

## Utilizzo Avanzato

### Con Allegati Multimediali

```javascript
const reply = await aiService.generateReply({
  messageText: 'Descrivi questa immagine',
  authorName: 'Mario Rossi',
  chatName: 'Gruppo Foto',
  chatId: 'group123@g.us',
  mediaAttachments: [
    {
      type: 'image',
      data: imageBuffer,
      mimetype: 'image/jpeg'
    }
  ]
});
```

### Trascrizione Audio

```javascript
const transcript = await aiService.transcribeAudio(audioBuffer, 'audio/ogg');
console.log(transcript); // Testo trascritto dall'audio
```

### Gestione Personalità

```javascript
// Cambia personalità
aiService.setPersonaPrompt('Sei un assistente amichevole e divertente.');

// Resetta alla personalità predefinita
aiService.resetPersonaPrompt();

// Resetta cronologia per una chat specifica
aiService.resetHistory('chat123@g.us');

// Resetta tutte le cronologie
aiService.resetAllHistory();
```

## Integrazione con WhatsApp Bot

```javascript
const { createAIService } = require('./ai-plugin');

async function handleMessage(message, aiService) {
  // Estrai informazioni dal messaggio WhatsApp
  const text = message.text;
  const author = message.author;
  const chatId = message.chatId;

  // Prepara allegati se presenti
  const attachments = [];
  if (message.audio) {
    attachments.push({
      type: 'audio',
      data: message.audio.data,
      mimetype: message.audio.mimetype
    });
  }

  // Genera risposta AI
  const aiReply = await aiService.generateReply({
    messageText: text,
    authorName: author,
    chatId: chatId,
    mediaAttachments: attachments
  });

  if (aiReply) {
    // Invia risposta
    await sendMessage(chatId, aiReply);
  }
}
```

## Configurazione

Il plugin supporta le seguenti opzioni di configurazione:

```javascript
const options = {
  MAX_HISTORY_LENGTH: 12,        // Lunghezza massima cronologia per chat
  DEFAULT_MODEL: 'gpt-4o-mini',  // Modello OpenAI da utilizzare
  DEFAULT_TEMPERATURE: 0.6,      // Temperatura per generazione risposte
  AUDIO_TRANSCRIPTION_MODEL: 'gpt-4o-mini-transcribe' // Modello per trascrizione
};

const aiService = createAIService(apiKey, options);
```

## Architettura

Il plugin è composto da diversi moduli:

- **`AIService`**: Classe principale che orchestra tutte le funzionalità
- **`ConversationManager`**: Gestisce la cronologia delle conversazioni
- **`AudioTranscriptionService`**: Gestisce la trascrizione audio
- **`ContentFormatter`**: Formatta i contenuti per l'AI

## Gestione Errori

Il plugin include una gestione errori robusta:

- Errori API OpenAI vengono loggati ma non fermano l'esecuzione
- Trascrizioni audio fallite vengono segnalate all'utente
- Immagini non elaborabili vengono saltate silenziosamente

## Personalizzazioni

### Prompt di Personalità Personalizzati

```javascript
const customPrompt = `
Sei un assistente esperto di cucina italiana.
Rispondi sempre in italiano e fornisci ricette dettagliate.
`;

aiService.setPersonaPrompt(customPrompt);
```

### Estensioni

Il plugin può essere esteso creando sottoclassi delle classi principali:

```javascript
class CustomAIService extends AIService {
  async generateReply(params) {
    // Logica personalizzata
    const baseReply = await super.generateReply(params);
    // Modifiche personalizzate
    return baseReply;
  }
}
```

## Dipendenze

- **openai**: ^4.0.0 - Client ufficiale OpenAI
- **Node.js**: >= 16.0.0

## Licenza

MIT License - Vedi file LICENSE per dettagli.

## Supporto

Per supporto o segnalazioni bug, apri una issue nel repository del progetto.</content>
<parameter name="filePath">c:\Users\Dy\Desktop\bot-bagley-baileys\AI_PLUGIN_README.md