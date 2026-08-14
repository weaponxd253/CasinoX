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

const HOTEL_OPERATION_PAGES = [
  { name: 'Floor Ops', dept: 'rooms', path: '/hotel/rooms/index.html', start: '#start-ops-btn', startText: 'Start Floor Ops', back: '#ops-return-link', next: '#ops-next-step' },
  { name: 'Check-In Rush', dept: 'lobby', path: '/hotel/checkin/index.html', start: '#ci-start-btn', startText: 'Start Check-In', back: '#overlay-idle .ci-back-link', next: '#ci-next-step' },
  { name: 'Tasting Room', dept: 'restaurant', path: '/hotel/restaurant/index.html', start: '#start-tasting-btn', startText: 'Open Service', back: '#restaurant-return-link', next: '#tasting-next-step' },
  { name: 'Bar Shift', dept: 'bar', path: '/hotel/bar/index.html', start: '#start-shift-btn', startText: 'Start Bar Shift', back: '#bar-return-link', next: '#bar-next-step' },
  { name: 'Show Lineup', dept: 'entertainment', path: '/hotel/entertainment/index.html', start: '#book-btn', startText: 'Pick Slot and Act', back: '#booker-return-link', next: '#booker-next-step' },
  { name: 'Spa Rush', dept: 'spa', path: '/hotel/spa/index.html', start: '#start-spa-btn', startText: 'Start Spa Rush', back: '#spa-return-link', next: '#spa-next-step' },
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
    await page.evaluate(() => {
      HotelState.resetSave();
      HotelState.setGuidanceMode('expert');
      HotelState.restStaff('housekeeping_rosa');
      HotelState.unlockDept('restaurant');
      HotelUI.renderAll();
    });

    await expect(page.locator('.hotel-snapshot-card')).toBeVisible();
    await expect(page.locator('.hotel-view-wrap')).toHaveCount(0);
    await expect(page.locator('.shift-card')).toHaveCount(3);
    await expect(page.locator('.shift-card-featured')).toHaveCount(1);
    await expect(page.locator('.shift-card-featured')).toContainText('Best Now');
    await expect(page.locator('.shift-secondary-stack .shift-card-secondary')).toHaveCount(2);
    await expect(page.locator('.shift-card-state')).toHaveCount(3);
    await expect(page.locator('.shift-card-featured .shift-card-prep')).toBeVisible();
    await expect(page.locator('.shift-card-featured')).toContainText('Risk:');
    await expect(page.locator('.next-reward-rail')).toContainText('Next Reward');
    await expect(page.locator('.command-primary')).toContainText('staff gaps');

    await page.locator('.shift-card-prepare').first().click();
    await expect(page.locator('.mgmt-tab[data-tab="staff"]')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('.staff-shift-fit').first()).toContainText('Prepare');
    await expect(page.locator('.staff-assign-btn.prepare-target-control').first()).toBeVisible();

    await page.evaluate(() => {
      HotelState.recordShiftResult('rooms', {
        title: 'Floor Ops complete',
        cash: 120,
        satisfaction: 4,
        primaryLabel: 'Resolved',
        primaryValue: 3,
        summary: '3 requests resolved, 0 complaints.',
      });
      HotelUI.renderAll();
    });
    await expect(page.locator('.shift-return-banner')).toContainText('Floor Ops complete');
    await expect(page.locator('.shift-return-banner')).toContainText('coverage');
    await expect(page.locator('.shift-return-next')).toContainText('Prepare Guest Rooms staff');
    await expect(page.locator('.recent-shift-history')).toContainText('Floor Ops complete');
    await expect(page.locator('.recent-shift-history')).toContainText('High risk');
    await expect(page.locator('.shift-card', { hasText: 'Floor Ops' })).toContainText('Completed');
    await page.locator('.shift-result-dismiss').click();
    await expect(page.locator('.shift-return-banner')).toHaveCount(0);

    await page.locator('.mgmt-tab[data-tab="operations"]').click();
    await expect(page.locator('#operations-list .all-shifts-intro')).toContainText('Full Shift Catalog');
    await expect(page.locator('#operations-list .all-shift-group')).toHaveCount(3);
    await expect(page.locator('#operations-list .all-shift-group')).toContainText(['Playable Now', 'Build To Unlock', 'Reputation Locked']);
    await expect(page.locator('#operations-list .all-shift-card')).toHaveCount(7);
  });

  test('featured shift CTA starts the selected shift from the dashboard', async ({ page }) => {
    await page.goto('/hotel/index.html');
    await page.evaluate(() => {
      HotelState.resetSave();
      HotelState.setGuidanceMode('expert');
      HotelUI.renderAll();
    });

    const featuredTitle = await page.locator('.shift-card-featured .shift-card-copy strong').textContent();
    if (await page.locator('.command-primary').count()) {
      const primaryText = await page.locator('.command-primary').textContent();
      expect(primaryText).not.toContain(featuredTitle);
    }
    const dept = await page.locator('.shift-card-featured .shift-card-cta').getAttribute('data-shift-dept');
    await page.locator('.shift-card-featured .shift-card-cta').click();
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('hotelGameState'))?.shifts?.active?.deptId)).toBe(dept);
  });

  test('hotel mini-game pages open with a clear operation briefing', async ({ page }) => {
    for (const operation of HOTEL_OPERATION_PAGES) {
      await page.goto(operation.path);
      await page.evaluate((dept) => {
        HotelState.resetSave();
        HotelShiftBriefing.mount(dept);
      }, operation.dept);

      const briefing = page.locator('.mini-shift-briefing');
      await expect(briefing, `${operation.name} should mount briefing`).toContainText('Operation Briefing');
      await expect(briefing).toContainText(operation.name);
      await expect(briefing).toContainText("Today's Goal");
      await expect(briefing).toContainText('Reward');
      await expect(briefing).toContainText('Risk');
      await expect(briefing).toContainText('Coverage');
      await expect(briefing).toContainText('Staff Impact');
      await expect(page.locator(operation.start)).toContainText(operation.startText);
      await expect(page.locator(operation.back)).toContainText('Back to Hotel');
      await expect(page.locator(operation.next)).toContainText('Next Step');
      await expect(page.locator(operation.next).locator('strong')).not.toHaveText('');
    }
  });

  test('hotel mini-game direct play records active and completed shift state', async ({ page }) => {
    await page.goto('/hotel/rooms/index.html');
    await page.evaluate(() => {
      HotelState.resetSave();
      HotelShiftBriefing.mount('rooms');
    });

    await page.locator('#start-ops-btn').click();
    await expect.poll(() => page.evaluate(() => HotelState.get().shifts.active?.deptId)).toBe('rooms');
    await expect.poll(() => page.evaluate(() => HotelState.get().shifts.active?.briefing?.title)).toBe('Floor Ops');

    await page.evaluate(() => {
      HotelState.recordShiftResult('rooms', {
        title: 'Floor Ops complete',
        cash: 42,
        satisfaction: 1,
        primaryLabel: 'Resolved',
        primaryValue: 1,
        summary: '1 request resolved.',
      });
    });
    await expect.poll(() => page.evaluate(() => HotelState.get().shifts.lastResult?.deptId)).toBe('rooms');
    await expect.poll(() => page.evaluate(() => HotelState.get().shifts.lastResult?.staffImpact)).toContain('coverage');
  });

  test('hotel mini-games guide the next in-game action', async ({ page }) => {
    await page.goto('/hotel/rooms/index.html');
    await page.evaluate(() => {
      HotelState.resetSave();
      HotelShiftBriefing.mount('rooms');
    });
    await page.locator('#start-ops-btn').click();
    await expect(page.locator('#ops-next-step')).toContainText('Assign');
    await expect(page.locator('.staff-card.recommended')).toContainText('Best Fit');

    await page.goto('/hotel/restaurant/index.html');
    await page.evaluate(() => {
      HotelState.resetSave();
      const state = HotelState.get();
      state.departments.restaurant.unlocked = true;
      state.departments.restaurant.level = 2;
      state.departments.restaurant.lastCollected = Date.now();
      HotelState.save();
      location.reload();
    });
    await page.waitForLoadState('domcontentloaded');
    await page.locator('#start-tasting-btn').click();
    await expect(page.locator('#tasting-next-step')).toContainText('Choose 3 dishes');
    await expect(page.locator('#fire-course-btn')).toContainText('Choose 3 Dishes');
    for (let i = 0; i < 3; i++) {
      await page.locator('.dish-card:not([disabled])').first().click();
    }
    await expect(page.locator('#tasting-next-step')).toContainText('Flight ready');
    await expect(page.locator('#fire-course-btn')).toContainText('Fire Flight');

    await page.goto('/hotel/spa/index.html');
    await page.evaluate(() => {
      HotelState.resetSave();
      const state = HotelState.get();
      state.departments.spa.unlocked = true;
      state.departments.spa.level = 5;
      state.departments.spa.lastCollected = Date.now();
      HotelState.save();
      location.reload();
    });
    await page.waitForLoadState('domcontentloaded');
    await page.locator('#start-spa-btn').click();
    await expect(page.locator('#spa-next-step')).toContainText('Choose');
    await expect(page.locator('.treatment-btn.best-match')).toContainText('Best Match');
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
