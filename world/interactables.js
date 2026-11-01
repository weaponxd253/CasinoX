import { LOBBY } from './lobby-config.js';
import { ROOM } from '../floor/room-config.js';
import { HOTEL } from './hotel-config.js';
import { LOBBY_INTERACTIONS } from './lobby-layout.js';
import { MAIN_PORTALS } from './main-casino-layout.js';
import { ATTRACTION_INTERACTIONS } from './casino-attractions.js';

// Presentation/navigation definitions only. Availability never unlocks a department.
export const INTERACTABLES = [
  ...ATTRACTION_INTERACTIONS,
  { id:'main-south',scene:'MainCasinoFloor',position:MAIN_PORTALS.south,radius:MAIN_PORTALS.south.reach,label:'Return to Central Lobby',availability:true,action:{type:'return'} },
  { id:'main-north',scene:'MainCasinoFloor',position:MAIN_PORTALS.north,radius:MAIN_PORTALS.north.reach,label:'Enter Blackjack Lounge',availability:true,action:{type:'door',destination:'CasinoRoom'} },
  { id: 'casino', scene: 'CentralLobby', position: LOBBY.entrance, radius: LOBBY.entrance.reach,
    label: 'Enter Main Casino Floor', availability: true, action: { type: 'door', destination: 'MainCasinoFloor' } },
  { id: 'receptionist', scene: 'CentralLobby', position: LOBBY_INTERACTIONS.receptionist, radius: LOBBY_INTERACTIONS.receptionist.reach,
    label: 'Talk to receptionist', availability: true, action: { type: 'dialogue', conversation: 'reception' } },
  { id: 'office', scene: 'CentralLobby', position: LOBBY_INTERACTIONS.office, radius: LOBBY_INTERACTIONS.office.reach,
    label: "Open manager’s office", availability: true, action: { type: 'management' } },
  { id: 'hotel', scene: 'CentralLobby', position: LOBBY_INTERACTIONS.hotel, radius: LOBBY_INTERACTIONS.hotel.reach,
    label: 'Enter hotel interior', availability: true, action: { type: 'door', destination: 'HotelInterior' } },
  { id: 'blackjack', scene: 'CasinoRoom', position: ROOM.table, radius: ROOM.table.reach,
    label: 'Play blackjack', availability: true, action: { type: 'blackjack' } },
  { id: 'lobby', scene: 'CasinoRoom', position: ROOM.exit, radius: ROOM.exit.reach,
    label: 'Return to Central Lobby', availability: context => context.canReturn,
    action: { type: 'return' } },
  { id: 'hotel-lobby', scene: 'HotelInterior', position: HOTEL.exit, radius: 44,
    label: 'Return to Central Lobby', availability: true, action: { type: 'return' } },
  { id: 'directory', scene: 'HotelInterior', position: HOTEL.directory, radius: 65,
    label: 'Read hotel directory', availability: true, action: { type: 'dialogue', conversation: 'directory' } },
];
