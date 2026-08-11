import { parseINES } from './ines.mjs';

export class Mapper0Cartridge {
  constructor(image) {
    const c = image?.format === 'iNES' ? image : parseINES(image);
    if (c.mapper !== 0) throw new Error(`Mapper ${c.mapper} is not supported by Mapper0Cartridge`);
    if (![0x4000, 0x8000].includes(c.prgRom.length)) throw new Error(`Mapper 0 requires 16KiB or 32KiB PRG ROM, got ${c.prgRom.length}`);
    if (![0, 0x2000].includes(c.chrRom.length)) throw new Error(`Mapper 0 requires 0 or 8KiB CHR, got ${c.chrRom.length}`);

    this.mapper = 0;
    this.mirroring = c.mirroring;
    this.hasBattery = c.hasBattery;
    this.prgRom = c.prgRom.slice();
    this.prgRam = new Uint8Array(Math.max(1, c.prgRamBanks ?? 1) * 0x2000);
    this.chrIsRam = c.chrRom.length === 0;
    this.chr = this.chrIsRam ? new Uint8Array(0x2000) : c.chrRom.slice();

    // iNES trainers are preloaded at CPU $7000-$71FF when cartridge RAM exists.
    if (c.trainer?.length) this.prgRam.set(c.trainer, 0x1000);
  }

  cpuRead(address) {
    const a = address & 0xffff;
    if (a >= 0x6000 && a <= 0x7fff) return this.prgRam[(a - 0x6000) % this.prgRam.length];
    if (a >= 0x8000) return this.prgRom[(a - 0x8000) % this.prgRom.length];
    return null;
  }

  cpuWrite(address, value) {
    const a = address & 0xffff;
    const v = value & 0xff;
    if (a >= 0x6000 && a <= 0x7fff) {
      this.prgRam[(a - 0x6000) % this.prgRam.length] = v;
      return true;
    }
    // NROM has no mapper registers; writes to PRG-ROM space are consumed/ignored.
    if (a >= 0x8000) return true;
    return false;
  }

  ppuRead(address) {
    const a = address & 0x3fff;
    return a < 0x2000 ? this.chr[a] : null;
  }

  ppuWrite(address, value) {
    const a = address & 0x3fff;
    if (a >= 0x2000) return false;
    if (this.chrIsRam) this.chr[a] = value & 0xff;
    return true;
  }
}

export function createCartridge(input) {
  const parsed = input?.format === 'iNES' ? input : parseINES(input);
  if (parsed.mapper === 0) return new Mapper0Cartridge(parsed);
  throw new Error(`Unsupported mapper ${parsed.mapper}; P2 supports Mapper 0/NROM only`);
}
