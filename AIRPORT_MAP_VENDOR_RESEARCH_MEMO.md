# Official Airport Map Vendor Embed — Research Memo (Part 1)

**Date:** 2026-07-13
**Author:** Kepi conductor (research pass, no code)
**Question:** Can Kepi embed a professional indoor-mapping vendor's live map + positioning (like the Atrius map at SEA) instead of building storefront-accurate maps in-house? What does it cost and require?
**Status:** Research complete. **Part 2 (integration) stays gated** — see "Gate for Part 2" at the end.

---

## Bottom line up front

**Recommendation: pursue LATER, not now.** Keep `OfficialAirportMapLink` (link-out) + the self-curated `AirportPackage` pipeline as the primary paths. Do not sign a vendor deal at current scale.

The blocking reason is **not** company size — it is **who owns the venue relationship**:

- The Atrius map at SEA (`maps.flysea.org`) is **licensed by the airport**, not by Atrius to the public. Kepi cannot self-serve license SEA's official map. Access to an airport's Atrius deployment comes through the **airport or an airline** granting a partner integration — the same way Atrius "pushes data in real-time to partner airlines' mobile apps" at Heathrow. That is a business-development relationship, not a checkout page.
- **Positioning (the blue dot) is infrastructure-dependent** (Atrius Sensory Network: BLE/VLC-enabled luminaires the airport installs). It exists only where the airport paid to deploy it. It is **not** something Kepi can turn on per-airport, and it is **not** universally available even across Atrius-mapped airports.

The only vendor Kepi can realistically buy **at its own scale today** is **Mappedin** ($165/map/month, self-serve SDK + routable data) — but that means Kepi licenses/curates maps itself per airport, which is close in effort to Kepi's existing `AirportPackage` pipeline, just paid, and still needs positioning infra to deliver a live dot.

---

## Vendor landscape

