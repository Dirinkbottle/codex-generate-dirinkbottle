# NES Lab

Browser-first NES emulator built around deterministic tests, observable device state and progressively wider ROM compatibility.

## Roadmap

- **P0 — foundation ✅**: ROM loader, iNES parser, trace/watchpoints and CI.
- **P1 — 2A03/6502 CPU ✅**: all 151 official NMOS opcodes, IRQ/NMI/BRK/RTI and instruction timing.
- **P2 — NES bus + Mapper 0 ✅**: RAM mirrors, Cartridge/NROM, PRG-RAM and real reset-vector boot.
- **P3 — PPU ✅**: PPU memory/register side effects, scrolling, background/sprites, VBlank/NMI and framebuffer.
- **P4 — controller + synchronization + APU ✅**: master CPU timeline, controllers, OAM/DMC DMA, pulse/triangle/noise/DMC audio and cross-device timing traces.
- **P5 — compatibility ✅**: MMC1/UxROM/CNROM, stable unofficial opcodes, battery SRAM, save states and mapper trace.
- **P5.5 — Mapper 4 / MMC3 ✅**: PRG/CHR banking, dynamic mirroring/WRAM control, mapper-visible PPU A12 filtering, IRQ counter/acknowledge, CPU IRQ-source aggregation and independent MMC3 IRQ ROM oracles.
- **P6 — performance / player UX 🚧**: production Fast Play detaches trace infrastructure from realtime hot paths; the web app is now player-first with responsive portrait/landscape layouts and a real multi-touch NES controller. Profiling/data-oriented rendering/audio optimizations follow.

## Supported cartridges

- Mapper 0 — NROM
- Mapper 1 — MMC1: serial register, 16/32KiB PRG modes, 4/8KiB CHR modes and dynamic single-screen/vertical/horizontal mirroring
- Mapper 2 — UxROM: switchable 16KiB lower PRG bank + fixed last bank
- Mapper 3 — CNROM: switchable 8KiB CHR bank
- Mapper 4 — MMC3: 8KiB PRG banking, 1/2KiB CHR banking/inversion, mirroring, PRG-RAM enable/write-protect and filtered A12-driven IRQ

Unknown mapper numbers still fail loudly at cartridge creation.

## MMC3 is a bus-observer, not a fake scanline counter

The Mapper 4 IRQ path is deliberately connected to PPU bus behavior:

```text
PPU fetch / $2006 commit / $2007 access
                  │
                  ▼
          mapper-visible PPU address
                  │
        (palette-internal $3Fxx is hidden)
                  │
                  ▼
             A12 low/high
                  │
             low-time filter
                  │
           qualified rising edge
                  │
                  ▼
        MMC3 IRQ reload/decrement
                  │
                  ▼
              mapper IRQ
                  │
          OR with APU IRQ source
                  │
                  ▼
               CPU IRQ
```

`PPUMemoryBus` keeps two concepts separate: `ppuMem` is a broad emulator memory trace, while the mapper observer sees only addresses that are meaningful on the mapper-facing PPU bus. In particular, framebuffer palette lookup is an internal emulator/PPU operation and must not generate fake MMC3 A12 edges.

The PPU sprite-fetch model was also moved toward the real fetch phase: sprite evaluation metadata is prepared at dot 257, while the eight sprite fetch slots are distributed across dots 257–320 (garbage nametable reads followed by pattern low/high), including dummy pattern fetches for unused slots. That gives both common pattern-table arrangements a real A12 low/high window instead of calling `mapper.scanline()` once per line.

## ROM testing model: no commercial ROM knowledge required

`tests/romfactory.mjs` creates legal synthetic iNES images and fills every PRG/CHR bank with unique byte patterns. Mapper tests therefore know the exact expected byte at every CPU/PPU window after a bank-register write.

P5.5 adds synthetic A12 waveforms and full-device tests for:

```text
MMC3 PRG mode 0 / mode 1
MMC3 CHR normal / inverted mode
mirroring and four-screen behavior
PRG-RAM enable + write protect
IRQ latch / reload / decrement / enable / acknowledge
short A12 pulse rejection
$2006 address commits clocking A12
$2007 post-increment clocking A12
palette-internal accesses not clocking A12
BG=$0000 / Sprite=$1000 fetch layout
BG=$1000 / Sprite=$0000 fetch layout
241 qualified A12 clocks per rendered frame
sprite pattern A12 edge timing at dot 261
APU IRQ OR Mapper IRQ
instruction-end maskable IRQ sampling
CPU MMIO writes landing on the final instruction bus cycle
Mapper4 A12 edge -> real CPU IRQ vector
save-state restoration of mapper/A12/IRQ state
```

