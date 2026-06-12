import type { Chain, HotelRecord, TouristAnchor, TransitStop } from "@/lib/search/types";

export interface CityCatalog {
  id: string;
  label: string;
  map: {
    center: { lng: number; lat: number };
    zoom: number;
    maxBounds: [[number, number], [number, number]];
  };
  hotels: HotelRecord[];
  transit: TransitStop[];
  touristAnchors: TouristAnchor[];
}

export type { Chain, HotelRecord, TouristAnchor, TransitStop };
