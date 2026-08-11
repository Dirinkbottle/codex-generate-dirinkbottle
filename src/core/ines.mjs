const INES_MAGIC = [0x4e, 0x45, 0x53, 0x1a];

export function parseINES(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes.length < 16) throw new Error('ROM too small for iNES header');
  for (let i = 0; i < 4; i++) if (bytes[i] !== INES_MAGIC[i]) throw new Error('Invalid iNES magic');

  const prgBanks = bytes[4];
  const chrBanks = bytes[5];
  const flags6 = bytes[6];
  const flags7 = bytes[7];
  const isNES2 = (flags7 & 0x0c) === 0x08;
  if (isNES2) throw new Error('NES 2.0 is not supported in stage 1');

  const hasTrainer = !!(flags6 & 0x04);
  const trainerSize = hasTrainer ? 512 : 0;
  const prgSize = prgBanks * 16 * 1024;
  const chrSize = chrBanks * 8 * 1024;
  const dataOffset = 16 + trainerSize;
  const required = dataOffset + prgSize + chrSize;
  if (bytes.length < required) throw new Error(`ROM truncated: expected at least ${required} bytes, got ${bytes.length}`);

  const mapper = (flags6 >> 4) | (flags7 & 0xf0);
  const mirroring = (flags6 & 0x08) ? 'four-screen' : (flags6 & 0x01) ? 'vertical' : 'horizontal';

  return {
    format: 'iNES',
    mapper,
    mirroring,
    hasBattery: !!(flags6 & 0x02),
    hasTrainer,
    prgBanks,
    chrBanks,
    prgRom: bytes.slice(dataOffset, dataOffset + prgSize),
    chrRom: bytes.slice(dataOffset + prgSize, dataOffset + prgSize + chrSize),
    raw: bytes,
  };
}
