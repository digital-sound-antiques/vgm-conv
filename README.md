# vgm-conv [![npm version](https://badge.fury.io/js/vgm-conv.svg)](https://badge.fury.io/js/vgm-conv)
<img src="https://nodei.co/npm/vgm-conv.png?downloads=true&stars=true" alt=""/>

Chip-type and clock converter for VGM.

# Clock Conversion
vgm-conv can change chip's clock while maintaining note's frequency. 
Supported chips are sn76489, ay8910, ym2203, ym2608, ym3812, y8950, ym3526, ymf262 and ym2413.

# Type Conversion
vgm-conv supports non-trivial conversion across various chip types.

|FROM|TO|
|-|-|
|ay8910|ym2203, ym2608, ym3812, y8950, ym3526, ymf262|
|sn76489|ay8910, ym2203, ym2608|
|ym2413|ym2608, ym3812, y8950, ym3526, ymf262|
|ym2203, ym2203.ssg|ay8910, ym3812, y8950, ym3526, ymf262|
|ym2608, ym2608.ssg|ay8910|
|ym2203, ym2203.fm|ym2413, ym3812, y8950, ym3526, ymf262|
|ym2608, ym2608.fm, ym2608.r|ym2413|
|ym2612, ym2612.fm, ym2612.dac|ym2413|

Note: downgrade conversion (ex. YM2203 to YM2413 conversion) is highly limited thus don't expect much.

## Limitation
- YM2413 to YM2608 supports FM1-6 and rhythm conversion. FM7,8,9 channels are ignored.
- YM2608 to YM2203 does not support the rhythm part conversion.
- SN76489 to AY8910: Noise channel conversion is pertially supported; SN76489 has the independent noice channel but AY8910 does not, so full conversion is not possible. 
- As for YM2612 DAC, only register 2A stream can be converted. VGM's DAC stream commands is not supported.
- Dual chip is not supported.

# Install
```sh
$ npm install -g vgm-conv
```

# Example
## Convert YM3812 clock to 4.00MHz
```sh
$ vgm-conv -f ym3812 -c 4000000 -o output.vgm input.vgm
```

## Convert YM2612 to YM2413(@3.58MHz)
```sh
$ vgm-conv -f ym2612 -t ym2413 -o output.vgm input.vgm
```

## Convert YM2612 to YM2413(@4.00MHz)
```sh
$ vgm-conv -f ym2612 -t ym2413 -c 4000000 -o output.vgm input.vgm
```

## Convert only YM2612 DAC part to YM2413 7.5bit DAC
```sh
$ vgm-conv -f ym2612.dac -t ym2413 -D useTestMode=true -o output.vgm input.vgm
```

## Convert YM2203's FM part to YM2413 and SSG part to AY8910
```sh
$ vgm-conv -f ym2203.fm -t ym2413 input.vgm | vgm-conv -f ym2203 -t ay8910 -o output.vgm
```

