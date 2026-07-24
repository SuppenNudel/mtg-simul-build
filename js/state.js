/**
 * Shared mutable application state.
 * All modules import this single object and mutate its properties directly.
 */
export const state = {
  /** @type {Array<{id:number, name:string, listText:string}>} */
  decks: [],
  nextId: 0,

  /** @type {Array<{id:number, cardA:string, cardB:string}>} */
  substitutions: [],
  nextSubId: 0,

  /**
   * Populated after calculate().
   * @type {{ parsedDecks, collection: Map, unlimitedBasics: boolean, subFind: Function } | null}
   */
  currentResult: null,

  /** Populated after loadTierList(). @type {Array<{deckId:string, name:string, tier:string}>} */
  tierDecks: [],
};
