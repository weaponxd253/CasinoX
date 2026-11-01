const { test, expect } = require('@playwright/test');
const { openCasino, launchGame, closeGame, balance, auditWrites, moneyWrites } = require('./helpers/casino-world');
for(const [name,finals,payout]of [
  ['loss',['🍒','🍋','🍉'],0],
  ['bet-back pair',['🍒','🍒','🍉'],.6],
  ['winning pair',['🍋','🍋','🍉'],.9],
  ['jackpot',['💰','💰','💰'],30],
])test(`existing Slots ${name} uses the original calculation and credits only once`,async({page})=>{
 test.setTimeout(45000);await auditWrites(page);await openCasino(page);const {frame}=await launchGame(page,'slot-3');
 await frame.locator('body').evaluate((_,finals)=>{let n=0;window.getRandomSymbol=()=>finals[Math.floor(n++/21)%3];},finals);
 await frame.locator('.spin-button').click();await expect(frame.locator('#history-list .history-item')).toHaveCount(1,{timeout:6000});
 await expect.poll(()=>balance(page)).toBe(Number((249.65+payout).toFixed(2)));await closeGame(page);
 expect((await moneyWrites(page)).map(w=>w.value)).toEqual(payout?['249.65',String(Number((249.65+payout).toFixed(2)))]:['249.65']);
});
