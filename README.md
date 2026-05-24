# Q U I L L O N — AI-Powered Blog Studio

**Quillon** is a premium, feature-rich blog management studio designed for modern authors and content creators. Built with a sleek, responsive design and powered by the Google Gemini API, Quillon allows users to generate SEO-optimized blog drafts, enhance formatting and writing on-the-fly, export libraries, and manage their publishing pipeline in style.

---

## 🌟 Key Features

### 1. AI Content Generation ("Write with AI")
*   **Prompt-to-Draft**: Enter a blog topic (e.g., "Meditation benefits") and generate a complete, structured article in seconds.
*   **Tone Matching**: Tailor output styles matching **Professional**, **Formal**, or **Casual** tones.
*   **Aesthetic Progress Tracker**: A visual progress modal displaying step-by-step actions (Analyzing intent → Generating SEO titles → Writing paragraphs) as the AI generates content.
*   **Input Validation**: Validates topic quality (rejects greetings, short text, math questions, code commands) to ensure high-performance outputs.

### 2. AI Content Enhancement ("Enhance with AI")
*   **Real-time Grammar & Flow Polish**: Accessible via the editor's sparkles (`auto_awesome`) button, the AI refines grammar, vocabulary, flow, and phrasing.
*   **HTML Structure Preservation**: Strictly improves text content inside existing HTML elements while keeping tags (like `<h2>`, `<p>`, `<ul>`, `<a>`) untouched, preventing editor layout breaking.
*   **Interactive UI Loader**: The sparkles icon dynamically morphs into a spinning loader to indicate active generation.

### 3. WYSIWYG Editor & Sidebar
*   **Formatting Toolbar**: Full rich text support (Bold, Italic, Underline, Headings, Unordered Lists, Link injection, Image embedding, and format clearing).
*   **Real-Time Auto-Save**: Silent background auto-saves changes to the database every 3 seconds to prevent data loss.
*   **Word Count & Save Status**: Tracks word count and shows exact time of the last save.
*   **SEO & Summary Controls**: Auto-suggests SEO titles based on current title inputs and provides one-click AI meta-description generation.

### 4. Interactive Dashboard & Activity Logs
*   **Overview Stats**: Visual cards tracking Total Views, Published Blogs, Drafts, Scheduled Posts, and Trash items.
*   **Search & Filtering**: Dynamic title search combined with Category and Status dropdown filters.
*   **Activity History Modal**: Logs user actions (e.g. Account Created, AI draft generated, content enhanced, blog posts published).
*   **Notifications Bell**: Populates real-time system alerts on successful actions.

### 5. Settings, Themes, and Privacy
*   **Theming**: Toggle between Light Mode, Dark Mode, or System Preferences with visual theme cards.
*   **Notifications Preference**: Enable or disable email and browser notifications.
*   **User Profiles**: Edit display name, upload custom profile pictures, or choose from pre-seeded designer avatars.
*   **Data Exports & Controls**:
    *   **Export to JSON**: Download the entire blog library in a single JSON backup.
    *   **Export to PDF**: Generate a clean, printed PDF portfolio of all blog entries.
    *   **Data Cleaners**: Perform bulk actions to clear drafts or delete the entire database securely.

---

## 🛠️ Tech Stack

*   **Frontend**: HTML5, CSS3, Tailwind CSS (Utility styling), Google Montserrat & JetBrains Mono Fonts, Material Symbols (Icons).
*   **Backend**: Node.js, Express.js (REST API, session management).
*   **Database**: MongoDB (via Mongoose ODM).
*   **AI Models**: Google Gemini Developer API using a fallback queue:
    1.  `gemini-2.5-flash-lite` (Default)
    2.  `gemini-2.0-flash-lite` (First fallback)
    3.  `gemini-2.5-flash` (Second fallback)

---

## 📂 Project Architecture

```
Todo/
├── public/                 # Static Frontend assets
│   ├── dashboard.html      # User Dashboard layout
│   ├── editor.html         # Rich-text Editor and AI Sidebar
│   ├── login.html          # Authentication page (Google & Demo Sign-In)
│   └── logo.svg            # Custom Q-Ring vector logo
├── server.js               # Express Server & REST API
├── package.json            # Dependencies and start scripts
└── .env                    # System Environment configuration
```

---

## ⚡ Setup & Installation

### 1. Prerequisites
Ensure you have the following installed:
*   [Node.js](https://nodejs.org/) (v18+ recommended)
*   [MongoDB](https://www.mongodb.com/try/download/community) running locally on port `27017`

### 2. Install Dependencies
Clone the repository, navigate to the folder, and run:
```bash
npm install
```

### 3. Environment Configuration
Create a `.env` file in the root directory:
```env
MONGODB_URI=mongodb://localhost:27017/lumina_blog
PORT=3001
GEMINI_API_KEY=your_gemini_api_key_here
SESSION_SECRET=your_session_secret_key
GOOGLE_CLIENT_ID=your_google_client_id_here
```

### 4. Run the Application
Start the server in development mode:
```bash
npm run dev
# or
node server.js
```
Open your browser and navigate to `http://localhost:3001` to start writing!

---

## 🔒 Authentication & Access
For quick testing and review, Quillon provides a **Demo Sign-In** option on the login screen.
*   **Demo User**: `interviewer@quillon.ai` (Pre-seeds beautiful mock articles, view counters, notifications, and activity logs).
*   **Google OAuth**: Optionally enter your `GOOGLE_CLIENT_ID` in the `.env` file to enable secure login via Google Account buttons.