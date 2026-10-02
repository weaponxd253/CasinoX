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
    await expect(page.locator('#ops-next-step')).toContainText('Click a room');
    await page.locator('.room-tile[data-request-id]').first().click();
    await expect(page.locator('#dispatch-preview')).toContainText('Latest Outcome');
    await expect(page.locator('#dispatch-preview')).toContainText('Auto dispatch');

    await page.goto('/hotel/restaurant/index.html');
    await page.evaluate(() => {
      HotelState.resetSave();
      const state = HotelState.get();
      state.departments.restaurant.unlocked = true;
      state.departments.restaurant.level = 2;
      state.departments.restaurant.lastCollected = Date.now();
      HotelState.save();
    });
    await page.reload();
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
    });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator('#start-spa-btn').click();
    await expect(page.locator('#spa-next-step')).toContainText('Choose a treatment');
    await expect(page.locator('.active-guest-card')).toContainText('Active Guest');
    await expect(page.locator('.treatment-btn.best-match.next-action')).toContainText('Best Match');
    await page.locator('.treatment-btn.best-match.next-action').click();
    await expect(page.locator('.station-card.busy')).toHaveCount(1);
    await expect(page.locator('#spa-outcome')).toContainText('started');
  });

  test('floor ops previews staff fit and distinguishes risky dispatches', async ({ page }) => {
    await page.goto('/hotel/rooms/index.html');
    await page.evaluate(() => {
      HotelState.resetSave();
      const state = HotelState.get();
      state.departments.rooms.unlocked = true;
      state.departments.rooms.level = 4;
      state.departments.rooms.lastCollected = Date.now();
      HotelState.save();
    });
    await page.reload({ waitUntil: 'domcontentloaded' });

    const fits = await page.evaluate(() => ({
      best: RoomsGame.debugEvaluateDispatch('runner', 'minibar'),
      cover: RoomsGame.debugEvaluateDispatch('housekeeper', 'minibar'),
      risky: RoomsGame.debugEvaluateDispatch('engineer', 'minibar'),
    }));

    expect(fits.best.tier).toBe('best');
    expect(fits.cover.tier).toBe('acceptable');
    expect(fits.risky.tier).toBe('risky');
    expect(fits.best.timeMult).toBeLessThan(fits.cover.timeMult);
    expect(fits.cover.cashMult).toBeGreaterThan(fits.risky.cashMult);

    await page.locator('#start-ops-btn').click();
    await expect(page.locator('#ops-next-step')).toContainText('Click a room request');
    await page.locator('.staff-card[data-staff-id="engineer"]').click();
    await expect(page.locator('.staff-card.manual-selected')).toContainText('Selected');
    await expect(page.locator('#dispatch-preview')).toContainText('Manual Override');
    await page.locator('.room-tile[data-request-id]').first().click();
    await expect(page.locator('#dispatch-preview')).toContainText('Latest Outcome');
    await expect(page.locator('#dispatch-preview')).toContainText('Manual override');
    await expect(page.locator('#dispatch-preview')).toContainText('Risky Match');
    await expect(page.locator('.room-tile.assigned')).toHaveCount(1);
  });

  test('tasting room rewards course order and explains the flight read', async ({ page }) => {
    await page.goto('/hotel/restaurant/index.html');
    await page.evaluate(() => {
      HotelState.resetSave();
      const state = HotelState.get();
      state.departments.restaurant.unlocked = true;
      state.departments.restaurant.level = 2;
      state.departments.restaurant.lastCollected = Date.now();
      HotelState.save();
    });
    await page.reload({ waitUntil: 'domcontentloaded' });

    const scores = await page.evaluate(() => ({
      idealCritics: RestaurantGame.debugScoreFlight(['citrusCrudo', 'velvetRisotto', 'gardenStatic'], 'critics'),
      reorderedCritics: RestaurantGame.debugScoreFlight(['gardenStatic', 'velvetRisotto', 'citrusCrudo'], 'critics'),
      artistFlight: RestaurantGame.debugScoreFlight(['citrusCrudo', 'pepperBloom', 'gardenStatic'], 'artists'),
      jetlagFlight: RestaurantGame.debugScoreFlight(['citrusCrudo', 'pepperBloom', 'gardenStatic'], 'jetlag'),
    }));

    expect(scores.idealCritics.harmony).toBeGreaterThan(scores.reorderedCritics.harmony);
    expect(scores.artistFlight.harmony).toBeGreaterThan(scores.jetlagFlight.harmony);
    expect(scores.idealCritics.feedback.map(item => item.label)).toContain('Course Arc');

    await page.locator('#start-tasting-btn').click();
    await page.locator('.dish-card[data-dish="citrusCrudo"]').click();
    await expect(page.locator('#flight-feedback')).toContainText('Flight Read');
    await page.locator('.dish-card[data-dish="velvetRisotto"]').click();
    await page.locator('.dish-card[data-dish="gardenStatic"]').click();
    await expect(page.locator('#flight-feedback')).toContainText('Projected Harmony');
    await expect(page.locator('#flight-feedback')).toContainText('Course Arc');
    await expect(page.locator('#course-rail')).toContainText('Bright opener');
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

test.describe('round 1 regressions', () => {
  test('Blackjack keeps the dealer hole card hidden until the player stands', async ({ page }) => {
    await page.goto('/blackjack/index.html');
    await page.evaluate(() => {
      CasinoWallet.set(100);
      // draw() pops from the end: player 10♥ 8♠, dealer 9♣ + hole 7♦, then 6♣ busts the dealer.
      const c = (value, suit, red) => ({ value, suit, symbol: '♠', red });
      window.newShuffledDeck = () => [c('6', 'CLUBS'), c('7', 'DIAMONDS', true), c('9', 'CLUBS'), c('8', 'SPADES'), c('10', 'HEARTS', true)];
    });
    await page.locator('.chip-btn[data-value="1"]').click();
    await tapCenter(page.locator('#deal-button'));

    await expect(page.locator('#dealer-cards .card')).toHaveCount(2);
    await expect(page.locator('#dealer-cards .card.face-down')).toHaveCount(1);
    await expect(page.locator('#dealer-score')).toHaveText('Score: 9 + ?');
    await expect(page.locator('#stand-button')).toBeEnabled();

    await tapCenter(page.locator('#stand-button'));
    await expect(page.locator('#result-message')).toHaveText('Dealer busts — you win!');
    await expect(page.locator('#dealer-cards .card.face-down')).toHaveCount(0);
    await expect(page.locator('#dealer-score')).toHaveText('Score: 22');
    await expect.poll(() => page.evaluate(() => CasinoWallet.get())).toBe(101);
  });

  test('casino results are queued and applied when the hotel opens', async ({ page }) => {
    await page.goto('/coinflip/index.html');
    await page.evaluate(() => CasinoWallet.set(100));
    await page.locator('#flip-heads').click();
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('hotelEventQueue'))?.wagered)).toBe(5);

    await page.goto('/hotel/index.html');
    await expect.poll(() => page.evaluate(() => HotelState.get().casinoBridge.events.totalChipsWagered)).toBe(5);
    expect(await page.evaluate(() => localStorage.getItem('hotelEventQueue'))).toBeNull();
  });
});

