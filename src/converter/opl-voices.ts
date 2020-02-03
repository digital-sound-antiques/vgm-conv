export type OPLSlotParam = {
  am: number;
  pm: number;
  eg: number;
  ml: number;
  kr: number;
  kl: number;
  tl: number;
  ar: number;
  dr: number;
  sl: number;
  rr: number;
  ws: number;
};

export type OPLVoice = {
  fb: number;
  con: number;
  slots: OPLSlotParam[];
};

export function OPLVoiceToBinary(v: OPLVoice): Array<number> {
  const s = v.slots;
  return [
    (s[0].am << 7) | (s[0].pm << 6) | (s[0].eg << 5) | (s[0].kr << 4) | s[0].ml,
    (s[1].am << 7) | (s[1].pm << 6) | (s[1].eg << 5) | (s[1].kr << 4) | s[1].ml,
    (s[0].kl << 6) | s[0].tl,
    (s[1].kl << 6) | s[1].tl,
    (s[0].ar << 4) | s[0].dr,
    (s[1].ar << 4) | s[1].dr,
    (s[0].sl << 4) | s[0].rr,
    (s[1].sl << 4) | s[1].rr,
    s[0].ws,
    s[1].ws,
    (v.fb << 1) | v.con
  ];
}

/***
 *    |D7|D6|D5|D4|D3|D2|D1|D0|
 * 0: |AM|PM|EG|KR|   ML(M)   |
 * 1: |AM|PM|EG|KR|   ML(C)   |
 * 2: |KL(M)|      TL(M)      |
 * 3: |KL(C)|      TL(C)      |
 * 4: |   AR(M)   |   DR(M)   |
 * 5: |   AR(C)   |   DR(C)   |
 * 6: |   SL(M)   |   RR(M)   |
 * 7: |   SL(C)   |   RR(C)   |
 * 8: |                 |WS(M)|
 * 9: |                 |WS(C)|
 * A: |           |    FB   |C|
 */
export function toOPLVoice(d: ArrayLike<number>): OPLVoice {
  return {
    fb: d[10] & 7,
    con: d[10] & 1,
    slots: [
      {
        am: (d[0] >> 7) & 1,
        pm: (d[0] >> 6) & 1,
        eg: (d[0] >> 5) & 1,
        kr: (d[0] >> 4) & 1,
        ml: d[0] & 0xf,
        kl: (d[2] >> 6) & 3,
        tl: d[2] & 0x3f,
        ar: (d[4] >> 4) & 0xf,
        dr: d[4] & 0xf,
        sl: (d[6] >> 4) & 0xf,
        rr: d[6] & 0xf,
        ws: d[8] & 3
      },
      {
        am: (d[1] >> 7) & 1,
        pm: (d[1] >> 6) & 1,
        eg: (d[1] >> 5) & 1,
        kr: (d[1] >> 4) & 1,
        ml: d[1] & 0xf,
        kl: (d[3] >> 6) & 3,
        tl: d[3] & 0x3f,
        ar: (d[5] >> 4) & 0xf,
        dr: d[5] & 0xf,
        sl: (d[7] >> 4) & 0xf,
        rr: d[7] & 0xf,
        ws: d[9] & 3
      }
    ]
  };
}
