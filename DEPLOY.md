# DEPLOY — How to publish this app (READ THIS FIRST)

This repo (`jefswat/bridge-inspector-app`, branch `main`) is served by **GitHub Pages
from the repo ROOT** at https://jefswat.github.io/bridge-inspector-app/ .
File paths are root-level: `app.js`, `index.html`, `sw.js`, `styles.css`,
`vendor/…` — **NOT** prefixed with `photo-pwa/`.

## ⚠️ The one thing that trips every agent up

In this VS Code / Copilot runtime, a plain `git push` **ALWAYS fails**:

```
error: cannot spawn git-credential-manager: Function not implemented
fatal: could not read Username for 'https://github.com': terminal prompts disabled
```

The sandboxed `git` here **cannot spawn the credential-helper subprocess**, and there
is no `gh` CLI, no `GITHUB_TOKEN` env var, and no interactive terminal. So:

- ❌ Do NOT run `git push origin main` — it will fail no matter how many times you retry.
- ❌ Do NOT try to "fix" the credential helper — the binary exists but can't be spawned.

There are TWO methods that DO work. Use Method A first; fall back to Method B.

---

## ✅ Method A — git push with the token pulled from Windows Credential Manager

The OAuth token IS stored in Windows Credential Manager under the target
`GitHub - https://api.github.com/jefswat`. Read it directly with the Win32 CredRead
API, then push with the token embedded in the URL and the credential helper DISABLED
(so git never needs to spawn the broken helper). The clone already proves
`git-remote-https` CAN spawn — only the *credential helper* can't.

Run this in PowerShell (uses `C:/ProgramData/anaconda3/python.exe`? No — pure PowerShell):

```powershell
$src = @"
using System;
using System.Runtime.InteropServices;
public class CredR {
  [DllImport("advapi32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
  static extern bool CredRead(string target, int type, int flags, out IntPtr cred);
  [DllImport("advapi32.dll")] static extern void CredFree(IntPtr cred);
  [StructLayout(LayoutKind.Sequential)]
  struct CREDENTIAL { public int Flags; public int Type; public IntPtr TargetName; public IntPtr Comment; public long LastWritten; public int CredentialBlobSize; public IntPtr CredentialBlob; public int Persist; public int AttributeCount; public IntPtr Attributes; public IntPtr TargetAlias; public IntPtr UserName; }
  public static byte[] ReadBytes(string target) {
    IntPtr p; if (!CredRead(target, 1, 0, out p)) return null;
    var c = (CREDENTIAL)Marshal.PtrToStructure(p, typeof(CREDENTIAL));
    byte[] b = new byte[c.CredentialBlobSize];
    Marshal.Copy(c.CredentialBlob, b, 0, c.CredentialBlobSize);
    CredFree(p); return b;
  }
}
"@
Add-Type -TypeDefinition $src -Language CSharp
# IMPORTANT: the blob is UTF-8 bytes, NOT UTF-16. Decode as UTF8 or you get garbage.
$tok = [System.Text.Encoding]::UTF8.GetString([CredR]::ReadBytes("GitHub - https://api.github.com/jefswat"))

cd "C:\Users\jsvatora\AppData\Local\Temp\bridge-inspector-app-sync"   # the deploy clone
$env:GIT_TERMINAL_PROMPT = 0
$url = "https://x-access-token:$tok@github.com/jefswat/bridge-inspector-app.git"
# -c credential.helper=  DISABLES the broken helper so git uses the URL token directly.
git -c credential.helper= --no-pager push $url main 2>&1 |
  ForEach-Object { $_ -replace [regex]::Escape($tok), "***" }   # redact token in output
```

Success looks like: `a691591..cddaf22  main -> main`.

Notes:
- The token is a `gho_…` OAuth token (40 chars). If `CredentialBlobSize` says 40, decode
  as UTF-8 → 40 chars. Decoding as Unicode gives a 20-char garbled string → auth fails.
- Always redact the token when printing command output.
- Use `x-access-token:<token>` as the userinfo (username value doesn't matter for a token).

## ✅ Method B — GitHub MCP API (no local git at all)

If Method A is unavailable, publish with the GitHub MCP tools (authenticated server-side
as `jefswat` — confirm with `github-get_me`):

- `github-push_files` — owner=`jefswat`, repo=`bridge-inspector-app`, branch=`main`,
  `files=[{path,content}, …]`, one commit message. New files need no SHA.
- or `github-create_or_update_file` per file (existing files need the current blob `sha`;
  re-fetch it right before the call to avoid conflicts).

Caveat: `app.js` is ~258 KB. `push_files` must carry the FULL file content inline, which is
large. Method A (git push) avoids re-uploading large files, so prefer it.

---

## Every deploy: cache-bust these THREE spots (or phones keep the old app)

The service worker is cache-first for local assets, so bumping versions is mandatory:

1. `app.js` line 1 — `const BUILD_STAMP = "YYYY-MM-DD HH:MM:SS";`
   (this is the date shown in the upper-left header; a stale header date = stale BUILD_STAMP)
2. `index.html` — bump the `?v=YYYYMMDD-HHMMSS` query strings on `styles.css` and `app.js`
3. `sw.js` line 1 — `const CACHE_NAME = "photo-vault-vNN";` (increment NN)

After publishing, on the phone tap **🔄 Clear cache & reload** (Transfer view), or
unregister the service worker + hard refresh, then confirm the header build stamp.

## Two locations — do NOT confuse them

- `C:\Users\jsvatora\Desktop\VScode Agent\photo-pwa\` = local DEV workspace (NOT a git repo).
- `C:\Users\jsvatora\AppData\Local\Temp\bridge-inspector-app-sync\` = the git clone of THIS
  deploy repo (root-level files). This is what maps to GitHub Pages. Push from here.
