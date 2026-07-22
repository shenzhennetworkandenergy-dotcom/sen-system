"use client";

import type { ButtonHTMLAttributes } from "react";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & { confirmation: string };

export function ConfirmSubmitButton({ confirmation, onClick, ...props }: Props) {
  return <button {...props} onClick={(event) => {
    onClick?.(event);
    if (!event.defaultPrevented && !window.confirm(confirmation)) event.preventDefault();
  }} />;
}
