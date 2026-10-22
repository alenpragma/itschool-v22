/* ==========================================================================
   assets/js/chat.js — live chat (tawk.to) loader
   --------------------------------------------------------------------------
   ┌───────────────────────────────────────────────────────────────────────┐
   │  ✅ CONFIGURED — live chat is ON site-wide.                            │
   │                                                                       │
   │  Property ID: 6ace6f47d0f2b934caf86b75                                │
   │  Widget ID:   1k4r65co4                                               │
   │  Embed URL:   https://embed.tawk.to/6ace6f47d0f2b934caf86b75/1k4r65co4 │
   │                                                                       │
   │  TO CHANGE THEM LATER, edit the two constants below. Get both values   │
   │  from your tawk.to dashboard:                                          │
   │      Administration → Channels → Chat Widget → Direct Chat Link        │
   │                                                                       │
   │  That link looks like:                                                │
   │    https://tawk.to/chat/6a1b2c3d4e5f6a7b8c9d0e1f/1i2j3k4l            │
   │                        └──── PROPERTY ID ─────┘ └─ WIDGET ID ─┘        │
   │                                                                       │
   │  If the constants are ever left as placeholders (starting with         │
   │  "TAWK_") the widget is NOT loaded at all — no console errors and no   │
   │  broken network requests. The site simply works without chat.          │
   └───────────────────────────────────────────────────────────────────────┘
   ========================================================================== */
(function () {
  'use strict';

  var TAWK_PROPERTY_ID = '6ace6f47d0f2b934caf86b75'; /* ← Property ID (configured) */
  var TAWK_WIDGET_ID = '1k4r65co4'; /* ← Widget ID   (configured) */

  /* Anything not replaced yet still reads as a placeholder → skip loading. */
  var configured =
    TAWK_PROPERTY_ID &&
    TAWK_WIDGET_ID &&
    TAWK_PROPERTY_ID.indexOf('TAWK_') !== 0 &&
    TAWK_WIDGET_ID.indexOf('TAWK_') !== 0;

  if (!configured) {
    if (window.console && console.info) {
      console.info(
        '[chat] tawk.to widget not loaded — add your IDs in ' + 'assets/js/chat.js (see README §9).'
      );
    }
    return;
  }

  /* ------------------------------------------------------------------------
     tawk.to embed. This is the standard, documented integration:
       1. define Tawk_API / Tawk_LoadStart BEFORE the script is injected,
       2. append https://embed.tawk.to/<property>/<widget> asynchronously.
     ---------------------------------------------------------------------- */
  window.Tawk_API = window.Tawk_API || {};
  window.Tawk_LoadStart = new Date();

  window.Tawk_API.onLoad = function () {
    if (window.console && console.info) {
      console.info('[chat] tawk.to ready');
    }
  };

  /* Keep the bubble from fighting the site's own UI:
     - zIndex 1090 sits BELOW the mobile drawer (z-index 1100), so an open
       menu is never covered by the chat bubble;
     - the back-to-top button is lifted clear of the bubble on mobile instead
       (see styles.css §23/§24) so the two never overlap. */
  window.Tawk_API.customStyle = {
    zIndex: 1090,
    visibility: {
      desktop: { position: 'br', xOffset: 24, yOffset: 80 },
      mobile: { position: 'br', xOffset: 16, yOffset: 88 }
    }
  };

  var s1 = document.createElement('script');
  var s0 = document.getElementsByTagName('script')[0];
  s1.async = true;
  s1.src = 'https://embed.tawk.to/' + TAWK_PROPERTY_ID + '/' + TAWK_WIDGET_ID;
  s1.charset = 'UTF-8';
  s1.setAttribute('crossorigin', '*');
  s0.parentNode.insertBefore(s1, s0);
})();
