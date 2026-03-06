import type { ImgHTMLAttributes } from 'react';

type InksightIconProps = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'alt'>;

export function InksightIcon(props: InksightIconProps) {
  return (
    <img
      src="/inksight-icon.png"
      alt=""
      aria-hidden="true"
      {...props}
    />
  );
}
