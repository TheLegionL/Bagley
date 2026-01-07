function parseCommand(text) {
  if (!text) {
    return null;
  }

  const trimmed = text.trim();
  const prefix = trimmed[0];

  if (prefix !== '!' && prefix !== '/') {
    return null;
  }

  const withoutPrefix = trimmed.slice(1).trim();
  if (!withoutPrefix) {
    return null;
  }

  const parts = withoutPrefix.split(/\s+/);
  const command = parts.shift().toLowerCase();
  const args = parts;
  return { command, args, raw: withoutPrefix, prefix };
}

function createCommandHandler(commandList) {
  const commandMap = new Map();
  for (const command of commandList) {
    commandMap.set(command.name, command);
  }

  async function handleCommand(context) {
    const parsed = context.parsed || parseCommand(context.text);
    if (!parsed) {
      return null;
    }

    const command = commandMap.get(parsed.command);
    if (!command) {
      return {
        text: 'Comando non riconosciuto. Usa !help per la lista completa.'
      };
    }

    if (context.permissionLevel < command.minLevel) {
      return {
        text: `Non hai i permessi per usare questo comando (richiede grado ${command.minLevel}).`
      };
    }

    context.parsed = parsed;
    return command.handler(context);
  }

  return { handleCommand };
}

module.exports = {
  parseCommand,
  createCommandHandler
};
