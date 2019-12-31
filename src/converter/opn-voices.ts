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

function R(rate: number): number {
  switch (rate) {
    case 0:
      return 0;
    case 15:
      return 31;
    default:
      return Math.min(31, Math.round((rate + 1.5) * 2));
  }
}

export function OPLLToOPNSlotParam(slot: OPLLSlotParam, car: boolean): OPNSlotParam {
  return {
    dt: 0,
    ml: slot.ml,
    tl: Math.min(127, slot.tl + (slot.wf ? (car ? 8 : 5) : 0)),
    ks: slot.kr * 2,
    ar: R(slot.ar),
    am: slot.am,
    dr: R(slot.dr),
    sr: R(slot.eg ? 0 : slot.rr),
    sl: slot.sl,
    rr: slot.eg ? Math.min(15, slot.rr + 1) : car ? 8 : 0,
    ssg: 0
  };
}

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

export function OPLLVoiceToOPNVoice(opll: OPLLVoice): OPNVoice {
  return {
    fb: opll.slots[0].wf ? Math.min(7, opll.fb * 2) : opll.fb,
    con: 2,
    ams: 4, // 5.9dB
    pms: opll.slots[0].pm || opll.slots[1].pm ? 2 : 0, // 6.7cent or 0
    slots: [OPLLToOPNSlotParam(opll.slots[0], false), emptySlot, emptySlot, OPLLToOPNSlotParam(opll.slots[1], true)]
  };
}

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