test.describe('round 2 economy', () => {
  test('Cashier only refills a busted bankroll', async ({ page }) => {
    await page.goto('/casino.html');
    await page.evaluate(() => CasinoWallet.set(50));
    await page.locator('#cashier-btn').click();
    await expect(page.locator('#shell-cashier-refill')).toBeDisabled();
    await expect(page.locator('[data-cashier="refill"] .cashier-note')).toContainText('drops below $1');
    await page.keyboard.press('Escape');
    expect(await page.evaluate(() => CasinoWallet.get())).toBe(50);

    await page.evaluate(() => CasinoWallet.set(0.4));
    await page.locator('#cashier-btn').click();
    await page.locator('#shell-cashier-refill').click();
    await expect.poll(() => page.evaluate(() => CasinoWallet.get())).toBe(100);
  });

  test('repeat shifts in one phase pay reduced rewards until the next phase', async ({ page }) => {
    await page.goto('/hotel/index.html');
    const mults = await page.evaluate(() => {
      const out = [HotelState.shiftRewardMultiplier('bar')];
      for (let i = 0; i < 3; i++) {
        HotelState.recordShiftResult('bar', { cash: 10 });
        out.push(HotelState.shiftRewardMultiplier('bar'));
      }
      HotelEngine.advanceCalendarPhase();
      out.push(HotelState.shiftRewardMultiplier('bar'));
      return out;
    });
    expect(mults).toEqual([1, 0.5, 0.25, 0.25, 1]);
  });

  test('Lucky Reels reports a bet-back pair as a push, not a win', async ({ page }) => {
    await page.goto('/slots/index.html');
    await page.evaluate(() => {
      CasinoWallet.set(100);
      // Each reel draws 20 filler symbols then its final one (every 21st call).
      const finals = ['🍒', '🍒', '🍉'];
      let n = 0;
      window.getRandomSymbol = () => { const i = n++; return i % 21 === 20 ? finals[Math.floor(i / 21)] : '🍋'; };
    });
    await tapCenter(page.locator('.spin-button'));
    await expect(page.locator('#history-list .history-amount').first()).toHaveText('±$0.00');
    await expect(page.locator('#result')).toHaveText('Bet back — $0.60 returned.');
    expect(await page.evaluate(() => CasinoWallet.get())).toBe(100);
  });
});

test.describe('earlier fixes and round 3', () => {
  test('XP bar keeps its fill element and labels progress', async ({ page }) => {
    await page.goto('/coinflip/index.html');
    await expect(page.locator('#shell-xp-fill')).toHaveCount(1);
    await expect(page.locator('#shell-xp-text')).toHaveAttribute('aria-label', /Level 1: \d+\/50 XP/);
  });

  test('Lucky Reels takes one bet even if spin is triggered twice', async ({ page }) => {
    await page.goto('/slots/index.html');
    const balance = await page.evaluate(() => {
      CasinoWallet.set(100);
      spin(); spin();
      return CasinoWallet.get();
    });
    expect(balance).toBe(99.4);
  });

  test('Bar Shift settles each order once, however fast it is clicked', async ({ page }) => {
    await page.goto('/hotel/index.html');
    await page.evaluate(() => {
      const s = HotelState.get();
      s.departments.bar.unlocked = true;
      s.departments.bar.level = 1;
      HotelState.saveNow();
    });
    await page.goto('/hotel/bar/index.html');
    await page.locator('#start-shift-btn').click();
    // Math.random is pinned to 0.1, so the first order is always beer.
    await expect(page.locator('#ticket-drink')).toContainText('Beer');
    await page.evaluate(() => {
      document.querySelector('.ingredient-btn[data-ingredient="lager"]').click();
      const serve = document.getElementById('serve-btn');
      serve.click(); serve.click(); serve.click();
    });
    await expect(page.locator('#served-count')).toHaveText('1');
  });

  test('Advance Time has a cooldown that dev mode skips', async ({ page }) => {
    await page.goto('/hotel/index.html');
    const btn = page.locator('#advance-time-btn');
    await btn.click();
    await expect(btn).toBeDisabled();
    await expect(btn).toContainText('Next phase in');
    expect(await page.evaluate(() => HotelState.get().calendar.phase)).toBe('afternoon');

    await page.goto('/hotel/index.html?dev=1');
    await expect(btn).toBeEnabled();
    await btn.click();
    await btn.click();
    expect(await page.evaluate(() => HotelState.get().calendar.phase)).toBe('night');
  });

  test('mini-game satisfaction bonus survives recalculation', async ({ page }) => {
    await page.goto('/hotel/index.html');
    const [withBonus, afterRecalc] = await page.evaluate(() => {
      HotelState.addSatisfactionBonus(6);
      const a = HotelState.getSatisfaction();
      HotelEngine.recalculateSatisfaction(HotelState.get());
      return [a, HotelState.getSatisfaction()];
    });
    expect(afterRecalc).toBe(withBonus);
  });

  test('a live tick writes the hotel save once', async ({ page }) => {
    await page.goto('/hotel/index.html');
    const writes = await page.evaluate(async () => {
      let n = 0;
      const orig = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) {
        if (key === 'hotelGameState') n++;
        return orig.call(this, key, value);
      };
      HotelEngine.processLiveTick();
      await Promise.resolve();
      Storage.prototype.setItem = orig;
      return n;
    });
    expect(writes).toBe(1);
  });

  test('dev tools panel opens from the badge and grants hotel cash', async ({ page }) => {
    await page.goto('/hotel/index.html?dev=1');
    const before = await page.evaluate(() => HotelState.getCash());
    await page.locator('#casino-dev-badge').click();
    await page.locator('#casino-dev-panel').getByRole('button', { name: '+$10,000 hotel cash' }).click();
    await expect.poll(() => page.evaluate(() => HotelState.getCash())).toBeGreaterThanOrEqual(before + 10000);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('hotelGameState')).currencies.hotelCash))
      .toBeGreaterThanOrEqual(before + 10000);
  });
});

