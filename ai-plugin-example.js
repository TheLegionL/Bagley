/**
 * Esempio di utilizzo del AI Plugin Universale
 *
 * Questo file dimostra come integrare il plugin AI in un'applicazione
 * o bot WhatsApp esistente.
 */

const { createAIService } = require('./ai-plugin');

// Simula un logger semplice
const logger = {
  info: (msg) => console.log('[INFO]', msg),
  warn: (msg, err) => console.warn('[WARN]', msg, err),
  error: (msg, err) => console.error('[ERROR]', msg, err)
};

// Configurazione
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'your-api-key-here';

// Crea il servizio AI
const aiService = createAIService(OPENAI_API_KEY, {
  MAX_HISTORY_LENGTH: 10,
  DEFAULT_MODEL: 'gpt-4o-mini',
  DEFAULT_TEMPERATURE: 0.7
}, logger);

// Esempio 1: Risposta semplice
async function esempioRispostaSemplice() {
  console.log('=== Esempio 1: Risposta Semplice ===');

  try {
    const reply = await aiService.generateReply({
      messageText: 'Ciao! Come ti chiami?',
      authorName: 'Utente Test',
      chatName: 'Chat di Test',
      chatId: 'test-chat-1'
    });

    console.log('Utente:', 'Ciao! Come ti chiami?');
    console.log('AI:', reply);
  } catch (error) {
    console.error('Errore:', error.message);
  }
}

// Esempio 2: Conversazione con cronologia
async function esempioConversazione() {
  console.log('\n=== Esempio 2: Conversazione ===');

  const chatId = 'test-chat-2';

  try {
    // Primo messaggio
    const reply1 = await aiService.generateReply({
      messageText: 'Qual è la capitale dell\'Italia?',
      authorName: 'Studente',
      chatName: 'Lezione Geografia',
      chatId: chatId
    });
    console.log('Utente:', 'Qual è la capitale dell\'Italia?');
    console.log('AI:', reply1);

    // Secondo messaggio (con contesto)
    const reply2 = await aiService.generateReply({
      messageText: 'Dimmi qualcosa di interessante su questa città',
      authorName: 'Studente',
      chatName: 'Lezione Geografia',
      chatId: chatId
    });
    console.log('\nUtente:', 'Dimmi qualcosa di interessante su questa città');
    console.log('AI:', reply2);

  } catch (error) {
    console.error('Errore:', error.message);
  }
}

// Esempio 3: Trascrizione audio simulata
async function esempioTrascrizioneAudio() {
  console.log('\n=== Esempio 3: Trascrizione Audio ===');

  // Simula un buffer audio (in un caso reale verrebbe da un messaggio WhatsApp)
  const fakeAudioBuffer = Buffer.from('fake audio data');

  try {
    const transcript = await aiService.transcribeAudio(fakeAudioBuffer, 'audio/ogg');
    console.log('Trascrizione:', transcript || 'Trascrizione non disponibile (audio simulato)');
  } catch (error) {
    console.error('Errore trascrizione:', error.message);
  }
}

// Esempio 4: Cambio personalità
async function esempioPersonalita() {
  console.log('\n=== Esempio 4: Cambio Personalità ===');

  // Salva la personalità corrente
  console.log('Personalità corrente: Bagley (default)');

  // Cambia personalità
  aiService.setPersonaPrompt(
    'Sei un insegnante paziente e incoraggiante. Rispondi sempre in modo educativo e motivante.'
  );

  try {
    const reply = await aiService.generateReply({
      messageText: 'Non capisco la matematica, è troppo difficile!',
      authorName: 'Studente Demotivato',
      chatName: 'Lezione Matematica',
      chatId: 'test-chat-3'
    });

    console.log('Utente:', 'Non capisco la matematica, è troppo difficile!');
    console.log('AI (Insegnante):', reply);

  } catch (error) {
    console.error('Errore:', error.message);
  }

  // Resetta alla personalità predefinita
  aiService.resetPersonaPrompt();
  console.log('Personalità resettata a Bagley');
}

