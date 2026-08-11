import { TraceRing, hex8, hex16 } from './debug.mjs';

export const FLAG = Object.freeze({ C: 0x01, Z: 0x02, I: 0x04, D: 0x08, B: 0x10, U: 0x20, V: 0x40, N: 0x80 });

function makeOpcodeTable() {
  const table = Array(256).fill(null);
  const d = (code, mnemonic, mode, cycles, pageCross = false) => {
    if (table[code]) throw new Error(`duplicate opcode ${code.toString(16)}`);
    table[code] = Object.freeze({ code, mnemonic, mode, cycles, pageCross });
  };

  d(0x00,'BRK','IMP',7); d(0x01,'ORA','IZX',6); d(0x05,'ORA','ZP',3); d(0x06,'ASL','ZP',5);
  d(0x08,'PHP','IMP',3); d(0x09,'ORA','IMM',2); d(0x0A,'ASL','ACC',2); d(0x0D,'ORA','ABS',4); d(0x0E,'ASL','ABS',6);
  d(0x10,'BPL','REL',2); d(0x11,'ORA','IZY',5,true); d(0x15,'ORA','ZPX',4); d(0x16,'ASL','ZPX',6); d(0x18,'CLC','IMP',2);
  d(0x19,'ORA','ABY',4,true); d(0x1D,'ORA','ABX',4,true); d(0x1E,'ASL','ABX',7);

  d(0x20,'JSR','ABS',6); d(0x21,'AND','IZX',6); d(0x24,'BIT','ZP',3); d(0x25,'AND','ZP',3); d(0x26,'ROL','ZP',5);
  d(0x28,'PLP','IMP',4); d(0x29,'AND','IMM',2); d(0x2A,'ROL','ACC',2); d(0x2C,'BIT','ABS',4); d(0x2D,'AND','ABS',4); d(0x2E,'ROL','ABS',6);
  d(0x30,'BMI','REL',2); d(0x31,'AND','IZY',5,true); d(0x35,'AND','ZPX',4); d(0x36,'ROL','ZPX',6); d(0x38,'SEC','IMP',2);
  d(0x39,'AND','ABY',4,true); d(0x3D,'AND','ABX',4,true); d(0x3E,'ROL','ABX',7);

  d(0x40,'RTI','IMP',6); d(0x41,'EOR','IZX',6); d(0x45,'EOR','ZP',3); d(0x46,'LSR','ZP',5); d(0x48,'PHA','IMP',3);
  d(0x49,'EOR','IMM',2); d(0x4A,'LSR','ACC',2); d(0x4C,'JMP','ABS',3); d(0x4D,'EOR','ABS',4); d(0x4E,'LSR','ABS',6);
  d(0x50,'BVC','REL',2); d(0x51,'EOR','IZY',5,true); d(0x55,'EOR','ZPX',4); d(0x56,'LSR','ZPX',6); d(0x58,'CLI','IMP',2);
  d(0x59,'EOR','ABY',4,true); d(0x5D,'EOR','ABX',4,true); d(0x5E,'LSR','ABX',7);

  d(0x60,'RTS','IMP',6); d(0x61,'ADC','IZX',6); d(0x65,'ADC','ZP',3); d(0x66,'ROR','ZP',5); d(0x68,'PLA','IMP',4);
  d(0x69,'ADC','IMM',2); d(0x6A,'ROR','ACC',2); d(0x6C,'JMP','IND',5); d(0x6D,'ADC','ABS',4); d(0x6E,'ROR','ABS',6);
  d(0x70,'BVS','REL',2); d(0x71,'ADC','IZY',5,true); d(0x75,'ADC','ZPX',4); d(0x76,'ROR','ZPX',6); d(0x78,'SEI','IMP',2);
  d(0x79,'ADC','ABY',4,true); d(0x7D,'ADC','ABX',4,true); d(0x7E,'ROR','ABX',7);

  d(0x81,'STA','IZX',6); d(0x84,'STY','ZP',3); d(0x85,'STA','ZP',3); d(0x86,'STX','ZP',3); d(0x88,'DEY','IMP',2); d(0x8A,'TXA','IMP',2);
  d(0x8C,'STY','ABS',4); d(0x8D,'STA','ABS',4); d(0x8E,'STX','ABS',4); d(0x90,'BCC','REL',2); d(0x91,'STA','IZY',6);
  d(0x94,'STY','ZPX',4); d(0x95,'STA','ZPX',4); d(0x96,'STX','ZPY',4); d(0x98,'TYA','IMP',2); d(0x99,'STA','ABY',5);
  d(0x9A,'TXS','IMP',2); d(0x9D,'STA','ABX',5);

  d(0xA0,'LDY','IMM',2); d(0xA1,'LDA','IZX',6); d(0xA2,'LDX','IMM',2); d(0xA4,'LDY','ZP',3); d(0xA5,'LDA','ZP',3); d(0xA6,'LDX','ZP',3);
  d(0xA8,'TAY','IMP',2); d(0xA9,'LDA','IMM',2); d(0xAA,'TAX','IMP',2); d(0xAC,'LDY','ABS',4); d(0xAD,'LDA','ABS',4); d(0xAE,'LDX','ABS',4);
  d(0xB0,'BCS','REL',2); d(0xB1,'LDA','IZY',5,true); d(0xB4,'LDY','ZPX',4); d(0xB5,'LDA','ZPX',4); d(0xB6,'LDX','ZPY',4); d(0xB8,'CLV','IMP',2);
  d(0xB9,'LDA','ABY',4,true); d(0xBA,'TSX','IMP',2); d(0xBC,'LDY','ABX',4,true); d(0xBD,'LDA','ABX',4,true); d(0xBE,'LDX','ABY',4,true);

  d(0xC0,'CPY','IMM',2); d(0xC1,'CMP','IZX',6); d(0xC4,'CPY','ZP',3); d(0xC5,'CMP','ZP',3); d(0xC6,'DEC','ZP',5); d(0xC8,'INY','IMP',2);
  d(0xC9,'CMP','IMM',2); d(0xCA,'DEX','IMP',2); d(0xCC,'CPY','ABS',4); d(0xCD,'CMP','ABS',4); d(0xCE,'DEC','ABS',6);
  d(0xD0,'BNE','REL',2); d(0xD1,'CMP','IZY',5,true); d(0xD5,'CMP','ZPX',4); d(0xD6,'DEC','ZPX',6); d(0xD8,'CLD','IMP',2);
  d(0xD9,'CMP','ABY',4,true); d(0xDD,'CMP','ABX',4,true); d(0xDE,'DEC','ABX',7);

  d(0xE0,'CPX','IMM',2); d(0xE1,'SBC','IZX',6); d(0xE4,'CPX','ZP',3); d(0xE5,'SBC','ZP',3); d(0xE6,'INC','ZP',5); d(0xE8,'INX','IMP',2);
  d(0xE9,'SBC','IMM',2); d(0xEA,'NOP','IMP',2); d(0xEC,'CPX','ABS',4); d(0xED,'SBC','ABS',4); d(0xEE,'INC','ABS',6);
  d(0xF0,'BEQ','REL',2); d(0xF1,'SBC','IZY',5,true); d(0xF5,'SBC','ZPX',4); d(0xF6,'INC','ZPX',6); d(0xF8,'SED','IMP',2);
  d(0xF9,'SBC','ABY',4,true); d(0xFD,'SBC','ABX',4,true); d(0xFE,'INC','ABX',7);
  return Object.freeze(table);
}