test.describe('sprint 1 UX', () => {
  const PAGES = ['/casino.html', '/slots/index.html', '/blackjack/index.html', '/coinflip/index.html',
    '/hotel/index.html', '/hotel/bar/index.html', '/hotel/spa/index.html', '/hotel/rooms/index.html',
    '/hotel/restaurant/index.html', '/hotel/checkin/index.html', '/hotel/entertainment/index.html', '/roulette/index.html?dev=1'];

  test('no page scrolls sideways', async ({ page }) => {
    for (const path of PAGES) {
      await page.goto(path);
      const [docWidth, viewport] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
      expect(docWidth, `${path} is ${docWidth}px wide in a ${viewport}px viewport`).toBeLessThanOrEqual(viewport);
    }
  });

  test('Lucky Reels marks the selected bet and dims bets the bankroll cannot cover', async ({ page }) => {
    await page.goto('/slots/index.html');
    await page.evaluate(() => CasinoWallet.set(3));
    await expect(page.locator('.bet-buttons [data-bet="0.6"]')).toHaveClass(/selected/);
    await expect(page.locator('.bet-buttons [data-bet="3.6"]')).toHaveClass(/unaffordable/);
    await expect(page.locator('.bet-buttons [data-bet="6"]')).toHaveClass(/unaffordable/);

    await page.locator('.bet-buttons [data-bet="2.4"]').click();
    await expect(page.locator('.bet-buttons [data-bet="2.4"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#current-bet')).toHaveText('2.40');

    // Dropping below the selected bet steps it down to the largest affordable one
    await page.evaluate(() => CasinoWallet.set(1.5));
    await expect(page.locator('#current-bet')).toHaveText('1.20');
    await expect(page.locator('.bet-buttons [data-bet="1.2"]')).toHaveClass(/selected/);
  });

  test('Blackjack shows the stake on the Deal button', async ({ page }) => {
    await page.goto('/blackjack/index.html');
    await page.evaluate(() => CasinoWallet.set(100));
    await page.locator('.chip-btn[data-value="5"]').click();
    await expect(page.locator('#deal-button')).toHaveText('Deal · $5.00');
  });

  test('dialogs take focus, keep Tab inside, close on Escape and restore focus', async ({ page }) => {
    await page.goto('/slots/index.html');
    const help = page.locator('#help');
    await help.focus();
    await help.press('Enter');
    const dialog = page.locator('#shell-info-modal .shell-modal-box');
    await expect(dialog).toHaveAttribute('role', 'dialog');
    await expect(page.locator('#shell-info-modal .shell-info-close')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.locator('#shell-info-modal .shell-info-close')).toBeFocused();   // only control: focus wraps
    await page.keyboard.press('Escape');
    await expect(page.locator('#shell-info-modal')).not.toHaveClass(/open/);
    await expect(help).toBeFocused();
  });

  test('new hotel players see one next step and one gold button', async ({ page }) => {
    await page.goto('/hotel/index.html');
    await expect(page.locator('.dashboard-focus')).toHaveCount(1);
    await expect(page.locator('.next-reward-rail')).toHaveCount(0);
    await expect(page.locator('.command-chips:empty')).toHaveCount(0);
    const gold = await page.evaluate(() => [...document.querySelectorAll('#hotel-command-strip button, #hotel-command-strip a')]
      .filter(el => el.offsetParent && /linear-gradient/.test(getComputedStyle(el).backgroundImage))
      .map(el => el.textContent.trim()));
    expect(gold).toHaveLength(1);
  });

  test('shift cards show the reduced reward for a repeat run', async ({ page }) => {
    await page.goto('/hotel/index.html');
    await page.evaluate(() => {
      HotelState.setGuidanceMode('expert');
      HotelState.recordShiftResult('lobby', { cash: 200 });
      HotelUI.renderAll();
    });
    const card = page.locator('.shift-card', { hasText: 'Check-In Rush' });
    await expect(card.locator('.shift-card-cta')).toHaveText('Run Again · 50%');
    await expect(card.locator('.shift-repeat-note')).toContainText('Next run pays 50%');
  });
});

