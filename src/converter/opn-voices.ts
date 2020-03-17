import { OPLLVoice, OPLLSlotParam } from "./opll-voices";

export type OPNSlotParam = {
  dt: number;
  ml: number;
  tl: number;
  ks: number;
  ar: number;
  am: number;
  dr: number;
  sr: number;
  sl: number;
  rr: number;
  ssg: number;
};

export type OPNVoice = {
  fb: number;
  con: number;
  ams: number;
  pms: number;
  slots: OPNSlotParam[]; // slots[0...3] corresponds to slot1, slot3, slot2, slot4
};

export function createOPNSlotParam(): OPNSlotParam {
  return {
    dt: 0,
    ml: 0,
    tl: 0,
    ks: 0,
    ar: 0,
    am: 0,
    dr: 0,
    sr: 0,
    sl: 0,
    rr: 0,
    ssg: 0
  };
}

const emptySlot = createOPNSlotParam();

export function createOPNVoice(): OPNVoice {
  return {
    fb: 0,
    con: 0,
    ams: 0,
    pms: 0,
    slots: [emptySlot, emptySlot, emptySlot, emptySlot]
  };
}

export function toOPNVoice(d: ArrayLike<number>): OPNVoice {
  const slots = [];
  for (let i = 0; i < 4; i++) {
    slots[i] = {
      dt: (d[0 + i] >> 4) & 7,
      ml: d[0 + i] & 15,
      tl: d[4 + i] & 127,
      ks: (d[8 + i] >> 6) & 3,
      ar: d[8 + i] & 31,
      am: (d[12 + i] >> 7) & 1,
      dr: d[12 + i] & 31,
      sr: d[16 + i] & 31,
      sl: (d[20 + i] >> 4) & 15,
      rr: d[20 + i] & 15,
      ssg: d[24 + i] & 15
    };
  }
  return {
    fb: (d[28] >> 3) & 7,
    con: d[28] & 7,
    ams: (d[29] >> 4) & 3,
    pms: d[29] & 7,
    slots
  };
}
