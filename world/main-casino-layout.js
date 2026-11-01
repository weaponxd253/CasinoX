import { clearOf, polygonStrips } from './collision-geometry.js';
export const MAIN_ART = Object.freeze({ key:'main-casino-floor', sourceWidth:1536, sourceHeight:1024, x:30, y:0, width:900, height:600, scale:75/128 });
export const toWorld = (x,y) => ({ x:30+x*MAIN_ART.scale, y:y*MAIN_ART.scale });
export const SOURCE_SOLIDS = [
  {
    "id": "north-west",
    "kind": "rect",
    "bounds": [
      0,
      0,
      688,
      214
    ]
  },
  {
    "id": "north-east",
    "kind": "rect",
    "bounds": [
      848,
      0,
      1536,
      214
    ]
  },
  {
    "id": "west-wall",
    "kind": "rect",
    "bounds": [
      0,
      214,
      65,
      666
    ]
  },
  {
    "id": "east-wall",
    "kind": "rect",
    "bounds": [
      1471,
      214,
      1536,
      666
    ]
  },
  {
    "id": "south-west-wing",
    "kind": "rect",
    "bounds": [
      0,
      820,
      280,
      1024
    ]
  },
  {
    "id": "south-east-wing",
    "kind": "rect",
    "bounds": [
      1256,
      820,
      1536,
      1024
    ]
  },
  {
    "id": "south-west-bed",
    "kind": "rect",
    "bounds": [
      474,
      880,
      650,
      1024
    ]
  },
  {
    "id": "south-east-bed",
    "kind": "rect",
    "bounds": [
      886,
      880,
      1062,
      1024
    ]
  },
  {
    "id": "west-stair-end",
    "kind": "rect",
    "bounds": [
      280,
      980,
      650,
      1024
    ]
  },
  {
    "id": "east-stair-end",
    "kind": "rect",
    "bounds": [
      886,
      980,
      1256,
      1024
    ]
  },
  {
    "id": "south-west-pillar",
    "kind": "rect",
    "bounds": [
      578,
      824,
      640,
      980
    ]
  },
  {
    "id": "south-east-pillar",
    "kind": "rect",
    "bounds": [
      896,
      824,
      958,
      980
    ]
  },
  {
    "id": "mid-west-pillar",
    "kind": "rect",
    "bounds": [
      616,
      446,
      664,
      550
    ]
  },
  {
    "id": "mid-east-pillar",
    "kind": "rect",
    "bounds": [
      872,
      446,
      920,
      550
    ]
  },
  {
    "id": "roulette-east-lamp",
    "kind": "rect",
    "bounds": [
      528,
      560,
      570,
      666
    ]
  },
  {
    "id": "west-low-furniture",
    "kind": "rect",
    "bounds": [
      112,
      696,
      264,
      820
    ]
  },
  {
    "id": "east-low-furniture",
    "kind": "rect",
    "bounds": [
      1336,
      696,
      1438,
      820
    ]
  },
  {
    "id": "roulette",
    "kind": "polygon",
    "points": [
      [
        128,
        368
      ],
      [
        446,
        368
      ],
      [
        481,
        396
      ],
      [
        486,
        452
      ],
      [
        448,
        488
      ],
      [
        150,
        488
      ],
      [
        106,
        453
      ],
      [
        106,
        410
      ]
    ]
  },
  {
    "id": "coin-kiosk",
    "kind": "polygon",
    "points": [
      [
        1160,
        560
      ],
      [
        1280,
        560
      ],
      [
        1332,
        601
      ],
      [
        1332,
        670
      ],
      [
        1280,
        714
      ],
      [
        1160,
        714
      ],
      [
        1116,
        670
      ],
      [
        1116,
        601
      ]
    ]
  },
  {
    "id": "slot-0",
    "kind": "rect",
    "bounds": [
      1067,
      360,
      1133,
      416
    ]
  },
  {
    "id": "slot-stool-0",
    "kind": "circle",
    "center": [
      1100,
      445
    ],
    "radius": 24
  },
  {
    "id": "slot-1",
    "kind": "rect",
    "bounds": [
      1141,
      360,
      1207,
      416
    ]
  },
  {
    "id": "slot-stool-1",
    "kind": "circle",
    "center": [
      1174,
      445
    ],
    "radius": 24
  },
  {
    "id": "slot-2",
    "kind": "rect",
    "bounds": [
      1215,
      360,
      1281,
      416
    ]
  },
  {
    "id": "slot-stool-2",
    "kind": "circle",
    "center": [
      1248,
      445
    ],
    "radius": 24
  },
  {
    "id": "slot-3",
    "kind": "rect",
    "bounds": [
      1289,
      360,
      1355,
      416
    ]
  },
  {
    "id": "slot-stool-3",
    "kind": "circle",
    "center": [
      1322,
      445
    ],
    "radius": 24
  },
  {
    "id": "slot-4",
    "kind": "rect",
    "bounds": [
      1363,
      360,
      1429,
      416
    ]
  },
  {
    "id": "slot-stool-4",
    "kind": "circle",
    "center": [
      1396,
      445
    ],
    "radius": 24
  },
  {
    "id": "roulette-stool-0",
    "kind": "circle",
    "center": [
      176,
      514
    ],
    "radius": 24
  },
  {
    "id": "roulette-stool-1",
    "kind": "circle",
    "center": [
      258,
      520
    ],
    "radius": 24
  },
  {
    "id": "roulette-stool-2",
    "kind": "circle",
    "center": [
      337,
      520
    ],
    "radius": 24
  },
  {
    "id": "roulette-stool-3",
    "kind": "circle",
    "center": [
      418,
      520
    ],
    "radius": 24
  },
  {
    "id": "roulette-stool-4",
    "kind": "circle",
    "center": [
      500,
      459
    ],
    "radius": 24
  },
  {
    "id": "roulette-stool-5",
    "kind": "circle",
    "center": [
      181,
      350
    ],
    "radius": 24
  },
  {
    "id": "pot-0",
    "kind": "circle",
    "center": [
      628,
      200
    ],
    "radius": 28
  },
  {
    "id": "pot-1",
    "kind": "circle",
    "center": [
      908,
      200
    ],
    "radius": 28
  },
  {
    "id": "pot-2",
    "kind": "circle",
    "center": [
      636,
      418
    ],
    "radius": 28
  },
  {
    "id": "pot-3",
    "kind": "circle",
    "center": [
      898,
      418
    ],
    "radius": 28
  },
  {
    "id": "pot-4",
    "kind": "circle",
    "center": [
      252,
      327
    ],
    "radius": 25
  },
  {
    "id": "pot-5",
    "kind": "circle",
    "center": [
      496,
      326
    ],
    "radius": 25
  },
  {
    "id": "pot-6",
    "kind": "circle",
    "center": [
      1054,
      552
    ],
    "radius": 22
  },
  {
    "id": "pot-7",
    "kind": "circle",
    "center": [
      1338,
      735
    ],
    "radius": 27
  },
  {
    "id": "pot-8",
    "kind": "circle",
    "center": [
      500,
      620
    ],
    "radius": 27
  },
  {
    "id": "pot-9",
    "kind": "circle",
    "center": [
      121,
      190
    ],
    "radius": 26
  },
  {
    "id": "pot-10",
    "kind": "circle",
    "center": [
      1450,
      190
    ],
    "radius": 26
  },
  {
    "id": "pot-11",
    "kind": "circle",
    "center": [
      56,
      640
    ],
    "radius": 32
  },
  {
    "id": "pot-12",
    "kind": "circle",
    "center": [
      1490,
      640
    ],
    "radius": 32
  },
  {
    "id": "north-exit-boundary",
    "kind": "rect",
    "bounds": [
      688,
      0,
      848,
      88
    ]
  },
  {
    "id": "west-front-return-wall",
    "kind": "rect",
    "bounds": [
      0,
      666,
      112,
      820
    ]
  },
  {
    "id": "east-front-return-wall",
    "kind": "rect",
    "bounds": [
      1438,
      666,
      1536,
      820
    ]
  }
];
export const MAIN_SOLIDS = [{"id":"left-margin","x":15,"y":300,"width":30,"height":600},{"id":"right-margin","x":945,"y":300,"width":30,"height":600}, ...SOURCE_SOLIDS.flatMap(o => {
  if(o.kind==='circle')return [{id:o.id,...toWorld(...o.center),radius:o.radius*MAIN_ART.scale}];
  if(o.kind==='rect'){const [l,t,r,b]=o.bounds;return [{id:o.id,...toWorld((l+r)/2,(t+b)/2),width:(r-l)*MAIN_ART.scale,height:(b-t)*MAIN_ART.scale}];}
  return polygonStrips(o.points).map((r,i)=>({id:o.id+':'+i,...toWorld(r.x,r.y),width:r.width*MAIN_ART.scale,height:r.height*MAIN_ART.scale}));
})];
export const MAIN_PORTALS = Object.fromEntries(Object.entries({"south":{"bounds":[712,950,824,1004],"reachWorld":18,"approach":[768,930],"spawn":[768,868],"facing":"up"},"north":{"bounds":[712,112,824,148],"reachWorld":18,"approach":[768,176],"spawn":[768,240],"facing":"down"}}).map(([key,p])=>{
 const [l,t,r,b]=p.bounds;return [key,{...toWorld((l+r)/2,(t+b)/2),width:(r-l)*MAIN_ART.scale,height:(b-t)*MAIN_ART.scale,reach:p.reachWorld,
   spawn:{...toWorld(...p.spawn),facing:p.facing},approach:toWorld(...p.approach)}];
}));
export const MAIN_APPROACHES = Object.fromEntries(Object.entries({"central":[[768,930],[768,868],[768,740],[768,300],[768,240],[768,176]],"westUpper":[[768,300],[576,300],[576,420]],"westLower":[[768,740],[304,740],[304,584]],"eastSlots":[[768,300],[980,300],[980,500],[1248,500]],"eastKiosk":[[768,740],[1000,740],[1068,644]]}).map(([k,ps])=>[k,ps.map(p=>toWorld(...p))]));
// Metadata only. Phase 6A registers no game action or NPC destination here.
export const MAIN_FUTURE_ANCHORS = Object.fromEntries(Object.entries({"roulette":[304,584],"slots":[1248,500],"coinFlip":[1068,644]}).map(([k,p])=>[k,toWorld(...p)]));
export function walkable(p,radius=14){return Number.isFinite(p?.x)&&Number.isFinite(p?.y)&&p.x>=radius&&p.x<=960-radius&&p.y>=radius&&p.y<=600-radius&&clearOf(p,MAIN_SOLIDS,radius);}
export function clearSegment(a,b,radius=14){const n=Math.ceil(Math.hypot(a.x-b.x,a.y-b.y));for(let i=0;i<=n;i++){const t=n?i/n:0;if(!walkable({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t},radius))return false;}return true;}
const chair=(id,x,y)=>({id,baseline:y+24,points:[[x-26,y-43],[x+26,y-43],[x+33,y-22],[x+28,y+8],[x+17,y+24],[x-17,y+24],[x-28,y+8],[x-33,y-22]]});
export const MAIN_FOREGROUNDS = [
 {id:'roulette-rail',baseline:488,points:[[128,350],[445,350],[482,386],[500,430],[482,470],[442,496],[145,496],[106,458],[95,412],[104,376]]},
 ...SOURCE_SOLIDS.filter(s=>s.id.startsWith('roulette-stool-')||s.id.startsWith('slot-stool-')).map(o=>chair(o.id,...o.center)),
 ...[1100,1174,1248,1322,1396].map((x,i)=>({id:'cabinet-'+i,baseline:416,points:[[x-33,416],[x+33,416],[x+36,300],[x+25,276],[x+10,262],[x-10,262],[x-25,276],[x-36,300]]})),
 {id:'coin-sculpture',baseline:714,points:[[1190,530],[1250,520],[1284,551],[1297,602],[1318,650],[1290,700],[1198,700],[1156,660],[1174,615],[1196,600]]},
 {id:'roulette-east-lamp',baseline:666,points:[[528,666],[570,666],[570,565],[562,552],[563,534],[556,519],[551,514],[545,526],[542,539],[543,553],[536,563],[528,566]]},
 ...SOURCE_SOLIDS.filter(s=>s.id.includes('pillar')).map(o=>({id:o.id,baseline:o.bounds[3],points:[[o.bounds[0],o.bounds[1]-100],[o.bounds[2],o.bounds[1]-100],[o.bounds[2],o.bounds[3]],[o.bounds[0],o.bounds[3]]]})),
 ...SOURCE_SOLIDS.filter(s=>s.id.startsWith('pot-')).map(o=>{const [x,y]=o.center,r=o.radius;return {id:o.id,baseline:y+r,points:[[x-48,y-60],[x-30,y-98],[x-6,y-88],[x+12,y-112],[x+30,y-82],[x+52,y-65],[x+35,y-40],[x+r,y+r],[x-r,y+r],[x-36,y-40]]};}),
];
