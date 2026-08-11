# NES Lab

Browser-first NES emulator project, built around deterministic tests and observable state before PPU/APU complexity.

## Roadmap

- **P0 — foundation ✅**: ROM loader, iNES parser, trace/watchpoint infrastructure, flat test bus, executable CPU slice and CI.
- **P1 — 2A03/6502 CPU ✅**: all 151 official NMOS 6502 opcodes, addressing modes, status/stack/control flow, IRQ/NMI/BRK/RTI, instruction cycle counts and page-cross penalties.
- **P2 — NES CPU bus + cartridge/Mapper 0**: RAM mirrors, PPU register window, APU/IO stubs, PRG mapping and reset from real NROM.
- **P3 — PPU**: pattern/nametable/palette/OAM, background/sprites, scrolling, VBlank/NMI and 256×240 framebuffer.
- **P4 — input/APU/scheduler**: controller, CPU/PPU synchronization, audio and frame pacing.
- **P5 — compatibility**: more mappers, unofficial opcodes when needed, save RAM/state and tougher timing suites.

## P1 CPU delivered

- Table-driven decode for all **151 official NMOS 6502 opcodes**; illegal opcodes fail loudly.
- Immediate, zero page, ZP X/Y, absolute, ABS X/Y, accumulator, relative, indirect, `(zp,X)` and `(zp),Y` addressing.
- Correct zero-page wrapping and original NMOS `JMP ($xxFF)` page-wrap behavior.
- Binary ALU, shifts/rotates, compares, BIT, loads/stores, transfers, increments/decrements, branches and flag instructions.
- PHA/PLA/PHP/PLP, JSR/RTS, BRK/RTI, IRQ and NMI.
- Instruction-level cycle accounting including branch and read page-cross penalties.
- NES behavior: D flag is writable, but ADC/SBC stay binary by default. `decimalArithmetic:true` exists only for generic NMOS oracle testing.
- Trace records opcode bytes, pre/post state and per-instruction cycle delta.

## Verification

`npm test` runs browser/Node-shared regression tests: exact 151-opcode set, base-cycle/page-cross metadata, one-step dispatch of every official opcode, directed addressing/stack/interrupt/ALU tests, plus exhaustive binary ADC and SBC over every `A × operand × carry` combination.

CI additionally downloads a commit-pinned Klaus Dormann `6502_functional_test.bin` and runs that independent suite. The upstream GPLv3 binary is not vendored here.

## Current boundary

P1 is instruction-accurate with total instruction cycle counts; it is **not yet a per-clock bus transaction model**. Dummy reads/writes and sub-instruction IRQ polling nuances are deferred until the NES bus/PPU timing layers need them. Unofficial opcodes are intentionally unsupported for now.

A `.nes` file can be parsed in the web UI; gameplay begins in P2/P3 when cartridge bus and PPU are connected.
