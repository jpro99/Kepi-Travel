// @ts-nocheck
"use client";

import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import PathFinder from 'geojson-path-finder';
import { point } from '@turf/helpers';
import nearestPointOnLine from '@turf/nearest-point-on-line';

interface AirportMapProps {
    maptilerKey: string;
    airportIata: string;
    userLat: number | null;
    userLon: number | null;
    gate: string | null;
}

export function AirportMap({ maptilerKey, airportIata, userLat, userLon, gate }: AirportMapProps) {
    const mapContainer = useRef<HTMLDivElement>(null);
    const map = useRef<maplibregl.Map | null>(null);
    const userMarker = useRef<maplibregl.Marker | null>(null);
    const [heading, setHeading] = useState(0);
    const [airportLayout, setAirportLayout] = useState<any>(null);

    // Effect for device orientation
    useEffect(() => {
        const handleOrientation = (event: DeviceOrientationEvent) => {
            const newHeading = event.alpha;
            if (newHeading !== null) {
                setHeading(newHeading);
            }
        };

        const startOrientation = () => {
            if (typeof (DeviceOrientationEvent as any).requestPermission === 'function') {
                (DeviceOrientationEvent as any).requestPermission()
                    .then((permissionState: string) => {
                        if (permissionState === 'granted') {
                            window.addEventListener('deviceorientation', handleOrientation);
                        }
                    })
                    .catch(console.error);
            } else {
                window.addEventListener('deviceorientation', handleOrientation);
            }
        };

        startOrientation();

        return () => {
            window.removeEventListener('deviceorientation', handleOrientation);
        };
    }, []);

    // Effect for initializing map and loading layout
    useEffect(() => {
        if (map.current || !mapContainer.current) return;

        map.current = new maplibregl.Map({
            container: mapContainer.current,
            style: `https://api.maptiler.com/maps/basic-v2/style.json?key=${maptilerKey}`,
            center: [-73.78, 40.643], // Default to JFK
            zoom: 16,
            pitch: 60,
        });

        map.current.on('load', async () => {
            try {
                const response = await fetch(`/api/airport-layout/${airportIata.toLowerCase()}`);
                if (!response.ok) {
                    console.error('Failed to load airport layout for', airportIata);
                    return;
                }
                const geojson = await response.json();
                setAirportLayout(geojson);

                if (map.current) {
                    map.current.addSource('airport-layout', { type: 'geojson', data: geojson });

                    map.current.addLayer({
                        'id': 'terminals', 'type': 'fill', 'source': 'airport-layout',
                        'filter': ['==', ['get', 'type'], 'terminal'],
                        'paint': { 'fill-color': '#e0e0e0', 'fill-opacity': 0.5, 'fill-outline-color': '#a0a0a0' }
                    });
                    map.current.addLayer({
                        'id': 'walkways', 'type': 'line', 'source': 'airport-layout',
                        'filter': ['==', ['get', 'type'], 'walkway'],
                        'paint': { 'line-color': '#888', 'line-width': 2 }
                    });
                    map.current.addLayer({
                        'id': 'gates', 'type': 'symbol', 'source': 'airport-layout',
                        'filter': ['==', ['get', 'type'], 'gate'],
                        'layout': { 'icon-image': 'airport-15', 'text-field': ['get', 'name'], 'text-offset': [0, 1.5], 'text-anchor': 'top' },
                        'paint': { 'text-color': '#000000' }
                    });

                    // Add an empty source for the route path
                    map.current.addSource('route', { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [] } } });
                    map.current.addLayer({
                        'id': 'route', 'type': 'line', 'source': 'route',
                        'layout': { 'line-join': 'round', 'line-cap': 'round' },
                        'paint': { 'line-color': '#3887be', 'line-width': 5, 'line-opacity': 0.75 }
                    });
                }
            } catch (error) {
                console.error('Error loading airport layout:', error);
            }
        });

    }, [maptilerKey, airportIata]);

    // Effect for user location, heading, and routing
    useEffect(() => {
        if (!map.current || !map.current.isStyleLoaded() || !userLat || !userLon) return;

        // Create or update user marker
        if (!userMarker.current) {
            const el = document.createElement('div');
            el.className = 'user-arrow';
            el.style.backgroundImage = 'url(/up-arrow-blue.svg)';
            el.style.width = '40px'; el.style.height = '40px';
            el.style.backgroundSize = 'contain'; el.style.backgroundRepeat = 'no-repeat';
            el.style.transition = 'transform 0.1s linear';

            userMarker.current = new maplibregl.Marker({ element: el, anchor: 'center' })
                .setLngLat([userLon, userLat])
                .addTo(map.current);

            map.current.easeTo({ center: [userLon, userLat], zoom: 18, pitch: 75, duration: 1000 });
        } else {
            userMarker.current.setLngLat([userLon, userLat]);
        }

        // Update marker rotation
        const rotation = Math.round(heading);
        (userMarker.current.getElement() as HTMLDivElement).style.transform = `rotate(${rotation}deg)`;

        // --- Dynamic Routing Logic ---
        if (airportLayout && gate) {
            const walkways = { type: 'FeatureCollection' as const, features: airportLayout.features.filter((f: { properties?: { type?: string } }) => f.properties?.type === 'walkway') };
            const pathFinder = new PathFinder(walkways);
            const destinationGate = airportLayout.features.find((f: any) => f.properties.type === 'gate' && f.properties.name === gate);

            if (!destinationGate) {
                console.warn(`Gate ${gate} not found in airport layout.`);
                return;
            }

            // Find the user's start point (snapped to the nearest walkway)
            const userPoint = point([userLon, userLat]);
            const nearest = nearestPointOnLine(walkways, userPoint, { units: 'meters' });

            const startPoint = nearest.geometry.coordinates;
            const endPoint = destinationGate.geometry.coordinates;

            const path = pathFinder.findPath({ type: 'Point', coordinates: startPoint }, { type: 'Point', coordinates: endPoint });

            const routeSource = map.current.getSource('route') as maplibregl.GeoJSONSource;
            if (routeSource && path) {
                routeSource.setData({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: path.path } });
            } else if (routeSource) {
                // Clear the path if no route is found
                routeSource.setData({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [] } });
            }
        }

    }, [userLat, userLon, heading, airportLayout, gate]);

    return <div ref={mapContainer} className="w-full h-full" />;
}
