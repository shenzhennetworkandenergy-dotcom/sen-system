# Logistics Maps

The shipment map is a responsive SVG visualization built from stored route points and recorded tracking checkpoints. It uses no paid map API.

The moving marker represents estimated progress along an operational route. It must always be labelled as estimated and not live GPS. Reduced-motion preferences disable decorative motion. If fewer than two valid coordinates exist, the interface shows a truthful empty state instead of inventing a route.

When geographic data is presented in a map-like context, the interface retains OpenStreetMap contributor attribution.
