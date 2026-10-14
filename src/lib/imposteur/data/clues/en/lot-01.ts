// ⚠️ SERVER-ONLY : révèle l'autre mot de la paire. Jamais importé côté client.
import type { ImposteurClueSet } from '../index'

/** en, lot 01 : paires 1 à 23 de data/en.ts (brief : node scripts/imposteur-clues-brief.mjs en 1). */
export const IMPOSTEUR_CLUES_EN_LOT_01: Record<string, ImposteurClueSet> = {
  'beach|swimming pool': {
    a: ['summer', 'towel', 'sand', 'waves', 'seashells', 'tide', 'sandcastle'],
    b: ['summer', 'towel', 'goggles', 'deep end', 'diving board', 'lanes', 'chlorine'],
  },
  'coffee|tea': {
    a: ['mug', 'morning', 'barista', 'latte', 'espresso', 'beans', 'grinder'],
    b: ['mug', 'morning', 'two sugars', 'biscuit', 'kettle', 'leaves', 'milk in first'],
  },
  'beer|cider': {
    a: ['pint', 'pub', 'six-pack', 'foamy head', 'lager', 'barley', 'hops'],
    b: ['pint', 'pub', 'sweet', 'over ice', 'cloudy', 'orchard', 'apples'],
  },
  'red wine|white wine': {
    a: ['grapes', 'cork', 'cheese', 'tannins', 'steak', 'room temperature', 'purple teeth'],
    b: ['grapes', 'cork', 'fish', 'chilled', 'spritzer', 'ice bucket', 'pale gold'],
  },
  'mojito|piña colada': {
    a: ['cocktail', 'rum', 'crushed ice', 'lime', 'soda water', 'muddled', 'mint leaves'],
    b: ['cocktail', 'rum', 'creamy', 'paper umbrella', 'cheesy song', 'coconut', 'pineapple'],
  },
  'vodka|tequila': {
    a: ['spirit', 'shots', 'clear', 'freezer', 'energy drink', 'martini', 'potatoes'],
    b: ['spirit', 'shots', 'salt', 'lime wedge', 'agave', 'worm', 'margarita'],
  },
  'champagne|prosecco': {
    a: ['bubbles', 'toast', 'flute', 'celebration', 'cork pop', 'posh', 'podium spray'],
    b: ['bubbles', 'toast', 'brunch', 'hen do', 'bottomless', 'cheap fizz', 'spritz'],
  },
  'pizza|flatbread': {
    a: ['dough', 'oven', 'slice', 'delivery box', 'pepperoni', 'margherita', 'stuffed crust'],
    b: ['dough', 'oven', 'thin', 'dipping', 'hummus', 'naan', 'pitta'],
  },
  'burger|kebab': {
    a: ['fast food', 'late night', 'bun', 'ketchup', 'drive-thru', 'cheese slice', 'patty'],
    b: ['fast food', 'late night', 'pitta', 'garlic sauce', 'skewer', 'spinning meat', 'doner'],
  },
  'fries|potato wedges': {
    a: ['side order', 'ketchup', 'golden', 'fast food', 'salty', 'thin', 'shoestring'],
    b: ['side order', 'ketchup', 'chunky', 'sour cream dip', 'paprika', 'skin on'],
  },
  'croissant|pain au chocolat': {
    a: ['bakery', 'flaky', 'butter', 'layers', 'crumbs everywhere', 'almond', 'crescent'],
    b: ['bakery', 'flaky', 'rectangle', 'gooey middle', 'dark strips inside', 'cocoa'],
  },
  'pancake|waffle': {
    a: ['breakfast', 'syrup', 'batter', 'stack', 'frying', 'flip', 'lemon and sugar'],
    b: ['breakfast', 'syrup', 'crispy', 'iron', 'little pockets', 'squares', 'grid pattern'],
  },
  'raclette|fondue': {
    a: ['melted cheese', 'winter', 'ski trip', 'potatoes', 'pickles', 'scraping', 'little pans'],
    b: ['melted cheese', 'winter', 'pot', 'dipping', 'bread cubes', 'chocolate', 'long forks'],
  },
  'sushi|poke bowl': {
    a: ['raw fish', 'soy sauce', 'chopsticks', 'wasabi', 'seaweed', 'conveyor belt', 'rolls'],
    b: ['raw fish', 'soy sauce', 'healthy lunch', 'avocado', 'edamame', 'mango', 'tuna cubes'],
  },
  'pasta|rice': {
    a: ['carbs', 'boiling water', 'sauce', 'fork', 'al dente', 'penne', 'spaghetti'],
    b: ['carbs', 'boiling water', 'grains', 'chopsticks', 'curry', 'sticky', 'basmati'],
  },
  'ketchup|mayonnaise': {
    a: ['condiment', 'chips', 'squeezy bottle', 'sweet', 'red', 'tomato'],
    b: ['condiment', 'chips', 'jar', 'creamy', 'white', 'coleslaw', 'egg yolk'],
  },
  'crisps|peanuts': {
    a: ['pub snack', 'salty', 'packet', 'crunchy', 'multipack', 'potato', 'salt and vinegar'],
    b: ['pub snack', 'salty', 'in a bowl', 'allergy', 'shells', 'monkey', 'dry roasted'],
  },
  'ice cream|sorbet': {
    a: ['scoop', 'summer', 'cone', 'sprinkles', 'vanilla', 'van', '99 flake'],
    b: ['scoop', 'summer', 'fruity', 'lemon', 'dairy free', 'between courses', 'palate cleanser'],
  },
  'chocolate|caramel': {
    a: ['sweet', 'dessert', 'melts', 'brown', 'bar', 'dark', 'cocoa'],
    b: ['sweet', 'dessert', 'sticky', 'chewy', 'golden', 'salted', 'burnt sugar'],
  },
  'baguette|brioche': {
    a: ['bread', 'bakery', 'crusty', 'sandwich', 'long', 'stick', 'under the arm'],
    b: ['bread', 'bakery', 'soft', 'golden', 'sweet', 'eggy', 'burger bun'],
  },
  'cheese board|charcuterie': {
    a: ['platter', 'wine', 'crackers', 'grapes', 'after dinner', 'chutney', 'brie', 'cheddar'],
    b: ['platter', 'wine', 'thin slices', 'cured', 'chorizo', 'salami', 'prosciutto'],
  },
  'oyster|mussel': {
    a: ['shellfish', 'seafood', 'lemon', 'raw', 'shucking', 'aphrodisiac', 'pearl'],
    b: ['shellfish', 'seafood', 'garlic', 'chips', 'steaming pot', 'white wine sauce', 'black shells'],
  },
  'barbecue|griddle': {
    a: ['sizzle', 'tongs', 'summer', 'garden', 'sausages', 'smoke', 'charcoal'],
    b: ['sizzle', 'tongs', 'hob', 'cast iron', 'ridges', 'pancakes', 'flat plate'],
  },
}