test.describe('sprint 2 casino-hotel loop', () => {
  // Casino Floor level 3 (bet ×2, +10% chip bonus), Bar level 3 (+$100 daily bonus)
  async function upgradedHotel(page, extraCash = 5000) {
    await page.goto('/hotel/index.html');
    await page.evaluate((cash) => {
      const s = HotelState.get();
      s.departments.casino.level = 3;
      s.departments.bar.unlocked = true;
      s.departments.bar.level = 3;
      HotelState.addHotelCash(cash);
      HotelBridge.applyHotelToCasino(s);
      HotelState.saveNow();
    }, extraCash);
  }

  test('hotel upgrades raise casino limits and show a perks strip', async ({ page }) => {
    await upgradedHotel(page);
    await page.goto('/slots/index.html');
    await expect(page.locator('#hotel-perk-strip')).toContainText('slots up to $12');
    await expect(page.locator('.bet-buttons [data-bet]').last()).toHaveAttribute('data-bet', '12');
    await page.goto('/blackjack/index.html');
    await expect(page.locator('.chip-btn[data-value="50"]')).toBeVisible();
    await expect(page.locator('.chip-btn[data-value="100"]')).toBeHidden();
  });

  test('daily bonus includes hotel perks', async ({ page }) => {
    await upgradedHotel(page);
    await page.goto('/coinflip/index.html');
    await page.evaluate(() => CasinoShell.dailyBonus.open());
    // $50 day-one bonus + 10% chip bonus + $100 from the bar
    await expect(page.locator('#shell-claim')).toHaveText('Claim $155');
  });

  test('Cashier trades hotel cash for chips and the hotel is charged', async ({ page }) => {
    await upgradedHotel(page);
    const cashBefore = await page.evaluate(() => HotelState.getCash());
    await page.goto('/casino.html');
    await page.evaluate(() => CasinoWallet.set(50));
    await page.locator('#cashier-btn').click();
    await expect(page.locator('#shell-cashier-refill')).toBeDisabled();
    await expect(page.locator('#shell-cashier-comp')).toHaveText('275 chips for $1,000');
    await page.locator('#shell-cashier-comp').click();
    await expect.poll(() => page.evaluate(() => CasinoWallet.get())).toBe(325);

    await page.goto('/hotel/index.html');
    await expect.poll(() => page.evaluate(() => HotelState.getCash())).toBeLessThanOrEqual(cashBefore - 1000 + 50);
    expect(await page.evaluate(() => localStorage.getItem('hotelEventQueue'))).toBeNull();
  });

  test('hotel cash celebrations look different from chip wins', async ({ page }) => {
    await page.goto('/hotel/bar/index.html');
    await page.evaluate(() => CasinoShell.celebrate(120, { currency: 'hotel' }));
    await expect(page.locator('#shell-bigwin')).toHaveClass(/hotel-cash/);
    await expect(page.locator('#shell-bigwin')).toContainText('hotel cash');
    await page.evaluate(() => CasinoShell.celebrate(5));
    await expect(page.locator('#shell-bigwin')).not.toHaveClass(/hotel-cash/);
    await expect(page.locator('#shell-bigwin')).toContainText('chips');
  });

  test('daily goals track progress and pay out a chest', async ({ page }) => {
    await page.goto('/hotel/index.html');
    await page.evaluate(() => { HotelState.setGuidanceMode('expert'); HotelUI.renderAll(); });
    await expect(page.locator('#hotel-goals .goal')).toHaveCount(3);
    await expect(page.locator('#hotel-goals .goals-claim')).toBeDisabled();

    // Complete every goal by moving the counters each one watches.
    await page.evaluate(() => {
      const s = HotelState.get();
      for (const goal of s.goals.items) {
        if (goal.id === 'run_shifts' || goal.id === 'dept_shift') {
          for (let i = 0; i < goal.target; i++) HotelState.recordShiftResult(goal.dept ?? 'lobby', { cash: 1 });
        } else if (goal.id === 'bj_wins') s.casinoBridge.events.blackjackWins += goal.target;
        else if (goal.id === 'spins') s.casinoBridge.events.slotsSpun += goal.target;
        else if (goal.id === 'wagered') s.casinoBridge.events.totalChipsWagered += goal.target;
        else if (goal.id === 'satisfaction') s.satisfaction.current = goal.target;
        else if (goal.id === 'earn_cash') HotelState.addHotelCash(goal.target);
        else if (goal.id === 'upgrade') s.stats.upgradeCount += 1;
      }
      CasinoWallet.set(10);
      HotelUI.renderAll();
    });
    await expect(page.locator('#hotel-goals .goal.done')).toHaveCount(3);
    const cashBefore = await page.evaluate(() => HotelState.getCash());
    const reward = await page.evaluate(() => HotelState.get().goals.reward);
    await page.locator('#hotel-goals .goals-claim').click();
    await expect(page.locator('#hotel-goals')).toContainText('Chest opened');
    expect(await page.evaluate(() => HotelState.getCash())).toBeGreaterThanOrEqual(cashBefore + reward.cash);
    expect(await page.evaluate(() => CasinoWallet.get())).toBe(10 + reward.chips);
  });

  test('a new in-game day brings new goals', async ({ page }) => {
    await page.goto('/hotel/index.html?dev=1');
    await page.evaluate(() => { HotelState.setGuidanceMode('expert'); HotelUI.renderAll(); });
    await expect(page.locator('#hotel-goals')).toContainText('Day 1');
    for (let i = 0; i < 4; i++) await page.locator('#advance-time-btn').click();
    await expect(page.locator('#hotel-goals')).toContainText('Day 2');
  });
});

test.describe('phase 2 polish', () => {
  test('daily bonus pulses on game pages and only opens itself in the casino lobby', async ({ page }) => {
    await page.addInitScript(() => sessionStorage.removeItem('shellBonusPrompted'));
    await page.goto('/slots/index.html');
    await expect(page.locator('#shell-bonus-btn')).toHaveClass(/ready/);
    await page.waitForTimeout(900);
    await expect(page.locator('#shell-bonus-modal')).not.toHaveClass(/open/);
    await page.goto('/hotel/index.html');
    await page.waitForTimeout(900);
    await expect(page.locator('#shell-bonus-modal')).not.toHaveClass(/open/);
    await page.goto('/casino.html');
    await expect(page.locator('#shell-bonus-modal')).toHaveClass(/open/);
  });

  test('reduced motion settles games quickly and hides confetti', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/coinflip/index.html');
    await page.evaluate(() => CasinoWallet.set(100));
    await page.locator('#flip-heads').click();
    await expect(page.locator('#cf-result')).not.toHaveText('Flipping…', { timeout: 600 });
    expect(await page.evaluate(() => getComputedStyle(document.getElementById('shell-confetti')).display)).toBe('none');
  });

  test('games announce results to screen readers', async ({ page }) => {
    await page.goto('/blackjack/index.html');
    await page.evaluate(() => {
      CasinoWallet.set(100);
      const c = (value, suit, red) => ({ value, suit, symbol: '♠', red });
      window.newShuffledDeck = () => [c('6', 'CLUBS'), c('7', 'DIAMONDS', true), c('9', 'CLUBS'), c('8', 'SPADES'), c('10', 'HEARTS', true)];
    });
    await page.locator('.chip-btn[data-value="1"]').click();
    await tapCenter(page.locator('#deal-button'));
    await expect(page.locator('#shell-announcer')).toContainText('You have 10 of Hearts and 8 of Spades, 18. Dealer shows 9 of Clubs.');
    await tapCenter(page.locator('#stand-button'));
    await expect(page.locator('#shell-announcer')).toContainText('Dealer busts — you win! You 18, dealer 22. Won $1.00.');
  });

  test('keyboard shortcuts play the game and ? lists them', async ({ page }) => {
    await page.goto('/coinflip/index.html');
    await page.evaluate(() => CasinoWallet.set(100));
    await page.locator('body').press('ArrowUp');
    await expect(page.locator('#bet-val')).toHaveText('$10.00');
    await page.locator('body').press('t');
    await expect(page.locator('#cf-result')).toContainText(/Heads|Tails/);
    await page.locator('body').press('?');
    await expect(page.locator('#shell-info-modal')).toHaveClass(/open/);
    await expect(page.locator('.shell-shortcut-list')).toContainText('Bet tails');
    // Shortcuts are ignored while a dialog is open
    await page.keyboard.press('ArrowUp');
    await expect(page.locator('#bet-val')).not.toHaveText('$15.00');
  });

  test('shift pages say "Back to Hotel Lobby"', async ({ page }) => {
    await page.goto('/hotel/bar/index.html');
    await expect(page.locator('#bar-return-link')).toContainText('Back to Hotel Lobby');
  });
});

