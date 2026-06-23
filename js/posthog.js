// ─── PostHog Analytics — VibeMarket (Minimal Setup) ─────────────────────────
// Tracks only 5 events:
//   1. user_logged_in
//   2. user_logged_out
//   3. item_sold
//   4. item_listed   (new listing posted)
//   5. profile_updated

const POSTHOG_KEY  = 'phc_ygCdQcLkWGUZRnrvXAYo3KZYK4EciSKXyt9KmGjPXLoK';
const POSTHOG_HOST = 'https://us.i.posthog.com';

export function initPostHog() {
  if (typeof window === 'undefined') return;
  if (window.posthog && window.posthog.__loaded) return;

  !function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]);t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+" (stub)"},o="init capture register register_once register_for_session unregister unregister_for_session getFeatureFlag getFeatureFlagPayload isFeatureEnabled reloadFeatureFlags updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures on onFeatureFlags onSessionId getSurveys getActiveMatchingSurveys renderSurvey canRenderSurvey identify alias group resetGroups setPersonProperties groupProperties createPersonProfile opt_in_capturing opt_out_capturing has_opted_in_capturing has_opted_out_capturing clear_opt_in_out_capturing debug reset".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);

  window.posthog.init(POSTHOG_KEY, {
    api_host:         POSTHOG_HOST,
    person_profiles:  'identified_only',
    capture_pageview: false,   // ← disabled: no Pageview noise
    capture_pageleave: false,  // ← disabled: no Pageleave noise
    autocapture:      false,   // ← disabled: only our 5 manual events
    persistence:      'localStorage',
    loaded: (ph) => { ph.__loaded = true; }
  });
}

// Identify user (called after login)
export function identifyUser(uid, { email, name, role } = {}) {
  if (!window.posthog) return;
  window.posthog.identify(uid, { email, name, role });
}

// Reset on logout
export function resetPostHog() {
  if (!window.posthog) return;
  window.posthog.reset();
}

// Fire a named event
export function track(event, properties = {}) {
  if (!window.posthog) return;
  window.posthog.capture(event, properties);
}

// Auto-init
initPostHog();
