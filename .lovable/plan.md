

# Generate Pulse Community Feature Guide (Word Document)

## What we'll create
A downloadable Word document (.docx) that serves as a comprehensive guide explaining how the Pulse Community feature works, covering: onboarding flow, joining communities, messaging, admin capabilities, member limits, and broadcast channels.

## Content outline
1. **Getting Started** — Install Pulse, sign up, enter invite code (LIVEGIG2026), join the organization
2. **Communities Overview** — What communities are, how they differ from broadcasts
3. **Joining a Community** — Members are added by the community creator; communities appear on the Communities tab
4. **Creating a Community (Admin/Any Member)** — Name, description, avatar, select members
5. **Messaging in Communities** — Real-time group chat, text messages, date grouping, unread badges
6. **Member Management** — View members, leave community, admin roles
7. **Member Limits** — Current technical limits (recommended 200 per community, 500 per org), scalability optimizations in place
8. **Broadcast Channels** — One-to-many messaging for large audiences, admin-only creation, subscriber model
9. **FAQ / Tips**

## Technical approach
- Use the `docx` npm package (already available) to generate a professional .docx file
- Write the generation script to `/tmp/gen_guide.js`, output to `/mnt/documents/Pulse_Community_Guide.docx`
- Apply branded styling with Pulse colors, proper headings, numbered lists, and table formatting
- QA by converting to images and inspecting

## Steps
1. Write the Node.js script using `docx` package to generate the document
2. Run the script to produce the .docx file
3. Convert to PDF/images for visual QA
4. Deliver the artifact to the user

