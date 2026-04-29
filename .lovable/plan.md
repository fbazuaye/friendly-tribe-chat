# Embed Pulse Logo in Pitch Documents

Re-generate both existing pitch documents with the official Pulse logo (`public/icon-512.png`) added to the cover page and document header.

## Scope

Update both documents:
1. `Pulse-Pain-Points-Political-Campaigns` (.docx + .pdf)
2. `Pulse-Pain-Points-Free-Chapel` (.docx + .pdf)

## Logo Placement

- **Cover page**: Large centered Pulse logo (~120x120 px) above the document title
- **Page header**: Small Pulse logo (~28x28 px) on the left next to "Pulse" wordmark, appearing on every page after the cover

## Implementation Steps

1. Read the existing logo file from `public/icon-512.png`
2. Update the docx generation script to:
   - Insert `ImageRun` with the logo on the cover (centered, large)
   - Add `ImageRun` inside the section `Header` (small, left-aligned with brand text)
   - Preserve all existing content, theme colors (Navy/Cyan/Purple), and 10 pain-point structure
3. Re-run the script for both documents to produce fresh `.docx` files
4. Convert each `.docx` to `.pdf` using LibreOffice headless
5. QA: render the first page of each PDF to PNG and visually verify the logo appears crisp, centered, and not stretched/overlapping

## Output Files

Saved to `/mnt/documents/` (overwriting the previous versions):
- `Pulse-Pain-Points-Political-Campaigns.docx`
- `Pulse-Pain-Points-Political-Campaigns.pdf`
- `Pulse-Pain-Points-Free-Chapel.docx`
- `Pulse-Pain-Points-Free-Chapel.pdf`

## Notes

- No code changes to the app itself — this is a document-generation task only.
- The logo source is the existing `public/icon-512.png` already used as the in-app brand mark.
