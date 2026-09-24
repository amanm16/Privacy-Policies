# Apps and their policies

This site exists because App Store and Google Play submissions were rejected: the apps had no
publicly deployed privacy policy URL. Each page here is the URL pasted into a store listing.

> **The policy text is frozen for now.** Don't edit anything in `policies/` or `Documents/` until
> Aman says otherwise (decided 24 Sep 2026). That includes the markup, not just the wording. Known
> issues are listed at the end, ready for when that changes.

## Which policy belongs to which app

| Policy URL | App | Codebase | Branch | Bundle / package ID | Platforms |
|---|---|---|---|---|---|
| [/dbocwwb](https://privacypolicies.metahos.com/dbocwwb) | DBOCWWB Labour Welfare (Delhi Building & Other Construction Workers Welfare Board) | `/Users/aman/Desktop/GCDMS_MOBILE` | `dbocwwb` | `com.dbocwwb.dsk` | Android, iOS |
| [/kbocwwb](https://privacypolicies.metahos.com/kbocwwb) | KBOCWWB Labour Welfare (Karnataka Building & Other Construction Workers Welfare Board) | `/Users/aman/Desktop/GCDMS_MOBILE` | `main` (default) | `com.karmikasethu.ksk` | Android, iOS |
| [/hiro](https://privacypolicies.metahos.com/hiro) | HIRO (Xcode project `MetaImmuneHIRO`) | `/Users/aman/Desktop/HIRO app` | `master` | `com.metaimmune.hiro` | iOS only |

The file for each is `policies/<slug>.html`, and the original it was made from is in `Documents/`.

HIRO also has a support page, because the App Store requires a Support URL (guideline 1.5):
[/hiro/support](https://privacypolicies.metahos.com/hiro/support), `support/hiro.html`, made from
`Documents/HIRO — Support.html`.

## GCDMS_MOBILE (DBOCWWB and KBOCWWB)

- One Expo / React Native codebase, with one branch per welfare board. Remote:
  `github.com/anmolmalik97/GCDMS_MOBILE`.
- **KBOCWWB is the default branch, `main`.** There is no branch named `kbocwwb`; `app.json` on
  `main` names the app "KBOCWWB Labour Welfare". `dbocwwb` branched off `main` at `a2f84ee`
  ("fix webview").
- The checkout was on `dbocwwb` as of 24 Sep 2026.
- `origin/goa-icon` changes the name and logo for Goa. There is no Goa policy here yet.
- The store release checklists are on the `dbocwwb` branch: `docs/PLAY_STORE_RELEASE.md` and
  `docs/APP_STORE_RELEASE.md`. `PLAY_STORE_RELEASE.md` suggested hosting the policy under
  `dbocwwb.delhi.gov.in`; it is hosted here instead. It also lists a public **account deletion
  URL** as a separate Play requirement.
- The KBOCWWB policy used to be hosted at `https://akashmeta16.github.io/KBOCWWB-Privacy-Policy/`
  (see the `saved from` line in `Documents/KBOCWWB — Privacy Policy.html`). Make sure the store
  listings point here now.

## HIRO app

- Bare React Native, iOS only: the repo has `ios/MetaImmuneHIRO` and no `android/`. Remote `base`
  is `github.com/amanm16/HIRO-app`.
- The store copy is in `appstore/listing-copy.md`. The App Privacy answers in App Store Connect must
  match `ios/MetaImmuneHIRO/PrivacyInfo.xcprivacy`.
- The header comment in `Documents/HIRO — Privacy Policy.html` records that the policy was checked
  against the app as built and against the App Privacy declaration published on 23 Sep 2026. If
  the app changes what it collects, the policy changes in the same commit.

## Keeping a policy in step with its app

A store reviewer compares three things: the policy, the store's data form (Play **Data safety** /
App Store **App Privacy**), and what the build actually requests. When an app adds or drops a
permission or a kind of data, update all three together.

## Known issues (not acted on, because the policies are frozen)

Checked on 24 Sep 2026 against `app.json` and `android/app/src/main/AndroidManifest.xml` on each
branch.

**Policy vs app**

- Both GCDMS apps declare `RECORD_AUDIO` and `SYSTEM_ALERT_WINDOW`, and neither policy mentions
  them. `docs/PLAY_STORE_RELEASE.md` already says both are unused and should be removed from the
  build. Removing them is the better fix than adding them to the policies.
- KBOCWWB's policy lists only `ACCESS_FINE_LOCATION`, but `app.json` on `main` also requests
  `ACCESS_COARSE_LOCATION`. (The DBOCWWB policy lists both.)
- Both policies list `READ/WRITE_EXTERNAL_STORAGE`, which do nothing on Android 13+. If the apps
  use the photo picker or `READ_MEDIA_IMAGES`, the wording should say so.
- KBOCWWB's policy is weaker than the other two:
  - it sets the child age at 13, where DPDP (and the other two policies) use 18;
  - it keeps data "for a reasonable period";
  - it has no rights or grievance section;
  - it is dated 1 Jul 2025;
  - it says the app collects "anonymized usage statistics", which the Data safety form must match.
- DBOCWWB: "send an email … from the mobile number" can't be done as written.
- DBOCWWB: Play needs an account deletion URL. The policy's
  [deletion section](https://privacypolicies.metahos.com/dbocwwb#account-and-data-deletion) may be
  enough; check against Play's requirements.

**Site (touches policy files, so also frozen)**

- Every policy links `/assets/site.css?v=f6ebe28152`. That is the hash of the *old* stylesheet,
  which the old server cached for a year as `immutable`. The policy-page styles haven't changed
  since, so nothing is wrong today. After the next edit to `site.css`, though, returning visitors
  may keep the old one. Change the `?v=` value in all three files alongside that edit.

**Site (`index.js` only, not frozen)**

- It pins Node 14.5.0 in `.nvmrc`, which has been end-of-life since April 2023.
- There's no `error` handler on `listen`, so a port that's already in use crashes it.
- It sends no cache headers.
- The comments in `assets/site.css` still refer to the deleted admin and to `server/assets.js`.
