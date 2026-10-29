import React from "react";

// a stable gradient per name so the same person always looks the same
const GRADIENTS = [
  ["#8B5CF6", "#6366F1"],
  ["#F472B6", "#FB7185"],
  ["#22D3EE", "#3B82F6"],
  ["#34D399", "#10B981"],
  ["#FBBF24", "#F97316"],
  ["#A78BFA", "#EC4899"],
  ["#2DD4BF", "#0EA5E9"],
];

const hash = (str) =>
  [...str].reduce((acc, ch) => (acc * 31 + ch.charCodeAt(0)) >>> 0, 7);

export const initials = (name = "") =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "?";

function Avatar({ name = "", size = 36 }) {
  const [from, to] = GRADIENTS[hash(name) % GRADIENTS.length];
  return (
    <span
      className="avatar"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.38,
        background: `linear-gradient(135deg, ${from}, ${to})`,
      }}
      title={name}
    >
      {initials(name)}
    </span>
  );
}

export default Avatar;
