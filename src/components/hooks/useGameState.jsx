import { useState, useEffect } from 'react';

const createShuffledDeck = (deck) => {
  const cards = [];
  deck.items.forEach(item => {
    for (let i = 0; i < (item.quantity || 1); i++) {
      cards.push({ ...item, uniqueId: `${item.product_id || item.product_name}-${Math.random()}` });
    }
  });
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards;
};

export default function useGameState(deck) {
  const [hand, setHand] = useState([]);
  const [library, setLibrary] = useState([]);
  const [graveyard, setGraveyard] = useState([]);
  const [exile, setExile] = useState([]);
  const [battlefield, setBattlefield] = useState([]);
  const [playerLife, setPlayerLife] = useState(20);
  const [turn, setTurn] = useState(1);
  const [phase, setPhase] = useState('main');

  useEffect(() => {
    if (!deck?.items?.length) return;
    const shuffled = createShuffledDeck(deck);
    setHand(shuffled.slice(0, 7));
    setLibrary(shuffled.slice(7));
    setBattlefield([]);
    setGraveyard([]);
    setExile([]);
    setPlayerLife(20);
    setTurn(1);
    setPhase('main');
  }, [deck]);

  const drawCard = () => {
    if (library.length === 0) return;
    setHand(prev => [...prev, library[0]]);
    setLibrary(prev => prev.slice(1));
  };

  const drawMultiple = (count) => {
    const drawn = library.slice(0, count);
    setHand(prev => [...prev, ...drawn]);
    setLibrary(prev => prev.slice(count));
  };

  // Move card from hand to battlefield
  const playFromHand = (cardUniqueId) => {
    const card = hand.find(c => c.uniqueId === cardUniqueId);
    if (!card) return;
    setHand(prev => prev.filter(c => c.uniqueId !== cardUniqueId));
    setBattlefield(prev => [...prev, { ...card, tapped: false, instanceId: Math.random() }]);
  };

  // Move card from battlefield to graveyard
  const sendToGraveyard = (instanceId) => {
    const card = battlefield.find(c => c.instanceId === instanceId);
    if (!card) return;
    setBattlefield(prev => prev.filter(c => c.instanceId !== instanceId));
    setGraveyard(prev => [...prev, card]);
  };

  // Move card from battlefield to exile
  const sendToExile = (instanceId) => {
    const card = battlefield.find(c => c.instanceId === instanceId);
    if (!card) return;
    setBattlefield(prev => prev.filter(c => c.instanceId !== instanceId));
    setExile(prev => [...prev, card]);
  };

  // Return card from battlefield to hand
  const returnToHand = (instanceId) => {
    const card = battlefield.find(c => c.instanceId === instanceId);
    if (!card) return;
    setBattlefield(prev => prev.filter(c => c.instanceId !== instanceId));
    setHand(prev => [...prev, card]);
  };

  // Discard from hand
  const discardCard = (uniqueId) => {
    const card = hand.find(c => c.uniqueId === uniqueId);
    if (!card) return;
    setHand(prev => prev.filter(c => c.uniqueId !== uniqueId));
    setGraveyard(prev => [...prev, card]);
  };

  // Toggle tap on battlefield card
  const tapCard = (instanceId) => {
    setBattlefield(prev => prev.map(c =>
      c.instanceId === instanceId ? { ...c, tapped: !c.tapped } : c
    ));
  };

  // Untap all permanents (new turn)
  const untapAll = () => {
    setBattlefield(prev => prev.map(c => ({ ...c, tapped: false })));
  };

  // Shuffle library
  const shuffleLibrary = () => {
    setLibrary(prev => {
      const arr = [...prev];
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    });
  };

  // Move top card of library to hand (scry-like: look at top)
  const scryTop = () => library[0] || null;

  // Move graveyard card back to hand
  const returnFromGraveyardToHand = (idx) => {
    const card = graveyard[idx];
    if (!card) return;
    setGraveyard(prev => prev.filter((_, i) => i !== idx));
    setHand(prev => [...prev, { ...card, uniqueId: `${card.uniqueId}-rtn-${Math.random()}` }]);
  };

  const nextTurn = () => {
    setTurn(prev => prev + 1);
    untapAll();
    drawCard();
  };

  const resetGame = () => {
    if (!deck?.items?.length) return;
    const shuffled = createShuffledDeck(deck);
    setHand(shuffled.slice(0, 7));
    setLibrary(shuffled.slice(7));
    setBattlefield([]);
    setGraveyard([]);
    setExile([]);
    setPlayerLife(20);
    setTurn(1);
    setPhase('main');
  };

  return {
    hand, setHand,
    library, setLibrary,
    graveyard, setGraveyard,
    exile, setExile,
    battlefield, setBattlefield,
    playerLife, setPlayerLife,
    turn, setTurn,
    phase, setPhase,
    drawCard,
    drawMultiple,
    playFromHand,
    sendToGraveyard,
    sendToExile,
    returnToHand,
    discardCard,
    tapCard,
    untapAll,
    shuffleLibrary,
    scryTop,
    returnFromGraveyardToHand,
    nextTurn,
    resetGame,
  };
}