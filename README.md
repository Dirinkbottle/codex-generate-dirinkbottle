# NES Lab

Browser-first NES emulator built around deterministic tests, observability and progressively wider ROM compatibility.

## Roadmap

- **P0 — foundation ✅**: ROM loader, iNES parser, trace/watchpoints and CI.
- **P1 — 2A03/6502 CPU ✅**: all 151 official NMOS opcodes, IRQ/NMI/BRK/RTI and instruction timing.
- **P2 — NES bus + Mapper 0 ✅**: RAM mirrors, Cartridge/NROM, PRG-RAM and real reset-vector boot.
- **P3 — PPU ✅**: PPU memory/register side effects, scrolling, background/sprites, VBlank/NMI and framebuffer.
- **P4 — controller + synchronization + APU ✅**: master CPU timeline, controllers, OAM/DMC DMA, pulse/triangle/noise/DMC audio and cross-device timing traces.
- **P5 — compatibility (current) ✅**: Mapper 1 MMC1, Mapper 2 UxROM, Mapper 3 CNROM, stable unofficial opcodes, battery SRAM persistence, save states, mapper trace and synthetic-ROM oracles.

## Supported cartridges

- Mapper 0 — NROM
- Mapper 1 — MMC1: serial register, 16/32KiB PRG modes, 4/8KiB CHR modes and dynamic single-screen/vertical/horizontal mirroring
- Mapper 2 — UxROM: switchable 16KiB lower PRG bank + fixed last bank
- Mapper 3 — CNROM: switchable 8KiB CHR bank

MMC3 and later boards are intentionally not half-implemented yet; unsupported mapper numbers fail loudly at cartridge creation.

## P5 testing model: you do not need commercial ROMs

`tests/romfactory.mjs` creates legal synthetic iNES images. Tests fill every PRG/CHR bank with a unique byte pattern, then verify the exact mapping after register writes. That gives a deterministic mapper oracle instead of relying on “the title screen looks right”.

Examples covered by the P5 suite:

```text
UxROM:
  initial $8000 -> PRG bank 0
  initial $C000 -> last PRG bank
  write $8000 = 2
  $8000 -> PRG bank 2
  $C000 -> still last PRG bank

MMC1:
  five LSB-first writes -> one register commit
  reset write discards partial shift state
  PRG mode 2/3 and 32KiB mode are independently checked
  CHR 4KiB halves are independently banked
  mirroring changes are observed live by PPUMemoryBus
```

For external stress testing, AccuracyCoin (`100thCoin/AccuracyCoin`) is a useful NROM accuracy ROM. It currently contains a large suite of CPU/PPU/APU/DMA/controller and unofficial-instruction tests. We do **not** vendor it into this repository; internal synthetic tests remain the CI correctness gate.

## Unofficial CPU opcodes

P5 keeps the official `OPCODES` table at exactly 151 entries and adds a separate unofficial table so P1's oracle remains meaningful. Current implementation includes 86 stable/common NMOS opcodes: unofficial NOP forms, SLO/RLA/SRE/RRA, SAX/LAX, DCP/ISC, `$EB` SBC, ANC, ALR, ARR, AXS and LAS.

Unstable high-byte store families such as AHX/SHX/SHY/TAS are intentionally deferred until the CPU becomes sub-instruction bus-cycle scheduled.

## Persistence

Battery-backed PRG-RAM exposes `exportBatteryRAM()` / `importBatteryRAM()`. The browser keys SRAM by a ROM fingerprint and stores it in `localStorage`.

`NESMachine.saveState()` / `loadState()` capture and restore mutable CPU, CPU bus RAM/open-bus state, PPU/OAM/framebuffer/internal pipeline state, PPU RAM/palette, APU channels/frame sequencer/DMC/audio state, controllers/input timeline, cartridge mapper registers/RAM and master-clock counters. Save states reject a different ROM fingerprint.

The browser exposes Save State / Load State controls using a per-ROM session slot.

## Observability

P5 adds a `mapper` trace channel. Bank selects and MMC1 shift/reset/commit events share the same global `seq` and `cpuCycle` stamps as CPU/PPU/APU/DMA/controller traces. This lets a future divergence report connect a CPU register write directly to a bank switch and the first instruction/CHR fetch from the new bank.

## Tests

```bash
npm test
```

The local command is the same command used by CI and runs P1 → P5. Current focused counts are:

- P1: 27
- P2: 13
- P3: 31
- P4: 26
- P5: 22

P5 additionally verifies save-state replay by restoring a state, executing the same future workload again, and requiring both the machine-state signature and generated audio hash to match exactly.

CI also retains the commit-pinned Klaus Dormann NMOS 6502 functional oracle from P1.

## Precision boundary

The emulator now has a master CPU timeline and explicit DMA stalls, but the CPU core is still instruction-granular internally. This means unstable unofficial opcodes, exact dummy-bus cycles, some DMA/controller conflicts, interrupt polling races, MMC3 A12 IRQ timing and other sub-instruction effects require a future micro-cycle CPU executor rather than being guessed here.
