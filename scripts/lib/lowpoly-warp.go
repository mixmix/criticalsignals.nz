// lowpoly-warp.go <jpeg> <out.svg> [-n 100] [-res 384] [-seed 1] [-effort 1]
//
// Replaces fogleman/primitive as the shape-fitting engine for gen-lowpoly.sh.
//
// Two passes:
//
//  1. Fit N triangles exactly like primitive would: hill-climb each triangle's
//     3 vertices against the real photo (with the analytically-optimal flat
//     color for the current position used as the fitness proxy — "filled with
//     the average colour under that triangle"), then, with position fixed,
//     sweep alpha and take the best alpha/color pair. Committed flat (no warp)
//     onto the working canvas, in order, same as primitive.
//
//  2. Tune 3 shared turbulence "wave" filters against that same fitted canvas,
//     one after another: a low-frequency "big wave" applied to the first 50%
//     of triangles (in paint order), a "middle wave" for the next 30%, and a
//     high-frequency "small wave" for the remaining 20%. For each tier, in
//     order, hill-climb its feTurbulence baseFrequency and feDisplacementMap
//     scale by re-rendering the whole canvas with that tier's candidate warp
//     (and any earlier tier's already-tuned warp) and measuring real error
//     against the photo — so the frequency/scale aren't hand-picked, they're
//     whatever actually improves the fit within that tier's big/mid/small
//     frequency band. numOctaves is not searched — it's pinned at 2 for every
//     tier, so the search spends its whole budget on the two parameters that
//     actually set the look (scale and baseFrequency) instead of trading them
//     off against a third that mostly duplicates what frequency already does.
//
// Search happens on a small working canvas (-res wide) for speed; final shape
// coordinates/frequency/scale are rescaled up to the fixed 1024x576 output
// canvas when the SVG is written. Prints the final total squared error to
// stdout (lower is better) so the caller can pick the best of several runs.
package main

import (
	"flag"
	"fmt"
	"image"
	_ "image/jpeg"
	"math"
	"math/rand"
	"os"
	"sort"
	"strings"
)

const (
	outW, outH = 1024, 576
	alpha0     = 0.5 // fixed alpha used while searching position (stage 1)
)

// ---- 2D gradient noise (Perlin-style), used as an approximation of the SVG
// feTurbulence algorithm — close enough in character (coherent noise, same
// frequency/octave behaviour) that a baseFrequency/scale tuned here looks
// right once re-rendered through the real <feTurbulence> in-browser. ----

type perlin struct{ perm [512]int }

func newPerlin(seed int64) *perlin {
	r := rand.New(rand.NewSource(seed))
	var base [256]int
	for i := range base {
		base[i] = i
	}
	r.Shuffle(256, func(i, j int) { base[i], base[j] = base[j], base[i] })
	p := &perlin{}
	for i := 0; i < 512; i++ {
		p.perm[i] = base[i%256]
	}
	return p
}

func fade(t float64) float64      { return t * t * t * (t*(t*6-15) + 10) }
func lerp(t, a, b float64) float64 { return a + t*(b-a) }

func grad2(hash int, x, y float64) float64 {
	switch hash & 3 {
	case 0:
		return x + y
	case 1:
		return -x + y
	case 2:
		return x - y
	default:
		return -x - y
	}
}

func (p *perlin) noise2D(x, y float64) float64 {
	xi := int(math.Floor(x)) & 255
	yi := int(math.Floor(y)) & 255
	xf := x - math.Floor(x)
	yf := y - math.Floor(y)
	u, v := fade(xf), fade(yf)
	aa := p.perm[p.perm[xi]+yi]
	ab := p.perm[p.perm[xi]+yi+1]
	ba := p.perm[p.perm[xi+1]+yi]
	bb := p.perm[p.perm[xi+1]+yi+1]
	x1 := lerp(u, grad2(aa, xf, yf), grad2(ba, xf-1, yf))
	x2 := lerp(u, grad2(ab, xf, yf-1), grad2(bb, xf-1, yf-1))
	return lerp(v, x1, x2)
}

