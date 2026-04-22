// Test market service subcategory selection
const { createMarketService } = require('./src/market-service');
const pino = require('pino');

(async () => {
  const logger = pino({ level: 'silent' });
  const marketService = await createMarketService({ logger });

  console.log('=== Test 1: getSubcategoryName with numeric subId ===');
  const name1 = marketService.getSubcategoryName(1, 10);
  console.log('Subcategory 10 name:', name1);
  
  console.log('\n=== Test 2: getSubcategoryItems with subcategory 10 (Ferrari) ===');
  const items10 = marketService.getSubcategoryItems(1, 10, 10);
  console.log('Number of items:', items10.length);
  if (items10.length > 0) {
    console.log('First item:', items10[0].name);
    console.log('Fifth item:', items10[4]?.name);
  }

  console.log('\n=== Test 3: getItemInfo for Ferrari SF90 (5th item in subcategory 10) ===');
  const item = marketService.getItemInfo(1, 10, 'sf90');
  if (item) {
    console.log('Item name:', item.name);
    console.log('Item price:', item.currentPrice);
  } else {
    console.log('Item not found');
  }

  console.log('\n=== Test 4: Compare with subcategory 1 (Fiat) ===');
  const items1 = marketService.getSubcategoryItems(1, 1, 10);
  console.log('Number of items in Fiat:', items1.length);
  if (items1.length > 0) {
    console.log('First Fiat item:', items1[0].name);
    console.log('Fifth Fiat item:', items1[4]?.name);
  }

  console.log('\n✅ Test completed!');
})().catch(console.error);
