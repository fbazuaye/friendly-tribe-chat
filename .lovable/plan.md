# Pulse Installation Guide (Word Document)

Generate a downloadable `.docx` installation guide covering iOS and Android, including QR-code onboarding.

## Deliverable
- `Pulse-Installation-Guide.docx` in `/mnt/documents/`, branded with "Designed by Frank Bazuaye · Powered by LiveGig Ltd"

## Document Outline
1. **Cover** — Title, subtitle, version, date
2. **What is Pulse** — Short overview (community messaging PWA)
3. **Before You Begin** — Requirements, invite code / QR code from admin
4. **Install on iPhone / iPad (iOS 16+)**
   - Open Safari (must be Safari, not Chrome)
   - Visit the Pulse URL or scan the QR code with the Camera app
   - Tap Share → Add to Home Screen → Add
   - Launch from home screen
5. **Install on Android (Chrome / Edge)**
   - Open Chrome
   - Visit the Pulse URL or scan the QR with Google Lens / Camera
   - Tap "Install app" prompt, or menu → Install app / Add to Home screen
   - Launch from home screen / app drawer
6. **Joining Your Organization**
   - Method A: Scan QR code (camera opens Pulse with code pre-filled)
   - Method B: Enter invite code manually at /join-organization
   - Sign up / sign in, then auto-join
7. **Enabling Notifications** — Allow push when prompted; iOS requires app to be installed first
8. **Troubleshooting** — Install prompt missing, QR not scanning, notifications not arriving, clearing cache
9. **Support** — Contact admin / LiveGig

## Generation Approach
- Use `docx` npm package (already in skill)
- US Letter, Arial, branded heading styles
- Numbered step lists for install flows
- Callout-style table rows for "Tip" / "Note" blocks
- QA: convert to PDF + page images, inspect each page, fix issues, then deliver

## Files
- Script: `/tmp/build-install-guide.js`
- Output: `/mnt/documents/Pulse-Installation-Guide.docx`