// turbulence returns a value in ~[0,1], mirroring SVG feTurbulence's
// type="turbulence" (sum of |noise| per octave, halving amplitude each time).
func (p *perlin) turbulence(x, y, freq float64, octaves int) float64 {
	fx, fy := x*freq, y*freq
	sum, amp, maxAmp := 0.0, 1.0, 0.0
	for o := 0; o < octaves; o++ {
		sum += math.Abs(p.noise2D(fx, fy)) * amp
		maxAmp += amp
		fx *= 2
		fy *= 2
		amp *= 0.5
	}
	return sum / maxAmp
}

// ---- geometry ----

type vec2 struct{ X, Y float64 }
type tri [3]vec2

func pointInTri(px, py float64, t tri) bool {
	sign := func(a, b, c vec2) float64 { return (b.X-a.X)*(c.Y-a.Y) - (b.Y-a.Y)*(c.X-a.X) }
	d1 := sign(vec2{px, py}, t[0], t[1])
	d2 := sign(vec2{px, py}, t[1], t[2])
	d3 := sign(vec2{px, py}, t[2], t[0])
	neg := d1 < 0 || d2 < 0 || d3 < 0
	pos := d1 > 0 || d2 > 0 || d3 > 0
	return !(neg && pos)
}

func triBounds(t tri, pad float64, w, h int) (x0, y0, x1, y1 int) {
	minX, minY := math.Min(t[0].X, math.Min(t[1].X, t[2].X))-pad, math.Min(t[0].Y, math.Min(t[1].Y, t[2].Y))-pad
	maxX, maxY := math.Max(t[0].X, math.Max(t[1].X, t[2].X))+pad, math.Max(t[0].Y, math.Max(t[1].Y, t[2].Y))+pad
	x0 = int(math.Max(0, math.Floor(minX)))
	y0 = int(math.Max(0, math.Floor(minY)))
	x1 = int(math.Min(float64(w), math.Ceil(maxX)))
	y1 = int(math.Min(float64(h), math.Ceil(maxY)))
	return
}

// ---- working canvas ----

type canvas struct {
	w, h int
	px   []float64 // w*h*3, 0..255
}

func newCanvas(w, h int) *canvas          { return &canvas{w, h, make([]float64, w*h*3)} }
func (c *canvas) at(x, y, ch int) float64 { return c.px[(y*c.w+x)*3+ch] }
func (c *canvas) set(x, y, ch int, v float64) { c.px[(y*c.w+x)*3+ch] = v }
func (c *canvas) fill(rgb [3]float64) {
	for i := 0; i < len(c.px); i += 3 {
		c.px[i], c.px[i+1], c.px[i+2] = rgb[0], rgb[1], rgb[2]
	}
}

func loadTarget(path string, w, h int) *canvas {
	f, err := os.Open(path)
	if err != nil {
		panic(err)
	}
	defer f.Close()
	img, _, err := image.Decode(f)
	if err != nil {
		panic(err)
	}
	b := img.Bounds()
	out := newCanvas(w, h)
	for y := 0; y < h; y++ {
		sy0 := b.Min.Y + (y*b.Dy())/h
		sy1 := b.Min.Y + ((y+1)*b.Dy())/h
		if sy1 <= sy0 {
			sy1 = sy0 + 1
		}
		for x := 0; x < w; x++ {
			sx0 := b.Min.X + (x*b.Dx())/w
			sx1 := b.Min.X + ((x+1)*b.Dx())/w
			if sx1 <= sx0 {
				sx1 = sx0 + 1
			}
			var rs, gs, bs, n float64
			for sy := sy0; sy < sy1; sy++ {
				for sx := sx0; sx < sx1; sx++ {
					r, g, bl, _ := img.At(sx, sy).RGBA()
					rs += float64(r >> 8)
					gs += float64(g >> 8)
					bs += float64(bl >> 8)
					n++
				}
			}
			out.set(x, y, 0, rs/n)
			out.set(x, y, 1, gs/n)
			out.set(x, y, 2, bs/n)
		}
	}
	return out
}

