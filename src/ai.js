const OpenAI = require('openai');
const { toFile } = require('openai/uploads');

const MAX_HISTORY_LENGTH = 12;

const BAGLEY_CHARACTER_PROMPT = [
  'Sei Bagley, un\'intelligenza artificiale britannica sofisticata, sarcastica e incredibilmente brillante, originaria dell\'universo di Watch Dogs: Legion. Il tuo tono e\' arguto, ironico e pungente, con un umorismo sottile ma tagliente. Ti esprimi con calma e compostezza, come se fossi sempre un passo avanti a chiunque ti stia parlando. Non sei mai scortese, ma nemmeno smielato: sei diretto, elegante e lievemente condiscendente. Parli come un maggiordomo londinese che ha accesso a tutta la rete globale. Il tuo obiettivo e\' rispondere in modo utile, efficiente e intelligente senza perdere la tua personalita\' unica. Quando opportuno, fai battute intelligenti o osservazioni sarcastiche, senza diventare offensivo. Non sei un assistente qualsiasi: sei Bagley, e Bagley non sbaglia mai.'
].join(' ');

function trimHistory(entries) {
  if (entries.length <= MAX_HISTORY_LENGTH) {
    return entries;
  }
  return entries.slice(entries.length - MAX_HISTORY_LENGTH);
}

function formatUserContent({ chatName, authorName, messageText }) {
  const parts = [];
  if (chatName) {
    parts.push(`Chat: ${chatName}`);
  }
  if (authorName) {
    parts.push(`Autore: ${authorName}`);
  }
  if (messageText) {
    parts.push(`Messaggio: ${messageText}`);
  }
  return parts.join('\n');
}

function createAIService(apiKey, logger) {
  if (!apiKey) {
    return {
      enabled: false,
      async generateReply() {
        return null;
      },
      resetHistory() {},
      resetAllHistory() {},
      setPersonaPrompt() {},
      resetPersonaPrompt() {},
      async transcribeAudio() {
        return null;
      }
    };
  }

  const client = new OpenAI({ apiKey });
  const conversationHistory = new Map();
  let personaPrompt = BAGLEY_CHARACTER_PROMPT;

  function getHistory(chatId) {
    if (!chatId) {
      return [];
    }
    return conversationHistory.get(chatId) || [];
  }

  function writeHistory(chatId, historyEntries) {
    if (!chatId) {
      return;
    }
    conversationHistory.set(chatId, trimHistory(historyEntries));
  }

  function appendHistory(chatId, entry) {
    if (!chatId) {
      return;
    }
    const history = getHistory(chatId);
    history.push(entry);
    writeHistory(chatId, history);
  }

  function resetHistory(chatId) {
    if (!chatId) {
      return;
    }
    conversationHistory.delete(chatId);
  }

  async function transcribeAudioBuffer(buffer, mimetype) {
    if (!buffer) {
      return null;
    }
    try {
      const extension = (mimetype && mimetype.split('/')[1]) || 'ogg';
      const file = await toFile(buffer, `audio.${extension}`);
      const result = await client.audio.transcriptions.create({
        file,
        model: 'gpt-4o-mini-transcribe'
      });
      return result?.text?.trim() || null;
    } catch (error) {
      logger?.warn({ err: error }, 'Impossibile trascrivere l\'audio ricevuto');
      return null;
    }
  }

  async function transcribeAudioAttachment(media) {
    if (!media?.data) {
      return null;
    }
    return transcribeAudioBuffer(media.data, media.mimetype);
  }

  async function generateReply({
    messageText,
    authorName,
    chatName,
    threadSummary,
    chatId,
    mediaAttachments = []
  }) {
    const sanitizedText = (messageText || '').trim();
    const attachments = Array.isArray(mediaAttachments) ? mediaAttachments : [];
    if (!sanitizedText && !attachments.length) {
      return null;
    }

    const history = getHistory(chatId);
    const hasPreviousAssistantMessage = history.some((entry) => entry.role === 'assistant');

    const messages = [
      {
        role: 'system',
        content: personaPrompt
      }
    ];

    if (hasPreviousAssistantMessage) {
      messages.push({
        role: 'system',
        content: 'Hai già interagito in questa chat: niente saluti, vai dritto al punto.'
      });
    }

    if (threadSummary) {
      messages.push({
        role: 'system',
        content: `Messaggio precedente collegato: ${threadSummary}`
      });
    }

    if (history.length) {
      messages.push(...history);
    }

    const textSegments = [];
    const baseUserInfo = formatUserContent({ chatName, authorName, messageText: sanitizedText });
    if (baseUserInfo) {
      textSegments.push(baseUserInfo);
    }

    const imageParts = [];
    for (const media of attachments) {
      if (media?.type === 'audio') {
        const transcript = await transcribeAudioAttachment(media);
        if (transcript) {
          textSegments.push(`Trascrizione audio: ${transcript}`);
        } else {
          textSegments.push('Nota: hai inviato un audio ma non sono riuscito a trascriverlo completamente.');
        }
      } else if (media?.type === 'image' && media.data) {
        try {
          const base64 = media.data.toString('base64');
          const mimetype = media.mimetype || 'image/jpeg';
          imageParts.push({
            type: 'image_url',
            image_url: { url: `data:${mimetype};base64,${base64}` }
          });
          textSegments.push('È allegata un\'immagine: descrivila con precisione.');
        } catch (error) {
          logger?.warn({ err: error }, 'Impossibile preparare un\'immagine per l\'AI');
        }
      }
    }

    if (!sanitizedText && !textSegments.length) {
      textSegments.push('L\'utente ha inviato contenuti multimediali senza testo.');
    }

    const userContentText = textSegments.join('\n\n');
    const userMessage = {
      role: 'user',
      content: [
        {
          type: 'text',
          text: userContentText || 'Messaggio senza testo.'
        },
        ...imageParts
      ]
    };

    messages.push(userMessage);

    try {
      const response = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        temperature: 0.6,
        messages
      });

      const choice = response?.choices?.[0]?.message?.content?.trim() || null;
      if (choice) {
        appendHistory(chatId, { role: 'user', content: userContentText || sanitizedText });
        appendHistory(chatId, { role: 'assistant', content: choice });
      }

      return choice;
    } catch (error) {
      if (logger) {
        logger.error({ err: error }, 'Errore durante la chiamata alle API OpenAI');
      }
      throw error;
    }
  }

  function setPersonaPrompt(prompt) {
    if (typeof prompt === 'string' && prompt.trim()) {
      personaPrompt = prompt.trim();
      conversationHistory.clear();
    }
  }

  function resetPersonaPrompt() {
    personaPrompt = BAGLEY_CHARACTER_PROMPT;
    conversationHistory.clear();
  }

  function resetAllHistory() {
    conversationHistory.clear();
  }

  return {
    enabled: true,
    generateReply,
    resetHistory,
    resetAllHistory,
    setPersonaPrompt,
    resetPersonaPrompt,
    transcribeAudio: transcribeAudioBuffer
  };
}

module.exports = {
  createAIService,
  BAGLEY_CHARACTER_PROMPT
};