CI also downloads pinned blargg MMC3 IRQ test ROMs from `christopherpow/nes-test-roms`. The runner does not inspect pixels: the test source exposes its final result in CPU RAM `$00F8`, where `1` means pass. The ROM bytes are pinned by upstream commit and verified with their Git blob SHA before execution.

The pinned external MMC3 suite currently passes all four automated targets: `1.Clocking`, `2.Details`, `3.A12_clocking`, and `4.Scanline_timing`.

## Unofficial CPU opcodes

P5 keeps the official `OPCODES` table at exactly 151 entries and adds a separate 2A03 unofficial table, preserving the P1/Klaus oracle. Current implementation includes 86 stable/common NMOS opcodes: unofficial NOP forms, SLO/RLA/SRE/RRA, SAX/LAX, DCP/ISC, `$EB` SBC, ANC, ALR, ARR, AXS and LAS.

Unstable high-byte store families such as AHX/SHX/SHY/TAS remain deferred until the CPU becomes sub-instruction bus-cycle scheduled.

## Persistence

Battery-backed PRG-RAM exposes `exportBatteryRAM()` / `importBatteryRAM()`. The browser keys SRAM by a ROM fingerprint and stores it in `localStorage`.

`NESMachine.saveState()` / `loadState()` capture mutable CPU, buses, PPU/OAM/framebuffer/fetch state, APU/DMC state, controllers/input timeline, mapper registers/RAM/A12 IRQ state and master-clock counters. Save states reject a different ROM fingerprint.

## Observability and Fast Play

The production/browser path constructs `NESMachine()` with tracing detached: `traceHub === null` and `cpu.trace === null`. CPU, PPU, APU, CPU/PPU buses, mapper and scheduler therefore receive no trace object at all, so optional trace calls short-circuit before record-object construction. The browser also skips trace-panel refresh while playing.

Development and oracle paths opt in explicitly with `new NESMachine({developmentTracing:true})`. The browser development path is available through `?debug=1`; the normal URL never creates TraceHub. In development mode normal mapper events live in the `mapper` channel with the same global `seq` / `cpuCycle` stamps as CPU/PPU/APU/DMA/controller traces. MMC3 additionally exposes a high-volume `mapperA12` raw channel containing A12 transitions, low duration, PPU-cycle timestamp and access source; that raw channel remains disabled until explicitly enabled.

This keeps observability available for failure analysis without leaving the instrumentation permanently in the realtime datapath.

## Player UI

The normal page now defaults to a player surface rather than a debug dashboard. ROM loading, framebuffer, Play/Pause, Reset, Save/Load and the NES controller remain visible; runtime state, trace and advanced stepping live inside a collapsed `Developer / Debug` panel.

The virtual controller uses Pointer Events and tracks active pointer IDs, so mobile input supports real combinations such as holding Right while pressing A. Portrait layouts keep the D-pad/actions/system keys below the screen, while a landscape media query moves the controls beside the framebuffer. Safe-area insets are respected on phones with display cutouts. Desktop keyboard input remains Z/X, Shift/Enter and arrow keys.

Normal browser startup also no longer imports or runs the CPU self-test suite. Correctness regression remains in `npm test` and CI rather than delaying every player session.

## Tests

```bash
npm test
```

The local command is the same regression command used by CI. Current focused counts:

- P1: 27
- P2: 13
- P3: 31
- P4: 26
- P5: 22
- P5.5: 22
- P6 fast-path: 2
- P6 player/UI: 6
- **Total: 149 local deterministic/static regression tests**

`npm test` also runs `node --check src/app.mjs` before the suites, so browser-app syntax failures are caught even though the UI module is not executed under Node.

CI additionally retains the commit-pinned Klaus Dormann NMOS 6502 functional oracle and runs pinned external blargg MMC3 IRQ ROMs.

## Precision boundary

This is common MMC3 Rev B/C-oriented functional behavior, not a claim of transistor-perfect MMC3 revision emulation. Pathological revision-specific reload behavior is intentionally outside this stage.

The CPU core is still instruction-granular internally, but the NES scheduler now predicts the instruction length before execution, advances the independent devices through the earlier CPU cycles, and places common device-visible CPU reads/writes at the final instruction bus-cycle boundary. Maskable IRQ is kept separate as a physical line and an instruction-end sampled request. This is enough for the pinned blargg MMC3 scanline-timing oracle without pretending that the CPU is already a true micro-cycle executor.

PPU rendering is dot-scheduled and sprite pattern bus fetches are distributed across dots 257–320, but secondary-OAM evaluation is still a functional model rather than every individual 2C02 OAM micro-operation. Exact dummy-read/RMW bus phases, DMC/OAM conflicts with individual CPU accesses, unstable high-byte unofficial opcodes, and revision-specific/sub-cycle races remain reasons to eventually move the CPU and device bus to a full micro-cycle executor.
