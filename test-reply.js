// Simulate reply handling logic for market command
const { createMarketService } = require('./src/market-service');
const pino = require('pino');

async function runTest() {
  const logger = pino({ level: 'silent' });
  const marketService = await createMarketService({ logger });

  // pick a category with subcategories, e.g., category 1 (Auto)
  const categories = marketService.getCategories();
  const catId = Object.keys(categories).find(id => categories[id].name === 'Auto');
  console.log('Category id for Auto:', catId);
  const subcats = marketService.getSubcategories(catId);
  console.log('Subcategories:', Object.values(subcats).map(s=>s.name));
  const subId = Object.keys(subcats)[0];
  console.log('First subcategory id:', subId, 'name', subcats[subId].name);

  // Simulate message listing items in that subcategory
  const quotedText = `📂 ${categories[catId].name} - ${subcats[subId].name}:
`;
  console.log('Quoted text for items listing:', quotedText);

  const scriptLogic = (quotedText, itemIndex) => {
    // replicate our logic
    let items = [];
    // 1. risposta alla lista di sottocategorie
    if (quotedText.includes('Sottocategorie di')) {
      // not this case
    }
    // 2. estrazione generica header (categoria o subcategoria)
    const headerMatch = quotedText.match(/📂 ([^-:]+)(?: - ([^:]+))?:/);
    if (headerMatch) {
      const catName = headerMatch[1].trim();
      const subName = headerMatch[2] ? headerMatch[2].trim() : null;
      const categories = marketService.getCategories();
      const categoryId = parseInt(Object.keys(categories).find(id =>
        categories[id].name === catName
      ));
      if (categoryId) {
        if (subName) {
          const subIds = Object.keys(marketService.getSubcategories(categoryId));
          const subId = subIds.find(sid => marketService.getSubcategoryName(categoryId, sid) === subName);
          if (subId) {
            items = marketService.getSubcategoryItems(parseInt(categoryId), parseInt(subId), 10);
          }
        } else {
          items = marketService.getCategoryItems(parseInt(categoryId), 10);
        }
      }
    }
    if (!items.length && (quotedText.includes('📈 Bagley Market') || quotedText.includes('Oggetti di tendenza'))) {
      // skip
    }
    console.log('Items found count', items.length);
    if (items[itemIndex]) {
      const item = items[itemIndex];
      const itemInfo = marketService.getItemInfo(item.categoryId, item.subId, item.itemId);
      console.log('Selected item info:', itemInfo.name, itemInfo.currentPrice);
    }
  };

  scriptLogic(quotedText, 0);
  
  console.log('\n--- Testing second subcategory (BMW) ---');
  const subId2 = Object.keys(subcats)[1];
  console.log('Second subcategory id:', subId2, 'name', subcats[subId2].name);
  const quotedText2 = `📂 ${categories[catId].name} - ${subcats[subId2].name}:
`;
  scriptLogic(quotedText2, 0);
}

runTest().then(() => console.log('\n✅ Test completato!')).catch(console.error);
