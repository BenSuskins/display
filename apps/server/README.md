# Render Service

Turns household data into a Frame: 800×480, one bit per pixel, 48,000 bytes,
ready to hand straight to GxEPD2's `writeImage`. The Device does no layout —
see [ADR-0001](../../docs/adr/0001-server-renders-the-frame.md).

## Running it

```sh
bun install
bunx playwright install chromium      # once
cp .env.example .env                  # then fill in the two tokens
bun run src/main.ts
```

Open `http://localhost:8080/preview?token=$DEVICE_TOKEN` in a browser. That is
the same HTML the Frame is rasterised from, so layout iteration is a reload
rather than a 15 s round trip to the Panel.

To see what the Panel would actually show, including the 1-bit conversion:

```sh
curl -H "Authorization: Bearer $DEVICE_TOKEN" localhost:8080/frame -o frame.bin
bun run scripts/frameToPng.ts frame.bin frame.png
```

## Endpoints

| Route | Auth | Purpose |
| --- | --- | --- |
| `GET /healthz` | none | Container health check |
| `GET /frame?battery=3.71` | Bearer | The Frame, plus `X-Next-Wake-Seconds` and an `ETag` |
| `GET /preview` | Bearer or `?token=` | The same page as HTML |

`/frame` honours `If-None-Match`. An unchanged Frame gets a `304`, and the
Device then skips the Panel refresh entirely — 3 s instead of 15 s. That is
what makes waking 45 times a day cheaper than waking 30 times and always
redrawing. See [ADR-0002](../../docs/adr/0002-server-owns-the-wake-schedule.md).

## Tests

```sh
bun run check      # tsc --noEmit && bun test
```

Use `check`, not `bun test`. Bun strips types without checking them, so `bun
test` alone will happily pass code that does not compile.

The rasteriser tests launch real Chromium; everything else runs against fakes
(`fakeDepartureSource`, `fakeRasteriser`) that live beside the interfaces they
stand in for.

## Design notes

**Two Dayparts, one shape.** Between `COMMUTE_STARTS_AT` and `COMMUTE_ENDS_AT`
(06:00–09:00 by default) the left zone holds the departure board; the rest of
the day it holds the weather. Nothing else on the page moves, so reading the
fridge at 09:05 is not a matter of re-learning where anything is. Outside the
window no board is fetched at all — nothing would show it.

The same two settings fix the Device's dense Wake window, so a Panel can never
show departures it is only refreshing every half hour. To see either view
without a panel:

```sh
bun run scripts/sampleFrame.ts sample.bin        # 06:40, the commute view
bun run scripts/sampleFrame.ts day.bin 14:00     # the day view
```

**Two horizons, everywhere.** Each of the two data zones answers "now" above and
"next" below: the calendar column carries today and then the next seven days, and
the weather zone carries the current reading and then tomorrow. The second half
of each is deliberately terser — the week ahead is a line per day rather than a
row per event, and tomorrow is a high, a low and whether it rains. What did not
fit is counted in the zone's heading, where the content cannot push it about.

**Pure black and white, no greys.** The rasteriser thresholds at mid grey, so a
page drawn only in `#000` and `#fff` renders identically in your browser and on
the Panel. Introducing greys means guessing how they will threshold.

**Sources fail one zone at a time.** Every source returns a `Result`. A dead Met
Office costs you the weather, not the train times.

**Frame bytes are the panel's native format** — a set bit is white, most
significant bit leftmost, matching `clearScreen`'s `0xFF` default. Do not invert.
