// src/utils/browserDetect.js
//
// Two small checks used by the Google sign-in flow:
//
// 1. isInAppBrowser() — Instagram, Facebook, Messenger, TikTok, Line, etc.
//    all open links inside their own embedded WebView instead of the
//    device's real browser. Google actively BLOCKS its OAuth sign-in
//    inside these WebViews ("disallowed_useragent" policy) for security
//    reasons — this can't be fixed from our code. The only fix is for the
//    user to open the page in Chrome/Safari instead (via the "..." menu →
//    "Open in browser"). We detect this so we can tell them that directly
//    instead of showing a confusing generic error.
//
// 2. isMobileDevice() — signInWithPopup is unreliable on mobile web: the
//    popup window can get killed when the OS switches away to run the
//    Google auth flow, breaking the postMessage bridge back to the opener,
//    which shows up as "it just flashes/loads then goes back to the page".
//    Firebase's own docs recommend signInWithRedirect on mobile instead.

export function isInAppBrowser() {
  const ua = navigator.userAgent || navigator.vendor || "";
  return /Instagram|FBAN|FBAV|FB_IAB|Line\/|Messenger|TikTok|MicroMessenger|Twitter|WhatsApp/i.test(ua);
}

export function isMobileDevice() {
  const ua = navigator.userAgent || "";
  return /Android|iPhone|iPad|iPod/i.test(ua) || window.innerWidth < 768;
}
