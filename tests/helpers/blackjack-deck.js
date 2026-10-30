// Control only shuffle input; exercise the real deal, wager and settlement code.
// The local deck is popped from the end: player 10+8, dealer 9+7, hit 10.
async function dealerBustDeck(table) {
  await table.locator('body').evaluate(() => {
    window.newShuffledDeck = () => ['10', '7', '9', '8', '10'].map(value => ({
      value, suit: 'HEARTS', symbol: '♥', red: true,
    }));
  });
}

module.exports = { dealerBustDeck };
