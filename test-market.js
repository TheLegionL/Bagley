// Test del Market Service
const { createMarketService } = require('./src/market-service');
const { createBankService } = require('./src/bank-service');
const pino = require('pino');

async function testMarketService() {
  console.log('🧪 Test del Market Service...');

  const logger = pino({ level: 'silent' });
  const bankService = await createBankService({ logger });
  const marketService = await createMarketService({ logger, bankService });

  // Test categorie
  console.log('📂 Categorie disponibili:', Object.keys(marketService.getCategories()));

  // Test trending items
  const trending = marketService.getTrendingItems(5);
  console.log('🔥 Trending items:', trending.length);

  // Test categoria auto
  const autos = marketService.getCategoryItems(1, 3);
  console.log('🚗 Auto disponibili:', autos.length);

  // Test info oggetto specifico
  if (autos[0]) {
    const itemInfo = marketService.getItemInfo(autos[0].categoryId, autos[0].subId, autos[0].itemId);
    console.log('📊 Info primo oggetto:', itemInfo?.name);
  }

  console.log('✅ Test completato con successo!');
}

testMarketService().catch(console.error);