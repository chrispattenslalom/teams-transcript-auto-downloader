import Darwin
import Foundation
import SafariServices

enum NativeTranscriptSaver {
    enum SaveError: LocalizedError {
        case invalidFilename
        case tooManyFiles
        case cleanupFailed(String, String)

        var errorDescription: String? {
            switch self {
            case .invalidFilename:
                return "Invalid transcript filename."
            case .tooManyFiles:
                return "Could not choose an unused transcript filename."
            case let .cleanupFailed(writeError, cleanupError):
                return "\(writeError) Could not remove the incomplete file: \(cleanupError)"
            }
        }
    }

    static func response(for message: Any?, directory: URL?) -> [String: Any] {
        guard let request = message as? [String: Any],
              request["type"] as? String == "SAVE_TRANSCRIPT",
              let filename = request["filename"] as? String,
              let text = request["text"] as? String else {
            return ["ok": false, "error": "Invalid transcript download request."]
        }
        guard let directory else {
            return ["ok": false, "error": "The Downloads folder is unavailable."]
        }

        do {
            return ["ok": true, "filename": try save(text: text, filename: filename, directory: directory)]
        } catch {
            return ["ok": false, "error": error.localizedDescription]
        }
    }

    static func save(text: String, filename: String, directory: URL) throws -> String {
        guard filename.hasSuffix(".txt"),
              !filename.hasPrefix("."),
              !filename.contains("/"),
              !filename.contains("\\"),
              !filename.unicodeScalars.contains(where: CharacterSet.controlCharacters.contains) else {
            throw SaveError.invalidFilename
        }

        var stem = String(filename.dropLast(4)).precomposedStringWithCanonicalMapping
        while stem.utf8.count > 240 {
            stem.removeLast()
        }
        guard !stem.isEmpty else { throw SaveError.invalidFilename }

        let data = Data(text.utf8)
        for index in 0..<10000 {
            let suffix = index == 0 ? "" : " (\(index))"
            let candidate = "\(stem)\(suffix).txt"
            let url = directory.appendingPathComponent(candidate, isDirectory: false)
            let descriptor = open(url.path, O_WRONLY | O_CREAT | O_EXCL | O_CLOEXEC | O_NOFOLLOW, 0o600)
            if descriptor < 0 {
                let code = errno
                if code == EEXIST { continue }
                throw NSError(domain: NSPOSIXErrorDomain, code: Int(code))
            }

            do {
                let file = FileHandle(fileDescriptor: descriptor, closeOnDealloc: true)
                try file.write(contentsOf: data)
                try file.synchronize()
                try file.close()
                return candidate
            } catch {
                let writeError = error
                do {
                    try FileManager.default.removeItem(at: url)
                } catch {
                    throw SaveError.cleanupFailed(writeError.localizedDescription, error.localizedDescription)
                }
                throw writeError
            }
        }
        throw SaveError.tooManyFiles
    }
}

final class SafariWebExtensionHandler: NSObject, NSExtensionRequestHandling {
    func beginRequest(with context: NSExtensionContext) {
        let request = context.inputItems.first as? NSExtensionItem
        let message = request?.userInfo?[SFExtensionMessageKey]
        let directory = FileManager.default.urls(for: .downloadsDirectory, in: .userDomainMask).first

        let response = NSExtensionItem()
        response.userInfo = [SFExtensionMessageKey: NativeTranscriptSaver.response(for: message, directory: directory)]
        context.completeRequest(returningItems: [response], completionHandler: nil)
    }
}
