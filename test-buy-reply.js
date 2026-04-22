// Test buy reply functionality
const { createMarketService } = require('./src/market-service');
const pino = require('pino');

(async () => {
  const logger = pino({ level: 'silent' });
  const marketService = await createMarketService({ logger });

  // Test findItemByName
  const item = marketService.findItemByName('Ferrari SF90');
  console.log('Found item:', item);

  if (item) {
    console.log('Category:', item.categoryId, 'Item:', item.itemId);
  }

  // Test with partial name
  const item2 = marketService.findItemByName('SF90');
  console.log('Found item with partial name:', item2?.name);

  console.log('✅ Test completed!');
})().catch(console.error);