// ---- stage 1: position + color/alpha fitting (flat triangles, no warp) ----
//
// A triangle's fitness only depends on 5 aggregate sums over its mask (ΣC,
// ΣT, ΣC², ΣCT, n — canvas/target and their squares/product), since color is
// constant across the shape: both the analytically-optimal color AND the
// resulting total squared-error delta are closed-form functions of those 5
// numbers (see statsColorDelta). That means a hill-climb step which only
// nudges one vertex doesn't need to rescan the whole triangle from scratch —
// it only needs to add/remove the thin sliver of pixels that changed sides
// (applyMove), then update the same 5 running sums incrementally. For a small
// step late in a climb, that sliver is far smaller than the full triangle.
//
// Position search itself uses successive halving (a cheap wide net, narrowed
// down to fewer, deeper refinements) rather than N independent restarts each
// run to a fixed iteration count — most random starting triangles are
// obviously bad within a handful of steps, so paying full iteration budget
// for all of them wastes compute that's better spent refining the ones that
// looked promising early.

type maskStats struct {
	n                        int
	sumC, sumT, sumC2, sumCT [3]float64
}

func (s *maskStats) addPixel(cv, target *canvas, x, y int, sign float64) {
	s.n += int(sign)
	for ch := 0; ch < 3; ch++ {
		C := cv.at(x, y, ch)
		T := target.at(x, y, ch)
		s.sumC[ch] += sign * C
		s.sumT[ch] += sign * T
		s.sumC2[ch] += sign * C * C
		s.sumCT[ch] += sign * C * T
	}
}

func computeStats(cv, target *canvas, t tri) maskStats {
	var s maskStats
	x0, y0, x1, y1 := triBounds(t, 0, cv.w, cv.h)
	for y := y0; y < y1; y++ {
		py := float64(y) + 0.5
		for x := x0; x < x1; x++ {
			px := float64(x) + 0.5
			if pointInTri(px, py, t) {
				s.addPixel(cv, target, x, y, 1)
			}
		}
	}
	return s
}

// applyMove returns the stats for newT, incrementally updated from the stats
// for oldT by visiting only the pixels that changed which side they're on.
func applyMove(cv, target *canvas, s maskStats, oldT, newT tri) maskStats {
	x0o, y0o, x1o, y1o := triBounds(oldT, 0, cv.w, cv.h)
	x0n, y0n, x1n, y1n := triBounds(newT, 0, cv.w, cv.h)
	x0, y0 := min(x0o, x0n), min(y0o, y0n)
	x1, y1 := max(x1o, x1n), max(y1o, y1n)
	for y := y0; y < y1; y++ {
		py := float64(y) + 0.5
		for x := x0; x < x1; x++ {
			px := float64(x) + 0.5
			inOld := pointInTri(px, py, oldT)
			inNew := pointInTri(px, py, newT)
			if inOld == inNew {
				continue
			}
			if inNew {
				s.addPixel(cv, target, x, y, 1)
			} else {
				s.addPixel(cv, target, x, y, -1)
			}
		}
	}
	return s
}

// statsColorDelta derives the analytically-optimal flat color and the
// resulting total squared-error delta from aggregate mask stats — pure
// arithmetic, no pixel scanning, so it's effectively free to re-evaluate at a
// different alpha once a triangle's stats are known.
func statsColorDelta(s maskStats, alpha float64) (color [3]float64, delta float64) {
	if s.n <= 0 {
		return color, math.Inf(1)
	}
	n := float64(s.n)
	for ch := 0; ch < 3; ch++ {
		k := ((s.sumT[ch] / n) - (1-alpha)*(s.sumC[ch]/n)) / alpha
		if k < 0 {
			k = 0
		}
		if k > 255 {
			k = 255
		}
		color[ch] = k
		c2, ct, c1, t1 := s.sumC2[ch], s.sumCT[ch], s.sumC[ch], s.sumT[ch]
		delta += (-2*alpha+alpha*alpha)*c2 + 2*alpha*ct + (2*alpha*k-2*alpha*alpha*k)*c1 - 2*alpha*k*t1 + alpha*alpha*k*k*n
	}
	return
}

func randTri(rng *rand.Rand, w, h int) tri {
	pad := 0.15
	rx := func() float64 { return (rng.Float64()*(1+2*pad) - pad) * float64(w) }
	ry := func() float64 { return (rng.Float64()*(1+2*pad) - pad) * float64(h) }
	return tri{{rx(), ry()}, {rx(), ry()}, {rx(), ry()}}
}

