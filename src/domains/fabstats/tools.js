import { getFabStatsDb } from '../../firebase.js';

/**
 * Community overview — total players, matches, top heroes, avg win rate
 */
export async function getCommunityStats() {
  const db = getFabStatsDb();
  const snapshot = await db.collection('leaderboard').get();

  let totalMatches = 0;
  let totalWins = 0;
  const heroCount = new Map();

  for (const doc of snapshot.docs) {
    const d = doc.data();
    totalMatches += d.totalMatches || 0;
    totalWins += d.totalWins || 0;
    if (d.topHero) {
      heroCount.set(d.topHero, (heroCount.get(d.topHero) || 0) + 1);
    }
  }

  const topHeroes = [...heroCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([hero, count]) => ({ hero, players: count }));

  return {
    totalPlayers: snapshot.size,
    totalMatches,
    avgWinRate: totalMatches > 0 ? ((totalWins / totalMatches) * 100).toFixed(1) + '%' : '0%',
    topHeroes,
  };
}

/**
 * Leaderboard — top N players sorted by a field
 */
export async function getLeaderboard(sort = 'totalMatches', limitN = 10) {
  const db = getFabStatsDb();
  const validSorts = ['totalMatches', 'winRate', 'eloRating', 'totalWins', 'longestWinStreak'];
  const sortField = validSorts.includes(sort) ? sort : 'totalMatches';

  const snapshot = await db.collection('leaderboard')
    .orderBy(sortField, 'desc')
    .limit(Math.min(Number(limitN) || 10, 50))
    .get();

  return snapshot.docs.map(doc => {
    const d = doc.data();
    return {
      username: d.username || d.displayName || 'Anonymous',
      totalMatches: d.totalMatches || 0,
      winRate: d.winRate != null ? d.winRate.toFixed(1) + '%' : 'N/A',
      eloRating: d.eloRating || null,
      topHero: d.topHero || null,
      totalTop8s: d.totalTop8s || 0,
    };
  });
}

/**
 * Minigame stats — top players for a specific game
 */
export async function getMinigameStats(game) {
  const db = getFabStatsDb();
  const validGames = [
    'fabdoku', 'fabdokuCard', 'crossword', 'heroguesser',
    'matchupmania', 'trivia', 'timeline', 'connections',
    'rhinarsrampage', 'kayosknockout', 'brutebrawl',
    'ninjacombo', 'shadowstrike', 'bladedash',
  ];

  const collectionName = `${game}PlayerStats`;
  // Quick validation — just check the collection exists
  if (!validGames.includes(game)) {
    return { error: `Unknown game: ${game}. Valid: ${validGames.join(', ')}` };
  }

  const snapshot = await db.collection(collectionName)
    .orderBy('gamesPlayed', 'desc')
    .limit(10)
    .get();

  if (snapshot.empty) {
    return { game, players: [], message: 'No stats found for this game yet.' };
  }

  return {
    game,
    players: snapshot.docs.map(doc => {
      const d = doc.data();
      return {
        username: d.username || d.displayName || 'Anonymous',
        gamesPlayed: d.gamesPlayed || 0,
        gamesWon: d.gamesWon || 0,
        winRate: d.gamesPlayed > 0
          ? ((d.gamesWon / d.gamesPlayed) * 100).toFixed(1) + '%'
          : '0%',
        currentStreak: d.currentStreak || 0,
        bestStreak: d.bestStreak || 0,
      };
    }),
  };
}
