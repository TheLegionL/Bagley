// Test subcategory numbering
const { createMarketService } = require('./src/market-service');
const pino = require('pino');

(async () => {
  const logger = pino({ level: 'silent' });
  const marketService = await createMarketService({ logger });

  console.log('=== Test: Subcategory numbering for Auto (category 1) ===\n');
  
  const categoryId = 1;
  const subcats = marketService.getSubcategories(categoryId);
  const sortedSubIds = Object.keys(subcats)
    .sort((a, b) => parseInt(a) - parseInt(b));
  
  console.log('Sorted subcategory IDs:', sortedSubIds);
  console.log('\nDisplay numbering (as shown to user):');
  
  sortedSubIds.forEach((id, idx) => {
    const displayNumber = idx + 1;
    const name = subcats[id].name;
    console.log(`${displayNumber}. ${name} (ID: ${id})`);
  });
  
  console.log('\n=== Test: What happens when user replies with number 10 ===');
  const userInput = 10;
  const itemNumber = userInput - 1; // 0-based index
  const selectedSubId = sortedSubIds[itemNumber];
  
  console.log(`User replies with: ${userInput}`);
  console.log(`itemNumber (0-based): ${itemNumber}`);
  console.log(`selectedSubId: ${selectedSubId}`);
  
  if (selectedSubId) {
    const selectedName = subcats[selectedSubId].name;
    console.log(`Selected: ${selectedName}`);
    
    // Get items from this subcategory
    const items = marketService.getSubcategoryItems(categoryId, selectedSubId, 10);
    console.log(`\nItems in ${selectedName}:`);
    items.forEach((item, idx) => {
      console.log(`${idx + 1}. ${item.name}`);
    });
    
    // Test what happens when user replies with number 5
    console.log(`\n=== Test: What happens when user replies with number 5 ===`);
    const userInput2 = 5;
    const itemIndex = userInput2 - 1; // 0-based
    if (items[itemIndex]) {
      const selectedItem = items[itemIndex];
      console.log(`User replies with: ${userInput2}`);
      console.log(`Selected item: ${selectedItem.name}`);
      
      const itemInfo = marketService.getItemInfo(selectedItem.categoryId, selectedItem.subId, selectedItem.itemId);
      if (itemInfo) {
        console.log(`Item info: ${itemInfo.name} - ${itemInfo.currentPrice}€`);
      }
    }
  }
  
  console.log('\n✅ Test completed!');
})().catch(console.error);