### 1. Atrius (Acuity Brands) — the SEA/flysea.org vendor
- **Coverage:** ~125 airports mapped, 450M passengers, "8 of top 10 NA airports / 6 of top 10 NA airlines." Confirmed on Kepi-relevant routes: **SEA, JFK, LHR (Heathrow), DUB (Dublin), DFW, ATL (Hartsfield IoT), AUS**, plus airline apps (American, United).
- **Embed product:** *Wayfinder Mobile SDK* (native iOS/Android, built on MapLibre native) **and** a *Wayfinder JavaScript SDK* (browser). **The JS SDK is the relevant one for Kepi** (Kepi is a Next.js web app, not a native app). Renders via WebGL (Mapbox/MapLibre). Iframe embedding is also supported.
- **What data comes with it:**
  - The **Browser SDK** is designed to *show a map* and *augment client-side UI with map data* — so it exposes POIs, floors, wayfinding routes, and step-by-step directions, not just a picture. That is better than "visual-only."
  - The **VMS API** exposes POI/geometry data programmatically, **but** it is in **private preview, no SLA, "not recommended in production," and serves unpublished data** that Atrius "cannot guarantee is consistent" with the live map. So routable geometry-as-data is *not* production-ready to route against independently today.
  - Practical read: the embed hands Kepi a **rendered, interactive, routable map surface** (with Atrius's own routing/lane logic inside it), not a clean geometry feed Kepi can pipe into its own A* graph. Atrius's embed even has a `showQueueSelectionUI` flag for security-lane selection — meaning **lane logic lives inside their map**, which is exactly Kepi's differentiator and would need to stay owned by Kepi's schematic model.
- **Positioning:** *Atrius Navigator* is a **separate product**, licensed separately, dependent on the **Atrius Sensory Network** (BLE/VLC luminaires the airport installs). Native SDK does beacon-region monitoring; web blue dot leans on Apple Core Location (iOS only, where the venue supports it). **Not Kepi-controllable, not universal.**
- **Terms/commitment:** No public price. Licensing is "for consumer-oriented applications to support a specific venue," and real deployments are airport/airline-scale contracts. **No self-serve tier for a company Kepi's size.** Access realistically requires an airport/airline partner to include Kepi.

### 2. Mappedin — the self-serviceable option
- **Coverage:** Not a fixed airport roster — **you build/commission the map.** Airports industry product exists; you supply or buy the floor plans.
- **Terms/cost:** **$165 per map / month (Pro)** for self-service SDK + API access (web, iOS, Android, React Native). Volume/enterprise pricing on request. Professional mapmaking available for an extra fee. **This is buyable at Kepi's scale today.**
- **Data:** Routable — SDK does wayfinding, step-by-step, and has a "Blue Dot Generator" utility. This is real geometry Kepi could route against.
- **Positioning:** Offered in the airport tier, but a real blue dot still needs positioning infrastructure/calibration; not free-standing from hardware.
- **Catch:** Kepi becomes the mapmaker/licensee per airport. That is effort comparable to Kepi's own `AirportPackage` pipeline — just paid and vendor-hosted. Not obviously better than what Kepi is already building, except for map polish.

### 3. Esri ArcGIS Indoors (+ ArcGIS IPS) — enterprise GIS
- **Coverage:** Denver (DEN), Miami (MIA) use it — but largely for **operations/space management**, not a consumer embed.
- **Data:** Fully routable (Network Analyst route service, JS SDK FloorFilter, 2D/3D).
- **Positioning:** ArcGIS IPS; blue dot via Apple Indoor Maps on iOS.
- **Verdict:** Enterprise-heavy, GIS-team oriented, expensive, overkill for Kepi's consumer wayfinding. Not the right tool at this stage.

(Jibestream was folded into the Esri/Inpixon lineage; treat "Jibestream" as effectively the Esri/ArcGIS Indoors or Inpixon indoor path — same enterprise conclusion.)

---

## Answers to the four key questions

1. **Which vendor covers Kepi's airports?** Atrius covers the most Kepi-relevant hubs (SEA/JFK/LHR/DUB/DFW/ATL/AUS + airline apps) — but coverage ≠ access; access needs the airport/airline. Mappedin covers "whatever you build." Esri covers a few ops deployments. **It's a patchwork; no single vendor is a turnkey answer.**
2. **Embed terms / cost / available at Kepi's size?** Atrius: airport/airline-scale contracts, no public self-serve, not sized for Kepi alone. Mappedin: **yes, $165/map/mo self-serve.** Esri: enterprise.
3. **Routable data or just visuals?** Atrius embed = interactive, routable **map surface** (routing lives inside their component; clean geometry-as-data only via a **private-preview, no-SLA VMS API**). Mappedin/Esri = genuinely routable data you control. **Conclusion: even with Atrius, Kepi's own credential-aware routing (PreCheck/CLEAR lane choice, lounge eligibility) must stay authoritative on Kepi's schematic model — the vendor map is a visual/browse layer, not a replacement for Kepi's routing brain.**
4. **Positioning included?** No — separately licensed for Atrius and **infrastructure-dependent** (airport-installed BLE/VLC). Real per-airport, not universal. Do not promise a live indoor dot you can't guarantee.

---

## Cost/coverage reality check (honest)

At Kepi's current scale, a commercial vendor embed is **premature**:
- Atrius official embeds require an airport/airline partner — Kepi doesn't have the volume yet to command those partnerships.
- Mappedin is affordable per-map but replicates effort Kepi already invests in its own `AirportPackage` pipeline, and still needs positioning infra to matter.
- Positioning (the thing that would most impress users) is the least available and least controllable piece.

**Revisit trigger:** pursue a vendor embed when (a) an airline/airport partnership makes an Atrius deployment accessible, or (b) Kepi has enough traveler volume at a specific hub to justify a paid Mappedin map there as a pilot. Until then, `OfficialAirportMapLink` (honest link-out) + Kepi's self-curated schematic remain the right primary paths.

---

## Gate for Part 2 (integration prompt)

Part 2 must NOT be built yet. Its precondition — *"a real, confirmed vendor relationship with known terms"* — is **not met**. This memo found published product terms, but **no signed/confirmed relationship** and **no owner-settled commercial deal**.

When (and only when) the owner confirms a specific vendor + airport + terms, Part 2 becomes: add `source: "vendor_embed"` to the `AirportPackage` model as an **additive** third source, keep resolution order `vendor_embed → curated (seed|db) → OfficialAirportMapLink → 404`, keep **Kepi's routing logic authoritative** even when the vendor map is shown, and wire any vendor positioning in as a new `IndoorPositionFix.source` that must still earn confidence via the existing `positionFusion.ts` calibration. Add a design law + resolution-order test at that time.