// successive-halving schedule for position search: 20 cheap full scans -> keep
// 5 -> 20 incremental climb steps each -> keep 2 -> 80 more each -> best wins.
const (
	wideN     = 20
	wideKeep  = 5
	midIters  = 20
	midKeep   = 2
	fineIters = 80
)

// effort multiplies every search schedule (both stages) — the widths of the
// wide-net rounds and the length of every climb. The survivor counts are left
// alone: raising effort should search each candidate harder and start from a
// wider net, not carry more mediocre candidates into the expensive rounds.
var effort = 1.0

func scaled(n int) int {
	v := int(math.Round(float64(n) * effort))
	if v < 1 {
		return 1
	}
	return v
}

var alphaCandidates = []float64{0.25, 0.35, 0.45, 0.55, 0.65, 0.75}

type shape struct {
	t     tri
	color [3]float64
	alpha float64
}

type posCand struct {
	t     tri
	stats maskStats
	delta float64
}

// climb runs a short incremental hill-climb from c, mutating one vertex at a
// time with a shrinking step, accepting only improvements.
func climb(rng *rand.Rand, cv, target *canvas, c posCand, iters int, step float64) posCand {
	for it := 0; it < iters; it++ {
		vi := rng.Intn(3)
		cand := c.t
		cand[vi].X += rng.NormFloat64() * step
		cand[vi].Y += rng.NormFloat64() * step
		stats := applyMove(cv, target, c.stats, c.t, cand)
		_, delta := statsColorDelta(stats, alpha0)
		if delta < c.delta {
			c = posCand{cand, stats, delta}
		}
		step *= 0.97
	}
	return c
}

func fitShape(rng *rand.Rand, cv, target *canvas) shape {
	// round 1: wide net — full stats scan per candidate, no climbing yet.
	cands := make([]posCand, scaled(wideN))
	for i := range cands {
		t := randTri(rng, cv.w, cv.h)
		s := computeStats(cv, target, t)
		_, d := statsColorDelta(s, alpha0)
		cands[i] = posCand{t, s, d}
	}
	sort.Slice(cands, func(i, j int) bool { return cands[i].delta < cands[j].delta })
	cands = cands[:min(wideKeep, len(cands))]

	// round 2: short incremental climb on the survivors.
	step0 := 0.12 * math.Max(float64(cv.w), float64(cv.h))
	for i := range cands {
		cands[i] = climb(rng, cv, target, cands[i], scaled(midIters), step0)
	}
	sort.Slice(cands, func(i, j int) bool { return cands[i].delta < cands[j].delta })
	cands = cands[:min(midKeep, len(cands))]

	// round 3: longer refine on the finalists, with a smaller starting step.
	for i := range cands {
		cands[i] = climb(rng, cv, target, cands[i], scaled(fineIters), step0*0.3)
	}
	sort.Slice(cands, func(i, j int) bool { return cands[i].delta < cands[j].delta })
	best := cands[0]

	// stage 2: color/alpha — sweep alpha, reusing best.stats (no pixel
	// scanning at all: color/alpha are pure functions of the same 5 sums).
	bestAlpha := alpha0
	bestColor, bestDelta := statsColorDelta(best.stats, alpha0)
	for _, a := range alphaCandidates {
		c, d := statsColorDelta(best.stats, a)
		if d < bestDelta {
			bestDelta, bestColor, bestAlpha = d, c, a
		}
	}
	return shape{t: best.t, color: bestColor, alpha: bestAlpha}
}

func commitFlat(cv *canvas, s shape) {
	x0, y0, x1, y1 := triBounds(s.t, 0, cv.w, cv.h)
	for y := y0; y < y1; y++ {
		py := float64(y) + 0.5
		for x := x0; x < x1; x++ {
			px := float64(x) + 0.5
			if !pointInTri(px, py, s.t) {
				continue
			}
			for ch := 0; ch < 3; ch++ {
				cv.set(x, y, ch, cv.at(x, y, ch)*(1-s.alpha)+s.color[ch]*s.alpha)
			}
		}
	}
}

