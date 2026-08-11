import { CPU6502, FLAG, OPCODES } from './cpu6502.mjs';
import { hex8, hex16 } from './debug.mjs';

function makeUnofficialOpcodeTable(){
  const t=Array(256).fill(null),d=(code,mnemonic,mode,cycles,pageCross=false)=>t[code]=Object.freeze({code,mnemonic,mode,cycles,pageCross,unofficial:true});
  for(const [c,m,mode,cy,pc] of [
    [0x03,'SLO','IZX',8],[0x07,'SLO','ZP',5],[0x0f,'SLO','ABS',6],[0x13,'SLO','IZY',8],[0x17,'SLO','ZPX',6],[0x1b,'SLO','ABY',7],[0x1f,'SLO','ABX',7],
    [0x23,'RLA','IZX',8],[0x27,'RLA','ZP',5],[0x2f,'RLA','ABS',6],[0x33,'RLA','IZY',8],[0x37,'RLA','ZPX',6],[0x3b,'RLA','ABY',7],[0x3f,'RLA','ABX',7],
    [0x43,'SRE','IZX',8],[0x47,'SRE','ZP',5],[0x4f,'SRE','ABS',6],[0x53,'SRE','IZY',8],[0x57,'SRE','ZPX',6],[0x5b,'SRE','ABY',7],[0x5f,'SRE','ABX',7],
    [0x63,'RRA','IZX',8],[0x67,'RRA','ZP',5],[0x6f,'RRA','ABS',6],[0x73,'RRA','IZY',8],[0x77,'RRA','ZPX',6],[0x7b,'RRA','ABY',7],[0x7f,'RRA','ABX',7],
    [0x83,'SAX','IZX',6],[0x87,'SAX','ZP',3],[0x8f,'SAX','ABS',4],[0x97,'SAX','ZPY',4],
    [0xa3,'LAX','IZX',6],[0xa7,'LAX','ZP',3],[0xaf,'LAX','ABS',4],[0xb3,'LAX','IZY',5,true],[0xb7,'LAX','ZPY',4],[0xbf,'LAX','ABY',4,true],
    [0xc3,'DCP','IZX',8],[0xc7,'DCP','ZP',5],[0xcf,'DCP','ABS',6],[0xd3,'DCP','IZY',8],[0xd7,'DCP','ZPX',6],[0xdb,'DCP','ABY',7],[0xdf,'DCP','ABX',7],
    [0xe3,'ISC','IZX',8],[0xe7,'ISC','ZP',5],[0xef,'ISC','ABS',6],[0xf3,'ISC','IZY',8],[0xf7,'ISC','ZPX',6],[0xfb,'ISC','ABY',7],[0xff,'ISC','ABX',7],
    [0xeb,'SBC','IMM',2],[0x0b,'ANC','IMM',2],[0x2b,'ANC','IMM',2],[0x4b,'ALR','IMM',2],[0x6b,'ARR','IMM',2],[0xcb,'AXS','IMM',2],[0xbb,'LAS','ABY',4,true],
  ])d(c,m,mode,cy,!!pc);
  for(const c of [0x1a,0x3a,0x5a,0x7a,0xda,0xfa])d(c,'NOP','IMP',2);
  for(const c of [0x80,0x82,0x89,0xc2,0xe2])d(c,'NOP','IMM',2);
  for(const c of [0x04,0x44,0x64])d(c,'NOP','ZP',3);
  for(const c of [0x14,0x34,0x54,0x74,0xd4,0xf4])d(c,'NOP','ZPX',4);
  d(0x0c,'NOP','ABS',4);
  for(const c of [0x1c,0x3c,0x5c,0x7c,0xdc,0xfc])d(c,'NOP','ABX',4,true);
  return Object.freeze(t);
}
export const UNOFFICIAL_OPCODES=makeUnofficialOpcodeTable();
export const STABLE_UNOFFICIAL_OPCODE_COUNT=UNOFFICIAL_OPCODES.filter(Boolean).length;

