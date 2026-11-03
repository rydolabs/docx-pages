export function createStyleCache(){ const cache=new Map(); return { get:key=>cache.get(key), set:(key,value)=>(cache.set(key,value),value), clear:()=>cache.clear(), size:()=>cache.size }; }
