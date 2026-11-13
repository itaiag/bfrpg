/**
 * Dungeon generator — entry point: map, story plan, room contents, dressing.
 *
 * @param {object} options  see generateDungeon
 * @param {object} data     he/dungeon-data.json
 * @param {object} content  the language's story content (content-he.js)
 */
import { generateDungeon } from './generator.js';
import { stockDungeon } from './stock.js';
import { planStory, finishStory } from './story.js';

export function createDungeon(options, data, content) {
  const dungeon = generateDungeon(options);
  planStory(dungeon, data, content);
  stockDungeon(dungeon, data);
  return finishStory(dungeon, data, content);
}
