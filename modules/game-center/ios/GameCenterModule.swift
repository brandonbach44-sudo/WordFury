import ExpoModulesCore
import GameKit

// Thin wrapper over GameKit for Word Fury's leaderboards. The app draws every
// board itself, so this only signs in, submits scores and reads entries; it
// never shows Apple's leaderboard sheet.
public class GameCenterModule: Module {
  private var handlerInstalled = false
  private var hasAuthCallback = false
  private var lastAuthErrorCode: Int?
  // The sign-in view Apple hands the authenticate handler when the player is
  // signed out. Held so a tap on "Sign in to Game Center" can present it.
  private var pendingSignInController: UIViewController?
  private var waitingAuthPromises: [Promise] = []

  public func definition() -> ModuleDefinition {
    Name("GameCenter")

    Events("onAuthChange")

    // Installs the authenticate handler (once) and resolves with the first
    // auth state GameKit reports. Later changes arrive as onAuthChange.
    AsyncFunction("authenticate") { (promise: Promise) in
      if self.handlerInstalled {
        if self.hasAuthCallback {
          promise.resolve(self.authState())
        } else {
          self.waitingAuthPromises.append(promise)
        }
        return
      }
      self.handlerInstalled = true
      self.waitingAuthPromises.append(promise)
      GKLocalPlayer.local.authenticateHandler = { [weak self] viewController, error in
        DispatchQueue.main.async {
          guard let self = self else { return }
          self.hasAuthCallback = true
          self.pendingSignInController = viewController
          self.lastAuthErrorCode = (error as NSError?)?.code
          let state = self.authState()
          let waiting = self.waitingAuthPromises
          self.waitingAuthPromises = []
          waiting.forEach { $0.resolve(state) }
          self.sendEvent("onAuthChange", state)
        }
      }
    }.runOnQueue(.main)

    AsyncFunction("getAuthState") { () -> [String: Any] in
      return self.authState()
    }.runOnQueue(.main)

    // Presents Apple's sign-in view if GameKit provided one. False when there
    // is none, in which case the player has to sign in through Settings.
    AsyncFunction("presentSignIn") { () -> Bool in
      guard
        let controller = self.pendingSignInController,
        let presenter = self.appContext?.utilities?.currentViewController()
      else {
        return false
      }
      self.pendingSignInController = nil
      presenter.present(controller, animated: true)
      return true
    }.runOnQueue(.main)

    AsyncFunction("submitScore") { (boardId: String, value: Double, context: Double, promise: Promise) in
      guard GKLocalPlayer.local.isAuthenticated else {
        promise.reject("E_NOT_AUTHENTICATED", "Game Center is not signed in")
        return
      }
      GKLeaderboard.submitScore(
        Int(value),
        context: Int(context),
        player: GKLocalPlayer.local,
        leaderboardIDs: [boardId]
      ) { error in
        if let error = error {
          promise.reject("E_SUBMIT", error.localizedDescription)
        } else {
          promise.resolve(nil)
        }
      }
    }

    AsyncFunction("loadOccurrence") { (boardId: String, promise: Promise) in
      self.loadBoard(boardId, promise: promise) { board in
        promise.resolve([
          "startDate": self.epochMs(board.startDate),
          "durationSeconds": board.duration,
          "nextStartDate": self.epochMs(board.nextStartDate),
        ])
      }
    }

    // One call returns the local player's entry, the requested range and the
    // total player count. occurrencesBack 0 is the current occurrence, 1 the
    // one before it, and so on.
    AsyncFunction("loadEntries") { (boardId: String, scope: String, first: Int, count: Int, occurrencesBack: Int, promise: Promise) in
      guard GKLocalPlayer.local.isAuthenticated else {
        promise.reject("E_NOT_AUTHENTICATED", "Game Center is not signed in")
        return
      }
      self.loadBoard(boardId, promise: promise) { board in
        self.walkBack(board, steps: max(0, occurrencesBack)) { target, error in
          guard let target = target else {
            promise.reject("E_NO_OCCURRENCE", error?.localizedDescription ?? "No earlier occurrence")
            return
          }
          let playerScope: GKLeaderboard.PlayerScope = scope == "friends" ? .friendsOnly : .global
          let range = NSRange(location: max(1, first), length: max(1, min(100, count)))
          target.loadEntries(for: playerScope, timeScope: .allTime, range: range) { local, entries, total, error in
            if let error = error {
              promise.reject("E_LOAD_ENTRIES", error.localizedDescription)
              return
            }
            var result: [String: Any] = [
              "entries": (entries ?? []).map { self.entryDict($0) },
              "totalPlayerCount": total,
              "occurrenceStart": self.epochMs(target.startDate),
              "durationSeconds": target.duration,
            ]
            // GameKit returns a placeholder local entry (rank 0, score 0)
            // when the player has no score in this occurrence. A real entry
            // always has rank 1 or more.
            if let local = local, local.rank >= 1 {
              result["local"] = self.entryDict(local)
            }
            promise.resolve(result)
          }
        }
      }
    }

    AsyncFunction("friendsAuthorizationStatus") { (promise: Promise) in
      guard GKLocalPlayer.local.isAuthenticated else {
        promise.resolve("restricted")
        return
      }
      GKLocalPlayer.local.loadFriendsAuthorizationStatus { status, error in
        if error != nil {
          promise.resolve("denied")
          return
        }
        promise.resolve(self.statusString(status))
      }
    }

    // Loading the friends list is what shows Apple's friends permission prompt.
    AsyncFunction("requestFriendsAuthorization") { (promise: Promise) in
      guard GKLocalPlayer.local.isAuthenticated else {
        promise.resolve("restricted")
        return
      }
      GKLocalPlayer.local.loadFriends { _, _ in
        GKLocalPlayer.local.loadFriendsAuthorizationStatus { status, _ in
          promise.resolve(self.statusString(status))
        }
      }
    }
  }

