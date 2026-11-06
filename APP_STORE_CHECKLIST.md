# App Store Launch Checklist

Ordered so everything that doesn't need a paid Apple Developer account comes first.
Enroll in that ($99/yr) as late as possible, only when you hit Phase 3, so the
1-year clock starts as close to your actual launch as you can get it.

## Phase 1 — No Apple account needed, do these now
- [ ] **Enable GitHub Pages**: repo Settings → Pages → Source: `main` branch, `/docs` folder. Confirm the privacy policy loads at `https://brandonbach44-sudo.github.io/WordFury/`.
- [ ] **Decide on `supportsTablet`**: keep `true` (means testing/screenshotting an iPad layout later) or turn it off for an iPhone-only launch. Tell me which and I'll flip the app.json flag.
- [x] **Test on your real iPhone via Expo Go** (free, no dev account): `npx expo start`, scan the QR code with the Expo Go app. Playtest all 8 games end to end — progress saving, achievements, daily challenges, dark mode, color blind mode.
- [ ] Fix anything broken you find.
- [ ] Draft the App Store description, promotional text, and keywords.
- [ ] Capture/plan screenshots (can be pulled from Expo Go or iOS Simulator; final polished versions can wait until Phase 3 once you have a real build).
- [ ] Icon is already done (1024×1024, no alpha) — nothing to do here.

## Phase 2 — Still no Apple account, final content prep
- [ ] Write "What's New" release notes for version 1.0.0.
- [ ] Sanity-check the privacy policy content against what the app actually does (already updated to reflect Formspree feedback, no analytics/tracking).
- [ ] Anything else you want changed/added to any of the 8 games — better to find it now than after paying for the account.

## Phase 3 — Enroll in Apple Developer Program now (starts the 1-yr clock)
- [ ] Enroll ($99/yr).
- [ ] Create the App Store Connect record: name "Word Fury", bundle ID `com.bachapps.wordfury`, primary language, SKU.
- [ ] Set category (Games → Word), fill in App Information.
- [ ] Paste the GitHub Pages URL into the Privacy Policy URL field and the Support URL field.
- [ ] Fill out the App Privacy (data collection) questionnaire. Since the feedback form sends whatever the user types to Formspree, mark "Contact Info" / "User Content" as collected, not linked to identity, used for App Functionality/Customer Support — everything else is "Data Not Collected."
- [ ] Complete the age rating questionnaire.

## Phase 4 — Build, TestFlight, submit
- [ ] Run `eas build --platform ios --profile production`.
- [ ] Install the build via TestFlight on your own phone for one more real pass.
- [ ] `eas submit --platform ios` to attach the build to the App Store Connect version.
- [ ] Confirm export compliance during the build/submit step (already set to non-exempt-encryption: false in app.json, should auto-answer).
- [ ] Upload final screenshots — 6.7" iPhone required at minimum (add 6.5"/5.5" for broader coverage; iPad screenshots only if you kept supportsTablet on).
- [ ] Submit for review.

---
I'll give you exact copy-paste commands when you're ready for the `eas build`/`eas submit` steps in Phase 4.
