export function makeINES({mapper=0,prgBanks=1,chrBanks=1,mirroring='horizontal',battery=false,trainer=false}={}){
  let flags6=((mapper&0x0f)<<4)|(mirroring==='vertical'?1:0)|(battery?2:0)|(trainer?4:0)|(mirroring==='four-screen'?8:0);
  const flags7=mapper&0xf0,trainerBytes=trainer?512:0;
  const b=new Uint8Array(16+trainerBytes+prgBanks*0x4000+chrBanks*0x2000);
  b.set([0x4e,0x45,0x53,0x1a,prgBanks,chrBanks,flags6,flags7]);
  const prgOff=16+trainerBytes,chrOff=prgOff+prgBanks*0x4000;
  for(let bank=0;bank<prgBanks;bank++)b.fill(bank&0xff,prgOff+bank*0x4000,prgOff+(bank+1)*0x4000);
  for(let bank4k=0;bank4k<chrBanks*2;bank4k++)b.fill((0x40+bank4k)&0xff,chrOff+bank4k*0x1000,chrOff+(bank4k+1)*0x1000);
  return {bytes:b,prgOff,chrOff};
}
export function setResetVector(rom,address=0x8000){const {bytes,prgOff}=rom,prgBanks=bytes[4],last=prgOff+(prgBanks-1)*0x4000;bytes[last+0x3ffc]=address&0xff;bytes[last+0x3ffd]=(address>>8)&0xff;return rom;}
export function setPrg(rom,bank,offset,data){rom.bytes.set(data,rom.prgOff+bank*0x4000+offset);return rom;}
export function mmc1Write5(cart,address,value){for(let i=0;i<5;i++)cart.cpuWrite(address,(value>>i)&1);}
export function setPrg8k(rom,bank,value){rom.bytes.fill(value&0xff,rom.prgOff+bank*0x2000,rom.prgOff+(bank+1)*0x2000);return rom;}
export function setChr1k(rom,bank,value){rom.bytes.fill(value&0xff,rom.chrOff+bank*0x0400,rom.chrOff+(bank+1)*0x0400);return rom;}
export function setVector(rom,cpuAddress,target){const {bytes,prgOff}=rom,prgBanks=bytes[4],last=prgOff+(prgBanks-1)*0x4000,off=(cpuAddress&0x3fff);bytes[last+off]=target&0xff;bytes[last+off+1]=(target>>8)&0xff;return rom;}
