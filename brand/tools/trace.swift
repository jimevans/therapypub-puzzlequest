// Traced the logo once, from the original gray PNG, into brand/logo.svg and
// brand/logo-piece.svg. Kept to show where the shapes came from; the SVGs are
// now the source, so this needn't run again.
//
// usage (macOS): swift -O brand/tools/trace.swift brand/original-logo.png brand
//
// It thresholds the PNG at four times its size (alpha for the outline, gray
// against black for the fill), links pixel edges into loops, smooths them
// (more for the piece than for the Q), simplifies, and joins the points with
// Catmull-Rom curves as cubic Béziers. The fill's largest loop is the piece;
// its other loops are the Q and its counter (drawn even-odd).
import Foundation
import CoreGraphics
import ImageIO

let url = URL(fileURLWithPath: CommandLine.arguments[1])
let src = CGImageSourceCreateWithURL(url as CFURL, nil)!
let img = CGImageSourceCreateImageAtIndex(src, 0, nil)!
let w = img.width, h = img.height
var buf = [UInt8](repeating: 0, count: w*h*4)
let ctx = CGContext(data: &buf, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w*4, space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
ctx.draw(img, in: CGRect(x: 0, y: 0, width: w, height: h))

func alpha(_ x: Int, _ y: Int) -> Double { Double(buf[(y*w+x)*4+3]) / 255 }
func value(_ x: Int, _ y: Int) -> Double { Double(buf[(y*w+x)*4]) / 255 }
func bilinear(_ f: (Int, Int) -> Double, _ x: Double, _ y: Double) -> Double {
    let x0 = max(0, min(w-1, Int(floor(x)))), y0 = max(0, min(h-1, Int(floor(y))))
    let x1 = min(w-1, x0+1), y1 = min(h-1, y0+1)
    let fx = max(0, min(1, x - Double(x0))), fy = max(0, min(1, y - Double(y0)))
    return f(x0,y0)*(1-fx)*(1-fy) + f(x1,y0)*fx*(1-fy) + f(x0,y1)*(1-fx)*fy + f(x1,y1)*fx*fy
}

let K = 4, N = w*K, M = h*K
typealias P = (x: Double, y: Double)

func mask(_ test: (Double, Double) -> Bool) -> [Bool] {
    var m = [Bool](repeating: false, count: N*M)
    for gy in 0..<M { for gx in 0..<N {
        let sx = (Double(gx)+0.5)/Double(K) - 0.5, sy = (Double(gy)+0.5)/Double(K) - 0.5
        m[gy*N+gx] = test(sx, sy)
    } }
    return m
}

// Boundary loops: directed pixel edges with the shape on the left, linked into loops.
func loops(_ m: [Bool]) -> [[P]] {
    func at(_ x: Int, _ y: Int) -> Bool { x >= 0 && y >= 0 && x < N && y < M && m[y*N+x] }
    var next = [Int: [Int]]()   // corner key -> list of end corner keys
    func key(_ x: Int, _ y: Int) -> Int { y*(N+1)+x }
    for y in 0..<M { for x in 0..<N where m[y*N+x] {
        if !at(x, y-1) { next[key(x+1,y), default: []].append(key(x,y)) }       // top edge, right→left
        if !at(x-1, y) { next[key(x,y), default: []].append(key(x,y+1)) }       // left edge, down
        if !at(x, y+1) { next[key(x,y+1), default: []].append(key(x+1,y+1)) }  // bottom edge, right
        if !at(x+1, y) { next[key(x+1,y+1), default: []].append(key(x+1,y)) }  // right edge, up
    } }
    var result = [[P]]()
    while let start = next.keys.first {
        var loop = [P](); var k = start
        repeat {
            loop.append((Double(k % (N+1)), Double(k / (N+1))))
            guard var outs = next[k], !outs.isEmpty else { break }
            let n = outs.removeLast()
            if outs.isEmpty { next[k] = nil } else { next[k] = outs }
            k = n
        } while k != start
        if loop.count > 8 { result.append(loop) }
    }
    return result
}

func area(_ l: [P]) -> Double {
    var a = 0.0
    for i in 0..<l.count { let p = l[i], q = l[(i+1) % l.count]; a += p.x*q.y - q.x*p.y }
    return abs(a)/2
}

func smooth(_ l: [P], sigma: Double) -> [P] {
    let r = Int(ceil(sigma*3)); let n = l.count
    let wts = (-r...r).map { exp(-Double($0*$0)/(2*sigma*sigma)) }; let tot = wts.reduce(0,+)
    return (0..<n).map { i in
        var x = 0.0, y = 0.0
        for (j, d) in (-r...r).enumerated() { let p = l[((i+d) % n + n) % n]; x += p.x*wts[j]; y += p.y*wts[j] }
        return (x/tot, y/tot)
    }
}

func dp(_ pts: [P], _ eps: Double) -> [P] {
    if pts.count < 3 { return pts }
    let a = pts.first!, b = pts.last!
    let dx = b.x-a.x, dy = b.y-a.y, len = max(1e-9, (dx*dx+dy*dy).squareRoot())
    var best = 0.0, idx = 0
    for i in 1..<(pts.count-1) {
        let d = abs(dy*pts[i].x - dx*pts[i].y + b.x*a.y - b.y*a.x)/len
        if d > best { best = d; idx = i }
    }
    if best <= eps { return [a, b] }
    let l = dp(Array(pts[0...idx]), eps), r = dp(Array(pts[idx...]), eps)
    return l.dropLast() + r
}

func simplifyClosed(_ l: [P], _ eps: Double) -> [P] {
    // Split at the point farthest from the first, simplify both halves.
    let a = l[0]; var far = 0; var fd = 0.0
    for (i, p) in l.enumerated() { let d = (p.x-a.x)*(p.x-a.x)+(p.y-a.y)*(p.y-a.y); if d > fd { fd = d; far = i } }
    let h1 = dp(Array(l[0...far]), eps), h2 = dp(Array(l[far...]) + [a], eps)
    return Array(h1.dropLast()) + Array(h2.dropLast())
}

// Catmull-Rom through the points, as cubic Béziers, in source pixels.
func pathData(_ ptsGrid: [P]) -> String {
    let p = ptsGrid.map { (x: $0.x/Double(K), y: $0.y/Double(K)) }
    let n = p.count
    func f(_ v: Double) -> String { String(format: "%.1f", v) }
    var s = "M\(f(p[0].x)),\(f(p[0].y))"
    for i in 0..<n {
        let p0 = p[(i-1+n)%n], p1 = p[i], p2 = p[(i+1)%n], p3 = p[(i+2)%n]
        let c1 = (x: p1.x + (p2.x-p0.x)/6, y: p1.y + (p2.y-p0.y)/6)
        let c2 = (x: p2.x - (p3.x-p1.x)/6, y: p2.y - (p3.y-p1.y)/6)
        s += "C\(f(c1.x)),\(f(c1.y)) \(f(c2.x)),\(f(c2.y)) \(f(p2.x)),\(f(p2.y))"
    }
    return s + "Z"
}

func shape(_ ls: [[P]], sigma: Double) -> String {
    ls.map { pathData(simplifyClosed(smooth($0, sigma: sigma), 0.7)) }.joined()
}

let outerMask = mask { bilinear(alpha, $0, $1) > 0.5 }
let fillMask = mask { bilinear(alpha, $0, $1) > 0.5 && bilinear(value, $0, $1) > 40.0/255 }

let outer = loops(outerMask).sorted { area($0) > area($1) }
let fill = loops(fillMask).filter { area($0) > 20*Double(K*K) }.sorted { area($0) > area($1) }

let outline = shape([outer[0]], sigma: 12)
let fillPath = shape([fill[0]], sigma: 12)
let qPath = shape(Array(fill.dropFirst()), sigma: 5)

// The outline's box, from its points (Bézier control points stay close to it).
let numbers = outline.split(whereSeparator: { "MCZ, ".contains($0) }).compactMap { Double($0) }
let xs = stride(from: 0, to: numbers.count, by: 2).map { numbers[$0] }
let ys = stride(from: 1, to: numbers.count, by: 2).map { numbers[$0] }
let pad = 6.0
let viewBox = String(format: "%.1f %.1f %.1f %.1f", xs.min()! - pad, ys.min()! - pad,
                     xs.max()! - xs.min()! + 2*pad, ys.max()! - ys.min()! + 2*pad)

func svg(withQ: Bool) -> String {
    var s = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"\(viewBox)\">\n"
    s += "  <title>PuzzleQuest</title>\n"
    s += "  <path fill=\"#2a1638\" d=\"\(outline)\"/>\n"
    s += "  <path fill=\"#f8ecc4\" d=\"\(fillPath)\"/>\n"
    if withQ { s += "  <path fill=\"#2a1638\" fill-rule=\"evenodd\" d=\"\(qPath)\"/>\n" }
    return s + "</svg>\n"
}
let dir = URL(fileURLWithPath: CommandLine.arguments[2])
try svg(withQ: true).write(to: dir.appendingPathComponent("logo.svg"), atomically: true, encoding: .utf8)
try svg(withQ: false).write(to: dir.appendingPathComponent("logo-piece.svg"), atomically: true, encoding: .utf8)
