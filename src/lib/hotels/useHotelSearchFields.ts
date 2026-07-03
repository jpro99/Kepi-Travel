"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface HotelSearchFieldDefaults {
  city?: string;
  cityIata?: string;
  checkIn?: string;
  checkOut?: string;
}

export function hotelDefaultsSignature(
  city: string,
  cityIata: string,
  checkIn: string,
  checkOut: string,
): string {
  return `${city}|${cityIata}|${checkIn}|${checkOut}`;
}

/**
 * Keeps hotel search fields in sync with trip defaults without clobbering
 * in-progress edits when the parent re-renders (mobile polls every few seconds).
 */
export function useHotelSearchFields(defaults: HotelSearchFieldDefaults) {
  const defaultCity = defaults.city ?? "";
  const defaultCityIata = defaults.cityIata ?? "";
  const defaultCheckIn = defaults.checkIn?.slice(0, 10) ?? "";
  const defaultCheckOut = defaults.checkOut?.slice(0, 10) ?? "";

  const signature = hotelDefaultsSignature(
    defaultCity,
    defaultCityIata,
    defaultCheckIn,
    defaultCheckOut,
  );
  const appliedSignatureRef = useRef<string | null>(null);

  const [city, setCity] = useState(defaultCity);
  const [cityIata, setCityIata] = useState(defaultCityIata);
  const [checkIn, setCheckIn] = useState(defaultCheckIn);
  const [checkOut, setCheckOut] = useState(defaultCheckOut);

  useEffect(() => {
    if (appliedSignatureRef.current === signature) return;
    appliedSignatureRef.current = signature;
    setCity(defaultCity);
    setCityIata(defaultCityIata);
    setCheckIn(defaultCheckIn);
    setCheckOut(defaultCheckOut);
  }, [signature, defaultCity, defaultCityIata, defaultCheckIn, defaultCheckOut]);

  const setCityField = useCallback((display: string, iata: string) => {
    setCity(display);
    setCityIata(iata);
  }, []);

  const clearCityField = useCallback(() => {
    setCity("");
    setCityIata("");
  }, []);

  return {
    city,
    cityIata,
    checkIn,
    checkOut,
    setCity,
    setCityIata,
    setCheckIn,
    setCheckOut,
    setCityField,
    clearCityField,
  };
}