# Usage
```
$ vgm-conv --help

vgm-conv

  Chip-type and clock converter for VGM. 

SYNOPSIS

  vgm-conv [<option>] <file> 

OPTIONS

  -i, --input file          Input VGM file. Standard input will be used if not specified.                 
  -f, --from chip           Specify source chip type.                                                     
  -t, --to chip             Specify destination chip type.                                                
  -c, --clock clock         Specify clock in Hz of destination chip. The typical clock value will be      
                            applied if not specified.                                                     
  -D, --define name=value   Define converter option variable. See below.                                  
  -o, --output file         Output VGM file. The standard output is used if not speicified. If the given  
                            file is *.vgz, the output will be compressed.                                 
  --no-gd3                  Remove GD3 tag from output.
  --voiceTable file         Specify the voice table file.  
  -v, --version             Show version.                                                    
  -h, --help                Show this help.                                                               

CLOCK CONVERSION

  AVAILABLE CHIPS               
  sn76489, ym2612               
  ay8910, ym2203, ym2608        
  ym3812, ym3526, y8950, ymf262 
  ym2413                        

CHIP CONVERSION

  FROM                            TO                                            
  ay8910                          ym2203, ym2608, ym3812, y8950, ym3526, ymf262 
  sn76489                         ay8910, ym2203, ym2608, ym2612                
  ym2413                          ym2608, ym3812, y8950, ym3526, ymf262         
  ym2203, ym2203.fm               ym2413                                        
  ym2608, ym2608.fm, ym2608.r     ym2413                                        
  ym2203, ym2203.ssg              ay8910                                        
  ym2608, ym2608.ssg              ay8910                                        
  ym2612, ym2612.fm, ym2612.dac   ym2413                                   

YM2612 to YM2413 OPTIONS

  -D decimation=n                  Decimate 1 of n PCM data. 2 to 4 is recommended if USB serial device (like SPFM) is used to play VGM. n=0 
                                   disables the feature and results the best playback quality. The default value is 4.                       
  -D dacEmulation=fmpcm|test|none  fmpcm: use pseudo 6-bit DAC is used (default).
                                   test:  use YM2413 test mode is used 7.5bit DAC but disables all YM2413 FM channels.
                                   none:  disable DAC emulation.

SN76489 to AY8910 OPTIONS

  -D mixChannel=none|0|1|2        Specify the AY8910 channel used for noise output (default: 2). If 'none' is specified, all noise part will be silent.                                                                                                                                                                                         
                                  Since AY8910 has no independent noise channel, SN76489's noise channel will be mixed with a tone channel into the 
                                  single AY8910's channel specified by this option.                                                                                                                                           
  -D mixResolver=tone|noise|mix   This option determines the behavior when tone and noise are requested to be key-on simultaneously on the same AY8910 channel.                                                                                                                                                                                 
                                  tone: tone will be output. noise will be silent.                                                                                                                                                                                                                                                              
                                  noise: noise will be output. tone will be silent.                                                                                                                                                                                                                                                             
                                  mix: both tone and noise will be output (default).  

EXAMPLES

  YM2612 to YM2413                                    $ vgm-conv -f ym2612 -t ym2413 input.vgm                                                 
  Both YM2413 and AY8910 to YM2608                    $ vgm-conv -f ay8910 -t ym2608 input.vgm | vgm-conv -f ym2413 -t ym2608    
  YM2203's FM part to YM2413 and SSG part to AY8910   $ vgm-conv -f ym2203.fm -t ym2413 input.vgm | vgm-conv -f ym2203 -t ay8910 
  Only DAC part of YM2612 to YM2413                   $ vgm-conv -f ym2612.dac -t ym2413 input.vgm                                             
  YM2612 to YM2413@4.00MHz                            $ vgm-conv -f ym2612 -t ym2413 -c 4000000 input.vgm     
```

# Voice Table (Beta)
The voice table configuration can be defined in JavaScript. Only OPN/OPNA/OPN2 to OPLL conversions are supported. To load the voice table configuration, use `--voiceTable <file>` option.

```voice-table.js
const [HH, CYM, TOM, SD, BD] = [1 << 10, 1 << 11, 1 << 12, 1 << 13, 1 << 14];
const [Violin, Piano, Guitar, Flute, Clarinet, Oboe, Trumpet, Organ, Horn, Synthsizer, Harpsicode, Vibraphone, SynthBass, WoodBass, ElectricBass] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];

module.exports = {
  voiceTable: {
    opn2opll: {
      // Override `-D dacEmulation` option. This must be set "none" to enable rhythm channels.
      dacEmulation: "none",
      // User defined voice table
      voices: {
        // Original Tones can be defined from program number 16 to 1023.
        16: [0x01, 0x01, 0x1c, 0x07, 0xf0, 0xd7, 0x00, 0x11],
      },
      mapping: {
        // i: Voice Number (required)
        // - 1...15: ROM Voice
        // - 16...1023: User defined voice
        // - 1024: HiHat, 2048: Cymbal, 4096: Tom, 8192: Snare, 16384: Bassdrum
        // v: Volume offset: -15<=v<=15 (default: 0)
        // o: Octave offset: -7<=o<=7 (default: 0)
        "520030001c1f257fdf1fdf1f0709068607060608251515f5000000000100": { i: Harpsicode, v: 1, o: -1 },
        "0f30005000120f121f1f1f1d01000106000f010b113117f1000000003e00": { i: SD, v: -1, o: -1 },
        "3e5051501f171c10df1bdf1f07070e040701010154f65572000000002b00": { i: WoodBass },
        "0f300050001a171a1f1f1f1d01000106000f010b113117f1000000003e00": { i: 16, v: 1, o: -1 },
      }
      // autoMap controls the fallback voice if no match is found in the mapping table.
      // - An appropriate ROM voice will be selected if autoMap is true.
      // - Slient if autoMap is false.
      autoMap: true,
    }
  }
};
```

The original instrument hash to the program number mapping can be seen on the console after running `vgm-conv` without specifiying `--voiceTable`. You can copy them into the template above.

