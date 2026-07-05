// lowpoly-score.go <imgA> <imgB>
//
// Prints the mean-squared error (per RGB channel, 0..65025) between two images,
// sampled on a common 160x90 grid so the two inputs need not share dimensions.
// Used by gen-lowpoly.sh to pick the best of several randomised primitive runs.
package main

import (
	"fmt"
	"image"
	_ "image/jpeg"
	_ "image/png"
	"os"
)

func load(p string) image.Image {
	f, err := os.Open(p)
	if err != nil {
		panic(err)
	}
	defer f.Close()
	im, _, err := image.Decode(f)
	if err != nil {
		panic(err)
	}
	return im
}

func main() {
	if len(os.Args) != 3 {
		fmt.Fprintln(os.Stderr, "usage: lowpoly-score <imgA> <imgB>")
		os.Exit(2)
	}
	a := load(os.Args[1])
	b := load(os.Args[2])
	const gw, gh = 160, 90
	ab := a.Bounds()
	bb := b.Bounds()
	var sum, n float64
	for gy := 0; gy < gh; gy++ {
		for gx := 0; gx < gw; gx++ {
			ax := ab.Min.X + (gx*ab.Dx())/gw
			ay := ab.Min.Y + (gy*ab.Dy())/gh
			bx := bb.Min.X + (gx*bb.Dx())/gw
			by := bb.Min.Y + (gy*bb.Dy())/gh
			ar, ag, aBl, _ := a.At(ax, ay).RGBA()
			br, bg, bBl, _ := b.At(bx, by).RGBA()
			dr := float64(int(ar>>8) - int(br>>8))
			dg := float64(int(ag>>8) - int(bg>>8))
			db := float64(int(aBl>>8) - int(bBl>>8))
			sum += dr*dr + dg*dg + db*db
			n += 3
		}
	}
	fmt.Printf("%.4f\n", sum/n)
}
