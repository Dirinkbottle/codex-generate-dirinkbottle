# NES Lab

Browser-first NES emulator built around deterministic tests and observable state before adding compatibility shortcuts.

## Roadmap

- **P0 — foundation ✅**: ROM loader, iNES parser, trace/watchpoints, flat test bus and CI.
- **P1 — 2A03/6502 CPU ✅**: 151 official NMOS opcodes, addressing, IRQ/NMI/BRK/RTI and instruction cycle counts.
- **P2 — NES bus + Mapper 0 ✅**: RAM mirrors, Cartridge/NROM, PRG-RAM, CHR-ROM/RAM and real reset-vector boot.
- **P3 — PPU ✅**: PPU bus/register side effects, v/t/x/w scrolling, background pipeline, sprites, VBlank/NMI and 256×240 framebuffer.
- **P4 — controller + synchronization + APU ✅**: controller serial ports, input record/replay, master clock, OAM/DMC DMA stalls, 2A03 pulse/triangle/noise/DMC audio, frame sequencer/IRQ, Web Audio output and cross-device timing diagnostics.
- **P5 — compatibility**: more mappers, unofficial opcodes, save RAM/state and external accuracy-ROM driven timing refinements.

## P4 architecture

```text
                       ┌── cpu / cpuMem trace
CPU6502 ── NESBus ─────┼── PPU ── ppuReg / ppuMem / ppuEvent
   │                   ├── Controllers ── controller trace
   │                   └── APU ── apuReg / apuEvent / audioSample
   │                                  │
   └──────────── MasterClock ─────────┘
                   │
                   ├── OAM DMA 513/514-cycle ownership
                   ├── DMC 4-cycle fetch stalls
                   └── global seq + cpuCycle correlation
```

`TraceHub` stamps device records with a global sequence number and CPU-cycle timestamp. `InputTimeline` records and replays controller state changes. `diagnostics.mjs` computes deterministic trace/snapshot signatures and returns the first divergent record plus context windows, which is intended for future differential testing against accuracy ROMs or another emulator.

## Tests

```bash
npm test
```

P4 adds 26 focused tests on top of P1/P2/P3. They cover controller strobing/shift order, replay timing, APU frame IRQ/status semantics, pulse/triangle/noise/DMC state, deterministic PCM signatures, OAM DMA 513/514 parity, 256 DMA read/write pairs, DMC 4-cycle stalls, CPU:PPU:APU clock ratios, bus routing, global trace timestamps and first-divergence diagnostics.

CI runs the same `npm test` command and retains the commit-pinned Klaus Dormann CPU oracle.

## Current precision boundary

The master clock advances APU once and PPU three dots per emulated CPU cycle, and DMA stalls are represented explicitly. The CPU core is still instruction-granular: bus accesses within an instruction are not individually scheduled onto microcycles. Therefore rare DMC/OAM/controller bus conflicts, the exact `$4017` frame-counter write delay, and some IRQ/NMI races remain future cycle-level work rather than being silently approximated.
