import React from "react";

interface Props {
  size?: number;
  className?: string;
}

/* Clean music note SVG — transparent background, green fill */
export function MelodiqueIcon({ size = 32, className = "" }: Props) {
  return (
    <svg
      width={size} height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <path
        d="M22 4v14.5a4 4 0 1 1-2-3.465V8.82L12 10.91V22.5a4 4 0 1 1-2-3.465V9L22 6V4z"
        fill="#1ed760"
      />
    </svg>
  );
}

/* Full wordmark — icon + text */
export function MelodiqueLogo({ iconSize = 28, textSize = "text-lg", className = "" }: {
  iconSize?: number;
  textSize?: string;
  className?: string;
}) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <MelodiqueIcon size={iconSize} />
      <span className={`font-black text-white tracking-tight ${textSize}`}>Melodique</span>
    </div>
  );
}