test.describe('phase 3 gameplay', () => {
  // Blackjack with a fixed deck: draw() pops from the end of the array.
  async function blackjackWith(page, cards, bet = 10) {
    await page.goto('/blackjack/index.html');
    await page.evaluate((cards) => {
      CasinoWallet.set(100);
      localStorage.setItem('casinoProfile', JSON.stringify({ xp: 0 }));
      const c = ([value, suit]) => ({ value, suit, symbol: '♠', red: suit === 'HEARTS' || suit === 'DIAMONDS' });
      window.newShuffledDeck = () => cards.map(c);
    }, cards);
    await page.locator(`.chip-btn[data-value="${bet}"]`).click();
    await tapCenter(page.locator('#deal-button'));
  }
  const balanceIs = (page, n) => expect.poll(() => page.evaluate(() => CasinoWallet.get())).toBe(n);

  test('Blackjack: double down doubles the bet and takes one card', async ({ page }) => {
    // Player 5+6, dealer 9 (hole 7); double draws 10 → 21; dealer hits 6 → busts
    await blackjackWith(page, [['6','CLUBS'],['10','SPADES'],['7','DIAMONDS'],['9','CLUBS'],['6','HEARTS'],['5','SPADES']]);
    await expect(page.locator('#double-button')).toBeEnabled();
    await expect(page.locator('#split-button')).toBeDisabled();
    await tapCenter(page.locator('#double-button'));
    await expect(page.locator('#result-message')).toHaveText('Dealer busts — you win!');
    await balanceIs(page, 120);
  });

  test('Blackjack: splitting a pair plays two hands', async ({ page }) => {
    // 8+8 vs 10 (hole 7): hand 1 gets 3 then doubles to 21, hand 2 gets 10 and stands on 18
    await blackjackWith(page, [['10','SPADES'],['10','HEARTS'],['3','CLUBS'],['7','DIAMONDS'],['10','CLUBS'],['8','HEARTS'],['8','SPADES']]);
    await expect(page.locator('#split-button')).toBeEnabled();     // after the deal animation
    await tapCenter(page.locator('#split-button'));
    await expect(page.locator('#player-cards .hand-group')).toHaveCount(2);
    await expect(page.locator('.hand-group.active .hand-label')).toContainText('Hand 1');
    await expect(page.locator('#double-button')).toBeEnabled();
    await tapCenter(page.locator('#double-button'));
    await expect(page.locator('.hand-group.active .hand-label')).toContainText('Hand 2');
    await expect(page.locator('#stand-button')).toBeEnabled();
    await tapCenter(page.locator('#stand-button'));
    await expect(page.locator('#result-message')).toHaveText('Hand 1 wins, Hand 2 wins.');
    // 100 − 10 − 10 (split) − 10 (double) + 40 + 20 = 130
    await balanceIs(page, 130);
  });

  test('Blackjack: insurance pays 2:1 against a dealer Blackjack', async ({ page }) => {
    await blackjackWith(page, [['KING','DIAMONDS'],['ACE','SPADES'],['9','CLUBS'],['10','HEARTS']]);
    await expect(page.locator('#insurance-yes')).toBeVisible();
    await expect(page.locator('#insurance-yes')).toHaveText('Insure · $5.00');
    await tapCenter(page.locator('#insurance-yes'));
    await expect(page.locator('#result-message')).toHaveText('Dealer Blackjack. Insurance pays $10.00.');
    await balanceIs(page, 100);    // lose $10, insurance returns $5 + $10
  });

  test('Coin flip: let it ride doubles the pot until you cash out', async ({ page }) => {
    await page.goto('/coinflip/index.html');
    await page.evaluate(() => { CasinoWallet.set(100); localStorage.setItem('casinoProfile', JSON.stringify({ xp: 0 })); });
    await page.locator('#flip-heads').click();            // Math.random is pinned to 0.1 → heads
    await expect(page.locator('#ride-pot')).toHaveText('$10.00');
    await balanceIs(page, 95);
    await page.locator('#flip-heads').click();
    await expect(page.locator('#ride-pot')).toHaveText('$20.00');
    await page.locator('#cash-out').click();
    await balanceIs(page, 115);
    await expect(page.locator('#ride-panel')).toBeHidden();
  });

  test('Lucky Reels: auto-spin runs and stops on its own', async ({ page }) => {
    await page.goto('/slots/index.html');
    await page.evaluate(() => {
      CasinoWallet.set(100);
      let n = 0;   // never a match: each reel's 21st symbol differs
      window.getRandomSymbol = () => ['🍒', '🍋', '🍉'][Math.floor(n++ / 21) % 3];
    });
    await page.locator('.autospin-btn[data-auto="10"]').click();
    await expect(page.locator('#autospin-stop')).toBeHidden({ timeout: 20000 });
    await expect(page.locator('#history-list .history-item')).toHaveCount(10);
    await balanceIs(page, 94);
  });

  test('a hotel high roller opens a high-stakes table', async ({ page }) => {
    await page.goto('/hotel/index.html');
    await page.evaluate(() => { HotelState.setHighRollerFlag(); HotelState.saveNow(); });
    await page.goto('/slots/index.html');
    await expect(page.locator('#hotel-perk-strip')).toContainText('High roller in the house');
    await expect(page.locator('.bet-buttons [data-bet]').last()).toHaveAttribute('data-bet', '12');
    expect(await page.evaluate(() => { const before = CasinoShell.profile.xp; CasinoShell.awardXp(10); return CasinoShell.profile.xp - before; })).toBe(15);
  });

  test('achievements unlock with a toast and are listed', async ({ page }) => {
    await page.goto('/hotel/index.html');
    await page.evaluate(() => {
      HotelState.setGuidanceMode('expert');
      HotelState.addHotelCash(5000);
      HotelState.upgradeDept('casino');
      HotelEngine.checkAchievements(HotelState.get());
      HotelUI.renderAll();
    });
    await expect(page.locator('.shell-toast', { hasText: 'Room Service' })).toBeVisible();
    await expect(page.locator('#hotel-achievements')).toContainText(`1/`);
    await page.locator('.ach-view').click();
    await expect(page.locator('.ach-list .ach-row.done')).toHaveCount(1);
  });

  test('Advance Time shows a phase report card', async ({ page }) => {
    await page.goto('/hotel/index.html');
    await page.evaluate(() => { HotelState.setGuidanceMode('expert'); HotelUI.renderAll(); });
    await page.locator('#advance-time-btn').click();
    await expect(page.locator('.phase-report')).toContainText('Morning report');
    await expect(page.locator('.phase-report')).toContainText('Payroll');
    await page.locator('.phase-report-dismiss').click();
    await expect(page.locator('.phase-report')).toHaveCount(0);
  });

  test('Roulette is locked until the hotel qualifies, then pays out', async ({ page }) => {
    await page.goto('/roulette/index.html');
    await expect(page.locator('#rt-lock')).toBeVisible();

    await page.goto('/hotel/index.html');
    await page.evaluate(() => { const s = HotelState.get(); s.departments.casino.level = 2; s.currencies.reputation = 6; HotelState.saveNow(); });
    await page.goto('/casino.html');
    await expect(page.locator('a.game-card.live[data-game-id="roulette"]')).toHaveAttribute('href', 'roulette/index.html');

    await page.goto('/roulette/index.html');
    await page.evaluate(() => { CasinoWallet.set(100); localStorage.setItem('casinoProfile', JSON.stringify({ xp: 0 })); });
    await page.locator('.rt-chip[data-chip="5"]').click();
    for (const key of ['n17', 'red', 'odd']) await page.locator(`.rt-spot[data-bet="${key}"]`).click();
    await expect(page.locator('#rt-total')).toHaveText('$15.00');
    await page.evaluate(() => { Math.random = () => 17 / 37 + 0.001; });   // lands on 17 (black, odd)
    await page.locator('#rt-spin').click();
    await expect(page.locator('#rt-result')).toContainText('17 black', { timeout: 6000 });
    await balanceIs(page, 100 - 15 + 180 + 10);
  });
});

