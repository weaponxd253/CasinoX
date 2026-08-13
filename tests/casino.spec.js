const { test, expect } = require('@playwright/test');

const LIVE_GAMES = [
  {
    name: 'Lucky Reels',
    path: '/slots/index.html',
    ready: '.spin-button',
    play: async (page) => {
      await tapCenter(page.locator('.spin-button'));
      await expect.poll(() => page.evaluate(() => Number(localStorage.getItem('casinoBalance')))).not.toBe(100);
      await expect(page.locator('#history-list .history-item')).toHaveCount(1);
    }
  },
  {
    name: 'Blackjack X',
    path: '/blackjack/index.html',
    ready: '#deal-button',
    play: async (page) => {
      await page.locator('.chip-btn[data-value="1"]').click();
      await expect(page.locator('#bet-amount')).toHaveText('$1.00');
      await tapCenter(page.locator('#deal-button'));
      await expect.poll(() => page.evaluate(() => Number(localStorage.getItem('casinoBalance')))).toBe(99);
      await expect(page.locator('#player-cards .card')).toHaveCount(2);
      await expect(page.locator('#dealer-cards .card')).toHaveCount(2);
    }
  },
  {
    name: 'Coin Flip',
    path: '/coinflip/index.html',
    ready: '#flip-heads',
    play: async (page) => {
      await page.locator('#flip-heads').click();
      await expect.poll(() => page.evaluate(() => Number(localStorage.getItem('casinoBalance')))).not.toBe(100);
      await expect(page.locator('#cf-result')).not.toHaveText('Place your bet');
    }
  }
];

test.beforeEach(async ({ page }) => {
  await stubExternalDependencies(page);
  await page.addInitScript(() => {
    sessionStorage.setItem('shellBonusPrompted', '1');
    Math.random = () => 0.1;
  });
});

test.describe('launch navigation', () => {
  test('root sends visitors to the hotel lobby', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/hotel\/index\.html$/);
    await expect(page.locator('#hotel-name-display')).toContainText('Grand Casino Resort');
  });

  test('hotel dashboard keeps shifts prominent and exposes the full shift catalog', async ({ page }) => {
    await page.goto('/hotel/index.html');

    await expect(page.locator('.hotel-snapshot-card')).toBeVisible();
    await expect(page.locator('.hotel-view-wrap')).toHaveCount(0);
    await expect(page.locator('.shift-card')).toHaveCount(3);
    await expect(page.locator('.shift-card.featured')).toContainText('Recommended');

    await page.locator('.mgmt-tab[data-tab="operations"]').click();
    await expect(page.locator('.mgmt-tab[data-tab="operations"]')).toContainText('All Shifts');
    await expect(page.locator('#operations-list .all-shifts-intro')).toContainText('Full Shift Catalog');
    await expect(page.locator('#operations-list .all-shift-card')).toHaveCount(7);
  });

  test('casino lobby exposes only working live game links', async ({ page }) => {
    await page.goto('/casino.html');

    await expect(page.locator('.game-card.live')).toHaveCount(3);
    await expect(page.locator('.game-card.locked')).toHaveCount(2);

    for (const game of LIVE_GAMES) {
      const card = page.locator(`.game-card.live[href="${game.path.slice(1)}"]`);
      await expect(card, `${game.name} should be linked from the lobby`).toHaveCount(1);
    }

    await expect(page.locator('.game-card.locked[href]')).toHaveCount(0);
  });

  for (const game of LIVE_GAMES) {
    test(`${game.name} loads from its lobby card`, async ({ page }) => {
      await page.goto('/casino.html');
      await page.locator(`.game-card.live[href="${game.path.slice(1)}"]`).click();

      await expect(page).toHaveURL(new RegExp(`${escapeRegExp(game.path)}$`));
      await expect(page.locator(game.ready)).toBeVisible();
      await expect(page.locator('.shell-header')).toBeVisible();
    });
  }
});

