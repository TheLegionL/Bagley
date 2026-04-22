const { createMarketService } = require('./src/market-service');
const pino = require('pino');

(async () => {
  console.log('Starting test...');
  const logger = pino({ level: 'silent' });
  const marketService = await createMarketService({ logger });
  
  const categories = marketService.getCategories();
  console.log('✅ Got categories');
  
  // Test with numeric ID
  const items1 = marketService.getSubcategoryItems(1, 1, 5);
  console.log('Items from subcategory 1 (Fiat):', items1.length, 'items');
  if (items1.length > 0) {
    console.log('  First item:', items1[0].name);
  }
  
  // Test with numeric ID 2
  const items2 = marketService.getSubcategoryItems(1, 2, 5);
  console.log('Items from subcategory 2 (BMW):', items2.length, 'items');
  if (items2.length > 0) {
    console.log('  First item:', items2[0].name);
  }
  
  // Test with string ID (the bug case)
  const items3 = marketService.getSubcategoryItems('1', '2', 5);
  console.log('Items from subcategory "2" as string:', items3.length, 'items');
  if (items3.length > 0) {
    console.log('  First item:', items3[0].name);
  }
  
  console.log('✅ Test completed');
})().catch(console.error);
