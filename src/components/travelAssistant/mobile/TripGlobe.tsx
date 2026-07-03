"use client";

import { useEffect, useRef } from "react";
import type { RouteMapPoint } from "@/lib/travelAssistant/tripRouteMapGeo";
import { greatCircleLine } from "@/lib/travelAssistant/tripRouteMapGeo";
import { latLonToVector3 } from "@/lib/map/globeCoords";

export interface GlobeArc {
  id: string;
  fromLat: number;
  fromLon: number;
  toLat: number;
  toLon: number;
  color?: string;
}

interface TripGlobeProps {
  arcs: GlobeArc[];
  points?: RouteMapPoint[];
  /** Full viewport height for Map tab */
  immersive?: boolean;
  className?: string;
}

export function TripGlobe({ arcs, points = [], immersive = false, className = "" }: TripGlobeProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let disposed = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let renderer: any = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let scene: any = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let camera: any = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let globeGroup: any = null;

    const pointer = { down: false, lastX: 0, lastY: 0 };
    const rotation = { x: 0.25, y: 0 };

    const onPointerDown = (e: PointerEvent) => {
      pointer.down = true;
      pointer.lastX = e.clientX;
      pointer.lastY = e.clientY;
    };
    const onPointerUp = () => {
      pointer.down = false;
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!pointer.down) return;
      const dx = e.clientX - pointer.lastX;
      const dy = e.clientY - pointer.lastY;
      pointer.lastX = e.clientX;
      pointer.lastY = e.clientY;
      rotation.y += dx * 0.005;
      rotation.x = Math.max(-0.6, Math.min(0.6, rotation.x + dy * 0.004));
    };

    void import("three").then((THREE) => {
      if (disposed || !container) return;

      const width = container.clientWidth || 320;
      const height = container.clientHeight || (immersive ? 480 : 280);

      scene = new THREE.Scene();
      scene.background = new THREE.Color(0x020818);

      camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 100);
      camera.position.set(0, 0, 2.8);

      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(width, height);
      container.appendChild(renderer.domElement);

      globeGroup = new THREE.Group();
      scene.add(globeGroup);

      const earthGeo = new THREE.SphereGeometry(1, 64, 64);
      const earthMat = new THREE.MeshPhongMaterial({
        color: 0x0c2d5e,
        emissive: 0x061428,
        shininess: 12,
        specular: 0x224466,
      });
      const earth = new THREE.Mesh(earthGeo, earthMat);
      globeGroup.add(earth);

      const atmosGeo = new THREE.SphereGeometry(1.02, 48, 48);
      const atmosMat = new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.08,
        side: THREE.BackSide,
      });
      globeGroup.add(new THREE.Mesh(atmosGeo, atmosMat));

      const ambient = new THREE.AmbientLight(0x446688, 0.9);
      const sun = new THREE.DirectionalLight(0xffffff, 1.1);
      sun.position.set(4, 2, 5);
      scene.add(ambient, sun);

      for (const arc of arcs) {
        const lineCoords = greatCircleLine(arc.fromLon, arc.fromLat, arc.toLon, arc.toLat, 48);
        const arcPoints = lineCoords.map(([lon, lat], i) => {
          const t = i / Math.max(lineCoords.length - 1, 1);
          const bulge = 1 + 0.14 * Math.sin(Math.PI * t);
          const v = latLonToVector3(lat, lon, bulge);
          return new THREE.Vector3(v.x, v.y, v.z);
        });
        const curve = new THREE.CatmullRomCurve3(arcPoints);
        const tubeGeo = new THREE.TubeGeometry(curve, 64, 0.004, 6, false);
        const tubeMat = new THREE.MeshBasicMaterial({
          color: arc.color ? parseInt(arc.color.replace("#", ""), 16) : 0x007aff,
          transparent: true,
          opacity: 0.95,
        });
        globeGroup.add(new THREE.Mesh(tubeGeo, tubeMat));
      }

      for (const point of points) {
        const v = latLonToVector3(point.lat, point.lon, 1.012);
        const dotGeo = new THREE.SphereGeometry(0.018, 12, 12);
        const dotMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
        const dot = new THREE.Mesh(dotGeo, dotMat);
        dot.position.set(v.x, v.y, v.z);
        globeGroup.add(dot);
      }

      if (points.length >= 2) {
        const avg = points.reduce(
          (acc, p) => {
            const v = latLonToVector3(p.lat, p.lon, 1);
            return { x: acc.x + v.x, y: acc.y + v.y, z: acc.z + v.z };
          },
          { x: 0, y: 0, z: 0 },
        );
        const len = Math.sqrt(avg.x * avg.x + avg.y * avg.y + avg.z * avg.z) || 1;
        rotation.y = Math.atan2(avg.x / len, avg.z / len);
      }

      const animate = (time: number) => {
        if (disposed) return;
        rafRef.current = requestAnimationFrame(animate);
        if (!pointer.down) {
          rotation.y += 0.0008;
        }
        globeGroup.rotation.x = rotation.x;
        globeGroup.rotation.y = rotation.y;
        const pulse = 1 + 0.003 * Math.sin(time * 0.002);
        globeGroup.scale.setScalar(pulse);
        renderer.render(scene, camera);
      };
      animate(0);

      const onResize = () => {
        if (!container || !renderer || !camera) return;
        const w = container.clientWidth || 320;
        const h = container.clientHeight || 280;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
      };
      window.addEventListener("resize", onResize);
      container.addEventListener("pointerdown", onPointerDown);
      window.addEventListener("pointerup", onPointerUp);
      window.addEventListener("pointermove", onPointerMove);

      return () => {
        window.removeEventListener("resize", onResize);
        container.removeEventListener("pointerdown", onPointerDown);
        window.removeEventListener("pointerup", onPointerUp);
        window.removeEventListener("pointermove", onPointerMove);
      };
    });

    return () => {
      disposed = true;
      cancelAnimationFrame(rafRef.current);
      if (renderer?.domElement?.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }
      renderer?.dispose();
    };
  }, [arcs, points, immersive]);

  return (
    <div
      ref={containerRef}
      className={`touch-none select-none overflow-hidden ${immersive ? "h-full min-h-[50vh] w-full" : "h-full w-full"} ${className}`}
      aria-hidden
    />
  );
}
