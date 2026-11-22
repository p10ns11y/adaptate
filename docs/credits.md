---
title: "Credits"
description: "Where the logo geometry, the wordmark, and each palette colour came from."
answer: "The logo is original geometry. The wordmark is original path outlines drawn for adaptate; no font is used. Each palette colour is a hex value sampled from a photograph listed below; no photograph ships."
---

# Credits

## Logo

The mark is original geometry: two ascent strokes that meet at a peak above a burn. The wordmark is "Contrast cut": original path outlines drawn for adaptate, not set from a font, so no font file ships.

## Palette

Each token is the median of a 9×9 px patch from the Flickr original, sampled on 2026-11-22 (Europe/Stockholm). The site and the logo use the hex values only. No photograph, mark, or name from a source ships in the site.

Licence as the live Flickr photo page and oEmbed showed on 2026-11-22: Creative Commons Attribution-NonCommercial 2.0 Generic ([CC BY-NC 2.0](https://creativecommons.org/licenses/by-nc/2.0/)). `dateTaken` is the Flickr field as stored, with no timezone.

| Token | Hex | Source | Flickr dateTaken | Patch centre x,y | Licence |
| --- | --- | --- | --- | --- | --- |
| `plume-core` | `#FFE99D` | <https://www.flickr.com/photos/spacex/50192510273/> | 2020-07-04 15:58:42 | 1920, 2180 | CC BY-NC 2.0 |
| `thrust` | `#ECA43F` | <https://www.flickr.com/photos/spacex/17139094400/> | 2015-04-30 11:04:56 | 1300, 2050 | CC BY-NC 2.0 |
| `ember` | `#B76625` | <https://www.flickr.com/photos/spacex/17139094400/> | 2015-04-30 11:04:56 | 776, 2364 | CC BY-NC 2.0 |
| `void` | `#0F0E0C` | <https://www.flickr.com/photos/spacex/47173936271/> | 2019-02-21 20:45:18 | 200, 150 | CC BY-NC 2.0 |
| `ocean` | `#294C74` | <https://www.flickr.com/photos/spacex/27259828166/> | 2016-05-27 17:38:44 | 2700, 850 | CC BY-NC 2.0 |
| `cloud` | `#D3D4D6` | <https://www.flickr.com/photos/spacex/51169562702/> | 2021-05-05 00:00:00 | 2000, 200 | CC BY-NC 2.0 |
| `sky` | `#799AD5` | <https://www.flickr.com/photos/spacex/26288402056/> | 2016-04-08 16:43:33 | 400, 400 | CC BY-NC 2.0 |
| `exhaust` | `#B59789` | <https://www.flickr.com/photos/spacex/40126461851/> | 2018-02-06 15:36:24 | 2200, 800 | CC BY-NC 2.0 |

No OKLCH lightness change was needed. Text pairs on `void`: `cloud` 13.01:1, `exhaust` 7.12:1, `sky` 6.80:1, `plume-core` 15.98:1, `thrust` 9.14:1, `ember` 4.54:1. `cloud` on `ocean` is 5.95:1. `apps/site/src/__tests__/palette.check.ts` recomputes these.
