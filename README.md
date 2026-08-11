# NES Lab

Browser-first NES emulator built around deterministic tests and observable state before adding more console complexity.

## Roadmap

- **P0 — foundation ✅**: ROM loader, iNES parser, trace/watchpoint infrastructure, flat test bus and CI.
- **P1 — 2A03/6502 CPU ✅**: all 151 official NMOS opcodes, addressing modes, stack/control flow, IRQ/NMI/BRK/RTI and instruction cycle accounting.
- **P2 — NES CPU bus + Mapper 0 ✅**: 2KiB RAM mirroring, CPU device windows, NROM-128/NROM-256, PRG-RAM, trainer preload and CHR-ROM/CHR-RAM.
- **P3 — PPU ✅ (functional timing model)**: PPU memory bus, CIRAM/palette mirroring, `$2000-$2007` side effects, `v/t/x/w` scroll registers, `$2007` read buffer, 262×341 NTSC timing, odd-frame skip, VBlank/NMI, background fetch pipeline, framebuffer, basic sprite evaluation/priority/flip/overflow/sprite-0 hit.
- **P4 — input/APU/scheduler**: controller ports, OAM DMA stalls, APU, realtime frame/audio pacing and tighter CPU/PPU scheduling.
- **P5 — compatibility**: additional mappers, selected unofficial opcodes, save RAM/state and tougher timing ROMs.

## P3 architecture and observability

```text
CPU6502
   │
   ├──────── cpu instruction trace
   │
NES CPU Bus ─────────── cpuMem trace
   │
   ├── RAM
   ├── APU/IO stub
   ├── Cartridge / Mapper 0
   └── PPU registers ── ppuReg trace
                         │
                      PPU2C02 ───── ppuEvent trace
                         │
                    PPU Memory Bus ─ ppuMem trace
                      │     │     │
                     CHR   CIRAM  Palette
                         │
                     framebuffer
```

The trace channels are deliberately separate. A black or corrupt frame can be reduced from CPU writes to PPU register state (`v/t/x/w`), then to the exact PPU memory transactions and finally to timing events such as VBlank, NMI edges and sprite evaluation.

## Browser

Load a Mapper 0/NROM `.nes` file. The page exposes a 256×240 framebuffer canvas, Step/Run/Run Frame/Reset controls, CPU/PPU state, and selectable CPU instruction, CPU memory, PPU register, PPU memory and PPU event trace tails.

CPU instructions advance the PPU by three PPU clocks per CPU clock. A PPU NMI edge queues an NMI on the CPU core.

## Tests

```bash
npm test
```

The command runs the same local suite used by CI: P1 CPU tests, P2 cartridge/bus tests, and 31 P3 device tests covering PPU memory mapping, palette aliases, register side effects, scroll state, memory/register tracing, VBlank/NMI timing, background fetch ordering, background pixels, sprites and frame length. CI additionally runs the commit-pinned Klaus Dormann NMOS 6502 functional oracle used in P1.

## P3 precision boundary

This is a real stateful PPU model and advances at scanline/dot granularity, but it is not yet transistor/bus-cycle exact in every corner. Sprite evaluation is functionally modeled rather than reproducing the 2C02 sprite-overflow hardware bug, and CPU instructions are still atomic before their elapsed clocks are handed to the PPU. OAM DMA, controller I/O, APU behavior and finer CPU/PPU contention are P4 work.
