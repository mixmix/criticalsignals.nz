// SVGO config for the spore brand mark (static/images/design/spore.svg).
//
// Separate from svgo.config.mjs, which is tuned for fogleman/primitive polygon
// output and rounds coordinates to integers -- far too lossy for hand-drawn line
// art. Measured on a 1299x1172 canvas against the original:
//
//   floatPrecision 0:  16,573 raw / 11,590 gz  -- 1.252% of pixels differ
//   floatPrecision 1:  20,461 raw / 13,456 gz  -- 0.314% of pixels differ
//   floatPrecision 2:  22,980 raw / 14,874 gz  -- no useful saving
//
// Precision 1 is what ships: mean channel delta 0.44/255, which is invisible,
// while precision 0 visibly nudges the thin stroke edges. Re-run with:
//   npx svgo --config=scripts/lib/svgo.spore.config.mjs -i static/images/design/spore.svg -o static/images/design/spore.svg
export default {
  multipass: true,
  js2svg: { pretty: false, indent: 0 },
  plugins: [
    {
      name: 'preset-default',
      params: {
        overrides: {
          cleanupNumericValues: { floatPrecision: 1 },
          convertPathData: { floatPrecision: 1 },
        },
      },
    },
  ],
};
