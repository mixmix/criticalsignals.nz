// detect-faces.swift <image>
//
// Finds the parts of people that scripts/podcast-covers.mjs gives extra
// triangles to, using macOS's Vision framework. Prints one region per line:
//
//   <kind> <cx> <cy> <size>      pixels, origin top-left
//
// kind is `face`, `hand` or `arm`; size is roughly the region's diameter.
// macOS only.
//
// Faces: face detection, plus a person (body-box) fallback, since face
// detection misses profiles and hats. Hands and arms: body-pose joints —
// a hand at each wrist, an arm region at the middle of each upper arm and
// forearm.
import Foundation
import Vision
import AppKit

guard CommandLine.arguments.count == 2,
      let img = NSImage(contentsOfFile: CommandLine.arguments[1]),
      let cg = img.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
  FileHandle.standardError.write("usage: detect-faces <image>\n".data(using: .utf8)!)
  exit(2)
}
let W = Double(cg.width), H = Double(cg.height)

// Vision coordinates are normalised with the origin bottom-left; flip to pixels.
func px(_ b: CGRect) -> CGRect {
  CGRect(x: b.minX * W, y: (1 - b.maxY) * H, width: b.width * W, height: b.height * H)
}
func px(_ p: CGPoint) -> CGPoint { CGPoint(x: p.x * W, y: (1 - p.y) * H) }
func dist(_ a: CGPoint, _ b: CGPoint) -> Double { hypot(a.x - b.x, a.y - b.y) }
func emit(_ kind: String, _ c: CGPoint, _ size: Double) {
  print(String(format: "%@ %.0f %.0f %.0f", kind, c.x, c.y, size))
}

let faces = VNDetectFaceRectanglesRequest()
let people = VNDetectHumanRectanglesRequest()
people.upperBodyOnly = false
let poses = VNDetectHumanBodyPoseRequest()
try VNImageRequestHandler(cgImage: cg, options: [:]).perform([faces, people, poses])

// --- faces ---------------------------------------------------------------------
var heads = (faces.results ?? []).map { px($0.boundingBox) }
for p in (people.results ?? []).map({ px($0.boundingBox) }) {
  if heads.contains(where: { p.contains(CGPoint(x: $0.midX, y: $0.midY)) }) { continue }
  // Head ≈ a square 45% of the body's width, at the top centre.
  let s = p.width * 0.45
  heads.append(CGRect(x: p.midX - s / 2, y: p.minY, width: s, height: s))
}
for h in heads { emit("face", CGPoint(x: h.midX, y: h.midY), max(h.width, h.height)) }

// --- arms and hands --------------------------------------------------------------
typealias J = VNHumanBodyPoseObservation.JointName
for obs in poses.results ?? [] {
  guard let pts = try? obs.recognizedPoints(.all) else { continue }
  func joint(_ n: J) -> CGPoint? {
    guard let p = pts[n], p.confidence > 0.2 else { return nil }
    return px(p.location)
  }
  for (shoulder, elbow, wrist) in [(J.leftShoulder, J.leftElbow, J.leftWrist),
                                   (J.rightShoulder, J.rightElbow, J.rightWrist)] {
    let s = joint(shoulder), e = joint(elbow), w = joint(wrist)
    if let s = s, let e = e {
      emit("arm", CGPoint(x: (s.x + e.x) / 2, y: (s.y + e.y) / 2), dist(s, e))
    }
    if let e = e, let w = w {
      let fore = dist(e, w)
      emit("arm", CGPoint(x: (e.x + w.x) / 2, y: (e.y + w.y) / 2), fore)
      // The hand sits just past the wrist, about half a forearm across.
      let hand = CGPoint(x: w.x + (w.x - e.x) * 0.25, y: w.y + (w.y - e.y) * 0.25)
      emit("hand", hand, fore * 0.6)
    }
  }
}
