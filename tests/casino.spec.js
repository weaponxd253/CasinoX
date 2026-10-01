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
      const btn = document.querySelector('.drink-btn[data-drink="beer"]');
      btn.click(); btn.click(); btn.click();
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
    '/hotel/restaurant/index.html', '/hotel/checkin/index.html', '/hotel/entertainment/index.html'];

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
  const box = await locator.boundingBox();
  if (!box) throw new Error('Cannot tap an element without a bounding box.');
  await locator.page().mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}
