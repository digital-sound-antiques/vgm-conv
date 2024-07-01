## 0.14.0-beta.0

- Fixed the [issue#85](https://github.com/digital-sound-antiques/vgm-conv/issues/85) where the LFO depth is not set when no rhythm register accesses in YM2413 to OPL conversion (Thanks to @ccacook98).
- Added an option to specify a chip variant (ex. YM2413, VRC7 and YMF281B) in YM2413 to OPL/OPNA conversion.

## 0.13.8

- Fixed the problem where AMS is always set zero in YM2413 to YM2608 conversion (Thanks to @kash1wa).

## 0.13.7

- Fixed the problem where the OPM noise frequency was inverted.

## 0.13.6

- Fixed the problem where some channels were not enabled in OPN2 to OPM conversion.

## 0.13.3

- Fixed the problem where `-D squareWaveAttenuation=n` did not work.

## 0.13.2

- Tweaked noise volume and frequency in PSG to OPM conversion.

## 0.13.1

- Added OPN to OPM converter.
- Added AY-3-8910 to OPM converter.

## 0.12.0

- Upgraded npm dependencies.
- Changed minimum node version to 18.0.0.
- Purged tslint dependency.

## 0.11.2

- Fixed rhythm volume in OPLL to OPL conversion.

## 0.11.0

- Added option to log VOPM .OPM files when converting OPN to YM2413. Thanks to @dquenne
