import { OPNSlotParam, OPNVoice, createOPNSlotParam } from "./opn-voices";
import { OPLSlotParam, OPLVoice } from "./opl-voices";
import { OPLLSlotParam, OPLLVoice, toOPLLVoice, OPLL_VOICES } from "./opll-voices";

export function OPLLToOPNSlotParam(slot: OPLLSlotParam, car: boolean): OPNSlotParam {
  function _RR(rate: number): number {
    switch (rate) {
      case 0:
        return 0;
      case 15:
        return 31;
      default:
        return Math.min(31, Math.round((rate + 1.5) * 2));
    }
  }
  return {
    dt: 0,
    ml: slot.ml,
    tl: Math.min(127, slot.tl + (slot.ws ? (car ? 8 : 5) : 0)),
    ks: slot.kr * 2,
    ar: _RR(slot.ar),
    am: slot.am,
    dr: _RR(slot.dr),
    sr: _RR(slot.eg ? 0 : slot.rr),
    sl: slot.sl,
    rr: slot.eg ? Math.min(15, slot.rr + 1) : car ? 8 : 0,
    ssg: 0
  };
}

const emptyOPNSlotParam = createOPNSlotParam();

export function OPLLVoiceToOPNVoice(opll: OPLLVoice): OPNVoice {
  return {
    fb: opll.slots[0].ws ? Math.min(7, opll.fb + 6) : opll.fb,
    con: 2,
    ams: 4, // 5.9dB
    pms: opll.slots[0].pm || opll.slots[1].pm ? 2 : 0, // 6.7cent or 0
    slots: [
      OPLLToOPNSlotParam(opll.slots[0], false),
      emptyOPNSlotParam,
      emptyOPNSlotParam,
      OPLLToOPNSlotParam(opll.slots[1], true)
    ]
  };
}

export function OPNSlotParamToOPLSlotParam(p: OPNSlotParam, key: boolean): OPLSlotParam {
  function _AR(a: number) {
    switch (a) {
      case 31:
        return 15;
      case 0:
        return 0;
      default:
        return Math.max(1, Math.min(15, (a * 28) >> 6));
    }
  }
  function _DR(a: number) {
    switch (a) {
      case 31:
        return 15;
      case 0:
        return 0;
      default:
        return Math.max(1, Math.min(15, (a * 28) >> 6));
    }
  }
  function _RR(a: number) {
    return a == 0 ? 1 : a;
  }
  return {
    am: p.am,
    pm: 0,
    eg: key ? 0 : 1,
    kr: p.ks >> 1,
    ml: p.ml,
    kl: 0,
    tl: Math.min(63, p.tl),
    ar: _AR(p.ar),
    dr: _DR(p.dr),
    sl: p.sl,
    rr: key ? _DR(p.sr) : _RR(p.rr),
    ws: 0
  };
}