  // MARK: - Helpers

  private func authState() -> [String: Any] {
    let player = GKLocalPlayer.local
    let restricted = lastAuthErrorCode == GKError.Code.parentalControlsBlocked.rawValue
    return [
      "isAuthenticated": player.isAuthenticated,
      "isRestricted": restricted,
      "playerId": player.isAuthenticated ? player.gamePlayerID : "",
      "displayName": player.isAuthenticated ? player.displayName : "",
      "canPresentSignIn": pendingSignInController != nil,
    ]
  }

  private func loadBoard(_ boardId: String, promise: Promise, then: @escaping (GKLeaderboard) -> Void) {
    GKLeaderboard.loadLeaderboards(IDs: [boardId]) { boards, error in
      if let error = error {
        promise.reject("E_LOAD_BOARD", error.localizedDescription)
        return
      }
      guard let board = boards?.first else {
        promise.reject("E_NO_BOARD", "Leaderboard \(boardId) was not found")
        return
      }
      then(board)
    }
  }

  private func walkBack(_ board: GKLeaderboard, steps: Int, completion: @escaping (GKLeaderboard?, Error?) -> Void) {
    if steps == 0 {
      completion(board, nil)
      return
    }
    board.loadPreviousOccurrence { previous, error in
      if let previous = previous {
        self.walkBack(previous, steps: steps - 1, completion: completion)
      } else {
        completion(nil, error)
      }
    }
  }

  private func entryDict(_ entry: GKLeaderboard.Entry) -> [String: Any] {
    return [
      "rank": entry.rank,
      "value": Double(entry.score),
      "context": Double(entry.context),
      "displayName": entry.player.displayName,
      "playerId": entry.player.gamePlayerID,
      "isLocal": entry.player.gamePlayerID == GKLocalPlayer.local.gamePlayerID,
    ]
  }

  private func epochMs(_ date: Date?) -> Double {
    guard let date = date else { return -1 }
    return date.timeIntervalSince1970 * 1000
  }

  private func statusString(_ status: GKFriendsAuthorizationStatus) -> String {
    switch status {
    case .notDetermined:
      return "notDetermined"
    case .authorized:
      return "authorized"
    case .denied:
      return "denied"
    case .restricted:
      return "restricted"
    @unknown default:
      return "denied"
    }
  }
}
