// src/components/icons/CrayfishIcon.js

import React from "react";
import Svg, { Path, Circle } from "react-native-svg";

export default function CrayfishIcon({ size = 24, color = "#22d3c5" }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      <Path
        d="M28 12C23 6 17 5 11 8"
        stroke={color}
        strokeWidth="4"
        strokeLinecap="round"
      />
      <Path
        d="M36 12C41 6 47 5 53 8"
        stroke={color}
        strokeWidth="4"
        strokeLinecap="round"
      />

      <Path
        d="M20 22C12 17 6 19 5 26C4 32 10 34 15 30"
        stroke={color}
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M44 22C52 17 58 19 59 26C60 32 54 34 49 30"
        stroke={color}
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      <Path
        d="M22 27L14 36"
        stroke={color}
        strokeWidth="4"
        strokeLinecap="round"
      />
      <Path
        d="M42 27L50 36"
        stroke={color}
        strokeWidth="4"
        strokeLinecap="round"
      />

      <Path
        d="M32 14C24 14 19 21 19 31C19 43 25 54 32 58C39 54 45 43 45 31C45 21 40 14 32 14Z"
        stroke={color}
        strokeWidth="4"
        strokeLinejoin="round"
      />

      <Path
        d="M23 30H41"
        stroke={color}
        strokeWidth="3"
        strokeLinecap="round"
      />
      <Path
        d="M24 38H40"
        stroke={color}
        strokeWidth="3"
        strokeLinecap="round"
      />
      <Path
        d="M27 46H37"
        stroke={color}
        strokeWidth="3"
        strokeLinecap="round"
      />

      <Path
        d="M20 34L13 39"
        stroke={color}
        strokeWidth="3"
        strokeLinecap="round"
      />
      <Path
        d="M44 34L51 39"
        stroke={color}
        strokeWidth="3"
        strokeLinecap="round"
      />
      <Path
        d="M22 42L15 47"
        stroke={color}
        strokeWidth="3"
        strokeLinecap="round"
      />
      <Path
        d="M42 42L49 47"
        stroke={color}
        strokeWidth="3"
        strokeLinecap="round"
      />

      <Circle cx="28" cy="22" r="2" fill={color} />
      <Circle cx="36" cy="22" r="2" fill={color} />
    </Svg>
  );
}