import { walkable as lobbyWalkable } from './lobby-config.js';
import { MAIN_PORTALS, walkable as mainWalkable } from './main-casino-layout.js';
import { ROOM } from '../floor/room-config.js';
import { HOTEL } from './hotel-config.js';
import { clearOf } from './collision-geometry.js';

export const WORLD_ROOMS = Object.freeze({
  CentralLobby:{label:'Central Lobby',parent:null,help:'Visit reception, the casino, the manager’s office or the hotel entrance.'},
  MainCasinoFloor:{label:'Main Casino Floor',parent:'CentralLobby',help:'Explore the casino floor. North to the Blackjack Lounge; south to the Central Lobby.'},
  CasinoRoom:{label:'Blackjack Lounge',parent:'MainCasinoFloor',help:'Approach the blackjack table, or walk south to return to the Main Casino Floor.'},
  HotelInterior:{label:'Hotel Interior',parent:'CentralLobby',help:'Explore the hotel preview. Read the directory, or return south to the lobby.'},
});
export const ROOM_ROUTES = Object.freeze([
  {from:'CentralLobby',portal:'casino',to:'MainCasinoFloor',entry:'south',label:'Enter Main Casino Floor'},
  {from:'MainCasinoFloor',portal:'main-south',to:'CentralLobby',entry:'checkpoint',label:'Return to Central Lobby'},
  {from:'MainCasinoFloor',portal:'main-north',to:'CasinoRoom',entry:'south',label:'Enter Blackjack Lounge'},
  {from:'CasinoRoom',portal:'lobby',to:'MainCasinoFloor',entry:'north',label:'Return to Main Casino Floor'},
  {from:'CentralLobby',portal:'hotel',to:'HotelInterior',entry:'south',label:'Enter hotel interior'},
  {from:'HotelInterior',portal:'hotel-lobby',to:'CentralLobby',entry:'checkpoint',label:'Return to Central Lobby'},
]);
export const routeFor = (from,portal) => ROOM_ROUTES.find(r=>r.from===from&&r.portal===portal)??null;
export const backRoute = from => ROOM_ROUTES.find(r=>r.from===from&&r.to===WORLD_ROOMS[from]?.parent)??null;
export function validRoomPosition(key,p) {
  if(!p||!['up','down','left','right'].includes(p.facing))return false;
  if(key==='CentralLobby')return lobbyWalkable(p);
  if(key==='MainCasinoFloor')return mainWalkable(p);
  const config=key==='CasinoRoom'?ROOM:key==='HotelInterior'?HOTEL:null;
  return Boolean(config&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.x>=14&&p.x<=946&&p.y>=14&&p.y<=586&&clearOf(p,config.solids,14));
}
export function routeEntry(route,checkpoint,remembered) {
  if(!ROOM_ROUTES.includes(route))throw Error('Unknown room connection.');
  let p=route.to==='CentralLobby'?{...checkpoint}:route.to==='MainCasinoFloor'?{...MAIN_PORTALS[route.entry].spawn}
    :route.to==='CasinoRoom'?{...ROOM.spawn,facing:'up'}:{...HOTEL.spawn,facing:HOTEL.spawn.facing??'up'};
  // Retain established interior pose memory, except a lounge pose in its exit
  // volume must use the safe south spawn instead of landing back in the door.
  if(remembered&&(route.to==='HotelInterior'||(route.to==='CasinoRoom'&&Math.hypot(remembered.x-ROOM.exit.x,remembered.y-ROOM.exit.y)>ROOM.exit.reach)))p={...remembered};
  if(!validRoomPosition(route.to,p))throw Error('Room arrival position is obstructed.');
  return p;
}
