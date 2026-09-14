'use client';

import { useCallback } from 'react';
import { shouldBypassLocalCaptcha } from './localCaptchaBypass';

declare global {
  interface Window {
    grecaptcha?: {
      ready: (callback: () => void) => void;
      execute: (
        siteKey: string,
        options: { action: string },
      ) => Promise<string>;
    };
  }
}

const siteKey = process.env.NEXT_PUBLIC_GOOGLE_CAPTCHA_SITE_KEY;
let recaptchaScriptPromise: Promise<void> | null = null;

function isValidSiteKey(configuredSiteKey: string): boolean {
  return /^[A-Za-z0-9_-]+$/.test(configuredSiteKey);
}

function loadRecaptchaScript(configuredSiteKey: string): Promise<void> {
  if (window.grecaptcha) return Promise.resolve();
  if (recaptchaScriptPromise) return recaptchaScriptPromise;

  recaptchaScriptPromise = new Promise((resolve, reject) => {
    if (!isValidSiteKey(configuredSiteKey)) {
      reject(new Error('Invalid reCAPTCHA site key.'));
      return;
    }

    const script = document.createElement('script');
    script.src = `https://www.google.com/recaptcha/api.js?render=${encodeURIComponent(
      configuredSiteKey,
    )}`;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => { recaptchaScriptPromise = null; script.remove(); reject(new Error('Security verification could not load. Check your connection and try again.')); };
    document.head.appendChild(script);
  });

  return recaptchaScriptPromise;
}

export function useRecaptchaV3() {
  return useCallback(async (action: string): Promise<string | undefined> => {
    if (typeof window === 'undefined' || shouldBypassLocalCaptcha(window.location.hostname)) {
      return undefined;
    }

    if(!siteKey) throw new Error('Security verification is temporarily unavailable. Please try again shortly.');
    await loadRecaptchaScript(siteKey);

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(()=>reject(new Error('Security verification timed out. Please try again.')),15000);
      const grecaptcha = window.grecaptcha;
      if (!grecaptcha) {
        reject(new Error('reCAPTCHA is unavailable.'));
        return;
      }

      grecaptcha.ready(() => {
        grecaptcha.execute(siteKey, { action }).then(value=>{clearTimeout(timeout);resolve(value);}).catch(error=>{clearTimeout(timeout);reject(error);});
      });
    });
  }, []);
}
