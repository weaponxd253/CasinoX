const contexts = values => Object.freeze(Object.fromEntries(Object.entries(values).map(([key, lines]) => [key, Object.freeze(lines)])));
export const GUEST_DIALOGUE_LINES = Object.freeze({
  relaxed: contexts({
    entering: ['Nice place. I like the atmosphere.', 'Now this is a beautiful place.'],
    waiting: ["No rush. I'll wait.", 'A moment to take it all in.'],
    casino: ["I'll have a look around.", 'Quite an inviting entrance.'],
    relaxing: ['I could stay here all afternoon.', 'What a lovely place to unwind.'],
    departing: ['That was a pleasant visit.', 'Time for a leisurely stroll.'],
  }),
  excited: contexts({
    entering: ['Wow, look at this lobby!', 'This place has everything!'],
    waiting: ['So much to explore!', "I can't wait to look around."],
    casino: ["I can't wait to see the casino!", 'Time to take a look inside!'],
    relaxing: ['Look at that fountain!', 'What a beautiful spot!'],
    departing: ["I'll definitely be back!", 'What a place!'],
  }),
  reserved: contexts({
    entering: ["Let's see where everything is.", 'Quite an impressive resort.'],
    waiting: ["I'll wait here.", 'An impressive lobby.'],
    casino: ["I'll take a look around.", 'This way, then.'],
    relaxing: ['A quiet moment.', 'A pleasant corner.'],
    departing: ['Time to head out.', 'On my way.'],
  }),
  impatient: contexts({
    entering: ["Let's get going.", 'Now, where to first?'],
    waiting: ['Hopefully the line moves soon.', "I'll be ready when it's my turn."],
    casino: ["Let's take a look inside.", 'Nearly there.'],
    relaxing: ['A quick breather.', 'Time to get moving soon.'],
    departing: ['Time to be on my way.', 'Off I go.'],
  }),
  discerning: contexts({
    entering: ['The attention to detail is impressive.', 'Beautiful interior design.'],
    waiting: ['A thoughtfully designed lobby.', 'The lighting is quite elegant.'],
    casino: ["Let's see what the gaming floor offers.", 'An elegant entrance.'],
    relaxing: ['The craftsmanship is lovely.', 'A well-chosen place to pause.'],
    departing: ['A memorable setting.', 'Quite a distinctive resort.'],
  }),
});

// General opinions only: satisfaction cannot establish a particular room,
// elevator, cleanliness or service incident. Tone remains personality-specific.
export const GUEST_SATISFACTION_LINES = Object.freeze({
  low: contexts({
    relaxed: ["I'm hoping the stay gets better.", 'A little more warmth would be welcome.'],
    excited: ['I was hoping for a little more sparkle.', "Come on, there's still time to impress me!"],
    reserved: ['The experience could be better.', "I'll reserve my judgment for now."],
    impatient: ["I'm ready for things to improve.", "Let's hope the rest feels better."],
    discerning: ['There is room to improve the experience.', 'I expected a more polished experience.'],
  }),
  high: contexts({
    relaxed: ['This is turning into a lovely stay.', 'I feel quite at home here.'],
    excited: ['This resort has won me over!', 'What a wonderful experience!'],
    reserved: ['A very pleasant experience so far.', 'The resort makes a good impression.'],
    impatient: ["Good impressions. Let's keep moving.", "A fine experience. What's next?"],
    discerning: ['The experience lives up to the setting.', 'A pleasing standard throughout.'],
  }),
});

export function guestDialogueLines(personality, context, mood = null) {
  if (!GUEST_DIALOGUE_LINES[personality]?.[context]) return null;
  return GUEST_SATISFACTION_LINES[mood]?.[personality] ?? GUEST_DIALOGUE_LINES[personality][context];
}

export const GUEST_DIALOGUE_CONFIG = Object.freeze({
  maxVisible: 1, minDurationMs: 3000, maxDurationMs: 4000,
  minCooldownMs: 30000, maxCooldownMs: 60000, minGlobalGapMs: 9000, maxGlobalGapMs: 15000,
  minInitialMs: 2000, maxInitialMs: 5000, minCheckMs: 6000, maxCheckMs: 10000,
  minContextMs: 1000, maxContextMs: 3000, arrivalContextMs: 8000,
  walkingChanceMultiplier: .12, historyLimit: 64,
});

export function dialogueConfig(overrides = {}) {
  const c = { ...GUEST_DIALOGUE_CONFIG, ...overrides };
  for (const stem of ['Duration', 'Cooldown', 'GlobalGap', 'Initial', 'Check', 'Context']) {
    const low = c[`min${stem}Ms`], high = c[`max${stem}Ms`];
    if (!Number.isFinite(low) || !Number.isFinite(high) || low < 0 || low > high
      || (stem === 'Duration' && low === 0)) throw new Error(`Invalid dialogue ${stem} range`);
  }
  if (!Number.isInteger(c.maxVisible) || c.maxVisible < 1 || !Number.isInteger(c.historyLimit) || c.historyLimit < 1
    || !Number.isFinite(c.arrivalContextMs) || c.arrivalContextMs < 0
    || !Number.isFinite(c.walkingChanceMultiplier) || c.walkingChanceMultiplier < 0 || c.walkingChanceMultiplier > 1) {
    throw new Error('Invalid guest dialogue settings');
  }
  c.maxVisible = Math.min(2, c.maxVisible);
  return c;
}
