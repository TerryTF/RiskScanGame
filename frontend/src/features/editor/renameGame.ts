import type { GameState } from '../../api/types';
import { cardKeys, type CardTranslate } from '../../texts';

/** The sample game with catalogue element and hazard names as edited, so the preview matches a game set up today. */
export function renameGame(game: GameState, card: CardTranslate): GameState {
  return {
    ...game,
    elements: game.elements.map((element) => ({ ...element, name: card(cardKeys.elementName(element.name), element.name) })),
    hazards: game.hazards.map((hazard) => ({ ...hazard, name: card(cardKeys.hazardName(hazard.name), hazard.name) })),
  };
}
