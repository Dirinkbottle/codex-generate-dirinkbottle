export class TraceRing {
  constructor(capacity = 512) { if(!Number.isInteger(capacity)||capacity<=0)throw new Error('capacity must be a positive integer');this.capacity=capacity;this.records=[]; }
  push(record){const frozen=Object.freeze({...record});this.records.push(frozen);if(this.records.length>this.capacity)this.records.shift();return frozen;}
  clear(){this.records.length=0;} snapshot(){return this.records.slice();} tail(n=32){return this.records.slice(-Math.max(0,n));}
}
export class TraceHub {
  constructor({capacities={},enabled=null}={}){this.capacities={cpu:8192,cpuMem:8192,ppuReg:4096,ppuMem:16384,ppuEvent:4096,timeline:8192,dma:8192,controller:4096,apuReg:4096,apuEvent:8192,audioSample:8192,...capacities};this.channels=new Map();this.enabled=new Set(enabled??Object.keys(this.capacities));this.sequence=0;this.clock=()=>null;}
  setClock(provider){this.clock=typeof provider==='function'?provider:()=>null;}
  channel(n){if(!this.channels.has(n))this.channels.set(n,new TraceRing(this.capacities[n]??2048));return this.channels.get(n)}
  emit(n,r){if(!this.enabled.has(n))return null;const now=this.clock?.();const stamp={seq:this.sequence++,channel:n};if(now!=null&&r.cpuCycle==null)stamp.cpuCycle=now;return this.channel(n).push({...stamp,...r});}
  enable(n,on=true){if(on)this.enabled.add(n);else this.enabled.delete(n);} tail(n,c=32){return this.channel(n).tail(c)} snapshot(n){return this.channel(n).snapshot()} clear(n=null){if(n)this.channel(n).clear();else{for(const c of this.channels.values())c.clear();this.sequence=0;}}
}
export class WatchpointSet {constructor(){this.points=new Map();}add(address,kind='rw',label=''){if(!Number.isInteger(address)||address<0||address>0xffff)throw new Error('watchpoint address out of range');if(!['r','w','rw'].includes(kind))throw new Error('watchpoint kind must be r, w or rw');this.points.set(address&0xffff,{kind,label});}remove(a){this.points.delete(a&0xffff)}match(a,access){const p=this.points.get(a&0xffff);return!!p&&(p.kind==='rw'||p.kind===access)}}
export function hex8(v){return(v&0xff).toString(16).toUpperCase().padStart(2,'0')}export function hex16(v){return(v&0xffff).toString(16).toUpperCase().padStart(4,'0')}
