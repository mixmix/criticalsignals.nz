// Max-compression SVGO config for scripts/lib/lowpoly-warp.go output.
// Drops version/metadata and rounds numeric precision; cleanupIDs keeps the
// per-tier <filter id> references (url(#w-big) etc.) consistent while
// minifying them. floatPrecision is kept high (5) so small feTurbulence
// baseFrequency values (e.g. 0.00749) don't get rounded down to 0.01 and
// change the texture.
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
  ],
};
