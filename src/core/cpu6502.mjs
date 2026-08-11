import { TraceRing, hex8, hex16 } from './debug.mjs';

export const FLAG = Object.freeze({ C: 0x01, Z: 0x02, I: 0x04, D: 0x08, B: 0x10, U: 0x20, V: 0x40, N: 0x80 });

export class CPU6502 {
  constructor(bus, { trace = new TraceRing(2048) } = {}) {
    this.bus = bus;
    this.trace = trace;
    this.resetState();
  }

  resetState() {
    this.a = 0; this.x = 0; this.y = 0;
    this.sp = 0xfd;
    this.p = FLAG.U | FLAG.I;
    this.pc = 0;
    this.cycles = 0;
    this.halted = false;
  }

  reset() {
    this.resetState();
    this.pc = this.bus.read16(0xfffc, 'reset-vector');
    this.cycles = 7;
  }

  getFlag(flag) { return (this.p & flag) !== 0; }
  setFlag(flag, on) { this.p = on ? (this.p | flag) : (this.p & ~flag); this.p |= FLAG.U; }
  setZN(v) { const n = v & 0xff; this.setFlag(FLAG.Z, n === 0); this.setFlag(FLAG.N, !!(n & 0x80)); return n; }

  fetch8() { const v = this.bus.read8(this.pc, 'opcode/data'); this.pc = (this.pc + 1) & 0xffff; return v; }
  fetch16() { const lo = this.fetch8(); const hi = this.fetch8(); return lo | (hi << 8); }
  push8(v) { this.bus.write8(0x0100 | this.sp, v, 'stack'); this.sp = (this.sp - 1) & 0xff; }
  pop8() { this.sp = (this.sp + 1) & 0xff; return this.bus.read8(0x0100 | this.sp, 'stack'); }

  step() {
    if (this.halted) return 0;
    const startPC = this.pc;
    const opcode = this.fetch8();
    let spent = 0;
    let mnemonic = '???';

    switch (opcode) {
      case 0xea: mnemonic = 'NOP'; spent = 2; break;
      case 0xa9: mnemonic = 'LDA #'; this.a = this.setZN(this.fetch8()); spent = 2; break;
      case 0xa2: mnemonic = 'LDX #'; this.x = this.setZN(this.fetch8()); spent = 2; break;
      case 0xa0: mnemonic = 'LDY #'; this.y = this.setZN(this.fetch8()); spent = 2; break;
      case 0x8d: { mnemonic = 'STA abs'; const addr = this.fetch16(); this.bus.write8(addr, this.a); spent = 4; break; }
      case 0xe8: mnemonic = 'INX'; this.x = this.setZN(this.x + 1); spent = 2; break;
      case 0xc8: mnemonic = 'INY'; this.y = this.setZN(this.y + 1); spent = 2; break;
      case 0xca: mnemonic = 'DEX'; this.x = this.setZN(this.x - 1); spent = 2; break;
      case 0x88: mnemonic = 'DEY'; this.y = this.setZN(this.y - 1); spent = 2; break;
      case 0x4c: mnemonic = 'JMP abs'; this.pc = this.fetch16(); spent = 3; break;
      case 0x20: {
        mnemonic = 'JSR';
        const target = this.fetch16();
        const ret = (this.pc - 1) & 0xffff;
        this.push8(ret >> 8); this.push8(ret & 0xff);
        this.pc = target; spent = 6; break;
      }
      case 0x60: {
        mnemonic = 'RTS';
        const lo = this.pop8(); const hi = this.pop8();
        this.pc = (((hi << 8) | lo) + 1) & 0xffff;
        spent = 6; break;
      }
      case 0xd0: {
        mnemonic = 'BNE';
        const off = this.fetch8();
        spent = 2;
        if (!this.getFlag(FLAG.Z)) {
          const old = this.pc;
          const signed = off < 0x80 ? off : off - 0x100;
          this.pc = (this.pc + signed) & 0xffff;
          spent += 1 + ((old & 0xff00) !== (this.pc & 0xff00) ? 1 : 0);
        }
        break;
      }
      case 0xf0: {
        mnemonic = 'BEQ';
        const off = this.fetch8();
        spent = 2;
        if (this.getFlag(FLAG.Z)) {
          const old = this.pc;
          const signed = off < 0x80 ? off : off - 0x100;
          this.pc = (this.pc + signed) & 0xffff;
          spent += 1 + ((old & 0xff00) !== (this.pc & 0xff00) ? 1 : 0);
        }
        break;
      }
      case 0x00:
        mnemonic = 'BRK(stage1-stop)';
        this.halted = true;
        spent = 7;
        break;
      default:
        throw new Error(`Unsupported opcode $${hex8(opcode)} at $${hex16(startPC)} (stage 1 CPU slice)`);
    }

    this.cycles += spent;
    this.trace.push({ pc: startPC, opcode, mnemonic, a: this.a, x: this.x, y: this.y, sp: this.sp, p: this.p, nextPC: this.pc, cycles: this.cycles });
    return spent;
  }

  snapshot() {
    return { a: this.a, x: this.x, y: this.y, sp: this.sp, p: this.p, pc: this.pc, cycles: this.cycles, halted: this.halted };
  }
}
