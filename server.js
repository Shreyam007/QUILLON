require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const session = require('express-session');
const MongoStore = require('connect-mongo');

const app = express();
const PORT = process.env.PORT || 3000;

// Connect to MongoDB
const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/lumina_blog';
mongoose.connect(mongoUri)
  .then(() => console.log('✅ Connected to MongoDB'))
  .catch(err => console.error('❌ MongoDB connection error:', err));

// Middleware
app.use(cors());
app.use(express.json());

// Session setup with connect-mongo
app.use(session({
  secret: process.env.SESSION_SECRET || 'quillon-blog-super-secret-2026',
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: mongoUri,
    collectionName: 'sessions'
  }),
  cookie: {
    maxAge: 1000 * 60 * 60 * 24 * 7, // 1 week
    secure: false, // set to true if using https
    httpOnly: true
  }
}));

// Serve static assets from public
app.use(express.static(path.join(__dirname, 'public')));

// ==================== DATABASE SCHEMAS ====================

// User Schema
const userSchema = new mongoose.Schema({
  googleId: { type: String, unique: true, sparse: true },
  email: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  picture: { type: String, default: '' },
  theme: { type: String, enum: ['light', 'dark', 'system'], default: 'light' },
  emailNotifications: { type: Boolean, default: true },
  browserNotifications: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
});
const User = mongoose.model('User', userSchema);

// Blog Schema
const blogSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  title: { type: String, required: true, trim: true },
  content: { type: String, default: '' },
  excerpt: { type: String, default: '' },
  status: { type: String, enum: ['draft', 'published', 'scheduled', 'trash'], default: 'draft' },
  category: { type: String, default: 'General' },
  tags: [{ type: String }],
  seoTitle: { type: String, default: '' },
  summary: { type: String, default: '' },
  featuredImage: { type: String, default: '' },
  author: { type: String, default: 'Alex Rivera' },
  views: { type: Number, default: 0 },
  scheduledAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

blogSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  if (this.content) {
    this.excerpt = this.content.replace(/<[^>]*>/g, '').substring(0, 150) + '...';
  }
  next();
});

const Blog = mongoose.model('Blog', blogSchema);

// Notification Schema
const notificationSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type: { type: String, default: 'info' }, // 'info', 'success', 'warning'
  title: { type: String, required: true },
  message: { type: String, required: true },
  read: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});
const Notification = mongoose.model('Notification', notificationSchema);

// History Schema
const historySchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  action: { type: String, required: true }, // 'created', 'updated', 'published', 'deleted', 'ai_generated', 'profile_updated', 'signed_up'
  blogTitle: { type: String, required: true },
  blogId: { type: mongoose.Schema.Types.ObjectId, ref: 'Blog', default: null },
  createdAt: { type: Date, default: Date.now }
});
const History = mongoose.model('History', historySchema);

// ==================== AUTHENTICATION MIDDLEWARE ====================
const requireAuth = (req, res, next) => {
  if (!req.session.userId) {
    if (req.headers.accept && req.headers.accept.includes('application/json')) {
      return res.status(401).json({ success: false, error: 'Unauthorized. Please log in.' });
    }
    return res.redirect('/login');
  }
  next();
};

// ==================== AUTH ROUTES ====================

// GET config (exposes Google Client ID safely)
app.get('/api/config', (req, res) => {
  res.json({
    success: true,
    googleClientId: process.env.GOOGLE_CLIENT_ID || ''
  });
});

// GET current user
app.get('/api/auth/me', async (req, res) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ success: false, error: 'Not authenticated' });
    }
    const user = await User.findById(req.session.userId);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    res.json({ success: true, data: user });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST Google Login