export const OPCODES = makeOpcodeTable();
export const LEGAL_OPCODE_COUNT = OPCODES.filter(Boolean).length;

export class CPU6502 {
  constructor(bus, { trace = new TraceRing(4096), decimalArithmetic = false } = {}) {
    this.bus = bus;
    this.trace = trace;
    this.decimalArithmetic = !!decimalArithmetic;
    this.resetState();
  }

  resetState() {
    this.a = 0; this.x = 0; this.y = 0;
    this.sp = 0xfd;
    this.p = FLAG.U | FLAG.I;
    this.pc = 0;
    this.cycles = 0;
    this.irqLine = false;
    this.nmiPending = false;
    this._instructionBytes = null;
  }

  reset() {
    this.resetState();
    this.pc = this.bus.read16(0xfffc, 'reset-vector');
    this.cycles = 7;
  }

  requestNMI() { this.nmiPending = true; }
  setIRQ(level = true) { this.irqLine = !!level; }
  irq(level = true) { this.setIRQ(level); }
  nmi() { this.requestNMI(); }

  getFlag(flag) { return (this.p & flag) !== 0; }
  setFlag(flag, on) {
    this.p = on ? (this.p | flag) : (this.p & ~flag);
    this.p = (this.p | FLAG.U) & 0xff;
  }
  setZN(value) {
    const v = value & 0xff;
    this.setFlag(FLAG.Z, v === 0);
    this.setFlag(FLAG.N, !!(v & 0x80));
    return v;
  }

