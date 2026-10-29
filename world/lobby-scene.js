import { LOBBY } from './lobby-config.js';
import { ExplorableScene } from './explorable-scene.js';
import { LOBBY_ART, LOBBY_FOREGROUNDS, LOBBY_INTERACTIONS, toWorld } from './lobby-layout.js';

const imageUrl = new URL('./assets/lobby/central-lobby.png', import.meta.url).href;

export class LobbyScene extends ExplorableScene {
  constructor(host, spawn) {
    super('CentralLobby', host, { ...LOBBY, label: 'Central Lobby' }, spawn);
  }

  preload() {
    super.preload();
    this.load.image(LOBBY_ART.key, imageUrl, { timeout: 5000 });
  }

  create() {
    if (this.host.hasFailed()) {
      this.events.once('create', () => this.game.scene.pause(this));
      return;
    }
    const texture = this.textures.exists(LOBBY_ART.key) && this.textures.get(LOBBY_ART.key);
    const source = texture && texture.getSourceImage();
    if (!source || source.width !== 1536 || source.height !== 1024) {
      this.host.onError(new Error('Central Lobby artwork could not load or has invalid dimensions. Your world save has not been changed.'));
      return;
    }
    texture.setFilter(window.Phaser.Textures.FilterMode.NEAREST);
    super.create();
    this.drawCollisions = () => {
      if (!this.collisionOverlay.visible) return;
      const g = this.collisionOverlay.clear();
      for (const shape of LOBBY.solids) {
        g.fillStyle(0xff5268, 0.3).lineStyle(1, 0xff6375, 0.85);
        if (shape.radius !== undefined) g.fillCircle(shape.x, shape.y, shape.radius).strokeCircle(shape.x, shape.y, shape.radius);
        else g.fillRect(shape.x - shape.width / 2, shape.y - shape.height / 2, shape.width, shape.height);
      }
      g.lineStyle(2, 0x5de8ed, 1);
      for (const target of Object.values(LOBBY_INTERACTIONS)) {
        g.strokeRoundedRect(target.x - target.width / 2 - target.reach, target.y - target.height / 2 - target.reach,
          target.width + target.reach * 2, target.height + target.reach * 2, target.reach);
      }
      g.lineStyle(2, 0xffffff).strokeCircle(this.player.x, this.player.y, 14);
    };
    this.events.on('postupdate', this.drawCollisions);
    this.events.once('shutdown', () => this.events.off('postupdate', this.drawCollisions));
  }

  drawRoom() {
    this.add.rectangle(480, 300, 960, 600, 0x000000);
    const image = () => this.add.image(LOBBY_ART.x, LOBBY_ART.y, LOBBY_ART.key)
      .setOrigin(0).setDisplaySize(LOBBY_ART.width, LOBBY_ART.height);
    this.background = image().setDepth(0);
    this.foregrounds = LOBBY_FOREGROUNDS.map(definition => {
      const graphics = this.make.graphics({ x: 0, y: 0 }, false);
      graphics.fillStyle(0xffffff).fillPoints(definition.points.map(([x, y]) => toWorld(x, y)), true);
      const mask = graphics.createGeometryMask();
      const foreground = image().setMask(mask).setDepth(5);
      this.events.once('shutdown', () => { mask.destroy(); graphics.destroy(); });
      return { foreground, baseline: toWorld(0, definition.baseline).y };
    });
    this.halos = new Map(Object.entries(LOBBY_INTERACTIONS).map(([id, target]) => [id,
      this.add.rectangle(target.x, target.y, target.width + 8, target.height + 8)
        .setStrokeStyle(2, 0xf0d699, 0.9).setDepth(25).setVisible(false),
    ]));
    this.collisionOverlay = this.add.graphics().setDepth(100)
      .setVisible(new URLSearchParams(location.search).has('collisions'));
  }

  toggleCollisions() { this.collisionOverlay.setVisible(!this.collisionOverlay.visible); this.drawCollisions(); }

  update() {
    if (!this.owner) return;
    super.update();
    for (const layer of this.foregrounds) layer.foreground.setDepth(this.player.y + 14 < layer.baseline ? 20 : 5);
  }
}
