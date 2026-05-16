"use client";

import { useEffect, useState, useCallback } from "react";

const KEY = "parent.selectedStudentId";
const EVENT = "parent-selected-student-change";

export function useSelectedStudentId() {
  const [id, setId] = useState<string | null>(null);

  useEffect(() => {
    setId(localStorage.getItem(KEY));
    const onChange = () => setId(localStorage.getItem(KEY));
    window.addEventListener("storage", onChange);
    window.addEventListener(EVENT, onChange);
    return () => {
      window.removeEventListener("storage", onChange);
      window.removeEventListener(EVENT, onChange);
    };
  }, []);

  const select = useCallback((next: string) => {
    localStorage.setItem(KEY, next);
    window.dispatchEvent(new Event(EVENT));
  }, []);

  return [id, select] as const;
}
