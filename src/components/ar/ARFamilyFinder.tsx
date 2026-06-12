// @ts-nocheck
"use client";

import { useState, useEffect, useMemo, useRef } from 'react';
import dynamic from 'next/dynamic';
import { triggerHaptic } from '@/lib/native/haptics';
import * as turf from '@turf/turf';
import './PathShader'; // Register the A-Frame component

const ARScene = dynamic(() => import('@/components/ar/ARScene'), { ssr: false });

interface Location {
    id: string;
    name: string;
    lat: number;
    lon: number;
}

interface ARFamilyFinderProps {
    familyLocations: Location[];
    targetId: string | null;
    onClose: () => void;
}

const ARFamilyFinder: React.FC<ARFamilyFinderProps> = ({ familyLocations, targetId, onClose }) => {
    const [userLocation, setUserLocation] = useState<{ lat: number, lon: number, heading: number | null } | null>(null);
    const hapticIntervalRef = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        const watchId = navigator.geolocation.watchPosition(
            (pos) => {
                setUserLocation({
                    lat: pos.coords.latitude,
                    lon: pos.coords.longitude,
                    heading: pos.coords.heading
                });
            },
            (err) => console.error("Error getting user location:", err),
            { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
        );
        return () => navigator.geolocation.clearWatch(watchId);
    }, []);

    const targetLocation = useMemo(() => familyLocations.find(m => m.id === targetId), [familyLocations, targetId]);

    const pathLine = useMemo(() => {
        if (!userLocation || !targetLocation) return null;
        return turf.lineString([[userLocation.lon, userLocation.lat], [targetLocation.lon, targetLocation.lat]]);
    }, [userLocation, targetLocation]);

    const pathSegments = useMemo(() => {
        if (!pathLine) return [];
        const length = turf.length(pathLine, { units: 'meters' });
        const numSegments = Math.max(2, Math.floor(length / 2)); // 2 meter segments
        const points = Array.from({ length: numSegments }, (_, i) => {
            const distance = (i / (numSegments - 1)) * length;
            const point = turf.along(pathLine, distance, { units: 'meters' });
            return { lon: point.geometry.coordinates[0], lat: point.geometry.coordinates[1] };
        });
        return points;
    }, [pathLine]);


    // Bio-Haptic Feedback Engine
    useEffect(() => {
        if (hapticIntervalRef.current) {
            clearInterval(hapticIntervalRef.current);
        }

        if (!pathLine || !userLocation || userLocation.heading === null) return;

        hapticIntervalRef.current = setInterval(() => {
            const userPoint = turf.point([userLocation.lon, userLocation.lat]);
            const distance = turf.pointToLineDistance(userPoint, pathLine, { units: 'meters' });

            if (distance > 15) { // User has strayed far from the path
                triggerHaptic('error');
                return;
            }
            
            const nextPointOnPath = turf.along(pathLine, turf.length(pathLine) * 0.1, {units: 'meters'});
            const pathBearing = turf.bearing(userPoint, nextPointOnPath);
            const headingDifference = Math.abs(userLocation.heading - pathBearing);

            if (headingDifference < 30 || headingDifference > 330) {
                 // Correct direction: calm, steady heartbeat
                 window.navigator.vibrate([50, 600, 50, 600]);
            } else {
                // Wrong direction: insistent, faster pulse
                 window.navigator.vibrate([100, 150, 100, 150]);
            }

        }, 2000);

        return () => {
            if (hapticIntervalRef.current) {
                clearInterval(hapticIntervalRef.current);
            }
        };

    }, [pathLine, userLocation]);

    return (
        <div style={{ height: '100vh', width: '100vw', position: 'fixed', top: 0, left: 0, zIndex: 9999 }}>
            <ARScene>
                {/* The Chrono-Spatial Path */}
                {pathSegments.slice(0, -1).map((point, index) => {
                    const nextPoint = pathSegments[index + 1];
                    if (!nextPoint) return null;

                    const midpoint = turf.midpoint(
                        turf.point([point.lon, point.lat]), 
                        turf.point([nextPoint.lon, nextPoint.lat])
                    );
                    const distance = turf.distance(point, nextPoint, { units: 'meters' });
                    const bearing = turf.bearing(point, nextPoint);

                    return (
                        <a-entity 
                            key={index} 
                            gps-entity-place={`latitude: ${midpoint.geometry.coordinates[1]}; longitude: ${midpoint.geometry.coordinates[0]};`}
                            rotation={`0 ${-bearing} 90`}
                        >
                            <a-cylinder
                                radius="0.4"
                                height={distance}
                                path-shader
                            ></a-cylinder>
                        </a-entity>
                    )
                })}

                {/* Target Beacon */}
                {targetLocation && (
                    <a-entity gps-entity-place={`latitude: ${targetLocation.lat}; longitude: ${targetLocation.lon};`}>
                        <a-text
                            value={targetLocation.name}
                            look-at="[gps-camera]"
                            scale="25 25 25"
                            position="0 10 0"
                        ></a-text>
                         <a-cone color="#007AFF" radius-bottom="3" radius-top="0" height="5" position="0 4 0" animation="property: rotation; to: 0 360 0; loop: true; dur: 4000; easing: linear;"></a-cone>
                    </a-entity>
                )}
            </ARScene>
            <button onClick={onClose} style={{ position: 'absolute', top: '20px', right: '20px', zIndex: 10000, padding: '10px 20px', fontSize: '16px', borderRadius: '20px', border: 'none', background: 'rgba(0,0,0,0.5)', color: 'white' }}>
                Close AR
            </button>
        </div>
    );
};

export default ARFamilyFinder;
