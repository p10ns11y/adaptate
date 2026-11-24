---
title: "Credits"
description: "Where the logo geometry, the wordmark, and each palette colour came from."
answer: "The logo is original geometry. The wordmark is original path outlines drawn for adaptate; no font is used. Each palette colour is a hex value sampled from a photograph listed below; no photograph ships."
---

# Credits

## Logo

The mark is original geometry: two ascent strokes that meet at a peak above a burn. The wordmark is "Contrast cut": original path outlines drawn for adaptate, not set from a font, so no font file ships.

## Palette

Each token is the per-channel median of a 9×9 px patch (Python/PIL) from a recent official @SpaceX photograph posted on X (Sep–Nov 2026), sampled on 2026-11-22 18:36 CET. This set replaces an earlier pass the same day that used SpaceX Flickr originals. The site and the logo use the hex values only. No photograph, mark, or name from a source ships in the site.

Posts were found with a public search of @SpaceX posts with images from 1 Sep 2026. Post times are `created_at` converted to Europe/Stockholm. Media links are the X original (`name=orig`). The photographs are used only to sample hex values and are not redistributed.

| Token | Hex | Source | Post time (Europe/Stockholm) | Patch centre x,y | Media |
| --- | --- | --- | --- | --- | --- |
| `plume-core` | `#FEF2DC` | [@SpaceX, 2105061657558786148](https://x.com/SpaceX/status/2105061657558786148), 4096×2731. Super Heavy / 33 Raptor 3 engines. Flame core, below saturation | 2026-09-30 00:26 CEST | 2040, 1680 | [https://pbs.twimg.com/media/HTauGVFXkAAF_G8.jpg](https://pbs.twimg.com/media/HTauGVFXkAAF_G8?format=jpg&name=orig) |
| `thrust` | `#D19057` | [@SpaceX, 2121437515819159871](https://x.com/SpaceX/status/2121437515819159871), 4096×2304. Starship Flight 15 liftoff. Sunrise-lit gold exhaust, outer flame | 2026-11-14 03:58 CET | 800, 1500 | [https://pbs.twimg.com/media/HXDcEwRWwAEIyMi.jpg](https://pbs.twimg.com/media/HXDcEwRWwAEIyMi?format=jpg&name=orig) |
| `ember` | `#DF6746` | [@SpaceX, 2105352066424017118](https://x.com/SpaceX/status/2105352066424017118), 3840×2071. Starship Flight 14 morning launch. Deeper fire glow above the ground fire line | 2026-09-30 19:40 CEST | 2185, 1760 | [https://pbs.twimg.com/media/HTeWy8kWIAArWZl.jpg](https://pbs.twimg.com/media/HTeWy8kWIAArWZl?format=jpg&name=orig) |
| `void` | `#0A0D12` | [@SpaceX, 2124122550339002718](https://x.com/SpaceX/status/2124122550339002718), 4096×2730. Falcon 9 USSF-317 night, pad 4E. Night sky, away from the launch arc | 2026-11-21 13:47 CET | 3600, 1800 | [https://pbs.twimg.com/media/HXpmBHwXoAADDzN.jpg](https://pbs.twimg.com/media/HXpmBHwXoAADDzN?format=jpg&name=orig) |
| `ocean` | `#2F5480` | [@SpaceX, 2121439746740170859](https://x.com/SpaceX/status/2121439746740170859), 3455×1943. Super Heavy Booster 22 splashdown. Open water, right of the splash column | 2026-11-14 04:07 CET | 3100, 1400 | [https://pbs.twimg.com/media/HXDdifZXEAA2KCh.jpg](https://pbs.twimg.com/media/HXDdifZXEAA2KCh?format=jpg&name=orig) |
| `cloud` | `#C4C6C5` | [@SpaceX, 2122352509721190612](https://x.com/SpaceX/status/2122352509721190612), 3634×2160. Starship Flight 15 catch, overcast. Light cloud deck | 2026-11-16 16:34 CET | 2000, 200 | [https://pbs.twimg.com/media/HXQbSJMWkAAGcsz.jpg](https://pbs.twimg.com/media/HXQbSJMWkAAGcsz?format=jpg&name=orig) |
| `sky` | `#7AAED6` | [@SpaceX, 2121437515819159871](https://x.com/SpaceX/status/2121437515819159871), 4096×2304. Starship Flight 15 liftoff. Clear mid-sky, upper right, away from the sun | 2026-11-14 03:58 CET | 3000, 300 | [https://pbs.twimg.com/media/HXDcEwRWwAEIyMi.jpg](https://pbs.twimg.com/media/HXDcEwRWwAEIyMi?format=jpg&name=orig) |
| `exhaust` | `#D2BB98` | [@SpaceX, 2121437515819159871](https://x.com/SpaceX/status/2121437515819159871), 4096×2304. Starship Flight 15 liftoff. Muted tan exhaust cloud, right-hand column | 2026-11-14 03:58 CET | 3600, 800 | [https://pbs.twimg.com/media/HXDb_kPXQAATb2F.jpg](https://pbs.twimg.com/media/HXDb_kPXQAATb2F?format=jpg&name=orig) |

No OKLCH lightness change was needed. Text pairs on `void`: `cloud` 11.33:1, `exhaust` 10.47:1, `sky` 8.20:1, `plume-core` 17.56:1, `thrust` 7.26:1, `ember` 5.71:1. `cloud` on `ocean` is 4.53:1, and `void` on `cloud` is 11.33:1. `sky` and `exhaust` on `ocean` are 3.28:1 and 4.18:1, so panel text on `ocean` uses `cloud`. Text on `cloud` uses `void`. `apps/site/src/__tests__/palette.check.ts` recomputes these.
