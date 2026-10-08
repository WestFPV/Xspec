# Menu sponsor boards

The 64 sponsor boards around the menu platform use eight fallback XSPEC-style sponsor designs until custom logos are configured.

To use your logos:

1. Put image files in this folder, for example `sponsor-01.png` through `sponsor-08.png`.
2. In `src/app.js`, set `menuSponsorLogoSources` to paths for those files, for example:

   ```js
   const menuSponsorLogoSources = Array.from(
     { length: 8 },
     (_, index) => `/sponsors/sponsor-${String(index + 1).padStart(2, '0')}.png`,
   );
   ```

Use wide images (about 1200 x 180 pixels) for best fit. The same eight logos repeat around the four sides of the platform. You can also supply fewer paths; the remaining slots keep their fallback designs.
