"use client";

import { useEffect } from "react";

/** Clear an OTP challenge only after the server has confirmed an authenticated account. */
export function RegistrationOtpCleanup() {
  useEffect(() => {
    try {
      window.sessionStorage.removeItem("gheverhan.registration.otp.v1");
    } catch {
      // Private browsing may disable storage.
    }
  }, []);
  return null;
}