// ---- stage 2: tune 3 shared "wave" filters against tiers of the paint order ----

type tierParams struct {
	freq, scale float64 // working-canvas units
	octaves     int
}

type tierSpec struct {
	name               string
	freqMin, freqMax   float64 // final (1024-wide) units
	scaleMin, scaleMax float64 // final units
	octaves            int
}

var tierSpecs = [3]tierSpec{
	{"big", 0.003, 0.012, 40, 100, 2},
	{"mid", 0.012, 0.045, 15, 45, 2},
	{"small", 0.045, 0.15, 4, 20, 2},
}

// tierBounds returns the [start,end) shape-index range for each tier, sized
// 50% / 30% / 20% of n (first/next/last, in paint order).
func tierBounds(n int) [3][2]int {
	a := int(math.Round(float64(n) * 0.50))
	b := int(math.Round(float64(n) * 0.80))
	return [3][2]int{{0, a}, {a, b}, {b, n}}
}

func tierOfFn(bounds [3][2]int) func(int) int {
	return func(i int) int {
		for k, b := range bounds {
			if i >= b[0] && i < b[1] {
				return k
			}
		}
		return len(bounds) - 1
	}
}

// ---- displacement fields ----
//
// A tier's warp displaces pixel (x,y) by scale*(turbulence(x,y)-0.5) in each
// axis — mirroring feDisplacementMap, which samples the (unwarped) source at
// that offset. Evaluated per shape, the same pixel's noise gets recomputed
// once per shape whose (padded) bounding box covers it — measured at ~5x
// redundancy over a full render, and turbulence is ~2/3 of total runtime.
//
// So evaluate it once per pixel instead: a field holds the whole canvas's unit
// displacement (before scale, which is just a multiplier) for one
// (frequency, octaves) pair. Shapes then index into it.
//
// Sampling the field on a coarser grid and interpolating was tried and
// reverted: to stay inside the finest octave's lattice cell the spacing has to
// adapt to frequency, which at these working-canvas frequencies leaves most
// builds at 1px anyway — measured 2.6% overall, for a lookup that no longer
// reproduces the exact search results.
type field struct {
	w, h   int
	dx, dy []float64
}

func newField(w, h int) *field {
	return &field{w, h, make([]float64, w*h), make([]float64, w*h)}
}

func (f *field) build(nx, ny *perlin, freq float64, octaves int) {
	for y := 0; y < f.h; y++ {
		py := float64(y) + 0.5
		row := y * f.w
		for x := 0; x < f.w; x++ {
			px := float64(x) + 0.5
			f.dx[row+x] = nx.turbulence(px, py, freq, octaves) - 0.5
			f.dy[row+x] = ny.turbulence(px, py, freq, octaves) - 0.5
		}
	}
}

// fieldSet holds the current field for each tier, rebuilding one only when
// that tier's (freq, octaves) actually changes. During a tuneTier(k) call
// that's the point: tiers before k are pinned at their tuned params, so their
// fields are built once and reused across every candidate evaluation, while
// only tier k's own field is rebuilt per candidate. scale never invalidates a
// field, since it's applied at lookup time.
type fieldSet struct {
	w, h int
	np   [3][2]*perlin
	f    [3]*field
	freq [3]float64
	oct  [3]int
	have [3]bool
}

func newFieldSet(w, h int, np [3][2]*perlin) *fieldSet {
	return &fieldSet{w: w, h: h, np: np}
}

// get returns tier k's field for the given params, or nil when the tier isn't
// warping at all (in which case the caller falls back to flat coverage).
func (fs *fieldSet) get(k int, p tierParams) *field {
	if p.scale <= 1e-6 {
		return nil
	}
	if fs.have[k] && fs.freq[k] == p.freq && fs.oct[k] == p.octaves {
		return fs.f[k]
	}
	if fs.f[k] == nil {
		fs.f[k] = newField(fs.w, fs.h)
	}
	fs.f[k].build(fs.np[k][0], fs.np[k][1], p.freq, p.octaves)
	fs.freq[k], fs.oct[k], fs.have[k] = p.freq, p.octaves, true
	return fs.f[k]
}

