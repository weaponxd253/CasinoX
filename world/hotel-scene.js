import { HOTEL } from './hotel-config.js';
import { ExplorableScene } from './explorable-scene.js';

export class HotelScene extends ExplorableScene {
  constructor(host) { super('HotelInterior', host, { ...HOTEL, label: 'Hotel Interior' }); }

  drawRoom() {
    const g = this.add.graphics();
    g.fillStyle(0x24383c).fillRect(0, 0, HOTEL.width, HOTEL.height);
    g.fillStyle(0x344b4d).fillRoundedRect(54, 54, 852, 492, 12);
    for (const rect of HOTEL.solids) {
      g.fillStyle(0x182a30).fillRect(rect.x - rect.width / 2, rect.y - rect.height / 2, rect.width, rect.height);
      g.lineStyle(2, 0xa28251).strokeRect(rect.x - rect.width / 2, rect.y - rect.height / 2, rect.width, rect.height);
    }
    const text = (x, y, value, size = 18) => this.add.text(x, y, value, {
      fontFamily: 'Georgia, serif', fontSize: size, color: '#e9ce98', align: 'center',
    }).setOrigin(0.5);
    text(480, 85, 'HOTEL INTERIOR', 28);
    text(480, 180, 'HOTEL DIRECTORY', 15);
    text(260, 280, 'SEATING', 16);
    text(700, 280, 'SEATING', 16);
    text(480, 365, 'A quiet place to explore.\nGuest rooms and services are planned.', 17);
    text(480, 525, 'E · CENTRAL LOBBY', 15);
    this.halos = new Map([
      ['directory', this.add.rectangle(480, 180, 196, 76).setStrokeStyle(2, 0xf0d699).setVisible(false)],
      ['hotel-lobby', this.add.rectangle(480, 525, 230, 48).setStrokeStyle(2, 0xf0d699).setVisible(false)],
    ]);
  }
}
