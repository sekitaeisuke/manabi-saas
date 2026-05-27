"use client";
import { useEffect } from "react";

type Props = { message: string; type?: "success" | "error" | "info"; onClose: () => void };

export function Toast({ message, type = "success", onClose }: Props) {
  useEffect(() => {
    const t = setTimeout(onClose, 3000);
    return () => clearTimeout(t);
  }, [onClose]);

  const colors = { success: "bg-green-600", error: "bg-red-600", info: "bg-blue-600" };
  const icons = { success: "✓", error: "✕", info: "ℹ" };

  return (
    <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-2xl px-5 py-3 text-sm font-semibold text-white shadow-lg ${colors[type]}`}>
      <span>{icons[type]}</span>
      <span>{message}</span>
    </div>
  );
}
