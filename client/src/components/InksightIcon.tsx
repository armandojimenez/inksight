import type { SVGProps } from 'react';

export function InksightIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" {...props}>
      <g fill="currentColor">
        <path d="M2 2h18v5H7v13H2V2z" />
        <path d="M44 2h18v18h-5V7H44V2z" />
        <path d="M2 44h5v13h13v5H2V44z" />
        <path d="M44 57h13V44h5v18H44v-5z" />
      </g>
      <path
        d="M32 21c-11 0-19 11-19 11s8 11 19 11 19-11 19-11-8-11-19-11z"
        fill="currentColor"
      />
      <circle cx="32" cy="32" r="7.5" fill="white" />
      <circle cx="32" cy="32" r="5" fill="currentColor" />
      <circle cx="30" cy="30" r="1.8" fill="white" />
      <g stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none">
        <line x1="28" y1="22.5" x2="27" y2="19" />
        <line x1="32" y1="21.5" x2="32" y2="17.5" />
        <line x1="36" y1="22.5" x2="37" y2="19" />
      </g>
    </svg>
  );
}
