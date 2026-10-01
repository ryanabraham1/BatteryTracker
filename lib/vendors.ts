import "server-only";

/**
 * Finding where to buy a COTS part from what Onshape knows about it (vendor
 * + the vendor's part number). Most FRC vendors run Shopify stores, whose
 * public catalog (/products.json) lists every variant's SKU with its price,
 * so a part number resolves to the exact product page. Others get a direct
 * (McMaster) or search (REV, goBILDA, VEX) link.
 */

export interface VendorHit {
  url: string;
  /** per pack (or each), dollars; null when the store doesn't say */
  price: number | null;
  /** units per pack ("(5-Pack)" in the product name) */
  pack: number | null;
  vendor: string;
  title: string;
}

interface Store {
  host: string;
  vendor: string;
  matches: (vendor: string, pn: string) => boolean;
}

const STORES: Store[] = [
  { host: "wcproducts.com", vendor: "West Coast Products", matches: (v, pn) => /^WCP-/i.test(pn) || /west\s*coast|\bwcp\b/i.test(v) },
  { host: "andymark.com", vendor: "AndyMark", matches: (v, pn) => /^am-\d/i.test(pn) || /andy\s*mark/i.test(v) },
  { host: "www.swervedrivespecialties.com", vendor: "Swerve Drive Specialties", matches: (v, pn) => /^SDS/i.test(pn) || /swerve drive spec|\bsds\b/i.test(v) },
  { host: "store.ctr-electronics.com", vendor: "CTR Electronics", matches: (v) => /\bctr\b|ctre|cross the road/i.test(v) },
  { host: "www.thethriftybot.com", vendor: "ThriftyBot", matches: (v, pn) => /^TTB/i.test(pn) || /thrifty/i.test(v) },
];

interface Catalog {
  at: number;
  bySku: Map<string, VendorHit>;
  byTitle: Map<string, VendorHit>;
}
const catalogs = new Map<string, Promise<Catalog>>();
const TTL = 6 * 3600_000;

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const packOf = (...texts: (string | undefined)[]) => {
  for (const t of texts) {
    const m = /\(?(\d+)[\s-]*(?:pack|pk|pcs|pieces)\)?/i.exec(t ?? "");
    if (m && Number(m[1]) > 1) return Number(m[1]);
  }
  return null;
};

async function loadCatalog(s: Store): Promise<Catalog> {
  const bySku = new Map<string, VendorHit>();
  const byTitle = new Map<string, VendorHit>();
  for (let page = 1; page <= 40; page++) {
    const res = await fetch(`https://${s.host}/products.json?limit=250&page=${page}`, {
      headers: { "User-Agent": "FRC3256-Tools/1.0 (team build tracker)" },
      signal: AbortSignal.timeout(20_000),
      cache: "no-store",
    });
    if (!res.ok) break;
    const { products } = (await res.json()) as {
      products?: { handle: string; title: string; variants?: { id: number; sku?: string; price?: string; title?: string }[] }[];
    };
    if (!products?.length) break;
    for (const p of products) {
      for (const v of p.variants ?? []) {
        const one = (p.variants?.length ?? 0) <= 1;
        const hit: VendorHit = {
          url: `https://${s.host}/products/${p.handle}${one ? "" : `?variant=${v.id}`}`,
          price: v.price ? Number(v.price) : null,
          pack: packOf(p.title, v.title),
          vendor: s.vendor,
          title: one || !v.title || v.title === "Default Title" ? p.title : `${p.title} — ${v.title}`,
        };
        if (v.sku) bySku.set(v.sku.trim().toUpperCase(), hit);
        byTitle.set(norm(hit.title), hit);
        if (one) byTitle.set(norm(p.title), hit);
      }
    }
    if (products.length < 250) break;
  }
  return { at: Date.now(), bySku, byTitle };
}

function catalog(s: Store): Promise<Catalog> {
  const cur = catalogs.get(s.host);
  if (cur) {
    // refresh in the background-ish: a stale one is replaced on the next call
    void cur.then((c) => {
      if (Date.now() - c.at > TTL) catalogs.delete(s.host);
    });
    return cur;
  }
  const p = loadCatalog(s).catch((e) => {
    catalogs.delete(s.host);
    throw e;
  });
  catalogs.set(s.host, p);
  return p;
}

const MCMASTER = /^\d{4,5}[A-Z]\d{1,5}$/i;

/** Where to buy one part; null when nothing points anywhere. */
export async function findVendorLink(part: { name: string; vendor: string; part_number: string }): Promise<VendorHit | null> {
  const pn = part.part_number.trim();
  const usable = pn && !/^(n\/?a|none|-)$/i.test(pn) && pn.length <= 40 && !/\s{2,}|\(/.test(pn);
  const vendor = part.vendor.trim();

  if (usable && (MCMASTER.test(pn) || /mcmaster/i.test(vendor))) {
    return { url: `https://www.mcmaster.com/${encodeURIComponent(pn)}/`, price: null, pack: null, vendor: "McMaster-Carr", title: part.name };
  }
  const store = STORES.find((s) => s.matches(vendor, usable ? pn : ""));
  if (store) {
    const c = await catalog(store);
    if (usable) {
      // exact SKU, then without a length / option suffix (WCP-1743-001 → WCP-1743)
      let key = pn.toUpperCase();
      for (let i = 0; i < 3; i++) {
        const hit = c.bySku.get(key);
        if (hit) return hit;
        const cut = key.replace(/-[^-]+$/, "");
        if (cut === key) break;
        key = cut;
      }
    }
    const byName = c.byTitle.get(norm(part.name));
    if (byName) return byName;
    if (usable) return { url: `https://${store.host}/search?q=${encodeURIComponent(pn)}`, price: null, pack: null, vendor: store.vendor, title: part.name };
    return null;
  }
  if (!usable) return null;
  if (/^REV-/i.test(pn) || /\brev\b/i.test(vendor))
    return { url: `https://www.revrobotics.com/search.php?search_query=${encodeURIComponent(pn)}`, price: null, pack: null, vendor: "REV Robotics", title: part.name };
  if (/gobilda/i.test(vendor))
    return { url: `https://www.gobilda.com/search-results-page/?q=${encodeURIComponent(pn)}`, price: null, pack: null, vendor: "goBILDA", title: part.name };
  if (/\bvex\b/i.test(vendor))
    return { url: `https://www.vexrobotics.com/search?q=${encodeURIComponent(pn)}`, price: null, pack: null, vendor: "VEX Robotics", title: part.name };
  return null;
}
