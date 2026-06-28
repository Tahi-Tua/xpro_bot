# XPRO Member Hub Setup

This guide wires Glide, Google Sheets, and the Discord bot together for the private XPRO Member Hub.

## 1. Google Sheet

Create or import a spreadsheet named `XPRO Member Hub` with these tabs:

- `Users`
- `MemberProfiles`
- `Resources`
- `Events`
- `Leaderboard`
- `AppLinks`

Required columns:

- `Users`: `Email`, `DiscordId`, `DiscordName`, `Role`, `Status`, `JoinedAt`, `ProfileComplete`
- `MemberProfiles`: `Email`, `DiscordId`, `InGameName`, `PlayerId`, `FavoriteHeroes`, `Language`, `Timezone`, `Availability`, `Bio`, `AvatarUrl`
- `Resources`: `Title`, `Type`, `Hero`, `Content`, `ImageUrl`, `Link`, `VisibleForRole`, `SortOrder`
- `Events`: `Title`, `Type`, `StartsAt`, `Status`, `Description`, `DiscordLink`, `VisibleForRole`
- `Leaderboard`: `Name`, `DiscordId`, `Score`, `Rank`, `LastUpdated`
- `AppLinks`: `Title`, `Description`, `Url`, `VisibleForRole`, `SortOrder`

The repo includes a generator:

```bash
node scripts/build-member-hub-workbook.mjs outputs/member-hub
```

Import the generated workbook into Google Drive as a native Google Sheet.

## 2. Glide

Use the Google Sheet as the Glide data source.

Configure User Profiles:

- Profile table: `Users`
- Email column: `Email`
- Role column: `Role`
- Allowed roles: `member`, `staff`, `leader`

Access model:

- Require sign-in.
- Only accepted members should have a row in `Users` with `Status = accepted`.
- Use Row Owners for private/member-scoped data. Do not rely only on visibility conditions for security.

Recommended app tabs:

- Home: onboarding text, profile completion status, next event, top 5 leaderboard.
- My Profile: editable fields from `MemberProfiles`.
- Guides: filtered `Resources`.
- Events: filtered `Events`.
- Leaderboard: `Leaderboard`, sorted by `Rank`.
- Links: `AppLinks`.

## 3. Render Environment

Set:

```env
MEMBER_HUB_URL=https://your-glide-app-url
GOOGLE_SHEETS_ID=your_google_sheet_id
```

For bot-to-Sheets sync, create a Google Cloud service account, enable Google Sheets API, and share the spreadsheet with the service account email as Editor.

Set either:

```env
GOOGLE_SERVICE_ACCOUNT_JSON={"client_email":"...","private_key":"..."}
```

or:

```env
GOOGLE_SERVICE_ACCOUNT_EMAIL=your-service-account@project.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n
```

## 4. Discord Commands

Deploy slash commands after updating Render:

```bash
node deploy-commands.js
```

Commands:

- `/hub` posts the Glide Member Hub link.
- `/ranking board` posts the Discord PNG ranking board.
- `/ranking reload`, `/ranking set`, `/ranking remove`, and `/ranking reset` manage ranking data.
- The Member Hub `Leaderboard` sheet is populated from the same ranking data source.
