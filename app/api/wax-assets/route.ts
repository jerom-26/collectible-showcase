import { NextRequest, NextResponse } from "next/server";
import { WAX_ACCOUNT } from "@/lib/collection";

const ATOMIC_ASSETS_ENDPOINT = "https://wax.api.atomicassets.io/atomicassets/v1/assets";
const IPFS_GATEWAY = "https://gateway.pinata.cloud/ipfs/";

type UnknownRecord = Record<string, unknown>;

function record(value: unknown): UnknownRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as UnknownRecord) : {};
}

function text(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const object = record(value);
  for (const field of [object.url, object.uri, object.cid, object.hash, object.value]) {
    const candidate = text(field);
    if (candidate) return candidate;
  }
  return null;
}

function firstText(...values: unknown[]) {
  for (const value of values) {
    const candidate = text(value);
    if (candidate) return candidate;
  }
  return null;
}

function mediaUrl(value: unknown) {
  const candidate = text(value);
  if (!candidate) return null;
  if (/^https:\/\//i.test(candidate)) return candidate;
  const withoutScheme = candidate.replace(/^ipfs:\/\//i, "").replace(/^ipfs\//i, "");
  if (/^(Qm[1-9A-HJ-NP-Za-km-z]{44}|bafy[a-z0-9]+)(\/.*)?$/i.test(withoutScheme)) {
    return `${IPFS_GATEWAY}${withoutScheme}`;
  }
  return null;
}

export async function GET(request: NextRequest) {
  const account = request.nextUrl.searchParams.get("account")?.trim().toLowerCase() ?? "";
  if (!WAX_ACCOUNT.test(account)) {
    return NextResponse.json({ error: "Enter a valid WAX account name." }, { status: 400 });
  }

  const url = new URL(ATOMIC_ASSETS_ENDPOINT);
  url.searchParams.set("owner", account);
  url.searchParams.set("collection_name", "hotwheels");
  url.searchParams.set("page", "1");
  url.searchParams.set("limit", "24");
  url.searchParams.set("order", "desc");
  url.searchParams.set("sort", "asset_id");

  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) {
      return NextResponse.json({ error: "The WAX indexer is temporarily unavailable." }, { status: 502 });
    }

    const payload = record(await response.json());
    if (payload.success !== true || !Array.isArray(payload.data)) {
      return NextResponse.json({ error: "The WAX indexer returned an incomplete response. Please try again." }, { status: 502 });
    }
    const seen = new Set<string>();
    const rawAssets = payload.data.filter((value) => {
      const asset = record(value);
      const id = text(asset.asset_id);
      if (!id || !/^\d+$/.test(id) || seen.has(id) || asset.owner !== account || record(asset.collection).collection_name !== "hotwheels") return false;
      seen.add(id);
      return true;
    });
    const assets = rawAssets.map((value) => {
      const asset = record(value);
      const data = record(asset.data);
      const template = record(asset.template);
      const immutable = record(template.immutable_data);
      const collection = record(asset.collection);

      return {
        assetId: firstText(asset.asset_id) ?? "unknown",
        name: firstText(data.name, asset.name, immutable.name) ?? "Unnamed collectible",
        collectionName: firstText(collection.collection_name) ?? "hotwheels",
        collectionDisplay: firstText(collection.name) ?? "Hot Wheels NFT Garage",
        schemaName: firstText(record(asset.schema).schema_name) ?? "unknown",
        templateId: firstText(template.template_id),
        mint: firstText(asset.template_mint),
        maxSupply: firstText(template.max_supply),
        rarity: firstText(data.rarity, immutable.rarity),
        year: firstText(data["year released"], immutable["year released"]),
        designer: firstText(data.designer, immutable.designer),
        make: firstText(data.make, immutable.make),
        set: firstText(data.collection, immutable.collection),
        imageUrl: mediaUrl(firstText(data.img, data.image, immutable.img, immutable.image)),
        backImageUrl: mediaUrl(firstText(data.backimg, data.back_image, immutable.backimg, immutable.back_image)),
        videoUrl: mediaUrl(firstText(data.video, data.animation_url, immutable.video, immutable.animation_url)),
      };
    });

    return NextResponse.json({ account, collection: "hotwheels", assets });
  } catch (error) {
    console.error("AtomicAssets request failed", error);
    return NextResponse.json({ error: "The WAX collection could not be reached. Try again shortly." }, { status: 504 });
  }
}
