# About turntall.com

turntall.com was built to solve a focused editing problem: turn a horizontal video into a useful vertical clip without first handing the original footage to a cloud service. A user can choose exact start and end frames, create a centered 9:16 crop, or draw a box around a moving subject so the crop follows that subject through the clip.

## Local-first by design

Video analysis, subject tracking, preview, crop planning, encoding, and final file creation happen on the user's device in desktop Google Chrome. The web application has no server upload path for source footage. No account is required, the editor is free to use, and turntall.com does not place a logo or promotional watermark over exported videos.

## How the editor works

The browser combines WebAssembly media tools with native browser media capabilities. Compatible operations use an efficient path when possible; exact cuts, vertical crops, subject-following motion, and speed changes create a newly encoded output. Large inputs use a streaming path to avoid reading a multi-gigabyte video into one browser memory buffer.

turntall.com is best suited to individual creators who want a private, focused tool for clips, Shorts, Reels, TikTok, and other 9:16 formats. It is not a collaborative cloud editor, a hosting service, or a server-side batch conversion API.

- [Open the editor](https://turntall.com/)
- [Contact](https://turntall.com/contact)
- [Privacy](https://turntall.com/privacy)