test.describe('wallet behavior', () => {
  test('shared wallet starts, persists, emits updates, and blocks unaffordable bets', async ({ page }) => {
    await page.goto('/casino.html');

    const result = await page.evaluate(() => {
      const seen = [];
      CasinoWallet.onChange((balance) => seen.push(balance));

      const starting = CasinoWallet.get();
      const afterAdd = CasinoWallet.add(12.345);
      const afterDeduct = CasinoWallet.deduct(2.34);
      const canAffordExact = CasinoWallet.canAfford(afterDeduct);
      const canAffordTooMuch = CasinoWallet.canAfford(afterDeduct + 0.01);

      return {
        starting,
        afterAdd,
        afterDeduct,
        stored: Number(localStorage.getItem('casinoBalance')),
        seen,
        canAffordExact,
        canAffordTooMuch
      };
    });

    expect(result).toEqual({
      starting: 100,
      afterAdd: 112.34,
      afterDeduct: 110,
      stored: 110,
      seen: [100, 112.34, 110],
      canAffordExact: true,
      canAffordTooMuch: false
    });

    await page.goto('/coinflip/index.html');
    await expect(page.locator('.shell-balance')).toContainText('110.00');
  });
});

test.describe('betting gates', () => {
  test('Slots refuses a bet higher than the current wallet', async ({ page }) => {
    await page.goto('/slots/index.html');
    await page.evaluate(() => CasinoWallet.set(0.5));

    await tapCenter(page.locator('.spin-button'));

    await expect.poll(() => page.evaluate(() => CasinoWallet.get())).toBe(0.5);
    await expect(page.locator('#result')).toContainText('Invalid bet');
  });

  test('Blackjack disables impossible bets and requires a wager before deal', async ({ page }) => {
    await page.goto('/blackjack/index.html');
    await page.evaluate(() => CasinoWallet.set(0.5));

    await expect(page.locator('#deal-button')).toBeDisabled();
    await expect(page.locator('.chip-btn[data-value="1"]')).toBeDisabled();
    await expect(page.locator('#result-message')).toContainText('Out of chips');

    await page.evaluate(() => CasinoWallet.set(5));
    await expect(page.locator('.chip-btn[data-value="1"]')).toBeEnabled();
    await expect(page.locator('.chip-btn[data-value="10"]')).toBeDisabled();
  });

  test('Coin Flip does not deduct when the wallet cannot cover the current bet', async ({ page }) => {
    await page.goto('/coinflip/index.html');
    await page.evaluate(() => CasinoWallet.set(4));

    await page.locator('#flip-heads').click();

    await expect.poll(() => page.evaluate(() => CasinoWallet.get())).toBe(4);
    await expect(page.locator('#cf-result')).toHaveText('Place your bet');
  });
});

test.describe('live game smoke paths', () => {
  for (const game of LIVE_GAMES) {
    test(`${game.name} can place a basic wager without freezing`, async ({ page }) => {
      await page.goto(game.path);
      await expect(page.locator(game.ready)).toBeVisible();

      await game.play(page);
    });
  }
});

async function stubExternalDependencies(page) {
  await page.route('https://cdnjs.cloudflare.com/ajax/libs/gsap/**', (route) => {
    route.fulfill({
      contentType: 'application/javascript',
      body: `
        window.gsap = {
          to(target, vars) { if (vars && vars.onComplete) setTimeout(vars.onComplete, 0); return {}; },
          fromTo(target, fromVars, toVars) {
            Object.assign(target.style || target, fromVars || {});
            if (toVars && toVars.y != null && target.style) target.style.transform = 'translateY(' + toVars.y + 'px)';
            if (toVars && toVars.onComplete) setTimeout(toVars.onComplete, 0);
            return {};
          },
          set(target, vars) { if (target && target.style) Object.assign(target.style, vars || {}); },
          killTweensOf() {}
        };
      `
    });
  });

  await page.route('https://deckofcardsapi.com/api/deck/new/shuffle/?deck_count=1', (route) => {
    route.fulfill({ json: { success: true, deck_id: 'test-deck' } });
  });

  await page.route('https://deckofcardsapi.com/api/deck/test-deck/draw/?count=4', (route) => {
    route.fulfill({
      json: {
        success: true,
        cards: [
          card('10', 'HEARTS'),
          card('9', 'CLUBS'),
          card('8', 'SPADES'),
          card('7', 'DIAMONDS')
        ]
      }
    });
  });

  await page.route('https://deckofcardsapi.com/api/deck/test-deck/draw/?count=1', (route) => {
    route.fulfill({ json: { success: true, cards: [card('6', 'CLUBS')] } });
  });
}

function card(value, suit) {
  return {
    value,
    suit,
    image: `data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="80" height="112"></svg>`
  };
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function tapCenter(locator) {
  const box = await locator.boundingBox();
  if (!box) throw new Error('Cannot tap an element without a bounding box.');
  await locator.page().mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}
