export type ShowcaseAsset = {
  assetId: string;
  name: string;
  collectionName: string;
  collectionDisplay: string;
  schemaName: string;
  templateId: string | null;
  mint: string | null;
  maxSupply: string | null;
  rarity: string | null;
  year: string | null;
  designer: string | null;
  make: string | null;
  set: string | null;
  imageUrl: string | null;
  backImageUrl: string | null;
  videoUrl: string | null;
};

export const WAX_ACCOUNT = /^[a-z1-5.]{1,12}$/;

export function mintLabel(asset: ShowcaseAsset) {
  if (!asset.mint) return "Mint unavailable";
  return `#${asset.mint}${asset.maxSupply && asset.maxSupply !== "0" ? ` / ${asset.maxSupply}` : ""}`;
}

export function seriesLabel(schema: string) {
  return schema.replace(/^series(\d+)$/i, "Series $1");
}
