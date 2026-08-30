"use client";

import { useEffect, useState } from "react";

const KEY = "400faqs_phone";

export function getStoredPhone(): string {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(KEY) ?? "";
}

export function usePhone() {
  const [phone, setPhoneState] = useState<string>("");

  useEffect(() => {
    setPhoneState(getStoredPhone());
  }, []);

  const setPhone = (value: string) => {
    const trimmed = value.trim();
    if (typeof window !== "undefined") window.localStorage.setItem(KEY, trimmed);
    setPhoneState(trimmed);
  };

  const clearPhone = () => {
    if (typeof window !== "undefined") window.localStorage.removeItem(KEY);
    setPhoneState("");
  };

  return { phone, setPhone, clearPhone };
}