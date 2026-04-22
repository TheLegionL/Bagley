// Test findItemByName
const { createMarketService } = require('./src/market-service');
const pino = require('pino');

async function test() {
  const logger = pino({ level: 'silent' });
  const ms = await createMarketService({ logger });
  const item = ms.findItemByName('Fiat 500');
  console.log('Found item:', item ? item.name : 'none');
  if (item) {
    console.log('Category:', item.categoryId, 'Sub:', item.subId, 'Item:', item.itemId);
  }
}

test();