import Foundation
import PDFKit
import Vision
import AppKit
let input = CommandLine.arguments[1], out = CommandLine.arguments[2]
let doc = PDFDocument(url: URL(fileURLWithPath: input))!
let fm = FileManager.default
try! fm.createDirectory(atPath: out, withIntermediateDirectories: true)
for i in 0..<doc.pageCount {
 autoreleasepool {
 let p = doc.page(at:i)!, dest="\(out)/\(String(format:"%03d",i+1)).json"
 if fm.fileExists(atPath: dest) { return }
 let native=p.string ?? ""
 let bounds=p.bounds(for:.mediaBox)
 let thumb=p.thumbnail(of: NSSize(width: bounds.width*2.5,height: bounds.height*2.5), for:.mediaBox)
 var rect=CGRect(origin:.zero,size:thumb.size)
 guard let cg=thumb.cgImage(forProposedRect:&rect,context:nil,hints:nil) else { return }
 let req=VNRecognizeTextRequest()
 req.recognitionLevel = .accurate
 req.recognitionLanguages=["zh-Hant","en-US"]
 req.usesLanguageCorrection=true
 var ocrLines:[[String:Any]]=[]
 do {
 try VNImageRequestHandler(cgImage:cg).perform([req])
 for o in req.results ?? [] {
 if let c=o.topCandidates(1).first { ocrLines.append(["text":c.string,"confidence":c.confidence,"bbox":[o.boundingBox.minX,o.boundingBox.minY,o.boundingBox.width,o.boundingBox.height]]) }
 }
 } catch { print("OCR ERROR \(i+1): \(error)") }
 let record:[String:Any] = ["pdf_page":i+1,"native_text":native,"ocr_text":ocrLines.map{$0["text"] as! String}.joined(separator:"\n"),"ocr_lines":ocrLines]
 let data=try! JSONSerialization.data(withJSONObject:record,options:[.prettyPrinted,.sortedKeys,.withoutEscapingSlashes])
 try! data.write(to:URL(fileURLWithPath:dest))
 if i % 12 == 0 || i == doc.pageCount-1 { print("\(URL(fileURLWithPath:input).lastPathComponent) \(i+1)/\(doc.pageCount)"); fflush(stdout) }
 }
}
