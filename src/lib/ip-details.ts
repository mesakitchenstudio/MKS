export type IpDetails = {
  ip: string;
  decimal: number | null;
  hostname: string;
  asn: string;
  isp: string;
  services: string;
  country: string;
  region: string;
  city: string;
  latitude: number | null;
  longitude: number | null;
  latitudeLabel: string;
  longitudeLabel: string;
  mapEmbedUrl: string | null;
};
