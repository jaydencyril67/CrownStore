export type CrownApp = {
  id: string;
  slug: string;
  name: string;
  shortDescription: string;
  description: string;
  packageId: string;
  iconUrl: string | null;
  screenshots: string[];
  category: string;
  releaseId: string | null;
  versionName: string | null;
  versionCode: number | string | null;
  changelog: string | null;
  sizeBytes: number | string | null;
  sha256: string | null;
  publishedAt: string | null;
  firstPublishedAt?: string | null;
  lastUpdatedAt?: string | null;
  totalDownloads?: number;
  averageRating?: number | string | null;
  reviewCount?: number;
};

export type AppsResponse = { apps: CrownApp[] };
