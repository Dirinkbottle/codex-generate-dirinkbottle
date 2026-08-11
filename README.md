# NES Lab

Browser-first NES emulator built around deterministic tests and observable state before adding rendering/audio complexity.

## Roadmap

- **P0 — foundation ✅**: ROM loader, iNES parser, trace/watchpoint infrastructure, flat test bus and CI.
- **P1 — 2A03/6502 CPU ✅**: all 151 official NMOS opcodes, addressing modes, stack/control flow, IRQ/NMI/BRK/RTI and instruction cycle accounting.
- **P2 — NES CPU bus + Mapper 0 ✅**: real 2KiB RAM mirroring, PPU/APU device windows, Cartridge abstraction, NROM-128/NROM-256 PRG mapping, PRG-RAM, trainer preload and CHR-ROM/CHR-RAM.
- **P3 — PPU**: PPU memory bus, nametable/palette/OAM, registers with real side effects, background/sprites, scrolling, VBlank/NMI and framebuffer.
- **P4 — input/APU/scheduler**: controller, CPU/PPU synchronization, OAM DMA, audio and frame pacing.
- **P5 — compatibility**: more mappers, selected unofficial opcodes, save RAM/state and tougher timing suites.

## P2 architecture

```text
.nes / iNES
    ↓
Cartridge
    ↓ Mapper 0 (NROM)
NES CPU Bus ─── 2KiB RAM
    │          PPU register device (stub in P2)
    │          APU/IO device (stub in P2)
    ↓
2A03 / 6502 CPU
```

The browser now constructs a real `NESMachine`: parses the ROM, creates a cartridge, maps it into `NESBus`, resets the actual CPU through `$FFFC/$FFFD`, and exposes guarded Step/Run/Reset controls plus the CPU trace tail.

P2 deliberately does **not** fake a working PPU. A commercial NROM may execute for a while and then wait forever on PPU status; P3 replaces the stub with the real device.

## Tests

```bash
npm test
```

This runs both the P1 CPU suite and P2 bus/cartridge suite. P2 includes a synthetic NROM integration test whose reset vector starts the real CPU at `$8000`; its program executes `LDA/STA` through the cartridge/bus stack and must write `$42` into NES internal RAM.

CI uses the exact same `npm test` command and additionally runs the commit-pinned Klaus Dormann NMOS 6502 functional oracle.

## Current precision boundary

CPU execution is instruction-accurate with total cycle counts, not yet a per-clock bus-transaction model. PPU/APU semantics, OAM DMA stalls and sub-instruction interrupt timing are future stages. Unofficial opcodes remain intentionally unsupported.