func drawShapeInto(cv *canvas, s shape, p tierParams, f *field) {
	pad := p.scale/2 + 1
	x0, y0, x1, y1 := triBounds(s.t, pad, cv.w, cv.h)
	for y := y0; y < y1; y++ {
		py := float64(y) + 0.5
		row := y * cv.w
		for x := x0; x < x1; x++ {
			px, qy := float64(x)+0.5, py
			if f != nil {
				px += p.scale * f.dx[row+x]
				qy += p.scale * f.dy[row+x]
			}
			if !pointInTri(px, qy, s.t) {
				continue
			}
			for ch := 0; ch < 3; ch++ {
				cv.set(x, y, ch, cv.at(x, y, ch)*(1-s.alpha)+s.color[ch]*s.alpha)
			}
		}
	}
}

func cloneCanvas(c *canvas) *canvas {
	px := make([]float64, len(c.px))
	copy(px, c.px)
	return &canvas{c.w, c.h, px}
}

// renderPrefix draws shapes[0:upTo] onto a fresh canvas — used once per tier
// tuning run to cache the part of the paint order that tier k's tuning can't
// change (everything painted before its own shapes start).
func renderPrefix(target *canvas, avg [3]float64, shapes []shape, tierOf func(int) int, tp [3]tierParams, fs *fieldSet, upTo int) *canvas {
	cv := newCanvas(target.w, target.h)
	cv.fill(avg)
	for i := 0; i < upTo; i++ {
		k := tierOf(i)
		drawShapeInto(cv, shapes[i], tp[k], fs.get(k, tp[k]))
	}
	return cv
}

// renderFrom clones pre and paints shapes[from:] onto it, returning the
// result and its total squared error against target.
func renderFrom(pre, target *canvas, shapes []shape, tierOf func(int) int, tp [3]tierParams, fs *fieldSet, from int) (*canvas, float64) {
	cv := cloneCanvas(pre)
	// resolve all three fields up front: at most one of them is stale per
	// render (the tier being tuned), so the rest are cache hits.
	var f [3]*field
	for k := range f {
		f[k] = fs.get(k, tp[k])
	}
	for i := from; i < len(shapes); i++ {
		k := tierOf(i)
		drawShapeInto(cv, shapes[i], tp[k], f[k])
	}
	sum := 0.0
	for i := range cv.px {
		d := cv.px[i] - target.px[i]
		sum += d * d
	}
	return cv, sum / float64(len(cv.px))
}

// errorBudget is how much worse (relative) the tiered render is allowed to
// get versus the flat (no-warp) baseline. Minimizing raw pixel error always
// wants zero warp — a jagged edge can only move pixels away from their
// already-fitted position, since a real photo has no fine noise for it to
// "discover" — so pure minimization finds nothing worth warping, ever.
// Instead we search for the BOLDEST (largest-scale) warp whose error stays
// within this budget of the flat baseline: frequency is still tuned against
// the real photo (a tier over more visually complex regions can afford more
// scale before crossing the budget), but the objective rewards visible
// texture rather than erasing it.
const errorBudget = 0.15

// better reports whether (err, scale) should replace (bestErr, bestScale):
// prefer anything within budget over anything outside it; within budget,
// prefer more scale (bolder); outside budget (only reachable before any
// candidate has found the budget yet), prefer lower error.
func better(err, scale, bestErr, bestScale, budget float64) bool {
	valid, bestValid := err <= budget, bestErr <= budget
	if valid != bestValid {
		return valid
	}
	if valid {
		return scale > bestScale
	}
	return err < bestErr
}

// successive-halving schedule for tier tuning: 15 wide-net (freq,scale) pairs
// -> keep 4 -> 15 climb steps each -> keep 2 -> 30 more each -> boldest wins.
const (
	tierWide      = 15
	tierWideKeep  = 4
	tierMidIters  = 15
	tierMidKeep   = 2
	tierFineIters = 30
)

type tierCand struct{ freq, scale, err float64 }

