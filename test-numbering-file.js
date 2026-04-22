// Test subcategory numbering - write to file
const fs = require('fs');
const { createMarketService } = require('./src/market-service');
const pino = require('pino');

(async () => {
  const logger = pino({ level: 'silent' });
  const marketService = await createMarketService({ logger });

  let output = '=== Test: Subcategory numbering for Auto (category 1) ===\n\n';
  
  const categoryId = 1;
  const subcats = marketService.getSubcategories(categoryId);
  const sortedSubIds = Object.keys(subcats)
    .sort((a, b) => parseInt(a) - parseInt(b));
  
  output += 'Sorted subcategory IDs: ' + JSON.stringify(sortedSubIds) + '\n\n';
  output += 'Display numbering (as shown to user):\n';
  
  sortedSubIds.forEach((id, idx) => {
    const displayNumber = idx + 1;
    const name = subcats[id].name;
    output += `${displayNumber}. ${name} (ID: ${id})\n`;
  });
  
  output += '\n=== Test: What happens when user replies with number 10 ===\n';
  const userInput = 10;
  const itemNumber = userInput - 1; // 0-based index
  const selectedSubId = sortedSubIds[itemNumber];
  
  output += `User replies with: ${userInput}\n`;
  output += `itemNumber (0-based): ${itemNumber}\n`;
  output += `selectedSubId: ${selectedSubId}\n`;
  
  if (selectedSubId) {
    const selectedName = subcats[selectedSubId].name;
    output += `Selected: ${selectedName}\n`;
    
    // Get items from this subcategory
    const items = marketService.getSubcategoryItems(categoryId, selectedSubId, 10);
    output += `\nItems in ${selectedName}:\n`;
    items.forEach((item, idx) => {
      output += `${idx + 1}. ${item.name}\n`;
    });
    
    // Test what happens when user replies with number 5
    output += `\n=== Test: What happens when user replies with number 5 ===\n`;
    const userInput2 = 5;
    const itemIndex = userInput2 - 1; // 0-based
    if (items[itemIndex]) {
      const selectedItem = items[itemIndex];
      output += `User replies with: ${userInput2}\n`;
      output += `Selected item: ${selectedItem.name}\n`;
      
      const itemInfo = marketService.getItemInfo(selectedItem.categoryId, selectedItem.subId, selectedItem.itemId);
      if (itemInfo) {
        output += `Item info: ${itemInfo.name} - ${itemInfo.currentPrice}€\n`;
      }
    }
  }
  
  output += '\n✅ Test completed!\n';
  
  fs.writeFileSync('test-numbering-output.txt', output);
  console.log('Test output written to test-numbering-output.txt');
})().catch(err => {
  console.error(err);
  process.exit(1);
});
