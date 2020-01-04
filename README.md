# vgm-conv
[![npm version](https://badge.fury.io/js/vgm-conv.svg)](https://badge.fury.io/js/vgm-conv)

Chip-type and clock converter for VGM.

This repository is still experimetal. At present, only YM2612 to YM2413 conversion is available. 

As for PCM conversion, YM2612's register 2A access can be converted to YM2413 DAC. VGM's DAC stream commands are not supported yet.

# Install
```sh
$ npm install -g vgm-conv
```

# Example
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

AVAILABLE CHIPS

  Currently only conversion from YM2612 to YM2413 is supported.                   
  ym2612, ym2612.fm and ym2612.dac are available for `-f` option. 
  ym2413 is available for `-t` option.                            

YM2612 to YM2413 OPTIONS

  -D decimation=n               Decimate 1 of n of PCM data. 2 to 4 is recommended if USB     
                                serial device (like SPFM) is used to play VGM. n=0 disables the feature and 
                                results the best playback quality. The default value is 4.                      
  -D useTestMode=<true|false>   If `true`, YM2413 test mode 7.5bit DAC is used but disables all YM2413 FM   
                                channels. Otherwise pseudo 6-bit DAC is used. The default value is `false`. 

EXAMPLES

  YM2612 to YM2413                    $ vgm-conv -f ym2612 -t ym2413 -o output.vgm input.vgm            
  Only DAC part of YM2612 to YM2413   $ vgm-conv -f ym2612.dac -t ym2413 -o output.vgm input.vgm        
  YM2612 to YM2413@4.00MHz            $ vgm-conv -f ym2612 -t ym2413 -c 4000000 -o output.vgm input.vgm 
```
