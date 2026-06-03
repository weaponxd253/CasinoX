/* ============================================================
   CHECK-IN RUSH — game.js PATCH FILE
   ------------------------------------------------------------
   Only two functions change in your check-in game.
   Apply each block to your existing game.js.
   ============================================================ */


/* ── PATCH 1 ────────────────────────────────────────────────
   ANCHOR: function confirmCheckIn() { ...
   The existing function commits to HotelGuestPool and updates
   the HUD. Replace the entire function with this version,
   which ALSO writes the guest to the persistent roster.       */

  function confirmCheckIn() {
    if (!activeGuest || !selectedRoom || phase !== 'active') return;

    const room = rooms.find(r => r.id === selectedRoom);
    if (!room || room.occupied) return;

    const match = _computeMatch(activeGuest, room);
    room.occupied = true;

    // Record result (in-session)
    results.push({
      guest:    activeGuest,
      room,
      match,
      outcome:  'checked_in',
      income:   activeGuest.totalIncome,
    });

    // Commit to the transient guest pool (existing behavior)
    HotelGuestPool.commitGuest({ ...activeGuest, roomAssigned: room.number });

    // ── NEW: write to the persistent roster (Phase 2B foundation) ──
    if (typeof HotelState.addGuestToRoster === 'function') {
      HotelState.addGuestToRoster({
        id:           activeGuest.id,
        type:         activeGuest.type,
        name:         activeGuest.name,
        lastName:     activeGuest.lastName,
        flagEmoji:    activeGuest.flagEmoji,
        origin:       activeGuest.origin,
        roomAssigned: room.number,
        roomType:     room.type,
        partySize:    activeGuest.partySize ?? 1,
        preferences:  activeGuest.preferences ?? [],
        matchQuality: match.quality,
        isReturning:  activeGuest.isReturning,
        totalIncome:  activeGuest.totalIncome,
        incomePerMin: activeGuest.incomePerMin,
        source:       'checkin_game',
      });
    }

    // Sound & visual feedback
    if (match.quality === 'perfect') {
      CasinoShell.sound.win();
      _flashDesk('perfect');
    } else if (match.quality === 'good') {
      CasinoShell.sound.tone(660, 'sine', 0.12, 0.35);
      _flashDesk('good');
    } else {
      CasinoShell.sound.tone(440, 'sine', 0.08, 0.25);
      _flashDesk('ok');
    }

    _updateHUDCounters();
    nextGuest();
  }


/* ── PATCH 2 ────────────────────────────────────────────────
   ANCHOR: function endSession() { ...
   The existing function tallies results, awards cash and
   satisfaction, then renders the results overlay. Add the
   boost application right after the satisfaction write.

   Find the block:

       if (cashBonus > 0) HotelState.addHotelCash(cashBonus);
       if (satBoost  > 0) {
         const state = HotelState.get();
         const newSat = Math.min(100, state.satisfaction.current + satBoost);
         HotelState.setSatisfaction(newSat);
       }

   And add THIS immediately after that block:                  */

    // ── NEW: word-of-mouth boost ─────────────────────────────
    // Each successful check-in becomes an extra arrival opportunity
    // for the idle tick model over the next several minutes.
    // The boost is capped inside HotelState (CHECK_IN_BOOST_CAP).
    if (checkedIn.length > 0 && typeof HotelState.applyCheckInBoost === 'function') {
      HotelState.applyCheckInBoost(checkedIn.length);
    }
    // ─────────────────────────────────────────────────────────


/* ── That's it. Nothing else in game.js needs to change. ──── */