app.post('/api/auth/google', async (req, res) => {
  const { credential } = req.body;
  if (!credential) {
    return res.status(400).json({ success: false, error: 'Credential token required' });
  }

  try {
    const verifyRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${credential}`);
    if (!verifyRes.ok) {
      return res.status(400).json({ success: false, error: 'Google token verification failed' });
    }
    const payload = await verifyRes.json();

    let user = await User.findOne({ email: payload.email });
    if (!user) {
      user = new User({
        googleId: payload.sub,
        email: payload.email,
        name: payload.name || 'Google User',
        picture: payload.picture || ''
      });
      await user.save();

      // Log signup events
      const history = new History({
        userId: user._id,
        action: 'signed_up',
        blogTitle: 'Welcome to Quillon Blog Manager!'
      });
      await history.save();

      const notification = new Notification({
        userId: user._id,
        type: 'success',
        title: 'Account Created',
        message: 'Your account was successfully created using Google Login!'
      });
      await notification.save();
    } else {
      user.name = payload.name || user.name;
      user.picture = payload.picture || user.picture;
      await user.save();
    }

    req.session.userId = user._id;
    res.json({ success: true, data: user, message: 'Logged in successfully' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST Demo login
app.post('/api/auth/demo', async (req, res) => {
  try {
    const demoEmail = 'interviewer@quillon.ai';
    let user = await User.findOne({ email: demoEmail });
    if (!user) {
      user = new User({
        email: demoEmail,
        name: 'Demo Interviewer',
        theme: 'light',
        picture: 'https://lh3.googleusercontent.com/aida-public/AB6AXuB1AIfVwzfLs39GTSOG2BZgqWnfml1fCczbes9e_E1G4LQSAdZzmvhPE8vO0QNEalA0DCVQVapBUoy9aU6hJoItNqojH5GPeuVMP7TEZkVgBh0VL94SU9x8ER8Q_j6Yfdos5rc4C6aPw3g95I-bCtvTiGCiqDZ-asYHzl1oo9n_k5YFelztubHI4JznKXYsY9iy0ml3okCZtWqHfSKw41Z3sKHFqFujkRlEVQZXESxrUzxAjTTkiglVbXATQQEZjAqGIWfNaPvJLvFo'
      });
      await user.save();

      // Pre-seed demo blogs for this new demo user
      const demoBlogs = [
        {
          userId: user._id,
          title: 'The Future of Glassmorphism in Modern UI Design',
          content: 'Exploring how translucency and depth are shaping the next generation of digital experiences and why it matters for user focus. The glassmorphism trend has taken the design world by storm, offering a unique visual language that feels both modern and sophisticated.',
          status: 'published',
          category: 'Design',
          tags: ['UI', 'Design', 'Glassmorphism'],
          author: 'Demo Interviewer',
          views: 1240,
          createdAt: new Date('2026-05-20')
        },
        {
          userId: user._id,
          title: 'A Deep Dive into Fluid Typography Systems',
          content: 'Why fixed font sizes are a thing of the past and how to implement truly responsive scales using CSS clamp. Fluid typography represents a paradigm shift in how we think about type on the web.',
          status: 'draft',
          category: 'Technology',
          tags: ['Typography', 'CSS', 'Responsive'],
          author: 'Demo Interviewer',
          views: 0,
          createdAt: new Date('2026-05-22')
        },
        {
          userId: user._id,
          title: 'The Psychology of Minimalist Writing Tools',
          content: 'Discover why distraction-free environments lead to higher quality content production and better cognitive flow for authors. The science behind focus and creativity reveals fascinating insights about our digital workspaces.',
          status: 'published',
          category: 'Philosophy',
          tags: ['Productivity', 'Writing', 'Minimalism'],
          author: 'Demo Interviewer',
          views: 2400,
          featuredImage: 'https://lh3.googleusercontent.com/aida-public/AB6AXuAcQz4RdXSOFWMsdKelIrVYU90KHo7S8LDG1gXl0pDwfeHh_8Z5gya2qN7QP5E66vGEUZh6ELxc3X_AnWLhuti2X7k1BTtxKMeQ_PlDJaHJ8ia4BJHtaP8XRO4TDPF2RhfHIykRbFNYhxY0opI8sHxTRy7dcBfOxtSQ1esgbUm1u9yj6lahxuOZCaJdrrPCzRkWkggB-4JH_VlVnyyokfs6L3lewIkLeu4dj6ohS3Df5OazOocLVoPOOAioA_sq5NpxnWtL41R_CqnH',
          createdAt: new Date('2026-05-23')
        }
      ];
      await Blog.insertMany(demoBlogs);

      const history = new History({
        userId: user._id,
        action: 'signed_up',
        blogTitle: 'Demo Account initialized with sample blog posts'
      });
      await history.save();

      const notification = new Notification({
        userId: user._id,
        type: 'success',
        title: 'Welcome Interviewer!',
        message: 'Successfully logged in as Demo Interviewer. Pre-seeded demo blogs have been created for you.'
      });
      await notification.save();
    } else {
      user.theme = 'light';
      await user.save();
    }

    req.session.userId = user._id;
    res.json({ success: true, data: user, message: 'Logged in as Demo Account' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST Logout
app.post('/api/auth/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) {
      return res.status(500).json({ success: false, error: 'Could not log out' });
    }
    res.clearCookie('connect.sid');
    res.json({ success: true, message: 'Logged out successfully' });
  });
});

// ==================== USER PROFILE ROUTE ====================

// PUT update profile
app.put('/api/users/profile', requireAuth, async (req, res) => {
  console.log('PUT /api/users/profile body:', req.body);
  const { name, picture, theme, emailNotifications, browserNotifications } = req.body;
  if (!name) {
    return res.status(400).json({ success: false, error: 'Name is required' });
  }

  try {
    const user = await User.findById(req.session.userId);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    user.name = name.trim();
    if (picture !== undefined) user.picture = picture;
    if (theme !== undefined) user.theme = theme;
    if (emailNotifications !== undefined) user.emailNotifications = emailNotifications;
    if (browserNotifications !== undefined) user.browserNotifications = browserNotifications;
    await user.save();

    // Log history
    const history = new History({
      userId: user._id,
      action: 'profile_updated',
      blogTitle: `Updated settings and profile preferences`
    });
    await history.save();

    // Create notification
    const notification = new Notification({
      userId: user._id,
      type: 'info',
      title: 'Settings Updated',
      message: 'Your preferences and settings were successfully updated!'
    });
    await notification.save();

    res.json({ success: true, data: user, message: 'Settings updated successfully' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==================== NOTIFICATIONS ROUTES ====================

// GET all user notifications
app.get('/api/notifications', requireAuth, async (req, res) => {
  try {
    const notifications = await Notification.find({ userId: req.session.userId }).sort({ createdAt: -1 });
    res.json({ success: true, data: notifications });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT mark notification as read
app.put('/api/notifications/:id/read', requireAuth, async (req, res) => {
  try {
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, userId: req.session.userId },
      { read: true },
      { new: true }
    );
    if (!notification) {
      return res.status(404).json({ success: false, error: 'Notification not found' });
    }
    res.json({ success: true, data: notification });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT mark all notifications as read
app.put('/api/notifications/read-all', requireAuth, async (req, res) => {
  try {
    await Notification.updateMany({ userId: req.session.userId, read: false }, { read: true });
    res.json({ success: true, message: 'All notifications marked as read' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE clear all notifications
app.delete('/api/notifications', requireAuth, async (req, res) => {
  try {
    await Notification.deleteMany({ userId: req.session.userId });
    res.json({ success: true, message: 'All notifications cleared' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==================== HISTORY ROUTES ====================

// GET history logs
app.get('/api/history', requireAuth, async (req, res) => {
  try {
    const history = await History.find({ userId: req.session.userId }).sort({ createdAt: -1 });
    res.json({ success: true, data: history });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE clear history
app.delete('/api/history', requireAuth, async (req, res) => {
  try {
    await History.deleteMany({ userId: req.session.userId });
    res.json({ success: true, message: 'Activity history cleared' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE clear all drafts (scoped to user)
app.delete('/api/blogs/clear-drafts', requireAuth, async (req, res) => {
  try {
    await Blog.deleteMany({ userId: req.session.userId, status: 'draft' });
    
    const history = new History({
      userId: req.session.userId,
      action: 'deleted',
      blogTitle: 'All draft blog posts cleared'
    });
    await history.save();

    const notification = new Notification({
      userId: req.session.userId,
      type: 'warning',
      title: 'Drafts Cleared',
      message: 'All your draft blog posts were deleted.'
    });
    await notification.save();

    res.json({ success: true, message: 'All draft blogs cleared successfully' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE clear all blogs (scoped to user)
app.delete('/api/blogs/clear-all', requireAuth, async (req, res) => {
  try {
    await Blog.deleteMany({ userId: req.session.userId });
    
    const history = new History({
      userId: req.session.userId,
      action: 'deleted',
      blogTitle: 'All blog posts deleted'
    });
    await history.save();

    const notification = new Notification({
      userId: req.session.userId,
      type: 'warning',
      title: 'All Blogs Deleted',
      message: 'Your entire blog library was deleted.'
    });
    await notification.save();

    res.json({ success: true, message: 'All blogs deleted successfully' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==================== BLOG OPERATIONS ====================

// GET all blogs (scoped to current user)
app.get('/api/blogs', requireAuth, async (req, res) => {
  try {
    const { status, category, search } = req.query;
    let filter = { userId: req.session.userId };

    if (status) filter.status = status;
    if (category && category !== 'All Categories') filter.category = category;
    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: 'i' } },
        { content: { $regex: search, $options: 'i' } }
      ];
    }

    const blogs = await Blog.find(filter).sort({ updatedAt: -1 });
    res.json({ success: true, data: blogs, count: blogs.length });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET single blog (scoped to user)
app.get('/api/blogs/:id', requireAuth, async (req, res) => {
  try {
    const blog = await Blog.findOne({ _id: req.params.id, userId: req.session.userId });
    if (!blog) return res.status(404).json({ success: false, error: 'Blog not found' });
    blog.views += 1;
    await blog.save();
    res.json({ success: true, data: blog });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST create blog (scoped to user)
app.post('/api/blogs', requireAuth, async (req, res) => {
  try {
    const blogData = { ...req.body, userId: req.session.userId };
    const blog = new Blog(blogData);
    await blog.save();

    // Log history
    const history = new History({
      userId: req.session.userId,
      action: blog.status === 'published' ? 'published' : 'created',
      blogTitle: blog.title,
      blogId: blog._id
    });
    await history.save();

    // Log notification
    const notification = new Notification({
      userId: req.session.userId,
      type: blog.status === 'published' ? 'success' : 'info',
      title: blog.status === 'published' ? 'Post Published' : 'Draft Saved',
      message: blog.status === 'published'
        ? `Blog post "${blog.title}" was published successfully!`
        : `Draft blog post "${blog.title}" was created.`
    });
    await notification.save();

    res.status(201).json({ success: true, data: blog, message: 'Blog created successfully' });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// PUT update blog (scoped to user)
app.put('/api/blogs/:id', requireAuth, async (req, res) => {
  try {
    req.body.updatedAt = new Date();
    if (req.body.content) {
      req.body.excerpt = req.body.content.replace(/<[^>]*>/g, '').substring(0, 150) + '...';
    }

    const existingBlog = await Blog.findOne({ _id: req.params.id, userId: req.session.userId });
    if (!existingBlog) return res.status(404).json({ success: false, error: 'Blog not found' });

    const originalStatus = existingBlog.status;
    const newStatus = req.body.status || originalStatus;

    const blog = await Blog.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );

    let action = 'updated';
    if (originalStatus === 'draft' && newStatus === 'published') {
      action = 'published';
    }

    // Log history
    const history = new History({
      userId: req.session.userId,
      action: action,
      blogTitle: blog.title,
      blogId: blog._id
    });
    await history.save();

    // Log notification
    const notification = new Notification({
      userId: req.session.userId,
      type: action === 'published' ? 'success' : 'info',
      title: action === 'published' ? 'Post Published' : 'Post Updated',
      message: action === 'published'
        ? `Blog post "${blog.title}" is now live!`
        : `Blog post "${blog.title}" was updated.`
    });
    await notification.save();

    res.json({ success: true, data: blog, message: 'Blog updated successfully' });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// DELETE blog (scoped to user)
app.delete('/api/blogs/:id', requireAuth, async (req, res) => {
  try {
    const { permanent } = req.query;
    const blog = await Blog.findOne({ _id: req.params.id, userId: req.session.userId });
    if (!blog) return res.status(404).json({ success: false, error: 'Blog not found' });

    if (permanent === 'true' || blog.status === 'trash') {
      await Blog.findByIdAndDelete(req.params.id);

      const history = new History({
        userId: req.session.userId,
        action: 'deleted',
        blogTitle: blog.title
      });
      await history.save();

      const notification = new Notification({
        userId: req.session.userId,
        type: 'warning',
        title: 'Post Permanently Deleted',
        message: `Blog post "${blog.title}" has been permanently deleted.`
      });
      await notification.save();

      res.json({ success: true, message: 'Blog permanently deleted' });
    } else {
      blog.status = 'trash';
      await blog.save();

      const history = new History({
        userId: req.session.userId,
        action: 'deleted',
        blogTitle: blog.title,
        blogId: blog._id
      });
      await history.save();

      const notification = new Notification({
        userId: req.session.userId,
        type: 'info',
        title: 'Post Moved to Trash',
        message: `Blog post "${blog.title}" was moved to trash.`
      });
      await notification.save();

      res.json({ success: true, data: blog, message: 'Blog moved to trash' });
    }
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET stats (scoped to user)
app.get('/api/stats', requireAuth, async (req, res) => {
  try {
    const [total, published, drafts, scheduled, trash] = await Promise.all([
      Blog.countDocuments({ userId: req.session.userId, status: { $ne: 'trash' } }),
      Blog.countDocuments({ userId: req.session.userId, status: 'published' }),
      Blog.countDocuments({ userId: req.session.userId, status: 'draft' }),
      Blog.countDocuments({ userId: req.session.userId, status: 'scheduled' }),
      Blog.countDocuments({ userId: req.session.userId, status: 'trash' })
    ]);
    const totalViews = await Blog.aggregate([
      { $match: { userId: new mongoose.Types.ObjectId(req.session.userId) } },
      { $group: { _id: null, total: { $sum: '$views' } } }
    ]);
    res.json({
      success: true,
      data: {
        total, published, drafts, scheduled, trash,
        totalViews: totalViews[0]?.total || 0
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Seed demo data (Deprecated - replaced by dynamic pre-seed on Demo Login)
app.post('/api/seed', async (req, res) => {
  res.json({ success: true, message: 'Database seeding managed on login' });
});

// ==================== GEMINI AI ROUTE ====================

app.post('/api/ai/generate', requireAuth, async (req, res) => {
  const { prompt, tone = 'Professional' } = req.body;

  if (!prompt || typeof prompt !== 'string') {
    return res.status(400).json({ success: false, error: 'Prompt is required.' });
  }

  const trimmed = prompt.trim();

  if (trimmed.length < 5) {
    return res.status(422).json({
      success: false,
      invalid: true,
      error: 'Your topic is too short. Please describe a blog topic in at least 5 characters.'
    });
  }

  if (trimmed.length > 300) {
    return res.status(422).json({
      success: false,
      invalid: true,
      error: 'Topic is too long. Keep it under 300 characters.'
    });
  }

  const GEMINI_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_KEY || GEMINI_KEY === 'your_gemini_api_key_here') {
    return res.status(503).json({
      success: false,
      error: 'Gemini API key not configured. Please add GEMINI_API_KEY to your .env file.'
    });
  }

  const systemInstruction = `You are a blog content generation engine embedded inside "Quillon Editor" — a blog management web application.

YOUR SOLE PURPOSE: Generate structured blog post content from a given blog topic. Nothing else.

━━━ WHAT COUNTS AS A VALID BLOG TOPIC ━━━
A valid input is a subject, theme, or idea that a person could reasonably write a blog post about. Examples:
• Technology: "artificial intelligence", "React hooks", "cloud computing", "cybersecurity trends"
• Lifestyle: "morning routines", "minimalist living", "mental health tips", "remote work productivity"
• Business: "startup growth strategies", "freelancing tips", "digital marketing"
• Health & Wellness: "meditation benefits", "sleep science", "nutrition myths"
• Design & Creative: "UI design trends", "glassmorphism", "color theory", "typography"
• Finance: "personal budgeting", "crypto basics", "investing for beginners"
• Education: "online learning", "study techniques", "skill development"
• Travel, Food, Science, Sports, Culture — any real topic a blogger would write about

━━━ WHAT IS INVALID (REJECT THESE COMPLETELY) ━━━
Reject anything that is NOT a blog topic. This includes:
• Greetings or small talk: "hello", "hi there", "how are you"
• Questions about you or the AI: "who are you", "what are you", "where are you from", "what can you do"
• Help requests: "help me", "help", "assist me", "I need help"
• Commands unrelated to blogging: "write code", "solve this math", "translate this", "tell me a joke"
• Math or factual questions: "what is 2+2", "capital of France", "when did WW2 end"
• Gibberish or random characters: "asdfgh", "123abc", "???", "lol ok"
• Single generic words with no blogging context: "yes", "no", "ok", "idk", "stuff"
• Anything that is a question directed at you rather than a topic to write about

━━━ RESPONSE FORMAT (STRICT — NO EXCEPTIONS) ━━━

If INVALID → respond with ONLY this JSON, nothing else:
{"valid": false, "reason": "<one sentence explaining it is not a blog topic, e.g. 'This appears to be a greeting, not a blog topic.' or 'This is a personal question, not a subject for a blog post.'>"}

If VALID → respond with ONLY this JSON, nothing else:
{
  "valid": true,
  "title": "<An engaging, SEO-friendly blog post title>",
  "content": "<Complete blog post in HTML. Use <p> for paragraphs, <h2> for section headings, <ul> and <li> for lists. Write at least 4 paragraphs and 350+ words. Make it genuinely useful and informative.>",
  "seoTitles": [
    "<SEO title variant 1 — keyword-rich>",
    "<SEO title variant 2 — question format>",
    "<SEO title variant 3 — how-to format>",
    "<SEO title variant 4 — listicle format>",
    "<SEO title variant 5 — trend/year format>"
  ],
  "summary": "<A compelling 1-2 sentence blog meta description under 155 characters, suitable for Google search results>",
  "tags": ["<tag1>", "<tag2>", "<tag3>", "<tag4>"]
}

━━━ ADDITIONAL RULES ━━━
• Writing tone for this request: ${tone}
• NEVER output anything outside the JSON object above
• NEVER add markdown, code fences, commentary, or explanations
• Do NOT fabricate specific statistics, quotes, or citations — write based on general knowledge only
• Keep content factually grounded and genuinely helpful to the reader`;

  const MODELS = [
    'gemini-2.5-flash-lite',
    'gemini-2.0-flash-lite',
    'gemini-2.5-flash'
  ];

  const geminiPayload = JSON.stringify({
    system_instruction: { parts: [{ text: systemInstruction }] },
    contents: [{ role: 'user', parts: [{ text: `Blog topic: ${trimmed}` }] }],
    generationConfig: {
      temperature: 0.7,
      topP: 0.9,
      maxOutputTokens: 2048,
      responseMimeType: 'application/json'
    },
    safetySettings: [
      { category: 'HARM_CATEGORY_HARASSMENT',        threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_HATE_SPEECH',       threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' }
    ]
  });

  let geminiRes = null;
  let usedModel = '';

  try {
    for (const model of MODELS) {
      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_KEY}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: geminiPayload }
      );
      if (r.status === 429 || r.status === 503) {
        const reason = r.status === 429 ? 'rate-limited' : 'unavailable (high demand)';
        console.warn(`Model ${model} ${reason}, trying next...`);
        continue;
      }
      geminiRes = r;
      usedModel = model;
      break;
    }

    if (!geminiRes) {
      return res.status(429).json({
        success: false,
        error: 'The AI is busy right now (rate limit). Please wait 15 seconds and try again.'
      });
    }

    if (!geminiRes.ok) {
      const errBody = await geminiRes.text();
      console.error(`Gemini [${usedModel}] error ${geminiRes.status}:`, errBody);
      return res.status(502).json({ success: false, error: 'AI service error. Please try again in a moment.' });
    }

    const geminiData = await geminiRes.json();
    const rawText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!rawText) {
      return res.status(502).json({ success: false, error: 'Empty response from AI. Please try again.' });
    }

    let parsed;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      return res.status(502).json({ success: false, error: 'AI returned malformed response. Please retry.' });
    }

    if (parsed.valid === false) {
      return res.status(422).json({
        success: false,
        invalid: true,
        error: parsed.reason || 'Please enter a valid blog topic.'
      });
    }

    if (parsed.valid === true) {
      // Log history
      const history = new History({
        userId: req.session.userId,
        action: 'ai_generated',
        blogTitle: parsed.title || trimmed
      });
      await history.save();

      // Log notification
      const notification = new Notification({
        userId: req.session.userId,
        type: 'success',
        title: 'AI Draft Generated',
        message: `Successfully generated blog draft for topic: "${trimmed}"`
      });
      await notification.save();

      return res.json({
        success: true,
        data: {
          title:     parsed.title     || '',
          content:   parsed.content   || '',
          seoTitles: Array.isArray(parsed.seoTitles) ? parsed.seoTitles : [],
          summary:   parsed.summary   || '',
          tags:      Array.isArray(parsed.tags)      ? parsed.tags      : []
        }
      });
    }

    return res.status(502).json({ success: false, error: 'Unexpected AI response. Please retry.' });

  } catch (err) {
    console.error('AI generate error:', err);
    res.status(500).json({ success: false, error: 'Server error while contacting AI.' });
  }
});

app.post('/api/ai/enhance', requireAuth, async (req, res) => {
  const { content, tone = 'Professional', title = 'Untitled Blog' } = req.body;

  if (!content || typeof content !== 'string') {
    return res.status(400).json({ success: false, error: 'Content is required.' });
  }

  const trimmed = content.trim();
  if (trimmed.length < 5) {
    return res.status(422).json({
      success: false,
      error: 'Content is too short to enhance.'
    });
  }

  const GEMINI_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_KEY || GEMINI_KEY === 'your_gemini_api_key_here') {
    return res.status(503).json({
      success: false,
      error: 'Gemini API key not configured. Please add GEMINI_API_KEY to your .env file.'
    });
  }

  const systemInstruction = `You are a blog text content enhancement engine embedded inside "Quillon Editor".

YOUR SOLE PURPOSE: Enhance, correct, polish, and improve the provided HTML text from a blog post while matching the requested writing tone: ${tone}.

━━━ CRITICAL RULES ━━━
1. You MUST preserve the exact HTML structure, elements, attributes, and tags (such as <p>, <h2>, <h3>, <ul>, <li>, <strong>, <em>, <a>, etc.) of the original content. ONLY modify the plain text content inside those tags. Do NOT add new tags, remove tags, or wrap everything in new tags, unless absolutely necessary to correct structural HTML errors.
2. Improve spelling, grammar, phrasing, vocabulary, sentence flow, and clarity.
3. Match the writing tone: "${tone}" (e.g. Professional should be polite, structured, and informative; Formal should be sophisticated, objective, and authoritative; Casual should be warm, friendly, conversational, and direct).
4. Do NOT change the core meaning or arguments of the text.
5. NEVER output markdown code blocks (e.g. \`\`\`html) or any commentary. Respond with ONLY the valid JSON object described below.

━━━ RESPONSE FORMAT (STRICT — NO EXCEPTIONS) ━━━
You must respond with a JSON object in this exact format:
{
  "enhancedContent": "<The enhanced HTML content with all original HTML tags preserved>"
}`;

  const MODELS = [
    'gemini-2.5-flash-lite',
    'gemini-2.0-flash-lite',
    'gemini-2.5-flash'
  ];

  const geminiPayload = JSON.stringify({
    system_instruction: { parts: [{ text: systemInstruction }] },
    contents: [{ role: 'user', parts: [{ text: trimmed }] }],
    generationConfig: {
      temperature: 0.6,
      topP: 0.9,
      maxOutputTokens: 2048,
      responseMimeType: 'application/json'
    },
    safetySettings: [
      { category: 'HARM_CATEGORY_HARASSMENT',        threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_HATE_SPEECH',       threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' }
    ]
  });

  let geminiRes = null;
  let usedModel = '';

  try {
    for (const model of MODELS) {
      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_KEY}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: geminiPayload }
      );
      if (r.status === 429 || r.status === 503) {
        const reason = r.status === 429 ? 'rate-limited' : 'unavailable (high demand)';
        console.warn(`Model ${model} ${reason}, trying next...`);
        continue;
      }
      geminiRes = r;
      usedModel = model;
      break;
    }

    if (!geminiRes) {
      return res.status(429).json({
        success: false,
        error: 'The AI is busy right now (rate limit). Please wait 15 seconds and try again.'
      });
    }

    if (!geminiRes.ok) {
      const errBody = await geminiRes.text();
      console.error(`Gemini [${usedModel}] enhance error ${geminiRes.status}:`, errBody);
      return res.status(502).json({ success: false, error: 'AI service error. Please try again in a moment.' });
    }

    const geminiData = await geminiRes.json();
    const rawText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!rawText) {
      return res.status(502).json({ success: false, error: 'Empty response from AI. Please try again.' });
    }

    let parsed;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      const cleaned = rawText.replace(/^```[a-zA-Z]*\n/, '').replace(/\n```$/, '').trim();
      try {
        parsed = JSON.parse(cleaned);
      } catch (e) {
        console.error('Enhance route failed to parse JSON response:', rawText);
        return res.status(502).json({ success: false, error: 'AI returned malformed response. Please retry.' });
      }
    }

    if (!parsed.enhancedContent) {
      return res.status(502).json({ success: false, error: 'AI response missing enhanced content. Please retry.' });
    }

    // Log history
    const history = new History({
      userId: req.session.userId,
      action: 'ai_generated',
      blogTitle: title
    });
    await history.save();

    // Log notification
    const notification = new Notification({
      userId: req.session.userId,
      type: 'success',
      title: 'Content Enhanced',
      message: `Successfully enhanced document content in "${tone}" tone for: "${title}"`
    });
    await notification.save();

    return res.json({
      success: true,
      enhancedContent: parsed.enhancedContent
    });

  } catch (err) {
    console.error('AI enhance error:', err);
    res.status(500).json({ success: false, error: 'Server error while contacting AI.' });
  }
});

// Serve frontend pages
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));
app.get('/', requireAuth, (req, res) => res.sendFile(path.join(__dirname, 'public', 'dashboard.html')));
app.get('/editor', requireAuth, (req, res) => res.sendFile(path.join(__dirname, 'public', 'editor.html')));
app.get('/editor/:id', requireAuth, (req, res) => res.sendFile(path.join(__dirname, 'public', 'editor.html')));

app.listen(PORT, () => {
  console.log(`🚀 Quillon Blog Manager running at http://localhost:${PORT}`);
});
