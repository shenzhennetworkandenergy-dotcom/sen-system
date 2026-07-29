"use client";

/* eslint-disable @next/next/no-img-element */
import { useState, type MouseEvent } from "react";

type ProductImage = {
  id: string;
  url: string;
  alt: string;
  primary: boolean;
};

export function ProductImageGallery({
  images,
  category,
}: {
  images: ProductImage[];
  category: string;
}) {
  const initialImage = images.find((image) => image.primary) ?? images[0] ?? null;
  const [selectedId, setSelectedId] = useState(initialImage?.id ?? null);
  const [zooming, setZooming] = useState(false);
  const [zoomPosition, setZoomPosition] = useState({ x: 50, y: 50 });
  const selected =
    images.find((image) => image.id === selectedId) ?? initialImage;

  function updateZoomPosition(event: MouseEvent<HTMLButtonElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - bounds.left) / bounds.width) * 100;
    const y = ((event.clientY - bounds.top) / bounds.height) * 100;
    setZoomPosition({
      x: Math.min(100, Math.max(0, x)),
      y: Math.min(100, Math.max(0, y)),
    });
    setZooming(true);
  }

  if (!selected) {
    return (
      <div className="sen-detail-media text-slate-500">
        Product image coming soon
        <span className="absolute left-4 top-4 rounded-full bg-[#07102f] px-3 py-1 text-xs font-semibold text-cyan-200">
          {category}
        </span>
      </div>
    );
  }

  return (
    <div>
      <button
        type="button"
        aria-label={`Zoom ${selected.alt}`}
        className="sen-detail-media group block w-full cursor-zoom-in overflow-hidden text-left focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-cyan-400"
        style={
          zooming
            ? {
                backgroundImage: `url("${selected.url}")`,
                backgroundPosition: `${zoomPosition.x}% ${zoomPosition.y}%`,
                backgroundRepeat: "no-repeat",
                backgroundSize: "240%",
              }
            : undefined
        }
        onMouseEnter={(event) => {
          updateZoomPosition(event);
          setZooming(true);
        }}
        onMouseMove={updateZoomPosition}
        onMouseLeave={() => setZooming(false)}
        onClick={() => setZooming(true)}
      >
        <img
          src={selected.url}
          alt={selected.alt}
          draggable={false}
          className={`h-full w-full object-contain p-6 transition duration-200 sm:p-10 ${
            zooming ? "opacity-0" : "opacity-100"
          }`}
        />
        <span className="absolute left-4 top-4 rounded-full bg-[#07102f] px-3 py-1 text-xs font-semibold text-cyan-200">
          {category}
        </span>
        <span className="pointer-events-none absolute bottom-4 right-4 rounded-full bg-slate-950/80 px-3 py-1.5 text-xs font-semibold text-white opacity-100 shadow-lg transition sm:opacity-0 sm:group-hover:opacity-100">
          Hover to zoom
        </span>
      </button>

      {images.length > 1 ? (
        <ul
          className="mt-4 grid grid-cols-4 gap-3"
          aria-label="Product images"
        >
          {images.map((image, index) => {
            const active = image.id === selected.id;
            return (
              <li key={image.id} className="aspect-square">
                <button
                  type="button"
                  aria-label={`View product image ${index + 1}`}
                  aria-pressed={active}
                  onClick={() => {
                    setSelectedId(image.id);
                    setZooming(false);
                    setZoomPosition({ x: 50, y: 50 });
                  }}
                  className={`h-full w-full overflow-hidden rounded-xl border-2 bg-white transition duration-200 hover:-translate-y-0.5 hover:border-cyan-500 hover:shadow-lg focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-cyan-400 ${
                    active
                      ? "border-cyan-500 shadow-md ring-2 ring-cyan-200"
                      : "border-slate-200"
                  }`}
                >
                  <img
                    src={image.url}
                    alt={image.alt}
                    className="h-full w-full object-contain p-2"
                  />
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}

      <p className="mt-3 text-xs text-slate-500">
        Select an image, then move the pointer over the large image to inspect
        details. Tap the large image to toggle zoom on touch devices.
      </p>
    </div>
  );
}
