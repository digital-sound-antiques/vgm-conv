# vgm-conv
[![npm version](https://badge.fury.io/js/vgm-conv.svg)](https://badge.fury.io/js/vgm-conv)

Chip-type and clock converter for VGM.

# Clock Conversion
vgm-conv can change chip's clock while maintaining note's frequency. 
Supported chips are ay8910, ym2203, ym2608, ym3812, y8950, ym3526, ymf262 and ym2413.

# Type Conversion
vgm-conv can convert VGM data stream for some chip to another chip. 

|FROM|TO|
|-|-|
|ay8910|ym2203, ym2608, ym3812, y8950, ym3526, ymf262|
|sn76489|ay8910, ym2203, ym2608|
|ym2413|ym2608, ym3812, y8950, ym3526, ymf262|
|ym2612|ym2413|
|ym2612.fm|ym2413|                                
|ym2612.dac|ym2413| 

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

# Current Limitation
- As for YM2612 DAC, only register 2A stream can be converted. VGM's DAC stream commands is not supported yet.
- Dual chip is not supported yet.

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
  -h, --help                Show this help.                                                               

CLOCK CONVERSION

  AVAILABLE CHIPS               
  sn76489, ym2612               
  ay8910, ym2203, ym2608        
  ym3812, ym3526, y8950, ymf262 
  ym2413                        

CHIP CONVERSION

  FROM         TO                                            
  ay8910       ym2203, ym2608, ym3812, y8950, ym3526, ymf262 
  sn76489      ay8910, ym2203, ym2608, ym2612                
  ym2413       ym2608, ym3812, y8950, ym3526, ymf262         
  ym2612       ym2413                                        
  ym2612.fm    ym2413                                        
  ym2612.dac   ym2413                                        

YM2612 to YM2413 OPTIONS

  -D decimation=n             Decimate 1 of n PCM data. 2 to 4 is recommended if USB serial device (like SPFM) is used to play VGM. n=0 
                              disables the feature and results the best playback quality. The default value is 4.                       
  -D useTestMode=true|false   If `true`, YM2413 test mode 7.5bit DAC is used but disables all YM2413 FM channels. Otherwise pseudo 6-   
                              bit DAC is used. The default value is `false`.                                                            

EXAMPLES

  YM2612 to YM2413                    $ vgm-conv -f ym2612 -t ym2413 input.vgm                                              
  Both YM2413 and AY8910 to YM2608    $ vgm-conv -f ay8910 -t ym2608 input.vgm | vgm-conv -f ym2413 -t ym2608 -o output.vgm 
  Only DAC part of YM2612 to YM2413   $ vgm-conv -f ym2612.dac -t ym2413 input.vgm                                          
  YM2612 to YM2413@4.00MHz            $ vgm-conv -f ym2612 -t ym2413 -c 4000000 input.vgm
```