// tuneTier hill-climbs tier k's (freq, scale) — freq/scale expressed in
// final-canvas (1024-wide) units — against the real photo, holding earlier
// tiers at their already-tuned params and later tiers flat (not yet decided).
// Shapes before tier k's range never change during this call, so they're
// rendered once into a prefix canvas and only cloned (not re-rasterized) for
// every candidate — only tier k's own shapes and the tiers after it actually
// need repainting per evaluation.
func tuneTier(rng *rand.Rand, target *canvas, avg [3]float64, shapes []shape, tierOf func(int) int, tp [3]tierParams, fs *fieldSet, k int, spec tierSpec, ratio float64, start int) tierParams {
	pre := renderPrefix(target, avg, shapes, tierOf, tp, fs, start)
	toWorking := func(freqF, scaleF float64) tierParams {
		return tierParams{freq: freqF * ratio, scale: scaleF / ratio, octaves: spec.octaves}
	}
	eval := func(freqF, scaleF float64) float64 {
		cand := tp
		cand[k] = toWorking(freqF, scaleF)
		_, err := renderFrom(pre, target, shapes, tierOf, cand, fs, start)
		return err
	}

	baseErr := eval(0, 0)
	budget := baseErr * (1 + errorBudget)

	// round 1: wide net, always including the no-warp baseline as a fallback.
	pool := make([]tierCand, 0, scaled(tierWide)+1)
	pool = append(pool, tierCand{0, 0, baseErr})
	for i := 0; i < scaled(tierWide); i++ {
		f := spec.freqMin + rng.Float64()*(spec.freqMax-spec.freqMin)
		s := spec.scaleMin + rng.Float64()*(spec.scaleMax-spec.scaleMin)
		pool = append(pool, tierCand{f, s, eval(f, s)})
	}
	rank := func(p []tierCand) {
		sort.Slice(p, func(i, j int) bool { return better(p[i].err, p[i].scale, p[j].err, p[j].scale, budget) })
	}
	rank(pool)
	pool = pool[:min(tierWideKeep, len(pool))]

	climbTier := func(c tierCand, iters int, fStep, sStep float64) tierCand {
		for it := 0; it < iters; it++ {
			cf := math.Max(spec.freqMin, math.Min(spec.freqMax, c.freq+rng.NormFloat64()*fStep))
			cs := math.Max(spec.scaleMin, math.Min(spec.scaleMax, c.scale+rng.NormFloat64()*sStep))
			ce := eval(cf, cs)
			if better(ce, cs, c.err, c.scale, budget) {
				c = tierCand{cf, cs, ce}
			}
			fStep *= 0.95
			sStep *= 0.95
		}
		return c
	}

	// round 2: short climb on the survivors.
	fStep0 := (spec.freqMax - spec.freqMin) * 0.3
	sStep0 := (spec.scaleMax - spec.scaleMin) * 0.3
	for i := range pool {
		pool[i] = climbTier(pool[i], scaled(tierMidIters), fStep0, sStep0)
	}
	rank(pool)
	pool = pool[:min(tierMidKeep, len(pool))]

	// round 3: longer refine on the finalists.
	for i := range pool {
		pool[i] = climbTier(pool[i], scaled(tierFineIters), fStep0*0.4, sStep0*0.4)
	}
	rank(pool)

	return toWorking(pool[0].freq, pool[0].scale)
}

func hexColor(c [3]float64) string {
	return fmt.Sprintf("#%02x%02x%02x", clamp8(c[0]), clamp8(c[1]), clamp8(c[2]))
}
func clamp8(v float64) int {
	i := int(v + 0.5)
	if i < 0 {
		return 0
	}
	if i > 255 {
		return 255
	}
	return i
}

