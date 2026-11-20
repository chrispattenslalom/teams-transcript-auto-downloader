import Foundation
import SafariServices

final class TestExtensionContext: NSExtensionContext {
    let request: NSExtensionItem
    var result: NSExtensionItem?

    init(message: [String: Any]) {
        request = NSExtensionItem()
        request.userInfo = [SFExtensionMessageKey: message]
        super.init()
    }

    override var inputItems: [Any] { [request] }

    override func completeRequest(
        returningItems items: [Any]?,
        completionHandler: ((Bool) -> Void)? = nil
    ) {
        result = items?.first as? NSExtensionItem
    }
}

@main
struct SafariNativeTests {
    static func main() throws {
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent("transcript-safari-test-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: false)
        defer { try? FileManager.default.removeItem(at: directory) }

        let request: [String: Any] = [
            "type": "SAVE_TRANSCRIPT",
            "filename": "Meeting.txt",
            "text": "Synthetic transcript"
        ]
        let first = NativeTranscriptSaver.response(for: request, directory: directory)
        precondition(first["ok"] as? Bool == true)
        precondition(first["filename"] as? String == "Meeting.txt")
        let second = NativeTranscriptSaver.response(for: request, directory: directory)
        precondition(second["ok"] as? Bool == true)
        precondition(second["filename"] as? String == "Meeting (1).txt")
        let contents = try String(contentsOf: directory.appendingPathComponent("Meeting.txt"), encoding: .utf8)
        precondition(contents == "Synthetic transcript")

        var invalid = request
        invalid["filename"] = "../outside.txt"
        precondition(NativeTranscriptSaver.response(for: invalid, directory: directory)["ok"] as? Bool == false)
        invalid["filename"] = "Meeting.pdf"
        precondition(NativeTranscriptSaver.response(for: invalid, directory: directory)["ok"] as? Bool == false)
        precondition(NativeTranscriptSaver.response(for: request, directory: nil)["ok"] as? Bool == false)

        invalid["filename"] = "../outside.txt"
        let context = TestExtensionContext(message: invalid)
        SafariWebExtensionHandler().beginRequest(with: context)
        let response = context.result?.userInfo?[SFExtensionMessageKey] as? [String: Any]
        precondition(response?["ok"] as? Bool == false)

        var longName = request
        longName["filename"] = String(repeating: "会", count: 180) + ".txt"
        let longResult = NativeTranscriptSaver.response(for: longName, directory: directory)
        precondition(longResult["ok"] as? Bool == true)
        let savedName = longResult["filename"] as? String
        precondition(savedName != nil && savedName!.utf8.count <= 255)
        print("Safari native download tests passed")
    }
}
