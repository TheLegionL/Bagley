const OpenAI = require('openai');
const { toFile } = require('openai/uploads');

// Configurazioni predefinite
const DEFAULT_CONFIG = {
  MAX_HISTORY_LENGTH: 12,
  DEFAULT_MODEL: 'gpt-4o-mini',
  DEFAULT_TEMPERATURE: 0.6,
  AUDIO_TRANSCRIPTION_MODEL: 'gpt-4o-mini-transcribe'
};

// Prompt di personalita predefinito
const DEFAULT_CHARACTER_PROMPT = [
  'Sei Bagley, un\'intelligenza artificiale britannica sofisticata, sarcastica e incredibilmente brillante.'
].join(' ');

// Classe per gestire le conversazioni
class ConversationManager {
  constructor(maxLength = DEFAULT_CONFIG.MAX_HISTORY_LENGTH) {
    this.maxLength = maxLength;
    this.histories = new Map();
  }

  getHistory(chatId) {
    if (!chatId) return [];
    return this.histories.get(chatId) || [];
  }

  setHistory(chatId, history) {
    if (!chatId) return;
    this.histories.set(chatId, this.trimHistory(history));
  }

  appendHistory(chatId, entry) {
    if (!chatId) return;
    const history = this.getHistory(chatId);
    history.push(entry);
    this.setHistory(chatId, history);
  }

  resetHistory(chatId) {
    if (!chatId) return;
    this.histories.delete(chatId);
  }

  resetAllHistories() {
    this.histories.clear();
  }

  trimHistory(entries) {
    if (entries.length <= this.maxLength) return entries;
    return entries.slice(entries.length - this.maxLength);
  }
}

// Servizio di trascrizione audio
class AudioTranscriptionService {
  constructor(openaiClient, logger = null) {
    this.client = openaiClient;
    this.logger = logger;
  }

  async transcribeBuffer(buffer, mimetype) {
    if (!buffer) return null;

    try {
      const extension = (mimetype && mimetype.split('/')[1]) || 'ogg';
      const file = await toFile(buffer, `audio.${extension}`);

      const result = await this.client.audio.transcriptions.create({
        file,
        model: DEFAULT_CONFIG.AUDIO_TRANSCRIPTION_MODEL
      });

      return result?.text?.trim() || null;
    } catch (error) {
      if (this.logger) {
        this.logger.warn({ err: error }, 'Audio transcription failed');
      }
      return null;
    }
  }

  async transcribeAttachment(media) {
    if (!media?.data) return null;
    return this.transcribeBuffer(media.data, media.mimetype);
  }
}

// Formattatore contenuti
class ContentFormatter {
  static formatUserContent({ chatName, authorName, messageText }) {
    const parts = [];
    if (chatName) parts.push(`Chat: ${chatName}`);
    if (authorName) parts.push(`Author: ${authorName}`);
    if (messageText) parts.push(`Message: ${messageText}`);
    return parts.join('\n');
  }

  static async processAttachments(attachments, transcriptionService, logger = null) {
    const textSegments = [];
    const imageParts = [];

    for (const media of attachments) {
      if (media?.type === 'audio') {
        const transcript = await transcriptionService.transcribeAttachment(media);
        if (transcript) {
          textSegments.push(`Audio transcript: ${transcript}`);
        } else {
          textSegments.push('Note: Audio sent but transcription failed.');
        }
      } else if (media?.type === 'image' && media.data) {
        try {
          const base64 = media.data.toString('base64');
          const mimetype = media.mimetype || 'image/jpeg';
          imageParts.push({
            type: 'image_url',
            image_url: { url: `data:${mimetype};base64,${base64}` }
          });
          textSegments.push('Image attached: describe it precisely.');
        } catch (error) {
          if (logger) {
            logger.warn({ err: error }, 'Image processing failed');
          }
        }
      }
    }

    return { textSegments, imageParts };
  }
}

// Servizio AI principale
class AIService {
  static create(apiKey, options = {}, logger = null) {
    if (!apiKey) {
      return AIService.createDisabledService();
    }

    const config = { ...DEFAULT_CONFIG, ...options };
    const client = new OpenAI({ apiKey });
    const conversationManager = new ConversationManager(config.MAX_HISTORY_LENGTH);
    const transcriptionService = new AudioTranscriptionService(client, logger);

    let personaPrompt = DEFAULT_CHARACTER_PROMPT;

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

      const history = conversationManager.getHistory(chatId);
      const hasPreviousAssistantMessage = history.some(entry => entry.role === 'assistant');

      const messages = [
        {
          role: 'system',
          content: personaPrompt
        }
      ];

      if (hasPreviousAssistantMessage) {
        messages.push({
          role: 'system',
          content: 'You have already interacted in this chat: no greetings, get straight to the point.'
        });
      }

      if (threadSummary) {
        messages.push({
          role: 'system',
          content: `Previous connected message: ${threadSummary}`
        });
      }

      if (history.length) {
        messages.push(...history);
      }

      const { textSegments, imageParts } = await ContentFormatter.processAttachments(
        attachments,
        transcriptionService,
        logger
      );

      const baseUserInfo = ContentFormatter.formatUserContent({
        chatName,
        authorName,
        messageText: sanitizedText
      });

      if (baseUserInfo) {
        textSegments.unshift(baseUserInfo);
      }

      if (!sanitizedText && !textSegments.length) {
        textSegments.push('User sent multimedia content without text.');
      }

      const userContentText = textSegments.join('\n\n');
      const userMessage = {
        role: 'user',
        content: [
          {
            type: 'text',
            text: userContentText || 'Message without text.'
          },
          ...imageParts
        ]
      };

      messages.push(userMessage);

      try {
        const response = await client.chat.completions.create({
          model: config.DEFAULT_MODEL,
          temperature: config.DEFAULT_TEMPERATURE,
          messages
        });

        const choice = response?.choices?.[0]?.message?.content?.trim() || null;

        if (choice) {
          conversationManager.appendHistory(chatId, {
            role: 'user',
            content: userContentText || sanitizedText
          });
          conversationManager.appendHistory(chatId, {
            role: 'assistant',
            content: choice
          });
        }

        return choice;
      } catch (error) {
        if (logger) {
          logger.error({ err: error }, 'OpenAI API call error');
        }
        throw error;
      }
    }

    function setPersonaPrompt(prompt) {
      if (typeof prompt === 'string' && prompt.trim()) {
        personaPrompt = prompt.trim();
        conversationManager.resetAllHistories();
      }
    }

    function resetPersonaPrompt() {
      personaPrompt = DEFAULT_CHARACTER_PROMPT;
      conversationManager.resetAllHistories();
    }

    function resetHistory(chatId) {
      conversationManager.resetHistory(chatId);
    }

    function resetAllHistory() {
      conversationManager.resetAllHistories();
    }

    async function transcribeAudio(buffer, mimetype) {
      return transcriptionService.transcribeBuffer(buffer, mimetype);
    }

    return {
      enabled: true,
      generateReply,
      resetHistory,
      resetAllHistory,
      setPersonaPrompt,
      resetPersonaPrompt,
      transcribeAudio
    };
  }

  static createDisabledService() {
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
}

// Factory function
function createAIService(apiKey, options = {}, logger = null) {
  return AIService.create(apiKey, options, logger);
}

// Exports
module.exports = {
  createAIService,
  AIService,
  ConversationManager,
  AudioTranscriptionService,
  ContentFormatter,
  DEFAULT_CHARACTER_PROMPT,
  DEFAULT_CONFIG
};