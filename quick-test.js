const { createMarketService } = require('./src/market-service');
const pino = require('pino');

createMarketService({ logger: pino({ level: 'silent' }) }).then(s => {
  const cats = s.getCategories();
  const subcats = s.getSubcategories(1);
  console.log('Keys:', Object.keys(subcats).sort((a,b) => parseInt(a) - parseInt(b)));
  console.log('Ferrari (10):', s.getSubcategoryName(1, 10));
  console.log('Items from Ferrari:', s.getSubcategoryItems(1, 10, 10).map(i => i.name));
  process.exit(0);
}).catch(e => {
  console.error(e);
  process.exit(1);
});