export function OPNVoiceToOPLVoice(v: OPNVoice, key: boolean): Array<OPLVoice> {
  const ss = [
    OPNSlotParamToOPLSlotParam(v.slots[0], key),
    OPNSlotParamToOPLSlotParam(v.slots[1], key),
    OPNSlotParamToOPLSlotParam(v.slots[2], key),
    OPNSlotParamToOPLSlotParam(v.slots[3], key)
  ];
  switch (v.con) {
    case 0:
      return [
        {
          fb: v.fb,
          con: 0,
          slots: [ss[0], { ...ss[3], ml: ss[1].ml, tl: Math.min(63, Math.max(0, ss[1].tl - 2) + ss[3].tl) }]
        },
        {
          fb: 0,
          con: 0,
          slots: [ss[2], ss[3]]
        }
      ];
    case 1:
      return [
        {
          fb: v.fb,
          con: 0,
          slots: [ss[0], { ...ss[3], ml: ss[2].ml, tl: Math.min(63, Math.max(0, ss[2].tl - 2) + ss[3].tl) }]
        },
        {
          fb: 0,
          con: 0,
          slots: [ss[2], ss[3]]
        }
      ];
    case 2:
      return [
        {
          fb: v.fb,
          con: 0,
          slots: [ss[0], ss[3]]
        },
        {
          fb: 0,
          con: 0,
          slots: [ss[2], ss[3]]
        }
      ];
    case 3:
      return [
        {
          fb: v.fb,
          con: 0,
          slots: [ss[0], { ...ss[3], ml: ss[1].ml, tl: Math.min(63, Math.max(0, ss[1].tl - 2) + ss[3].tl) }]
        },
        {
          fb: 0,
          con: 0,
          slots: [ss[2], ss[3]]
        }
      ];

    case 4:
      return [
        {
          fb: v.fb,
          con: 0,
          slots: [ss[0], ss[1]]
        },
        {
          fb: 0,
          con: 0,
          slots: [ss[2], ss[3]]
        }
      ];
    case 5:
      return [
        {
          fb: v.fb,
          con: 0,
          slots: [ss[0], ss[1]]
        },
        {
          fb: v.fb,
          con: 0,
          slots: [ss[0], ss[3]]
        }
      ];
    case 6:
      return [
        {
          fb: v.fb,
          con: 0,
          slots: [ss[0], ss[1]]
        },
        {
          fb: 0,
          con: 1,
          slots: [ss[2], ss[3]]
        }
      ];
    default:
      return [
        {
          fb: v.fb,
          con: 1,
          slots: [ss[0], ss[1]]
        },
        {
          fb: 0,
          con: 1,
          slots: [ss[2], ss[3]]
        }
      ];
  }
}

const _user_voice = [0x01, 0x01, 0x1c, 0x07, 0xf0, 0xd7, 0x00, 0x11];
const _opll_voices = [toOPLLVoice(_user_voice), ...OPLL_VOICES.slice(1)];
const _ml_tbl = [0.5, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 10, 12, 12, 15, 15];

export function estimateOPLLVoice(opl: OPLVoice): { inst: number; voff: number; ooff: number } {
  let diff = Infinity;
  let inst = 0;
  for (let i = 0; i < _opll_voices.length; i++) {
    const opll = _opll_voices[i];
    if (i == 13) continue;
    let d = 0;
    const ml_a = opl.slots[1].ml / _ml_tbl[opl.slots[0].ml];
    const ml_b = opll.slots[1].ml / _ml_tbl[opll.slots[0].ml];
    d += Math.abs(ml_a - ml_b) << 1;
    d += Math.abs(opl.fb - opll.fb) >> 1;
    d += Math.abs(opl.slots[0].ar - opll.slots[0].ar);
    d += Math.abs(opl.slots[1].ar - opll.slots[1].ar);
    d += Math.abs(opl.slots[0].dr - opll.slots[0].dr);
    d += Math.abs(opl.slots[1].dr - opll.slots[1].dr);
    d +=
      Math.min(
        63,
        4 * Math.abs(opl.slots[0].sl - opll.slots[0].sl) +
          Math.abs(opl.slots[0].tl - (opll.slots[0].tl + opll.slots[0].ws ? 8 : 0))
      ) >> 3;
    if (opl.slots[1].rr === 0) {
      // sustainable tone
      if (opll.slots[1].eg === 0) {
        continue;
      }
      d += Math.abs(opl.slots[1].sl - opll.slots[1].sl);
    } else {
      // percusive tone
      if (opll.slots[1].eg === 1) {
        continue;
      }
      d += Math.abs(opl.slots[1].rr - opll.slots[1].rr);
    }
    if (d < diff) {
      inst = i;
      diff = d;
    }
  }
  const opll = _opll_voices[inst];
  const ooff = Math.floor(Math.log2(_ml_tbl[opl.slots[1].ml] / _ml_tbl[opll.slots[1].ml]) / 2);
  let voff = 1;
  if (opll.slots[1].ws) {
    voff -= 2;
    if (opll.slots[0].ws) {
      voff -= 2;
    }
  }
  return { inst, voff, ooff };
}