export class CPU2A03 extends CPU6502 {
  execute(op,resolved){
    const read=()=>this.readOperand(resolved);
    const write=v=>this.writeOperand(resolved,v&0xff);
    const rmw=fn=>{const v=fn(read())&0xff;write(v);return v;};
    switch(op.mnemonic){
      case 'NOP': if(op.unofficial&&resolved.address!=null)read(); else return super.execute(op,resolved); break;
      case 'LAX':{const v=read();this.a=this.setZN(v);this.x=this.a;break;}
      case 'LAS':{const v=read()&this.sp;this.a=this.x=this.sp=this.setZN(v);break;}
      case 'SAX':write(this.a&this.x);break;
      case 'DCP':{const v=rmw(x=>x-1);this.compare(this.a,v);break;}
      case 'ISC':{const v=rmw(x=>x+1);this.sbc(v);break;}
      case 'SLO':{const v=rmw(x=>{this.setFlag(FLAG.C,!!(x&0x80));return x<<1;});this.a=this.setZN(this.a|v);break;}
      case 'RLA':{const old=this.getFlag(FLAG.C)?1:0,v=rmw(x=>{this.setFlag(FLAG.C,!!(x&0x80));return (x<<1)|old;});this.a=this.setZN(this.a&v);break;}
      case 'SRE':{const v=rmw(x=>{this.setFlag(FLAG.C,!!(x&1));return x>>>1;});this.a=this.setZN(this.a^v);break;}
      case 'RRA':{const old=this.getFlag(FLAG.C)?0x80:0,v=rmw(x=>{this.setFlag(FLAG.C,!!(x&1));return (x>>>1)|old;});this.adc(v);break;}
      case 'ANC':this.a=this.setZN(this.a&read());this.setFlag(FLAG.C,this.getFlag(FLAG.N));break;
      case 'ALR':{const v=this.a&read();this.setFlag(FLAG.C,!!(v&1));this.a=this.setZN(v>>>1);break;}
      case 'ARR':{const v=this.a&read(),old=this.getFlag(FLAG.C)?0x80:0;this.a=this.setZN((v>>>1)|old);this.setFlag(FLAG.C,!!(this.a&0x40));this.setFlag(FLAG.V,!!(((this.a>>6)^(this.a>>5))&1));break;}
      case 'AXS':{const base=this.a&this.x,imm=read(),r=(base-imm)&0xff;this.setFlag(FLAG.C,base>=imm);this.x=this.setZN(r);break;}
      default:return super.execute(op,resolved);
    }
    return 0;
  }
  step(){
    if(this.nmiPending){this.nmiPending=false;return this.serviceInterrupt(0xfffa,'NMI');}
    if(this.irqLine&&!this.getFlag(FLAG.I))return this.serviceInterrupt(0xfffe,'IRQ');
    const startPC=this.pc,before=this.trace?this.snapshot():null,opcode=this.bus.read8(this.pc,'opcode');this.pc=(this.pc+1)&0xffff;
    const op=OPCODES[opcode]??UNOFFICIAL_OPCODES[opcode];
    if(!op)throw new Error(`Unsupported/unstable opcode $${hex8(opcode)} at $${hex16(startPC)}`);
    this._instructionBytes=this.trace?[opcode]:null;const resolved=this.resolve(op.mode);let spent=op.cycles;spent+=this.execute(op,resolved)||0;if(op.pageCross&&resolved.pageCrossed)spent++;
    const bytes=this._instructionBytes?Object.freeze(this._instructionBytes.slice()):null;this.cycles+=spent;
    if(this.trace)this.trace.push({type:'instruction',pc:startPC,opcode,mnemonic:op.mnemonic,mode:op.mode,unofficial:!!op.unofficial,bytes,before,a:this.a,x:this.x,y:this.y,sp:this.sp,p:this.p,nextPC:this.pc,spent,cycles:this.cycles});
    this._instructionBytes=null;return spent;
  }
}