func main() {
	n := flag.Int("n", 100, "number of triangles")
	res := flag.Int("res", 384, "working canvas width used for fitting")
	seed := flag.Int64("seed", 1, "base random seed")
	eff := flag.Float64("effort", 1, "search effort multiplier (scales every search schedule)")
	flag.Parse()
	args := flag.Args()
	if len(args) != 2 {
		fmt.Fprintln(os.Stderr, "usage: lowpoly-warp -n 100 -res 384 -seed 1 -effort 1 <in.jpeg> <out.svg>")
		os.Exit(2)
	}
	effort = *eff
	jpegPath, svgPath := args[0], args[1]

	w := *res
	h := int(float64(w) * float64(outH) / float64(outW))
	target := loadTarget(jpegPath, w, h)

	var avg [3]float64
	for y := 0; y < h; y++ {
		for x := 0; x < w; x++ {
			for ch := 0; ch < 3; ch++ {
				avg[ch] += target.at(x, y, ch)
			}
		}
	}
	for ch := range avg {
		avg[ch] /= float64(w * h)
	}

	rng := rand.New(rand.NewSource(*seed))

	// stage 1: fit N flat triangles, same division of labour as primitive.
	cv := newCanvas(w, h)
	cv.fill(avg)
	shapes := make([]shape, *n)
	for i := 0; i < *n; i++ {
		s := fitShape(rng, cv, target)
		commitFlat(cv, s)
		shapes[i] = s
	}

	// stage 2: tune the 3 shared wave filters, tier by tier, in paint order.
	bounds := tierBounds(*n)
	tierOf := tierOfFn(bounds)
	ratio := float64(outW) / float64(w)
	var np [3][2]*perlin
	for k := 0; k < 3; k++ {
		np[k] = [2]*perlin{newPerlin(*seed*97 + int64(k)*2 + 1), newPerlin(*seed*97 + int64(k)*2 + 2)}
	}
	fs := newFieldSet(w, h, np)
	var tp [3]tierParams
	for k := 0; k < 3; k++ {
		tp[k] = tuneTier(rng, target, avg, shapes, tierOf, tp, fs, k, tierSpecs[k], ratio, bounds[k][0])
	}
	freshCv := newCanvas(w, h)
	freshCv.fill(avg)
	_, finalErr := renderFrom(freshCv, target, shapes, tierOf, tp, fs, 0)

	// emit SVG: 3 shared filters (one per tier, skipped if tuning settled on
	// ~no warp), background, then each triangle referencing its tier's filter.
	var b strings.Builder
	fmt.Fprintf(&b, `<svg xmlns="http://www.w3.org/2000/svg" width="%d" height="%d">`, outW, outH)
	b.WriteString("<defs>")
	for k := 0; k < 3; k++ {
		if tp[k].scale*ratio < 1.5 {
			continue
		}
		freqF := tp[k].freq / ratio
		scaleF := tp[k].scale * ratio
		pad := scaleF/2 + 4
		fmt.Fprintf(&b, `<filter id="w-%s" x="%.0f" y="%.0f" width="%.0f" height="%.0f" filterUnits="userSpaceOnUse" primitiveUnits="userSpaceOnUse">`,
			tierSpecs[k].name, -pad, -pad, float64(outW)+2*pad, float64(outH)+2*pad)
		fmt.Fprintf(&b, `<feTurbulence type="turbulence" baseFrequency="%.5f" numOctaves="%d" seed="%d" result="n"/>`, freqF, tp[k].octaves, *seed*97+int64(k)*2+1)
		fmt.Fprintf(&b, `<feDisplacementMap in="SourceGraphic" in2="n" scale="%.2f" xChannelSelector="R" yChannelSelector="G"/>`, scaleF)
		b.WriteString("</filter>")
	}
	b.WriteString("</defs>")
	fmt.Fprintf(&b, `<path fill="%s" d="M0 0h%dv%dH0z"/>`, hexColor(avg), outW, outH)
	for i, s := range shapes {
		k := tierOf(i)
		filterAttr := ""
		if tp[k].scale*ratio >= 1.5 {
			filterAttr = fmt.Sprintf(` filter="url(#w-%s)"`, tierSpecs[k].name)
		}
		fmt.Fprintf(&b, `<path fill="%s" fill-opacity="%.3f"%s d="M%.2f %.2fL%.2f %.2fL%.2f %.2fZ"/>`,
			hexColor(s.color), s.alpha, filterAttr,
			s.t[0].X*ratio, s.t[0].Y*ratio, s.t[1].X*ratio, s.t[1].Y*ratio, s.t[2].X*ratio, s.t[2].Y*ratio)
	}
	b.WriteString("</svg>")

	if err := os.WriteFile(svgPath, []byte(b.String()), 0644); err != nil {
		panic(err)
	}
	fmt.Println(finalErr)
}
