import Image from "next/image";

export function ProfileAvatar({
  imageUrl,
  emoji,
  name,
  size = 32,
  className = "",
}: {
  imageUrl?: string | null;
  emoji?: string | null;
  name?: string | null;
  size?: number;
  className?: string;
}) {
  return (
    <span
      className={`relative inline-grid shrink-0 place-items-center overflow-hidden rounded-full bg-slate-100 font-bold text-slate-700 ${className}`}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {imageUrl ? (
        <Image
          src={imageUrl}
          alt=""
          fill
          unoptimized
          sizes={`${size}px`}
          className="object-cover"
        />
      ) : (
        emoji || name?.trim().slice(0, 1).toUpperCase() || "👤"
      )}
    </span>
  );
}
