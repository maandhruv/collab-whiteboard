
# Collaborative Whiteboard

A real-time, multi-user collaborative whiteboard platform built with Next.js, TypeScript, Yjs (CRDT), custom WebSocket backend, and PostgreSQL. Designed for seamless cross-device drawing, secure room management, and persistent board state.

## Features

- **Real-Time Collaboration:** Multiple users can draw, erase, and edit shapes on the same board simultaneously with low latency.
- **CRDT-Powered Sync:** Uses Yjs for conflict-free, distributed state synchronization.
- **Custom WebSocket Server:** Efficient, scalable backend for Yjs sync, deployed on Render.
- **Persistent Boards:** Board state is periodically snapshotted and stored in Neon PostgreSQL via Prisma, ensuring recovery after disconnects.
- **Authentication & Ownership:** NextAuth-based login; boards are owned by users and only visible to their creators.
- **Secure Room Access:** Each board has a unique access code; only users with the code can join.
- **Rename Boards:** Inline renaming of boards from the dashboard.
- **Cross-Device Continuity:** Access your boards and drawings from any device/browser.
- **Intuitive UI:** Tools for pencil, rectangle, connector, eraser, and pan/zoom; multi-cursor presence display.

## Tech Stack

- **Frontend:** Next.js (App Router), React, TypeScript, Tailwind CSS
- **Realtime Backend:** Node.js, ws (WebSocket), Yjs, Render
- **Database:** Neon PostgreSQL, Prisma ORM
- **Authentication:** NextAuth.js
- **Deployment:** Vercel (frontend/API), Render (WebSocket server)

## Architecture

- **Frontend (Vercel):** Handles authentication, dashboard, and whiteboard UI. Communicates with the backend via REST (API routes) and WebSocket.
- **WebSocket Server (Render):** Manages Yjs document sync, room creation, access code validation, and snapshot persistence.
- **Database (Neon):** Stores board metadata and Yjs snapshots for recovery and listing.

## Getting Started

### Local Development

1. **Clone the repository:**
   ```bash
   git clone https://github.com/maandhruv/collab-whiteboard.git
   cd collab-whiteboard
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure environment variables:**
   - Copy .env.example to .env and fill in your values:
     ```
     DATABASE_URL=postgresql://...
     NEXTAUTH_SECRET=...
     NEXTAUTH_URL=http://localhost:3000
     NEXT_PUBLIC_WS_URL=ws://localhost:1234
     WS_SERVER_URL=http://localhost:1234
     ```

4. **Run the WebSocket server:**
   ```bash
   npm run ws
   ```

5. **Run the Next.js frontend:**
   ```bash
   npm run dev
   ```

6. **Open [http://localhost:3000](http://localhost:3000) in your browser.**

### Production Deployment

- **Frontend/API:** Deploy to Vercel. Set environment variables in the Vercel dashboard.
- **WebSocket Server:** Deploy `/server/ws-server.ts` to Render. Ensure `PORT` is set dynamically and `tsx` is in dependencies.
- **Database:** Use Neon or another managed PostgreSQL provider.

## Usage

- **Create a Board:** Log in, click "Create Room" on the dashboard.
- **Draw & Collaborate:** Share the board link or access code with others to collaborate in real time.
- **Rename Boards:** Click "Edit" next to a board to rename it.
- **Switch Devices:** Log in from any browser to access your boards.

## Security

- **Access Codes:** Only users with the correct code can join a board.
- **Ownership:** Only the creator can rename or manage their boards.
- **Authentication:** All actions are protected by NextAuth sessions.

---

**Contributors:**  
Dhruv Maan ([GitHub](https://github.com/maandhruv))

---
