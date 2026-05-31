import type { PosterRenderAsset } from './template-shared';

export function PosterDecorations({ assets }: { assets: PosterRenderAsset[] }) {
  if (assets.length === 0) return null;

  return (
    <>
      {assets.slice(0, 4).map((asset, index) => (
        <img
          key={`${asset.url}-${index}`}
          src={asset.url}
          alt=""
          aria-hidden
          style={{
            position: 'absolute',
            zIndex: 1,
            height: 'auto',
            objectFit: 'contain',
            pointerEvents: 'none',
            mixBlendMode: asset.blend ?? 'normal',
            filter: 'drop-shadow(0 10px 10px rgba(0, 0, 0, 0.12))',
            left: `${asset.x}%`,
            top: `${asset.y}%`,
            width: `${asset.width}%`,
            opacity: asset.opacity ?? 0.92,
            transform: `rotate(${asset.rotation}deg)`,
          }}
        />
      ))}
    </>
  );
}
