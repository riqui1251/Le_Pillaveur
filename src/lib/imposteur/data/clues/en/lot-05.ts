// ⚠️ SERVER-ONLY : révèle l'autre mot de la paire. Jamais importé côté client.
import type { ImposteurClueSet } from '../index'

/** en, lot 05 : paires 93 à 115 de data/en.ts (brief : node scripts/imposteur-clues-brief.mjs en 5). */
export const IMPOSTEUR_CLUES_EN_LOT_05: Record<string, ImposteurClueSet> = {
  'shower|bath': {
    a: ['soap', 'towel', 'morning rush', 'water pressure', 'singing', 'glass screen', 'standing up'],
    b: ['soap', 'towel', 'candles', 'bubbles', 'plughole', 'soaking', 'rubber duck'],
  },
  'fridge|freezer': {
    a: ['kitchen', 'cold', 'magnets', 'leftovers', 'midnight snack', 'milk', 'salad drawer'],
    b: ['kitchen', 'cold', 'ice cream', 'peas', 'fish fingers', 'ice cubes', 'frost', 'defrosting'],
  },
  'microwave|oven': {
    a: ['kitchen', 'timer', 'leftovers', 'popcorn', 'ready meal', 'ping', 'spinning plate'],
    b: ['kitchen', 'timer', 'roast chicken', 'cake', 'gloves', 'preheat', 'baking tray', 'gas mark'],
  },
  'TV|projector': {
    a: ['screen', 'movie night', 'sofa', 'remote', 'ad breaks', 'channel surfing', 'evening news'],
    b: ['screen', 'movie night', 'dark room', 'classroom', 'slides', 'white wall', 'lens', 'beam of light'],
  },
  'console|gaming PC': {
    a: ['video games', 'headset', 'sofa', 'controller', 'split screen', 'plug and play', 'under the TV'],
    b: ['video games', 'headset', 'desk', 'mods', 'keyboard and mouse', 'frame rate', 'glowing fans', 'graphics card'],
  },
  'Instagram|TikTok': {
    a: ['scrolling', 'influencers', 'photos', 'filters', 'brunch pics', 'square posts', 'grid', 'Meta'],
    b: ['scrolling', 'influencers', 'trends', 'dances', 'sounds', 'duets', 'For You page'],
  },
  'WhatsApp|Snapchat': {
    a: ['messages', 'notifications', 'family group', 'voice notes', 'last seen', 'green icon', 'blue ticks'],
    b: ['messages', 'notifications', 'filters', 'disappearing', 'streaks', 'yellow icon', 'ghost logo'],
  },
  'YouTube|Netflix': {
    a: ['streaming', 'autoplay', 'music videos', 'tutorials', 'vloggers', 'skip ad', 'like and subscribe'],
    b: ['streaming', 'autoplay', 'subscription', 'series', 'binge', 'password sharing', 'and chill', 'tudum'],
  },
  'selfie|story': {
    a: ['phone', 'social media', 'mirror', 'pout', 'arm outstretched', 'front camera', 'stick'],
    b: ['phone', 'social media', 'viewers', 'highlights', 'tap through', 'disappears', '24 hours'],
  },
  'tacos|burrito': {
    a: ['tortilla', 'salsa', 'street food', 'lime wedge', 'crunchy', 'hard shell', 'falls apart', 'on Tuesdays'],
    b: ['tortilla', 'salsa', 'rice', 'beans', 'massive', 'foil wrap', 'rolled tight'],
  },
  'lemonade|iced tea': {
    a: ['summer', 'straw', 'sugar', 'fizzy', 'sour', 'freshly squeezed', "kids' stand"],
    b: ['summer', 'straw', 'bottled', 'caffeine', 'porch swing', 'peach flavour', 'brewed then chilled'],
  },
  'espresso|cappuccino': {
    a: ['coffee', 'barista', 'strong', 'tiny cup', 'one gulp', 'crema', 'double shot'],
    b: ['coffee', 'barista', 'milk', 'big cup', 'foam', 'froth moustache', 'chocolate dusting'],
  },
  'gin and tonic|spritz': {
    a: ['bubbles', 'ice', 'bitter', 'slice of lime', 'cucumber', 'juniper', 'quinine'],
    b: ['bubbles', 'ice', 'terrace', 'aperitivo', 'bright orange', 'orange slice', 'prosecco'],
  },
  'rum|whisky': {
    a: ['spirit', 'oak barrel', 'cola', 'beach bar', 'pirates', 'sugar cane', 'mojito'],
    b: ['spirit', 'oak barrel', 'tumbler', 'on the rocks', 'neat', 'tartan', 'peaty', 'single malt'],
  },
  'sangria|punch': {
    a: ['party', 'chopped fruit', 'jug', 'summer terrace', 'red wine', 'tapas', 'holiday in Spain'],
    b: ['party', 'chopped fruit', 'mystery mix', 'spiked', 'prom', 'big bowl', 'ladle'],
  },
  'hot dog|grilled cheese': {
    a: ['quick bite', 'bread', 'mustard', 'fried onions', 'ballpark', 'long bun', 'sausage'],
    b: ['quick bite', 'bread', 'butter', 'two slices', 'frying pan', 'tomato soup', 'gooey cheddar'],
  },
  'nuggets|chicken wings': {
    a: ['fast food', 'dipping sauce', 'kids menu', 'breadcrumbs', 'boneless', 'box of twenty', 'dinosaur shapes'],
    b: ['fast food', 'dipping sauce', 'sticky fingers', 'hot sauce', 'napkins', 'bones', 'buffalo'],
  },
  'ramen|stir-fried noodles': {
    a: ['chopsticks', 'soy sauce', 'slurping', 'instant cup', 'broth', 'miso', 'soft-boiled egg'],
    b: ['chopsticks', 'soy sauce', 'takeaway box', 'vegetables', 'beansprouts', 'high heat', 'wok', 'chow mein'],
  },
  'paella|risotto': {
    a: ['rice', 'stock', 'seafood', 'saffron', 'prawns', 'mussels', 'huge flat pan', 'crispy bottom'],
    b: ['rice', 'stock', 'mushrooms', 'parmesan', 'creamy', 'constant stirring', 'arborio'],
  },
  'couscous|tagine': {
    a: ['spices', 'lamb', 'salad', 'tiny grains', 'raisins', 'fluff with a fork', 'semolina'],
    b: ['spices', 'lamb', 'stew', 'slow-cooked', 'apricots', 'preserved lemon', 'clay pot', 'cone-shaped lid'],
  },
  'omelette|scrambled eggs': {
    a: ['breakfast', 'whisk', 'fillings', 'ham and cheese', 'flip', 'folded in half', 'half-moon'],
    b: ['breakfast', 'whisk', 'toast', 'smoked salmon', 'butter', 'keep stirring', 'soft curds'],
  },
  'tiramisu|panna cotta': {
    a: ['dessert', 'cream', 'layers', 'coffee', 'cocoa powder', 'soaked biscuits', 'mascarpone', 'ladyfingers'],
    b: ['dessert', 'cream', 'vanilla', 'berry coulis', 'ramekin', 'gelatine', 'wobbly'],
  },
  'donut|muffin': {
    a: ['bakery', 'coffee break', 'icing', 'sprinkles', 'glazed', 'jam filling', 'deep-fried', 'hole in the middle'],
    b: ['bakery', 'coffee break', 'chocolate chips', 'blueberries', 'tray of twelve', 'paper case', 'domed top'],
  },
}
