#!/usr/bin/env node
const { createMarketService } = require('./src/market-service');
const pino = require('pino');

(async () => {
  try {
    const logger = pino({ level: 'silent' });
    const ms = await createMarketService({ logger });
    
    // Test: Get Ferrari items (subcategory 10)
    const ferrari = ms.getSubcategoryItems(1, 10, 10);
    console.log('Ferrari items:', ferrari.length);
    for (let i = 0; i < 5; i++) {
      console.log(`  ${i + 1}. ${ferrari[i]?.name}`);
    }
    
    // Test: Get 5th item details
    if (ferrari[4]) {
      const item5 = ferrari[4];
      const info = ms.getItemInfo(item5.categoryId, item5.subId, item5.itemId);
      console.log('\n5th item details:');
      console.log('  Name:', info.name);
      console.log('  Price:', info.currentPrice);
    }
  } catch (e) {
    console.error('Error:', e.message);
  }
})();
