# NES Lab

Browser-first NES emulator project. Stage 1 intentionally focuses on deterministic debugging and tests before full console emulation.

## Stage 1 delivered

- Browser `.nes` loader and strict iNES 1.0 parser
- Trace ring buffer and address watchpoints
- Flat 64KiB test bus
- Small but executable 6502 vertical slice: reset, NOP, LDA/LDX/LDY immediate, STA absolute, INX/INY/DEX/DEY, JMP, JSR, RTS, BEQ/BNE and a temporary BRK stop trap
- Shared browser/Node self-tests
- GitHub Actions CI for the same self-tests

## Local test

```bash
npm test
```

`tests.html` runs the same tests in a browser.

## Important

This stage is **not yet a playable NES**. The next milestones replace the flat test bus with the NES CPU memory map/Mapper 0 and then add the PPU.
