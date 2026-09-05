export function xmur3(str: string): () => number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashSeed(seed: string): number {
  return xmur3(seed)();
}

export function randomSeedWord(): string {
  const a = ["ridge", "fold", "mesa", "cairn", "scree", "kame", "wold", "fell"];
  const b = ["mist", "ash", "loom", "vale", "rift", "dune", "holt", "tarn"];
  const n = Math.floor(Math.random() * 9000 + 1000);
  const i = Math.floor(Math.random() * a.length);
  const j = Math.floor(Math.random() * b.length);
  return `${a[i]}-${b[j]}-${n}`;
}
