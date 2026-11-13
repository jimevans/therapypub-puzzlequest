// Draws an SVG made of filled M/C/Z paths, such as brand/logo.svg, to a PNG
// of any size, using only macOS's own frameworks (no image tools needed).
//
// usage: render <in.svg> <out.png> <size> <fraction> <background|none>
//   fraction: how much of the square the drawing's longest side fills,
//             centered. background: a #rrggbb color, or none for transparent.

import CoreGraphics
import Foundation
import ImageIO
import UniformTypeIdentifiers

let args = CommandLine.arguments
guard args.count == 6, let size = Int(args[3]), let fraction = Double(args[4]) else {
    FileHandle.standardError.write("usage: render <in.svg> <out.png> <size> <fraction> <background|none>\n".data(using: .utf8)!)
    exit(2)
}
let svg = try String(contentsOfFile: args[1], encoding: .utf8)

func color(_ hex: String) -> CGColor {
    let v = Int(hex.dropFirst(), radix: 16)!
    return CGColor(srgbRed: CGFloat((v >> 16) & 255) / 255, green: CGFloat((v >> 8) & 255) / 255,
                   blue: CGFloat(v & 255) / 255, alpha: 1)
}

func path(_ d: String) -> CGPath {
    let path = CGMutablePath()
    var tokens = [String](), current = ""
    for ch in d {
        if "MCZ".contains(ch) {
            if !current.isEmpty { tokens.append(current) }
            tokens.append(String(ch)); current = ""
        } else if ch == "," || ch == " " {
            if !current.isEmpty { tokens.append(current) }
            current = ""
        } else {
            current.append(ch)
        }
    }
    if !current.isEmpty { tokens.append(current) }
    var i = 0, command = "M"
    func number() -> CGFloat { defer { i += 1 }; return CGFloat(Double(tokens[i])!) }
    func point() -> CGPoint { let x = number(); return CGPoint(x: x, y: number()) }
    while i < tokens.count {
        if ["M", "C", "Z"].contains(tokens[i]) {
            command = tokens[i]; i += 1
            if command == "Z" { path.closeSubpath(); continue }
        }
        if command == "M" {
            path.move(to: point())
        } else {
            let c1 = point(), c2 = point(), end = point()
            path.addCurve(to: end, control1: c1, control2: c2)
        }
    }
    return path
}

// Each <path>: its fill, whether it's even-odd, and its shape.
let pathPattern = try NSRegularExpression(pattern: "<path ([^>]*)/>")
let attribute = { (name: String, tag: String) -> String? in
    guard let r = tag.range(of: "\(name)=\"([^\"]*)\"", options: .regularExpression) else { return nil }
    return String(tag[r].dropFirst(name.count + 2).dropLast())
}
let shapes = pathPattern.matches(in: svg, range: NSRange(svg.startIndex..., in: svg)).map { match in
    let tag = String(svg[Range(match.range(at: 1), in: svg)!])
    return (fill: color(attribute("fill", tag)!), evenOdd: attribute("fill-rule", tag) == "evenodd",
            path: path(attribute("d", tag)!))
}
let box = shapes[0].path.boundingBoxOfPath.union(shapes.dropFirst().reduce(CGRect.null) { $0.union($1.path.boundingBoxOfPath) })

let context = CGContext(data: nil, width: size, height: size, bitsPerComponent: 8, bytesPerRow: 0,
                        space: CGColorSpace(name: CGColorSpace.sRGB)!,
                        bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
if args[5] != "none" {
    context.setFillColor(color(args[5]))
    context.fill(CGRect(x: 0, y: 0, width: size, height: size))
}
// Center the drawing, and flip it: SVG's y runs down, Core Graphics' up.
let scale = CGFloat(size) * CGFloat(fraction) / max(box.width, box.height)
context.translateBy(x: CGFloat(size) / 2, y: CGFloat(size) / 2)
context.scaleBy(x: scale, y: -scale)
context.translateBy(x: -box.midX, y: -box.midY)
for shape in shapes {
    context.addPath(shape.path)
    context.setFillColor(shape.fill)
    context.fillPath(using: shape.evenOdd ? .evenOdd : .winding)
}
let destination = CGImageDestinationCreateWithURL(URL(fileURLWithPath: args[2]) as CFURL,
                                                  UTType.png.identifier as CFString, 1, nil)!
CGImageDestinationAddImage(destination, context.makeImage()!, nil)
guard CGImageDestinationFinalize(destination) else { exit(1) }
