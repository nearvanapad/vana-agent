/**
 * Lists a wasm module's exported function names, i.e. the contract's callable methods.
 * Reads only the export section; no wasm runtime needed.
 */
export function wasmExports(code: Uint8Array): string[] {
  if (code[0] !== 0x00 || code[1] !== 0x61 || code[2] !== 0x73 || code[3] !== 0x6d) throw new Error("not a wasm module");
  let p = 8;
  const u32 = () => {
    let result = 0;
    let shift = 0;
    for (;;) {
      const b = code[p++]!;
      result |= (b & 0x7f) << shift;
      if (!(b & 0x80)) return result >>> 0;
      shift += 7;
    }
  };
  const decoder = new TextDecoder();
  while (p < code.length) {
    const id = code[p++]!;
    const size = u32();
    const end = p + size;
    if (id === 7) {
      const out: string[] = [];
      const n = u32();
      for (let i = 0; i < n; i++) {
        const len = u32();
        const name = decoder.decode(code.subarray(p, p + len));
        p += len;
        const kind = code[p++]!;
        u32(); // index
        if (kind === 0) out.push(name);
      }
      return out;
    }
    p = end;
  }
  return [];
}

export function decodeBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
