import type { ButtonHTMLAttributes } from "react";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "secondary" | "ghost";
  size?: "default" | "lg" | "icon";
};

export function Button({
  variant = "default",
  size = "default",
  className = "",
  type = "button",
  ...props
}: Props) {
  const sizeClass = size === "default" ? "btn-size-default" : `btn-${size}`;
  return (
    <button
      type={type}
      className={`btn btn-${variant} ${sizeClass}${className ? ` ${className}` : ""}`}
      {...props}
    />
  );
}