// Esempio 5: Integrazione con bot WhatsApp simulato
async function esempioBotWhatsApp() {
  console.log('\n=== Esempio 5: Integrazione Bot WhatsApp ===');

  // Simula un messaggio WhatsApp
  const mockWhatsAppMessage = {
    text: 'Raccontami una barzelletta divertente',
    author: 'Mario Rossi',
    chatId: '120363123456789012@g.us',
    chatName: 'Gruppo Amici',
    audio: null, // Nessun audio in questo esempio
    image: null  // Nessuna immagine in questo esempio
  };

  // Funzione che simula la gestione di un messaggio
  async function handleWhatsAppMessage(message) {
    // Estrai informazioni dal messaggio
    const text = message.text;
    const authorName = message.author;
    const chatId = message.chatId;
    const chatName = message.chatName;

    // Prepara allegati
    const attachments = [];
    if (message.audio) {
      attachments.push({
        type: 'audio',
        data: message.audio.data,
        mimetype: message.audio.mimetype
      });
    }
    if (message.image) {
      attachments.push({
        type: 'image',
        data: message.image.data,
        mimetype: message.image.mimetype
      });
    }

    // Verifica se il messaggio richiede una risposta AI
    const shouldReplyAI = text && (
      text.toLowerCase().includes('bagley') ||
      text.toLowerCase().includes('ai') ||
      Math.random() > 0.7 // Rispondi casualmente per demo
    );

    if (shouldReplyAI) {
      try {
        const aiReply = await aiService.generateReply({
          messageText: text,
          authorName: authorName,
          chatName: chatName,
          chatId: chatId,
          mediaAttachments: attachments
        });

        if (aiReply) {
          // Simula invio messaggio
          console.log(`[BOT] Invio risposta a ${chatName}:`);
          console.log(`"${aiReply}"`);
          return aiReply;
        }
      } catch (error) {
        console.error('Errore generazione risposta AI:', error.message);
      }
    }

    return null;
  }

  // Gestisci il messaggio simulato
  const response = await handleWhatsAppMessage(mockWhatsAppMessage);
  if (!response) {
    console.log('Nessuna risposta AI generata per questo messaggio');
  }
}

// Esempio 6: Gestione errori
async function esempioGestioneErrori() {
  console.log('\n=== Esempio 6: Gestione Errori ===');

  // Servizio AI disabilitato (nessuna API key)
  const disabledAIService = createAIService('', {}, logger);

  console.log('Servizio AI abilitato:', disabledAIService.enabled);

  const reply = await disabledAIService.generateReply({
    messageText: 'Questo non dovrebbe funzionare',
    authorName: 'Test User',
    chatId: 'error-test'
  });

  console.log('Risposta da servizio disabilitato:', reply); // Dovrebbe essere null
}

// Funzione principale per eseguire tutti gli esempi
async function runExamples() {
  if (!OPENAI_API_KEY || OPENAI_API_KEY === 'your-api-key-here') {
    console.log('⚠️  ATTENZIONE: Imposta OPENAI_API_KEY per test reali');
    console.log('Eseguendo solo esempi che non richiedono API key...\n');

    await esempioGestioneErrori();
    return;
  }

  console.log('🚀 Avvio esempi AI Plugin...\n');

  await esempioRispostaSemplice();
  await esempioConversazione();
  await esempioTrascrizioneAudio();
  await esempioPersonalita();
  await esempioBotWhatsApp();
  await esempioGestioneErrori();

  console.log('\n✅ Tutti gli esempi completati!');
}

// Esegui gli esempi se il file viene chiamato direttamente
if (require.main === module) {
  runExamples().catch(console.error);
}

module.exports = {
  runExamples,
  aiService
};</content>
<parameter name="filePath">c:\Users\Dy\Desktop\bot-bagley-baileys\ai-plugin-example.js