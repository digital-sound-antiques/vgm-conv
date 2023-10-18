import fs from "fs";
import { OPNVoice, OPNSlotParam } from "ym-voice";

const OPM_HEADER = "//VOPM tone data\n//Ripped by vgm-conv\n\n";

function pad4(value: number) {
  return `${value}`.padStart(4, " ");
}

function toVOPM(voice: OPNVoice, id: number = 0, channels: string = "") {
  function convertSlot(slot: OPNSlotParam) {
    return [slot.ar, slot.dr, slot.sr, slot.rr, slot.sl, slot.tl, slot.ks, slot.ml, slot.dt].map(pad4).join("");
  }
  return `@:${id} CH${channels}
//  LFRQ AMD PMD WF NFRQ
LFO:  31  64  64  0    0
// PAN  FL CON AMS PMS SLOT NE
CH: 64${[voice.fb, voice.con, voice.ams, voice.pms].map(pad4).join("")}  127  0
//   AR D1R D2R  RR D1L  TL  KS MUL DT1 DT2 AMS-EN
M1:${convertSlot(voice.slots[0])}   0   ${pad4(voice.slots[0].am)}
C1:${convertSlot(voice.slots[1])}   0   ${pad4(voice.slots[0].am)}
M2:${convertSlot(voice.slots[2])}   0   ${pad4(voice.slots[0].am)}
C2:${convertSlot(voice.slots[3])}   0   ${pad4(voice.slots[0].am)}

`;
}

export function writeOpmVoiceData(filename: string, voices: { opnVoice: OPNVoice; channels: Set<number> }[]) {
  let opmOutput = "";
  opmOutput += OPM_HEADER;

  voices.forEach((voice, index) => {
    opmOutput += toVOPM(voice.opnVoice, index, Array.from(voice.channels).join(","));
  });

  fs.writeFileSync(filename, opmOutput);
}
