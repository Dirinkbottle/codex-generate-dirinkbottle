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

The PPU sprite-fetch model was also moved toward the real fetch phase: sprite pattern reads for the next scanline are prepared at dot 257, with dummy pattern fetches for unused sprite slots. That gives both common pattern-table arrangements a real A12 low/high window instead of calling `mapper.scanline()` once per line.

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
palette-internal accesses not clocking A12
BG=$0000 / Sprite=$1000 fetch layout
BG=$1000 / Sprite=$0000 fetch layout
APU IRQ OR Mapper IRQ
Mapper4 A12 edge -> real CPU IRQ vector
save-state restoration of mapper/A12/IRQ state
```

CI also downloads pinned blargg MMC3 IRQ test ROMs from `christopherpow/nes-test-roms`. The runner does not inspect pixels: the test source exposes its final result in CPU RAM `$00F8`, where `1` means pass. The ROM bytes are pinned by upstream commit and verified with their Git blob SHA before execution.

## Unofficial CPU opcodes

P5 keeps the official `OPCODES` table at exactly 151 entries and adds a separate 2A03 unofficial table, preserving the P1/Klaus oracle. Current implementation includes 86 stable/common NMOS opcodes: unofficial NOP forms, SLO/RLA/SRE/RRA, SAX/LAX, DCP/ISC, `$EB` SBC, ANC, ALR, ARR, AXS and LAS.

Unstable high-byte store families such as AHX/SHX/SHY/TAS remain deferred until the CPU becomes sub-instruction bus-cycle scheduled.

## Persistence

Battery-backed PRG-RAM exposes `exportBatteryRAM()` / `importBatteryRAM()`. The browser keys SRAM by a ROM fingerprint and stores it in `localStorage`.

`NESMachine.saveState()` / `loadState()` capture mutable CPU, buses, PPU/OAM/framebuffer/fetch state, APU/DMC state, controllers/input timeline, mapper registers/RAM/A12 IRQ state and master-clock counters. Save states reject a different ROM fingerprint.

## Observability

Normal mapper events live in the `mapper` channel with the same global `seq` / `cpuCycle` stamps as CPU/PPU/APU/DMA/controller traces. MMC3 adds a `mapperA12` raw channel containing A12 transitions, low duration, PPU-cycle timestamp and access source.

`mapperA12` is **disabled by default** because raw PPU-bus transitions are high-volume. Selecting the raw A12 trace in the browser enables it on demand; normal bank/qualified-edge/IRQ events stay visible through `mapper` without turning tracing itself into a performance problem.

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
- P5.5: 17
- **Total: 136 local deterministic tests**

CI additionally retains the commit-pinned Klaus Dormann NMOS 6502 functional oracle and runs pinned external blargg MMC3 IRQ ROMs.

## Precision boundary

This is common MMC3 Rev B/C-oriented functional behavior, not a claim of transistor-perfect MMC3 revision emulation. Pathological revision-specific reload behavior is intentionally outside this stage.

The CPU core is still instruction-granular internally. PPU rendering is dot-scheduled, but sprite evaluation/fetch is still a functional model rather than every individual 2C02 secondary-OAM bus micro-operation. Exact DMC/OAM conflicts, unstable high-byte unofficial opcodes, interrupt polling races and some MMC3 revision/sub-cycle edge cases remain reasons to eventually move the CPU and device bus to a micro-cycle executor.
