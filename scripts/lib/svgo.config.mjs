// Max-compression SVGO config for fogleman/primitive output.
// Wins: bake the outer scale() into coords, convert polygons to compact <path>
// data, hoist the shared fill-opacity onto the parent <g>, drop version/metadata.
// floatPrecision is kept high (5) so the scale() transform stays accurate and
// the triangles still reach the image edges (no white gaps).
export default {
  multipass: true,
  js2svg: { pretty: false, indent: 0 },
  plugins: [
    {
      name: 'preset-default',
      params: {
        overrides: {
          cleanupNumericValues: { floatPrecision: 5 },
        },
      },
    },
    // round the polygon point lists to integers
    { name: 'cleanupListOfValues', params: { floatPrecision: 0 } },
    // pull identical attributes (fill-opacity) up onto the parent <g>
    'moveElemsAttrsToGroup',
  ],
};