test.describe('shift hints and grades', () => {
  async function openShift(page, path, dept) {
    await page.goto('/hotel/index.html');
    await page.evaluate((dept) => {
      const s = HotelState.get();
      s.departments[dept].unlocked = true;
      s.departments[dept].level = Math.max(1, s.departments[dept].level);
      HotelState.saveNow();
    }, dept);
    await page.goto(path);
  }

  test('hints are training wheels: on for the first runs, then off unless staff coach', async ({ page }) => {
    await openShift(page, '/hotel/bar/index.html', 'bar');
    await expect(page.locator('.mini-shift-hints')).toContainText('Training hints · 3 runs left');
    const status = await page.evaluate(() => {
      HotelState.get().stats.shiftsByDept = { bar: 3, rooms: 3 };
      return { bar: HotelShiftBriefing.hintStatus('bar'), rooms: HotelShiftBriefing.hintStatus('rooms') };
    });
    expect(status.bar.on).toBe(false);
    expect(status.rooms.on).toBe(true);                  // Guest Rooms starts fully staffed
    expect(status.rooms.reason).toContain('Staff coaching you');
  });

  test('Bar Shift only highlights the order while hints are on', async ({ page }) => {
    await openShift(page, '/hotel/bar/index.html', 'bar');
    await page.locator('#start-shift-btn').click();
    await expect(page.locator('.ingredient-btn.is-order')).toHaveCount(1);   // beer = lager
    await expect(page.locator('#ticket-recipe .recipe-chip')).toHaveCount(1);
    await page.selectOption('[data-shift-hint-mode]', 'off');
    await expect(page.locator('.ingredient-btn.is-order')).toHaveCount(0);
    await expect(page.locator('#ticket-recipe .recipe-chip')).toHaveCount(0);
    await expect(page.locator('.mini-shift-hints')).toContainText('Hints off');
  });

  test('Bar Shift v2: cocktails are built from ingredients, and a wrong glass is a miss', async ({ page }) => {
    await openShift(page, '/hotel/bar/index.html', 'bar');
    const recipes = await page.evaluate(() => Object.fromEntries(BarGame.DRINKS.map(d => [d.id, d.recipe])));
    expect(recipes.martini).toEqual(expect.arrayContaining(['gin', 'vermouth', 'olive']));
    await page.locator('#start-shift-btn').click();
    await expect(page.locator('#ticket-drink')).toContainText('Beer');
    // Wrong: wine instead of lager
    await page.locator('.ingredient-btn[data-ingredient="wine"]').click();
    await expect(page.locator('#glass-contents')).toContainText('Wine');
    await page.locator('#serve-btn').click();
    await expect(page.locator('#shift-log p').first()).toContainText('Lager');
    await expect(page.locator('#served-count')).toHaveText('0');
    // More than one guest at the counter at once
    await expect.poll(() => page.locator('.bar-seat:not(.empty)').count(), { timeout: 8000 }).toBeGreaterThan(1);
  });

  test('Spa Rush v2: two needs per guest, long treatments backfire on impatient guests', async ({ page }) => {
    await openShift(page, '/hotel/spa/index.html', 'spa');
    const tiers = await page.evaluate(() => ({
      both: SpaRush.debugEvaluate('massage', ['stressed', 'sore']).tier,
      one: SpaRush.debugEvaluate('massage', ['stressed', 'tired']).tier,
      none: SpaRush.debugEvaluate('sauna', ['luxury', 'quiet']).tier,
      rushedLong: SpaRush.debugEvaluate('signature', ['stressed', 'sore'], 20).tier,
      rushedShort: SpaRush.debugEvaluate('sauna', ['tired', 'sore'], 20).tier,
    }));
    expect(tiers).toEqual({ both: 'best', one: 'acceptable', none: 'risky', rushedLong: 'acceptable', rushedShort: 'best' });

    await page.locator('#start-spa-btn').click();
    await expect(page.locator('.active-guest-card .need-chip')).toHaveCount(2);
    await expect.poll(() => page.locator('.lounge-guest[data-guest-id]').count(), { timeout: 5000 }).toBeGreaterThan(1);
    await page.locator('.treatment-btn.best-match').click();
    await expect(page.locator('.station-card.busy')).toHaveCount(1);
  });

  test('Spa Rush v2: rooms reset between guests and can be tidied by hand', async ({ page }) => {
    await openShift(page, '/hotel/spa/index.html', 'spa');
    await page.locator('#start-spa-btn').click();
    await page.locator('.treatment-btn.best-match').click();
    // Finish the treatment now instead of waiting for it
    await page.evaluate(() => { SpaRush.debugSession().stations[0].doneAt = Date.now() - 1; });
    await expect(page.locator('.station-card.cleaning')).toHaveCount(1);
    await expect(page.locator('#spa-served')).toHaveText('1');
    await page.keyboard.press('c');
    await expect(page.locator('.station-card.cleaning')).toHaveCount(0);
  });

  test('Spa Rush without hints hides ratings but keeps the treatment menu', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('hotelShiftHints', 'off'));
    await openShift(page, '/hotel/spa/index.html', 'spa');
    await page.locator('#start-spa-btn').click();
    await expect(page.locator('.active-guest-card .need-chip')).toHaveCount(2);
    await expect(page.locator('.treatment-btn.best-match')).toHaveCount(0);
    await expect(page.locator('.treatment-covers')).toHaveCount(0);
    await page.locator('#spa-menu-btn').click();
    await expect(page.locator('.spa-menu li')).toHaveCount(6);
  });

  test('Floor Ops without hints: pick the room, then the staff member', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('hotelShiftHints', 'off'));
    await openShift(page, '/hotel/rooms/index.html', 'rooms');
    await page.locator('#start-ops-btn').click();
    const room = page.locator('[data-request-id]').first();
    await expect(room).toBeVisible({ timeout: 10000 });
    await room.click();
    await expect(page.locator('.staff-card.busy')).toHaveCount(0);
    await expect(page.locator('.staff-fit-label')).toHaveCount(0);
    await page.locator('.staff-card:not(.busy)').first().click();
    await expect(page.locator('.staff-card.busy')).toHaveCount(1);
  });

  test('Check-In without hints hides room match badges', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('hotelShiftHints', 'off'));
    await page.goto('/hotel/checkin/index.html');
    await page.locator('#ci-start-btn').click();
    await expect(page.locator('.ci-room-tile').first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.ci-room-tile .match-badge')).toHaveCount(0);
  });

  test('runs are graded and personal bests are kept', async ({ page }) => {
    await openShift(page, '/hotel/bar/index.html', 'bar');
    const runs = await page.evaluate(() => {
      const first = HotelShiftBriefing.finishRun('bar', 78);
      const second = HotelShiftBriefing.finishRun('bar', 62);
      const third = HotelShiftBriefing.finishRun('bar', 93);
      return [first, second, third].map(r => ({ letter: r.letter, stars: r.stars, isNewBest: r.isNewBest }));
    });
    expect(runs).toEqual([
      { letter: 'A', stars: 2, isNewBest: true },
      { letter: 'B', stars: 1, isNewBest: false },
      { letter: 'S', stars: 3, isNewBest: true },
    ]);
    expect(await page.evaluate(() => HotelState.getShiftBest('bar'))).toMatchObject({ letter: 'S', score: 93 });
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
  // Instant tweens keep slot spins fast in tests.
  await page.route(/\/vendor\/gsap-[^/]*\.min\.js/, (route) => {
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
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function tapCenter(locator) {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  if (!box) throw new Error('Cannot tap an element without a bounding box.');
  await locator.page().mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

test.describe('linked shifts', () => {
  async function seedHotel(page, fn, arg) {
    await page.goto('/hotel/index.html');
    await page.evaluate(([fnSrc, arg]) => {
      const s = HotelState.get();
      ['rooms', 'lobby', 'bar', 'spa'].forEach(d => {
        s.departments[d].unlocked = true;
        s.departments[d].level = Math.max(1, s.departments[d].level);
      });
      new Function('arg', fnSrc)(arg);
      HotelState.saveNow();
    }, [fn, arg]);
  }

  test('Floor Ops: escalated cleaning leaves dirty rooms, and old ones come back as resets', async ({ page }) => {
    await seedHotel(page, 'HotelState.addDirtyRooms(arg)', 2);
    await page.goto('/hotel/rooms/index.html');
    await expect(page.locator('#ops-next-step')).toContainText('clean 2 dirty rooms');
    await page.locator('#start-ops-btn').click();
    await expect(page.locator('#room-grid')).toContainText('Dirty Room Reset');
    // Expire everything: the 2 backlog resets stay dirty, a fresh housekeeping request adds one
    await page.evaluate(() => {
      const shift = RoomsGame.debugShift();
      const fresh = shift.rooms.map(r => r.request).find(r => r && !r.backlog);
      fresh.type = 'housekeeping';
      shift.rooms.forEach(r => { if (r.request?.status === 'waiting') r.request.patienceEnd = Date.now() - 1; });
      shift.endsAt = Date.now() + 400;
    });
    await expect(page.locator('#ops-results')).toBeVisible();
    expect(await page.evaluate(() => HotelState.getDirtyRooms())).toBe(3);
    await expect(page.locator('#ops-dirty-note')).toContainText('3 dirty rooms carried over');
  });

  test('Check-In: dirty rooms are blocked until housekeeping cleans them', async ({ page }) => {
    await seedHotel(page, 'HotelState.addDirtyRooms(arg)', 3);
    await page.goto('/hotel/checkin/index.html');
    await expect(page.locator('#diff-card')).toContainText('3 dirty rooms');
    await page.locator('#ci-start-btn').click();
    await expect(page.locator('.ci-room-tile.dirty')).toHaveCount(3, { timeout: 6000 });
    await expect(page.locator('#room-count')).toContainText('3 dirty');
    const dirty = page.locator('.ci-room-tile.dirty').first();
    await dirty.click();
    await expect(page.locator('#ci-confirm-btn')).toBeDisabled();          // can't assign it
    await expect(page.locator('.ci-room-tile.dirty.cleaning')).toHaveCount(1);
    await expect(page.locator('#ci-next-step')).toContainText('Housekeeping is cleaning');
    await expect(page.locator('.ci-room-tile.dirty')).toHaveCount(2, { timeout: 6000 });
  });

  test('Bar Shift: a pleased high roller stays longer at the casino', async ({ page }) => {
    await seedHotel(page, 'HotelState.setHighRollerFlag()');
    await page.goto('/hotel/bar/index.html');
    await expect(page.locator('#shift-log')).toContainText('high roller');
    const before = await page.evaluate(() => HotelState.get().guests.highRollerUntil);
    await page.locator('#start-shift-btn').click();
    await page.evaluate(() => { const s = BarGame.debugShift(); s.highRollerDue = s.spawned; s.nextArrival = 0; });
    const seat = page.locator('.bar-seat.high-roller');
    await expect(seat).toBeVisible({ timeout: 5000 });
    await seat.click();
    await page.evaluate(() => {
      const s = BarGame.debugShift();
      s.seats[s.selected].drink.recipe.forEach(id => document.querySelector(`.ingredient-btn[data-ingredient="${id}"]`).click());
      document.getElementById('serve-btn').click();
    });
    await expect(page.locator('#shift-log')).toContainText('will stay longer');
    const after = await page.evaluate(() => HotelState.get().guests.highRollerUntil);
    expect(after - before).toBeGreaterThanOrEqual(14 * 60_000);
  });

  test('Spa Rush: a high roller who walks out checks out of the hotel', async ({ page }) => {
    await seedHotel(page, 'HotelState.setHighRollerFlag()');
    await page.goto('/hotel/spa/index.html');
    await page.locator('#start-spa-btn').click();
    await page.evaluate(() => { const s = SpaRush.debugSession(); s.highRollerDue = s.spawned; s.nextArrival = 0; });
    await expect(page.locator('.lounge-guest.high-roller')).toBeVisible({ timeout: 5000 });
    await page.evaluate(() => {
      SpaRush.debugSession().guests.find(g => g.highRoller).patienceEnd = Date.now() - 1;
    });
    await expect(page.locator('#spa-log')).toContainText('checked out early');
    expect(await page.evaluate(() => HotelState.highRollerInHouse())).toBe(false);
  });
});

test.describe('calendar twists', () => {
  test('the calendar picks one twist per shift, and day 1 stays plain', async ({ page }) => {
    await page.goto('/hotel/index.html');
    const picks = await page.evaluate(() => {
      const s = HotelState.get();
      const at = (day, weekday, phase) => {
        Object.assign(s.calendar, { day, weekday, phase });
        return Object.fromEntries(['bar', 'restaurant', 'spa', 'rooms', 'lobby'].map(d => [d, HotelTwists.active(d, s)?.id ?? null]));
      };
      const out = {
        dayOne: at(1, 0, 'evening'),
        mondayEvening: at(2, 0, 'evening'),
        saturdayMorning: at(6, 5, 'morning'),
        mondayAfternoon: at(8, 0, 'afternoon'),
        fridayEvening: at(5, 4, 'evening'),
      };
      // A show on right now turns the bar into a show-night crowd
      at(9, 1, 'evening');
      s.entertainment.schedule.bookings.push({ id: 't', label: 'Jazz Night', dateKey: HotelEngine.calendarDayKey(s), phase: 'evening', effects: {} });
      out.showNight = HotelTwists.active('bar', s)?.id;
      out.showDinner = HotelTwists.active('restaurant', s)?.id;
      return out;
    });
    expect(picks.dayOne).toEqual({ bar: null, restaurant: null, spa: null, rooms: null, lobby: null });
    expect(picks.mondayEvening).toMatchObject({ bar: 'happyHour', spa: 'executiveUnwind', restaurant: null, rooms: null });
    expect(picks.saturdayMorning).toMatchObject({ restaurant: 'weddingParty', spa: 'morningAfter', rooms: 'checkoutRush', bar: null });
    expect(picks.mondayAfternoon).toMatchObject({ lobby: 'conference' });
    expect(picks.fridayEvening).toMatchObject({ lobby: 'fridayArrivals', bar: 'happyHour' });
    expect(picks.showNight).toBe('showNightBar');
    expect(picks.showDinner).toBe('showNightDining');
  });

  test('Happy Hour: the bar briefing shows the twist and the shift has more guests', async ({ page }) => {
    await page.goto('/hotel/index.html');
    await page.evaluate(() => {
      const s = HotelState.get();
      s.departments.bar.unlocked = true;
      s.departments.bar.level = 1;
      Object.assign(s.calendar, { day: 2, weekday: 0, phase: 'evening' });
      HotelState.saveNow();
    });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect.poll(() => page.evaluate(() => document.body.textContent.includes('Happy Hour now'))).toBe(true);
    await page.goto('/hotel/bar/index.html');
    await expect(page.locator('.mini-shift-twist')).toContainText('Happy Hour');
    await page.locator('#start-shift-btn').click();
    await expect(page.locator('#served-target')).toHaveText('7');     // 5 at bar level 1, +2 for Happy Hour
    await expect(page.locator('#shift-log')).toContainText('Happy Hour');
  });

  test('Wedding Party: a big table arrives mid-service and pays 2.5x', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('hotelTwistForce', 'weddingParty'));
    await page.goto('/hotel/index.html');
    await page.evaluate(() => {
      const s = HotelState.get();
      s.departments.restaurant.unlocked = true;
      s.departments.restaurant.level = 2;
      HotelState.saveNow();
    });
    await page.goto('/hotel/restaurant/index.html');
    await page.locator('#start-tasting-btn').click();
    await expect(page.locator('#tables-target')).toHaveText('6');      // 5 at level 2, +1 for the wedding
    for (let table = 0; table < 3; table++) {
      await expect(page.locator('#table-persona')).not.toContainText('Wedding');
      for (let i = 0; i < 3; i++) await page.locator('.dish-card:not([disabled])').first().click();
      await page.locator('#fire-course-btn').click();
      await expect(page.locator('#table-number')).toHaveText(`Table ${table + 2}`, { timeout: 4000 });
    }
    await expect(page.locator('#table-persona')).toContainText('Wedding Party');
    await expect(page.locator('#tasting-log')).toContainText('pays 2.5×');
  });

  test('Morning After: every spa guest needs recovery', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('hotelTwistForce', 'morningAfter'));
    await page.goto('/hotel/index.html');
    await page.evaluate(() => {
      const s = HotelState.get();
      s.departments.spa.unlocked = true;
      s.departments.spa.level = 3;
      HotelState.saveNow();
    });
    await page.goto('/hotel/spa/index.html');
    await page.locator('#start-spa-btn').click();
    await expect.poll(() => page.evaluate(() => SpaRush.debugSession().guests.length), { timeout: 5000 }).toBeGreaterThan(1);
    const needs = await page.evaluate(() => SpaRush.debugSession().guests.map(g => g.needs));
    needs.forEach(pair => expect(pair).toContain('tired'));
  });
});