  fetch8() {
    const v = this.bus.read8(this.pc, 'opcode/data');
    this.pc = (this.pc + 1) & 0xffff;
    if (this._instructionBytes) this._instructionBytes.push(v);
    return v;
  }
  fetch16() { const lo = this.fetch8(); const hi = this.fetch8(); return lo | (hi << 8); }
  push8(v) { this.bus.write8(0x0100 | this.sp, v, 'stack'); this.sp = (this.sp - 1) & 0xff; }
  pop8() { this.sp = (this.sp + 1) & 0xff; return this.bus.read8(0x0100 | this.sp, 'stack'); }
  push16(v) { this.push8((v >> 8) & 0xff); this.push8(v & 0xff); }
  pop16() { const lo = this.pop8(); const hi = this.pop8(); return lo | (hi << 8); }

  serviceInterrupt(vector, kind) {
    const startPC = this.pc;
    const before = this.trace ? this.snapshot() : null;
    this.push16(this.pc);
    this.push8((this.p & ~FLAG.B) | FLAG.U);
    this.setFlag(FLAG.I, true);
    this.pc = this.bus.read16(vector, `${kind}-vector`);
    const spent = 7;
    this.cycles += spent;
    if (this.trace) this.trace.push({ type: 'interrupt', kind, pc: startPC, opcode: null, mnemonic: kind, mode: 'IMP', bytes: Object.freeze([]), before, a: this.a, x: this.x, y: this.y, sp: this.sp, p: this.p, nextPC: this.pc, spent, cycles: this.cycles });
    return spent;
  }

  resolve(mode) {
    switch (mode) {
      case 'IMP': return { address: null, pageCrossed: false };
      case 'ACC': return { accumulator: true, pageCrossed: false };
      case 'IMM': return { value: this.fetch8(), pageCrossed: false };
      case 'ZP': return { address: this.fetch8(), pageCrossed: false };
      case 'ZPX': return { address: (this.fetch8() + this.x) & 0xff, pageCrossed: false };
      case 'ZPY': return { address: (this.fetch8() + this.y) & 0xff, pageCrossed: false };
      case 'ABS': return { address: this.fetch16(), pageCrossed: false };
      case 'ABX': {
        const base = this.fetch16(); const address = (base + this.x) & 0xffff;
        return { address, pageCrossed: (base & 0xff00) !== (address & 0xff00) };
      }
      case 'ABY': {
        const base = this.fetch16(); const address = (base + this.y) & 0xffff;
        return { address, pageCrossed: (base & 0xff00) !== (address & 0xff00) };
      }
      case 'IND': {
        const ptr = this.fetch16();
        const lo = this.bus.read8(ptr, 'jmp-indirect');
        const hiAddr = (ptr & 0xff00) | ((ptr + 1) & 0x00ff); // NMOS 6502 page-wrap bug.
        const hi = this.bus.read8(hiAddr, 'jmp-indirect');
        return { address: lo | (hi << 8), pageCrossed: false };
      }
      case 'IZX': {
        const zp = (this.fetch8() + this.x) & 0xff;
        const lo = this.bus.read8(zp, 'indexed-indirect');
        const hi = this.bus.read8((zp + 1) & 0xff, 'indexed-indirect');
        return { address: lo | (hi << 8), pageCrossed: false };
      }
      case 'IZY': {
        const zp = this.fetch8();
        const lo = this.bus.read8(zp, 'indirect-indexed');
        const hi = this.bus.read8((zp + 1) & 0xff, 'indirect-indexed');
        const base = lo | (hi << 8); const address = (base + this.y) & 0xffff;
        return { address, pageCrossed: (base & 0xff00) !== (address & 0xff00) };
      }
      case 'REL': return { offset: this.fetch8(), pageCrossed: false };
      default: throw new Error(`unknown addressing mode ${mode}`);
    }
  }

  readOperand(resolved) {
    if ('value' in resolved) return resolved.value;
    if (resolved.accumulator) return this.a;
    return this.bus.read8(resolved.address, 'cpu-read');
  }
  writeOperand(resolved, value) {
    const v = value & 0xff;
    if (resolved.accumulator) this.a = v;
    else this.bus.write8(resolved.address, v, 'cpu-write');
  }

  compare(reg, value) {
    const r = (reg - value) & 0xff;
    this.setFlag(FLAG.C, reg >= value);
    this.setZN(r);
  }

