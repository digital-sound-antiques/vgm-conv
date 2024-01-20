import fs from "fs";
import { OPNVoice, OPNSlotParam } from "ym-voice";

const OPM_HEADER = "//VOPM tone data\n//Ripped by vgm-conv\n";

export function writeOpmVoiceData(filename: string, voices: { opnVoice: OPNVoice; channels: Set<number> }[]) {
  let opmOutput = "";
  opmOutput += OPM_HEADER;

  voices.forEach((voice, index) => {
    opmOutput +=
      "\n" + voice.opnVoice.toOPM().toFile("opm", { number: index, name: `CH${Array.from(voice.channels).join(",")}` });
  });

  fs.writeFileSync(filename, opmOutput);
}
