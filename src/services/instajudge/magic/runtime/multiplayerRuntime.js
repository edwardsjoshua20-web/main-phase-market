export function playerIsInGame(state, playerId) {
  const player = state?.players?.[playerId];
  return Boolean(player && player.inGame !== false && !player.lost);
}

export function canonicalTurnOrder(state) {
  const configured = Array.isArray(state?.game?.turnOrder) ? state.game.turnOrder : [];
  const known = Object.keys(state?.players || {});
  return [...new Set([...configured, ...known])].filter((playerId) => state?.players?.[playerId]);
}

export function playersStillInGame(state) {
  return canonicalTurnOrder(state).filter((playerId) => playerIsInGame(state, playerId));
}

export function orderedPlayersFrom(state, playerId, { includeStart = false, inGameOnly = true } = {}) {
  const order = canonicalTurnOrder(state);
  if (order.length === 0) return [];
  const startIndex = Math.max(0, order.indexOf(playerId));
  const rotated = Array.from({ length: order.length }, (_, offset) => order[(startIndex + offset) % order.length]);
  const selected = includeStart ? rotated : rotated.slice(1);
  return inGameOnly ? selected.filter((candidate) => playerIsInGame(state, candidate)) : selected;
}

export function nextPlayerInTurnOrder(state, playerId) {
  return orderedPlayersFrom(state, playerId).find((candidate) => candidate !== playerId) || null;
}

export function orderedNonactivePlayers(state) {
  const anchor = state?.game?.activePlayer || state?.game?.turnOrderAnchor || canonicalTurnOrder(state)[0] || null;
  return orderedPlayersFrom(state, anchor).filter((playerId) => playerId !== state?.game?.activePlayer);
}

export function priorityStartPlayer(state) {
  if (playerIsInGame(state, state?.game?.activePlayer)) return state.game.activePlayer;
  const anchor = state?.game?.turnOrderAnchor || state?.game?.activePlayer || canonicalTurnOrder(state)[0] || null;
  return playerIsInGame(state, anchor) ? anchor : nextPlayerInTurnOrder(state, anchor);
}

export function opponentsOf(state, playerId) {
  return playersStillInGame(state).filter((candidate) => candidate !== playerId);
}

export function apnapOrder(state) {
  const active = playerIsInGame(state, state?.game?.activePlayer) ? state.game.activePlayer : null;
  return [active, ...orderedNonactivePlayers(state)].filter(Boolean);
}

export function syncMultiplayerGameState(state) {
  const inGame = playersStillInGame(state);
  const nonactivePlayers = orderedNonactivePlayers(state);
  state.game.playersInGame = inGame;
  state.game.nonactivePlayers = nonactivePlayers;
  state.game.nonactivePlayer = nonactivePlayers[0] || null;
  const anchor = state.game.activePlayer || state.game.turnOrderAnchor || state.game.turnOrder?.[0] || null;
  state.game.nextPlayer = nextPlayerInTurnOrder(state, anchor);
  return state.game;
}