  adc(value) {
    const a = this.a, b = value & 0xff, carry = this.getFlag(FLAG.C) ? 1 : 0;
    const sum = a + b + carry;
    const binaryResult = sum & 0xff;
    this.setFlag(FLAG.V, !!((~(a ^ b) & (a ^ binaryResult)) & 0x80));
    if (this.decimalArithmetic && this.getFlag(FLAG.D)) {
      let lo = (a & 0x0f) + (b & 0x0f) + carry;
      if (lo > 9) lo += 6;
      let hi = (a >> 4) + (b >> 4) + (lo > 0x0f ? 1 : 0);
      if (hi > 9) hi += 6;
      this.setFlag(FLAG.C, hi > 0x0f);
      // NMOS decimal N/Z/V behavior is quirky; functional oracle ignores these.
      this.setFlag(FLAG.Z, binaryResult === 0);
      this.setFlag(FLAG.N, !!(binaryResult & 0x80));
      this.a = (((hi << 4) | (lo & 0x0f)) & 0xff);
      return;
    }
    this.setFlag(FLAG.C, sum > 0xff);
    this.a = this.setZN(binaryResult);
  }

  sbc(value) {
    const a = this.a, b = value & 0xff, carry = this.getFlag(FLAG.C) ? 1 : 0;
    const diff = a - b - (carry ? 0 : 1);
    const binaryResult = diff & 0xff;
    this.setFlag(FLAG.V, !!(((a ^ binaryResult) & (a ^ b)) & 0x80));
    if (this.decimalArithmetic && this.getFlag(FLAG.D)) {
      const a10 = ((a >> 4) * 10) + (a & 0x0f);
      const b10 = ((b >> 4) * 10) + (b & 0x0f);
      let d10 = a10 - b10 - (carry ? 0 : 1);
      this.setFlag(FLAG.C, d10 >= 0);
      if (d10 < 0) d10 += 100;
      d10 %= 100;
      this.setFlag(FLAG.Z, binaryResult === 0);
      this.setFlag(FLAG.N, !!(binaryResult & 0x80));
      this.a = ((((Math.floor(d10 / 10) % 10) << 4) | (d10 % 10)) & 0xff);
      return;
    }
    this.setFlag(FLAG.C, diff >= 0);
    this.a = this.setZN(binaryResult);
  }

  branch(condition, offset) {
    if (!condition) return 0;
    const old = this.pc;
    const signed = offset < 0x80 ? offset : offset - 0x100;
    this.pc = (this.pc + signed) & 0xffff;
    return 1 + ((old & 0xff00) !== (this.pc & 0xff00) ? 1 : 0);
  }

