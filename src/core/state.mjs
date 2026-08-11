const TYPED = new Map([
  ['Uint8Array',Uint8Array],['Uint8ClampedArray',Uint8ClampedArray],['Int8Array',Int8Array],
  ['Uint16Array',Uint16Array],['Int16Array',Int16Array],['Uint32Array',Uint32Array],['Int32Array',Int32Array],
  ['Float32Array',Float32Array],['Float64Array',Float64Array]
]);

export function captureMutable(value,{skip=[]}={}){
  const skipped=new Set(skip);
  function enc(v){
    if(v==null||typeof v==='number'||typeof v==='string'||typeof v==='boolean')return v;
    if(typeof v==='function')return undefined;
    if(ArrayBuffer.isView(v))return {__typed:v.constructor.name,data:Array.from(v)};
    if(Array.isArray(v))return v.map(enc);
    if(typeof v==='object'){
      const out={};
      for(const [k,x] of Object.entries(v)){if(skipped.has(k)||typeof x==='function')continue;const y=enc(x);if(y!==undefined)out[k]=y;}
      return out;
    }
    return undefined;
  }
  return enc(value);
}

function decode(v){
  if(v==null||typeof v!=='object')return v;
  if(v.__typed){const C=TYPED.get(v.__typed);if(!C)throw new Error(`Unknown typed array ${v.__typed}`);return C.from(v.data);}
  if(Array.isArray(v))return v.map(decode);
  const o={};for(const [k,x] of Object.entries(v))o[k]=decode(x);return o;
}

export function restoreMutable(target,state,{skip=[]}={}){
  const skipped=new Set(skip);
  function apply(dst,src){
    if(src==null||typeof src!=='object')return src;
    if(src.__typed){if(ArrayBuffer.isView(dst)){if(dst.length!==src.data.length)throw new Error(`Typed array size mismatch: ${dst.length} != ${src.data.length}`);dst.set(src.data);return dst;}return decode(src);}
    if(Array.isArray(src)){if(!Array.isArray(dst))return decode(src);dst.length=src.length;for(let i=0;i<src.length;i++){const s=src[i],d=dst[i];dst[i]=(s&&typeof s==='object'&&d&&typeof d==='object')?apply(d,s):decode(s);}return dst;}
    if(!dst||typeof dst!=='object')return decode(src);
    for(const [k,s] of Object.entries(src)){if(skipped.has(k))continue;const d=dst[k];if(s&&typeof s==='object'&&d&&typeof d==='object')dst[k]=apply(d,s);else dst[k]=decode(s);}return dst;
  }
  return apply(target,state);
}