  execute(op, resolved) {
    const read = () => this.readOperand(resolved);
    const rmw = (fn) => { const result = fn(read()) & 0xff; this.writeOperand(resolved, result); return result; };
    switch (op.mnemonic) {
      case 'ADC': this.adc(read()); break;
      case 'AND': this.a = this.setZN(this.a & read()); break;
      case 'ASL': rmw(v => { this.setFlag(FLAG.C, !!(v & 0x80)); return this.setZN(v << 1); }); break;
      case 'BCC': return this.branch(!this.getFlag(FLAG.C), resolved.offset);
      case 'BCS': return this.branch(this.getFlag(FLAG.C), resolved.offset);
      case 'BEQ': return this.branch(this.getFlag(FLAG.Z), resolved.offset);
      case 'BIT': { const v = read(); this.setFlag(FLAG.Z, (this.a & v) === 0); this.setFlag(FLAG.V, !!(v & 0x40)); this.setFlag(FLAG.N, !!(v & 0x80)); break; }
      case 'BMI': return this.branch(this.getFlag(FLAG.N), resolved.offset);
      case 'BNE': return this.branch(!this.getFlag(FLAG.Z), resolved.offset);
      case 'BPL': return this.branch(!this.getFlag(FLAG.N), resolved.offset);
      case 'BRK':
        this.fetch8(); // padding byte; PC pushed is opcode address + 2.
        this.push16(this.pc);
        this.push8(this.p | FLAG.B | FLAG.U);
        this.setFlag(FLAG.I, true);
        this.pc = this.bus.read16(0xfffe, 'brk-vector');
        break;
      case 'BVC': return this.branch(!this.getFlag(FLAG.V), resolved.offset);
      case 'BVS': return this.branch(this.getFlag(FLAG.V), resolved.offset);
      case 'CLC': this.setFlag(FLAG.C, false); break;
      case 'CLD': this.setFlag(FLAG.D, false); break;
      case 'CLI': this.setFlag(FLAG.I, false); break;
      case 'CLV': this.setFlag(FLAG.V, false); break;
      case 'CMP': this.compare(this.a, read()); break;
      case 'CPX': this.compare(this.x, read()); break;
      case 'CPY': this.compare(this.y, read()); break;
      case 'DEC': rmw(v => this.setZN(v - 1)); break;
      case 'DEX': this.x = this.setZN(this.x - 1); break;
      case 'DEY': this.y = this.setZN(this.y - 1); break;
      case 'EOR': this.a = this.setZN(this.a ^ read()); break;
      case 'INC': rmw(v => this.setZN(v + 1)); break;
      case 'INX': this.x = this.setZN(this.x + 1); break;
      case 'INY': this.y = this.setZN(this.y + 1); break;
      case 'JMP': this.pc = resolved.address; break;
      case 'JSR': { const ret = (this.pc - 1) & 0xffff; this.push16(ret); this.pc = resolved.address; break; }
      case 'LDA': this.a = this.setZN(read()); break;
      case 'LDX': this.x = this.setZN(read()); break;
      case 'LDY': this.y = this.setZN(read()); break;
      case 'LSR': rmw(v => { this.setFlag(FLAG.C, !!(v & 1)); return this.setZN(v >>> 1); }); break;
      case 'NOP': break;
      case 'ORA': this.a = this.setZN(this.a | read()); break;
      case 'PHA': this.push8(this.a); break;
      case 'PHP': this.push8(this.p | FLAG.B | FLAG.U); break;
      case 'PLA': this.a = this.setZN(this.pop8()); break;
      case 'PLP': this.p = ((this.pop8() & ~FLAG.B) | FLAG.U) & 0xff; break;
      case 'ROL': rmw(v => { const c = this.getFlag(FLAG.C) ? 1 : 0; this.setFlag(FLAG.C, !!(v & 0x80)); return this.setZN((v << 1) | c); }); break;
      case 'ROR': rmw(v => { const c = this.getFlag(FLAG.C) ? 0x80 : 0; this.setFlag(FLAG.C, !!(v & 1)); return this.setZN((v >>> 1) | c); }); break;
      case 'RTI': this.p = ((this.pop8() & ~FLAG.B) | FLAG.U) & 0xff; this.pc = this.pop16(); break;
      case 'RTS': this.pc = (this.pop16() + 1) & 0xffff; break;
      case 'SBC': this.sbc(read()); break;
      case 'SEC': this.setFlag(FLAG.C, true); break;
      case 'SED': this.setFlag(FLAG.D, true); break;
      case 'SEI': this.setFlag(FLAG.I, true); break;
      case 'STA': this.writeOperand(resolved, this.a); break;
      case 'STX': this.writeOperand(resolved, this.x); break;
      case 'STY': this.writeOperand(resolved, this.y); break;
      case 'TAX': this.x = this.setZN(this.a); break;
      case 'TAY': this.y = this.setZN(this.a); break;
      case 'TSX': this.x = this.setZN(this.sp); break;
      case 'TXA': this.a = this.setZN(this.x); break;
      case 'TXS': this.sp = this.x; break;
      case 'TYA': this.a = this.setZN(this.y); break;
      default: throw new Error(`unimplemented mnemonic ${op.mnemonic}`);
    }
    return 0;
  }

  step() {
    if (this.nmiPending) { this.nmiPending = false; return this.serviceInterrupt(0xfffa, 'NMI'); }
    if (this.irqLine && !this.getFlag(FLAG.I)) return this.serviceInterrupt(0xfffe, 'IRQ');

    const startPC = this.pc;
    const before = this.trace ? this.snapshot() : null;
    const opcode = this.bus.read8(this.pc, 'opcode');
    this.pc = (this.pc + 1) & 0xffff;
    const op = OPCODES[opcode];
    if (!op) throw new Error(`Unsupported/illegal opcode $${hex8(opcode)} at $${hex16(startPC)}`);

    this._instructionBytes = this.trace ? [opcode] : null;
    const resolved = this.resolve(op.mode);
    let spent = op.cycles;
    spent += this.execute(op, resolved) || 0;
    if (op.pageCross && resolved.pageCrossed) spent++;
    const bytes = this._instructionBytes ? Object.freeze(this._instructionBytes.slice()) : null;

    this.cycles += spent;
    if (this.trace) this.trace.push({ type: 'instruction', pc: startPC, opcode, mnemonic: op.mnemonic, mode: op.mode, bytes, before, a: this.a, x: this.x, y: this.y, sp: this.sp, p: this.p, nextPC: this.pc, spent, cycles: this.cycles });
    this._instructionBytes = null;
    return spent;
  }

  snapshot() {
    return { a: this.a, x: this.x, y: this.y, sp: this.sp, p: this.p, pc: this.pc, cycles: this.cycles, irqLine: this.irqLine, nmiPending: this.nmiPending };
  }
}
